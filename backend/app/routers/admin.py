"""Admin-only routes.

Protected by X-Admin-Secret header (compared against ADMIN_SECRET env var).
Used by the Next.js admin panel — never exposed to end users.
"""

from __future__ import annotations

import collections
import hmac
import logging
import time
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.supabase_client import get_supabase
from app.models.course import ArtifactOut, CourseCreate, CourseOut, ExamDateUpdate
from app.services.artifact_service import remove_artifact, store_file, store_url
from app.services.course_service import (
    create_course,
    delete_course,
    list_all_artifacts_admin,
    list_artifacts_by_ids,
    update_artifact_status,
)
import app.services.credit_service as credit_service

try:
    from app.services.rag_service import sync_artifact_doc_type as _sync_doc_type
    from app.services.rag_service import purge_artifact_chunks as _purge_chunks
except Exception:
    _sync_doc_type = None  # type: ignore[assignment]
    _purge_chunks = None   # type: ignore[assignment]

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Simple in-memory rate limiter for admin auth failures ─────────────────────
# 每个 IP 在滑动窗口内允许的最大失败次数；超出后锁定一段时间。
_RATE_WINDOW_SEC = 60        # 滑动窗口长度（秒）
_RATE_MAX_FAILS  = 10        # 窗口内允许的最大失败次数
_RATE_LOCKOUT_SEC = 300      # 达到上限后锁定时长（秒）

_fail_times: dict[str, collections.deque] = {}   # ip → deque of fail timestamps
_lockout_until: dict[str, float] = {}            # ip → lockout expiry timestamp
_rate_lock = threading.Lock()


def _check_admin_rate_limit(ip: str) -> None:
    """在失败计数超限时抛出 429，防止暴力枚举 admin secret。"""
    now = time.time()
    with _rate_lock:
        # 检查是否仍在锁定期
        if _lockout_until.get(ip, 0) > now:
            remaining = int(_lockout_until[ip] - now)
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed admin attempts. Try again in {remaining}s.",
            )
        # 清理窗口外的旧记录
        dq = _fail_times.get(ip)
        if dq:
            while dq and dq[0] < now - _RATE_WINDOW_SEC:
                dq.popleft()


def _record_admin_fail(ip: str) -> None:
    """记录一次失败；失败次数达到上限时触发锁定。"""
    now = time.time()
    with _rate_lock:
        dq = _fail_times.setdefault(ip, collections.deque())
        dq.append(now)
        if len(dq) >= _RATE_MAX_FAILS:
            _lockout_until[ip] = now + _RATE_LOCKOUT_SEC
            dq.clear()
            logger.warning(
                "Admin rate limit exceeded for IP=%s — locked out for %ds",
                ip, _RATE_LOCKOUT_SEC,
            )


def _require_admin(
    request: Request,
    x_admin_secret: str = Header(default=""),
) -> None:
    ip = request.client.host if request.client else "unknown"
    _check_admin_rate_limit(ip)
    cfg = get_settings()
    # hmac.compare_digest: constant-time comparison prevents timing attacks
    if not x_admin_secret or not any(
        hmac.compare_digest(x_admin_secret, s) for s in cfg.admin_secrets_set
    ):
        _record_admin_fail(ip)
        logger.warning("Admin auth failure from IP=%s", ip)
        raise HTTPException(status_code=403, detail="Admin access required")


