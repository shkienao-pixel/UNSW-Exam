"""Admin-only routes.

Protected by X-Admin-Secret header (compared against ADMIN_SECRET env var).
Used by the Next.js admin panel — never exposed to end users.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.supabase_client import get_supabase
from app.models.course import ArtifactOut, CourseCreate, CourseOut
from app.services.artifact_service import remove_artifact, store_file, store_url
from app.services.course_service import (
    create_course,
    delete_course,
    list_all_artifacts_admin,
    list_artifacts_by_ids,
    update_artifact_status,
)

try:
    from app.services.rag_service import sync_artifact_doc_type as _sync_doc_type
except Exception:
    _sync_doc_type = None  # type: ignore[assignment]

router = APIRouter()


def _require_admin(x_admin_secret: str = Header(default="")) -> None:
    cfg = get_settings()
    if not x_admin_secret or x_admin_secret not in cfg.admin_secrets_set:
        raise HTTPException(status_code=403, detail="Admin access required")


def _bg_process(supabase: Client, artifact: dict) -> None:
    """Background task: chunk + embed one artifact."""
    sp = artifact.get("storage_path")
    ft = artifact.get("file_type", "pdf")
    if not sp or ft == "url":
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
    art = update_artifact_status(supabase, artifact_id, status="approved")
    background_tasks.add_task(_bg_process, supabase, art)
    return art


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
    # supabase-py v2 需要 .select() 才能拿到修改后的行
    resp = (
        supabase.table("artifacts")
        .update({"doc_type": doc_type})
        .eq("id", artifact_id)
        .select()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Artifact not found")

    artifact = resp.data[0]

    # Step 2: 同步 ChromaDB 向量元数据（后台非阻塞，失败不影响响应）
    if _sync_doc_type is not None:
        background_tasks.add_task(_sync_doc_type, artifact["course_id"], artifact_id, doc_type)

    return artifact


@router.patch("/artifacts/{artifact_id}/reject", response_model=ArtifactOut)
def reject_artifact(
    artifact_id: int,
    reason: str = Body(default="", embed=True),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Reject a user-uploaded file with optional reason."""
    return update_artifact_status(
        supabase, artifact_id, status="rejected", reject_reason=reason or None
    )


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
        raise HTTPException(status_code=500, detail=f"Supabase HTTP {exc.response.status_code}: {exc.response.text[:200]}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Supabase admin API error [{type(exc).__name__}]: {exc}") from exc

    raw_users = data.get("users", data) if isinstance(data, dict) else data
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
    return create_course(supabase, code=body.code, name=body.name)


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
    storage_path = row.get("storage_path") if row else None
    user_id = row.get("user_id") if row else None
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