def _bg_extract_questions(supabase: Client, artifact: dict) -> None:
    """Background task: extract exam questions from past_exam type artifacts.

    Sets extraction_status = 'extracting' at start, 'done' or 'failed' at end.
    Must be a sync function (not async) so FastAPI runs it in a thread pool.
    """
    if artifact.get("doc_type") != "past_exam":
        return
    sp = artifact.get("storage_path")
    ft = artifact.get("file_type", "pdf")
    if not sp or ft not in ("pdf", "word", "text"):
        return

    artifact_id = artifact["id"]

    # Reset Storage + PostgREST auth to service-role key.
    # auth.sign_up/verify_otp contaminates the shared client's auth headers,
    # causing Storage uploads to get 403 "new row violates row-level security".
    from app.core.supabase_client import restore_service_role_auth
    restore_service_role_auth()

    try:
        supabase.table("artifacts").update({"extraction_status": "extracting"}).eq("id", artifact_id).execute()
    except Exception:
        pass  # status tracking is best-effort

    try:
        from app.services.exam_service import extract_questions_from_artifact
        from app.services.llm_key_service import get_api_key
        from app.core.config import get_settings
        openai_key = get_api_key("openai", supabase) or get_settings().openai_api_key
        questions = extract_questions_from_artifact(
            supabase,
            artifact_id,
            artifact["course_id"],
            openai_key,
        )
        final_status = "done" if questions else "failed"
        logger.info(
            "_bg_extract_questions: extracted %d questions for artifact %s → %s",
            len(questions), artifact_id, final_status,
        )
        supabase.table("artifacts").update({"extraction_status": final_status}).eq("id", artifact_id).execute()
    except Exception as exc:
        logger.warning("_bg_extract_questions failed for artifact %s: %s", artifact_id, exc)
        try:
            supabase.table("artifacts").update({"extraction_status": "failed"}).eq("id", artifact_id).execute()
        except Exception:
            pass


def _bg_process(supabase: Client, artifact: dict) -> None:
    """Background task: chunk + embed one artifact.

    Only indexes text-extractable types (pdf, word, text).
    Skips code files (python, notebook) — not useful for RAG text search.
    """
    sp = artifact.get("storage_path")
    ft = artifact.get("file_type", "pdf")
    # url has no file; python/notebook are code — skip RAG indexing
    if not sp or ft in ("url", "python", "notebook"):
        return
    try:
        from app.services.rag_service import process_artifact
        process_artifact(
            supabase,
            artifact["id"],
            artifact["course_id"],
            artifact["file_name"],
            ft,
            sp,
        )
    except Exception:
        pass  # non-fatal — artifact is stored, just not yet indexed


# ── File Review Queue ─────────────────────────────────────────────────────────

@router.get("/artifacts", response_model=list[ArtifactOut])
def list_pending_artifacts(
    status: str = "pending",
    course_id: str | None = None,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List artifacts by status (default: pending review)."""
    return list_all_artifacts_admin(supabase, status=status, course_id=course_id)


@router.patch("/artifacts/{artifact_id}/approve", response_model=ArtifactOut)
def approve_artifact(
    artifact_id: int,
    background_tasks: BackgroundTasks,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Approve a user-uploaded file — triggers background RAG indexing."""
    # 读取旧状态，幂等：只有首次 pending→approved 才奖励积分
    old_rows = supabase.table("artifacts").select("status, user_id").eq("id", artifact_id).execute().data or []
    old_status = old_rows[0]["status"] if old_rows else None

    art = update_artifact_status(supabase, artifact_id, status="approved")
    background_tasks.add_task(_bg_process, supabase, art)
    background_tasks.add_task(_bg_extract_questions, supabase, art)

    uploader_id = art.get("user_id")
    if uploader_id and old_status != "approved":
        try:
            credit_service.earn(supabase, uploader_id, 1, "artifact_approved",
                                ref_id=str(artifact_id), note="文件审核通过")
        except Exception:
            pass
    return art


@router.post("/artifacts/{artifact_id}/extract-questions")
def extract_questions_for_artifact(
    artifact_id: int,
    background_tasks: BackgroundTasks,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Manually trigger (re-)extraction of questions from a past_exam artifact.

    Deletes any existing questions for this artifact first so it re-runs cleanly.
    """
    art_rows = supabase.table("artifacts").select("*").eq("id", artifact_id).execute().data or []
    if not art_rows:
        raise HTTPException(status_code=404, detail="Artifact not found")
    art = art_rows[0]
    if art.get("doc_type") != "past_exam":
        raise HTTPException(status_code=400, detail="Only past_exam artifacts support question extraction")
    if art.get("extraction_status") == "extracting":
        raise HTTPException(status_code=409, detail="Extraction already in progress for this artifact")

    # Delete existing questions and stale crop images before re-extraction
    supabase.table("exam_questions").delete().eq("artifact_id", artifact_id).execute()
    from app.services.exam_service import purge_artifact_page_images
    purge_artifact_page_images(supabase, artifact_id)

    background_tasks.add_task(_bg_extract_questions, supabase, art)
    return {"ok": True, "artifact_id": artifact_id, "message": "Question extraction started in background"}


@router.get("/artifacts/{artifact_id}/questions")
def list_artifact_questions(
    artifact_id: int,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List extracted questions for a past_exam artifact (admin preview)."""
    rows = (
        supabase.table("exam_questions")
        .select("id, question_index, question_type, question_text, options, correct_answer, has_visual, page_image_url")
        .eq("artifact_id", artifact_id)
        .eq("source_type", "past_exam")
        .order("question_index")
        .execute()
        .data or []
    )
    return rows


@router.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Delete a single extracted question (admin correction)."""
    supabase.table("exam_questions").delete().eq("id", question_id).execute()
    return {"ok": True, "deleted_id": question_id}


@router.post("/courses/{course_id}/extract-all-questions")
def extract_all_questions_for_course(
    course_id: str,
    background_tasks: BackgroundTasks,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Re-extract questions from ALL approved past_exam artifacts in a course."""
    arts = (
        supabase.table("artifacts")
        .select("*")
        .eq("course_id", course_id)
        .eq("doc_type", "past_exam")
        .eq("status", "approved")
        .execute()
        .data or []
    )
    if not arts:
        raise HTTPException(status_code=404, detail="No approved past_exam artifacts found in this course")

    # Clear all existing questions and stale crop images
    artifact_ids = [a["id"] for a in arts]
    supabase.table("exam_questions").delete().in_("artifact_id", artifact_ids).execute()
    from app.services.exam_service import purge_artifact_page_images
    for aid in artifact_ids:
        purge_artifact_page_images(supabase, aid)

    for art in arts:
        background_tasks.add_task(_bg_extract_questions, supabase, art)

    return {"ok": True, "count": len(arts), "message": f"Started extraction for {len(arts)} artifacts"}


@router.get("/courses/{course_id}/extraction-status")
def get_extraction_status(
    course_id: str,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Return extraction progress: how many past_exam artifacts have questions extracted."""
    arts = (
        supabase.table("artifacts")
        .select("id, extraction_status")
        .eq("course_id", course_id)
        .eq("doc_type", "past_exam")
        .eq("status", "approved")
        .execute()
        .data or []
    )
    total = len(arts)
    if total == 0:
        return {"total": 0, "done": 0, "failed": 0, "extracting": 0}

    done = sum(1 for a in arts if a.get("extraction_status") == "done")
    failed = sum(1 for a in arts if a.get("extraction_status") == "failed")
    extracting = sum(1 for a in arts if a.get("extraction_status") == "extracting")
    return {"total": total, "done": done, "failed": failed, "extracting": extracting}


@router.patch("/artifacts/{artifact_id}/doc-type", response_model=ArtifactOut)
def update_artifact_doc_type(
    artifact_id: int,
    background_tasks: BackgroundTasks,
    doc_type: str = Body(embed=True),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Update the semantic doc_type label of an existing artifact.

    Two-step metadata sync:
      Step 1 — UPDATE artifacts.doc_type in Supabase (relational DB, synchronous)
      Step 2 — UPDATE ChromaDB chunk metadata doc_type (vector store, background non-blocking)

    ChromaDB sync patches only the metadata field — no Embedding API calls, zero cost.
    """
    if doc_type not in _VALID_DOC_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid doc_type '{doc_type}'. Must be one of: {sorted(_VALID_DOC_TYPES)}")

    # Step 1: 更新关系型数据库（同步）
    # supabase-py 在某些版本 update().eq() 返回 SyncFilterRequestBuilder，不支持 .select()
    # 改为先 update 再单独 select 取回完整行
    (
        supabase.table("artifacts")
        .update({"doc_type": doc_type})
        .eq("id", artifact_id)
        .execute()
    )
    fetch = (
        supabase.table("artifacts")
        .select("*")
        .eq("id", artifact_id)
        .execute()
    )
    if not fetch.data:
        raise HTTPException(status_code=404, detail="Artifact not found")

    artifact = fetch.data[0]

    # Step 2: 同步 ChromaDB 向量元数据（后台非阻塞，失败不影响响应）
    if _sync_doc_type is not None:
        background_tasks.add_task(_sync_doc_type, artifact["course_id"], artifact_id, doc_type)

    return artifact


@router.patch("/artifacts/{artifact_id}/week")
def update_artifact_week(
    artifact_id: int,
    week: int | None = Body(embed=True),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict:
    if week is not None and not (1 <= week <= 10):
        raise HTTPException(status_code=422, detail="week must be 1-10 or null")
    (
        supabase.table("artifacts")
        .update({"week": week})
        .eq("id", artifact_id)
        .execute()
    )
    fetch = (
        supabase.table("artifacts")
        .select("*")
        .eq("id", artifact_id)
        .execute()
    )
    if not fetch.data:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return fetch.data[0]


@router.patch("/artifacts/{artifact_id}/reject", response_model=ArtifactOut)
def reject_artifact(
    artifact_id: int,
    background_tasks: BackgroundTasks,
    reason: str = Body(default="", embed=True),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Reject a user-uploaded file with optional reason.

    Circuit-breaker: purges ChromaDB vectors + artifact_chunks in background
    so the rejected file never pollutes the RAG knowledge base.
    """
    art = update_artifact_status(
        supabase, artifact_id, status="rejected", reject_reason=reason or None
    )
    # 熔断：后台清理该文件的所有向量，不阻塞响应
    if _purge_chunks is not None:
        background_tasks.add_task(_purge_chunks, supabase, art["course_id"], artifact_id)
    return art


# ── Admin Direct Upload (bypasses review) ─────────────────────────────────────

_VALID_DOC_TYPES = {"lecture", "tutorial", "revision", "past_exam", "assignment", "other"}


@router.post("/courses/{course_id}/artifacts", response_model=ArtifactOut, status_code=201)
def admin_upload_file(
    course_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form("lecture"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Admin uploads a file directly — immediately approved, triggers RAG indexing."""
    if doc_type not in _VALID_DOC_TYPES:
        doc_type = "lecture"
    file_bytes = file.file.read()
    _MAX_UPLOAD_BYTES = 50 * 1024 * 1024
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum upload size is 50 MB.")
    art = store_file(
        supabase=supabase,
        user_id=None,
        course_id=course_id,
        file_name=file.filename or "upload.bin",
        file_bytes=file_bytes,
        status="approved",
        uploaded_by=None,
        doc_type=doc_type,
    )
    background_tasks.add_task(_bg_process, supabase, art)
    background_tasks.add_task(_bg_extract_questions, supabase, art)
    return art


@router.post("/courses/{course_id}/artifacts/url", response_model=ArtifactOut, status_code=201)
def admin_add_url(
    course_id: str,
    url: str = Body(..., embed=True),
    display_name: str = Body(default="", embed=True),
    doc_type: str = Body(default="other", embed=True),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Admin adds a URL reference — immediately approved (no text to index)."""
    if doc_type not in _VALID_DOC_TYPES:
        doc_type = "other"
    return store_url(
        supabase=supabase,
        user_id=None,
        course_id=course_id,
        url=url,
        display_name=display_name,
        status="approved",
        doc_type=doc_type,
    )


# ── RAG Index Management ───────────────────────────────────────────────────────

@router.post("/courses/{course_id}/reindex")
def reindex_course(
    course_id: str,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Reprocess all approved artifacts in a course (clean → chunk → embed).
    Synchronous — may take several minutes for large courses.
    """
    from app.services.rag_service import reindex_course as _reindex
    result = _reindex(supabase, course_id)
    return {"ok": True, "course_id": course_id, **result}


# ── User Management (admin only) ──────────────────────────────────────────────

@router.get("/users")
def admin_list_users(
    include_unverified: bool = True,
    _: None = Depends(_require_admin),
) -> list[dict[str, Any]]:
    """List all registered users via Supabase REST admin API."""
    import httpx
    cfg = get_settings()
    try:
        r = httpx.get(
            f"{cfg.supabase_url}/auth/v1/admin/users",
            headers={
                "apikey": cfg.supabase_service_role_key,
                "Authorization": f"Bearer {cfg.supabase_service_role_key}",
            },
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPStatusError as exc:
        logger.error("admin_list_users Supabase HTTP %s: %s", exc.response.status_code, exc.response.text[:500])
        raise HTTPException(status_code=500, detail="获取用户列表失败，请稍后重试") from exc
    except Exception as exc:
        logger.error("admin_list_users error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="获取用户列表失败，请稍后重试") from exc

    raw_users = data.get("users", data) if isinstance(data, dict) else data
    # Hide soft-deleted accounts
    raw_users = [u for u in raw_users if not u.get("deleted_at")]
    if not include_unverified:
        raw_users = [u for u in raw_users if u.get("email_confirmed_at")]
    return [
        {
            "id":              u.get("id", ""),
            "email":           u.get("email", ""),
            "created_at":      u.get("created_at", ""),
            "last_sign_in_at": u.get("last_sign_in_at"),
            "email_confirmed": bool(u.get("email_confirmed_at")),
        }
        for u in raw_users
    ]


@router.post("/users/{user_id}/confirm-email", status_code=200)
def admin_confirm_user_email(
    user_id: str,
    _: None = Depends(_require_admin),
) -> dict[str, Any]:
    """强制确认用户邮箱（用于 OTP 未完成导致无法登录的情况）。"""
    import httpx
    cfg = get_settings()
    try:
        r = httpx.put(
            f"{cfg.supabase_url}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": cfg.supabase_service_role_key,
                "Authorization": f"Bearer {cfg.supabase_service_role_key}",
                "Content-Type": "application/json",
            },
            json={"email_confirm": True},
            timeout=10,
        )
        r.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("admin_confirm_email HTTP %s: %s", exc.response.status_code, exc.response.text[:500])
        raise HTTPException(status_code=500, detail="邮箱确认失败，请稍后重试") from exc
    return {"ok": True, "id": user_id}


@router.delete("/users/{user_id}", status_code=200)
def admin_delete_user(
    user_id: str,
    email: Optional[str] = Query(default=None),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Delete user in Supabase Auth.

    Notes:
    - Missing user is treated as already deleted (idempotent).
    - Also best-effort deletes other accounts with the same email to avoid
      "deleted user pops back" caused by duplicate rows.
    """
    import httpx

    cfg = get_settings()
    already_deleted = False
    deleted_duplicates = 0
    target_email: str | None = (email or "").strip().lower() or None
    headers = {
        "apikey": cfg.supabase_service_role_key,
        "Authorization": f"Bearer {cfg.supabase_service_role_key}",
    }

    # Read target email first (best effort), used for duplicate cleanup.
    try:
        r_get = httpx.get(
            f"{cfg.supabase_url}/auth/v1/admin/users/{user_id}",
            headers=headers,
            timeout=10,
        )
        if r_get.status_code < 400:
            j = r_get.json()
            if isinstance(j, dict):
                user_obj = j.get("user", j)
                if isinstance(user_obj, dict):
                    target_email = (user_obj.get("email") or "").strip().lower() or target_email
    except Exception:
        pass

    try:
        r = httpx.delete(
            f"{cfg.supabase_url}/auth/v1/admin/users/{user_id}?should_soft_delete=false",
            headers=headers,
            timeout=10,
        )
        r.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            already_deleted = True
        else:
            logger.error("admin_delete_user HTTP %s: %s", exc.response.status_code, exc.response.text[:500])
            raise HTTPException(status_code=500, detail="删除用户失败，请稍后重试") from exc
    except Exception as exc:
        logger.error("admin_delete_user error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="删除用户失败，请稍后重试") from exc

    # Best-effort: remove duplicate accounts with the same email.
    if target_email:
        try:
            r_list = httpx.get(
                f"{cfg.supabase_url}/auth/v1/admin/users",
                headers=headers,
                timeout=10,
            )
            if r_list.status_code < 400:
                data = r_list.json()
                users = data.get("users", data) if isinstance(data, dict) else data
                for u in users or []:
                    uid = u.get("id")
                    uemail = (u.get("email") or "").lower()
                    if uid and uid != user_id and uemail and uemail == target_email:
                        try:
                            dr = httpx.delete(
                                f"{cfg.supabase_url}/auth/v1/admin/users/{uid}?should_soft_delete=false",
                                headers=headers,
                                timeout=10,
                            )
                            if dr.status_code < 400 or dr.status_code == 404:
                                deleted_duplicates += 1
                        except Exception:
                            pass
        except Exception:
            pass

    # Cleanup credit row (best effort)
    try:
        supabase.table("user_credits").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    return {
        "ok": True,
        "id": user_id,
        "already_deleted": already_deleted,
        "deleted_duplicates": deleted_duplicates,
    }


@router.get("/users/credits")
def admin_get_user_credits(
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, int]:
    """返回所有用户的积分余额 map：{user_id: balance}。"""
    rows = supabase.table("user_credits").select("user_id, balance").execute().data or []
    return {r["user_id"]: r["balance"] for r in rows}


class CreditAdjustBody(BaseModel):
    action: str          # "add" | "deduct"
    amount: int          # 正整数
    note: str | None = None


@router.post("/users/{user_id}/credits/adjust")
def admin_adjust_user_credits(
    user_id: str,
    body: CreditAdjustBody,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """管理员手动增减用户积分。action='add' 增加，action='deduct' 扣除（下限 0）。"""
    if body.action not in ("add", "deduct"):
        raise HTTPException(status_code=422, detail="action must be 'add' or 'deduct'")
    if body.amount <= 0:
        raise HTTPException(status_code=422, detail="amount must be a positive integer")
    amount = body.amount if body.action == "add" else -body.amount
    credit_service.admin_grant(supabase, user_id, amount, note=body.note)
    new_balance = credit_service.get_balance(supabase, user_id)
    return {"ok": True, "user_id": user_id, "balance": new_balance}


# ── Course Management (admin only) ────────────────────────────────────────────

@router.get("/courses", response_model=list[CourseOut])
def admin_list_courses(
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all courses (admin only, no Bearer token needed)."""
    from app.services.course_service import list_courses
    return list_courses(supabase)


@router.post("/courses", response_model=CourseOut, status_code=201)
def admin_create_course(
    body: CourseCreate,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Create a shared course (admin only)."""
    return create_course(supabase, code=body.code, name=body.name, exam_date=body.exam_date)


@router.patch("/courses/{course_id}/exam-date", response_model=CourseOut)
def admin_set_exam_date(
    course_id: str,
    body: ExamDateUpdate,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Set or clear the exam date for a course (admin only)."""
    from app.services.course_service import set_exam_date
    return set_exam_date(supabase, course_id, body.exam_date)


@router.post("/courses/{course_id}/exam-date", response_model=CourseOut)
def admin_set_exam_date_post(
    course_id: str,
    body: ExamDateUpdate,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """POST alias for exam-date update (works in proxies that block PATCH)."""
    from app.services.course_service import set_exam_date
    return set_exam_date(supabase, course_id, body.exam_date)


@router.delete("/courses/{course_id}", status_code=200)
def admin_delete_course(
    course_id: str,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Delete a course and all related data (admin only)."""
    delete_course(supabase, course_id)
    return {"ok": True, "id": course_id}


# ── Artifact Management ────────────────────────────────────────────────────────

@router.delete("/artifacts/{artifact_id}", status_code=200)
def admin_delete_artifact(
    artifact_id: int,
    course_id: str,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    rows = list_all_artifacts_admin(supabase, course_id=course_id)
    row = next((r for r in rows if r["id"] == artifact_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Artifact not found in this course")
    storage_path = row.get("storage_path")
    user_id = row.get("user_id")
    remove_artifact(supabase, user_id, course_id, artifact_id, storage_path)
    return {"ok": True, "id": artifact_id}


# ── Invite Code Management ────────────────────────────────────────────────────

@router.post("/invites", status_code=201)
def create_invite(
    note: str = Body(default="", embed=True),
    max_uses: int = Body(default=1, embed=True),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Generate a new invite code."""
    import secrets
    code = secrets.token_urlsafe(6).upper()[:8]
    row = supabase.table("invites").insert({
        "code": code,
        "note": note or None,
        "max_uses": max_uses,
    }).execute()
    return row.data[0]


@router.get("/invites")
def list_invites(
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all invite codes with usage stats."""
    return (
        supabase.table("invites")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.delete("/invites/{invite_id}", status_code=200)
def delete_invite(
    invite_id: str,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Delete an invite code."""
    supabase.table("invites").delete().eq("id", invite_id).execute()
    return {"ok": True, "id": invite_id}


# ── API Key Management ─────────────────────────────────────────────────────────

_VALID_PROVIDERS = {"openai", "gemini", "deepseek"}


class ApiKeyCreate(BaseModel):
    provider: str          # 'openai' | 'gemini' | 'deepseek'
    api_key:  str
    label:    Optional[str] = None


@router.get("/api-keys")
def list_api_keys(
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all stored API keys (keys are masked — never returned in full).

    Returns an empty list if the api_keys table does not yet exist in the DB.
    Run migrations/008_api_keys.sql in the Supabase Dashboard to create it.
    """
    try:
        rows = (
            supabase.table("api_keys")
            .select("id, provider, label, is_active, created_at, updated_at")
            .order("provider")
            .order("updated_at", desc=True)
            .execute()
            .data
        ) or []
    except Exception:
        # Table not yet created — return empty list gracefully
        return []

    return [
        {
            "id":         r["id"],
            "provider":   r["provider"],
            "label":      r.get("label") or r["provider"],
            "is_active":  r["is_active"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
        }
        for r in rows
    ]


@router.post("/api-keys", status_code=201)
def create_api_key(
    body: ApiKeyCreate,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Add a new API key. The new key becomes the active key for its provider."""
    if body.provider not in _VALID_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"provider must be one of: {', '.join(sorted(_VALID_PROVIDERS))}",
        )
    if not body.api_key.strip():
        raise HTTPException(status_code=400, detail="api_key must not be empty")

    try:
        # Deactivate any existing keys for this provider first
        supabase.table("api_keys").update({"is_active": False}).eq("provider", body.provider).execute()

        row = supabase.table("api_keys").insert({
            "provider": body.provider,
            "api_key":  body.api_key.strip(),
            "label":    body.label or body.provider,
            "is_active": True,
        }).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "api_keys table not found. Please run migrations/008_api_keys.sql "
                f"in your Supabase Dashboard SQL editor first. ({exc})"
            ),
        ) from exc

    # Invalidate in-process key cache
    from app.services.llm_key_service import invalidate_cache
    invalidate_cache(body.provider)

    r = row.data[0]
    return {
        "id":        r["id"],
        "provider":  r["provider"],
        "label":     r.get("label"),
        "is_active": r["is_active"],
    }


@router.patch("/api-keys/{key_id}/activate", status_code=200)
def activate_api_key(
    key_id: int,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Switch the active key for a provider to the given key_id.

    All other keys for the same provider are deactivated automatically.
    """
    try:
        existing = supabase.table("api_keys").select("provider").eq("id", key_id).execute()
    except Exception:
        raise HTTPException(status_code=503, detail="api_keys table not found. Run migrations/008_api_keys.sql first.")
    if not existing.data:
        raise HTTPException(status_code=404, detail="API key not found")
    provider = existing.data[0]["provider"]

    # Deactivate all, then activate the target
    supabase.table("api_keys").update({"is_active": False}).eq("provider", provider).execute()
    supabase.table("api_keys").update({
        "is_active":  True,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", key_id).execute()

    from app.services.llm_key_service import invalidate_cache
    invalidate_cache(provider)

    return {"ok": True, "activated_id": key_id, "provider": provider}


@router.delete("/api-keys/{key_id}", status_code=200)
def delete_api_key(
    key_id: int,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Permanently delete an API key record."""
    try:
        existing = supabase.table("api_keys").select("provider").eq("id", key_id).execute()
    except Exception:
        raise HTTPException(status_code=503, detail="api_keys table not found. Run migrations/008_api_keys.sql first.")
    if not existing.data:
        raise HTTPException(status_code=404, detail="API key not found")
    provider = existing.data[0]["provider"]

    supabase.table("api_keys").delete().eq("id", key_id).execute()

    from app.services.llm_key_service import invalidate_cache
    invalidate_cache(provider)

    return {"ok": True, "deleted_id": key_id, "provider": provider}
