"""Artifact routes — file upload and management."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Body
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.models.course import ArtifactOut
from app.services.artifact_service import freshen_artifact_urls, remove_artifact, store_file, store_url
from app.services.course_service import get_course, list_artifacts
import app.services.credit_service as credit_service

router = APIRouter()
logger = logging.getLogger(__name__)

# 所有他人上传的文件均需积分解锁（自己上传的永远免费）


def _get_unlocked_ids(supabase: Client, user_id: str) -> set[int]:
    """返回该用户已解锁的 artifact id 集合（表不存在时返回空集）。"""
    try:
        rows = (
            supabase.table("user_unlocked_files")
            .select("artifact_id")
            .eq("user_id", user_id)
            .execute()
            .data
        ) or []
        return {r["artifact_id"] for r in rows}
    except Exception:
        return set()


@router.get("/{course_id}/artifacts", response_model=list[ArtifactOut])
def get_artifacts(
    course_id: str,
    status: str = "approved",
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List artifacts for a course. Defaults to approved only.

    Files uploaded by others are locked by default:
    storage_url is hidden and is_locked=True until the user unlocks with credits.
    Files the user uploaded themselves are always accessible.
    """
    get_course(supabase, course_id)
    arts = list_artifacts(supabase, current_user["id"], course_id, status=status)
    arts = freshen_artifact_urls(supabase, arts)

    user_id = current_user["id"]
    unlocked_ids = _get_unlocked_ids(supabase, user_id)

    result: list[dict[str, Any]] = []
    for a in arts:
        needs_lock = (
            a.get("user_id") != user_id  # 自己上传的不锁，其余全部锁
            and a["id"] not in unlocked_ids
        )
        if needs_lock:
            a = {**a, "storage_url": None, "is_locked": True}
        else:
            a = {**a, "is_locked": False}
        result.append(a)
    return result


_VALID_DOC_TYPES = {"lecture", "tutorial", "revision", "past_exam", "assignment", "other"}


@router.post("/{course_id}/artifacts", response_model=ArtifactOut, status_code=201)
def upload_artifact(
    course_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form("lecture"),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """User upload — goes to pending review queue."""
    if doc_type not in _VALID_DOC_TYPES:
        doc_type = "lecture"
    get_course(supabase, course_id)
    file_bytes = file.file.read()
    # 文件大小限制：50 MB（防止大文件撑爆内存）
    _MAX_UPLOAD_BYTES = 50 * 1024 * 1024
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum upload size is 50 MB.")
    return store_file(
        supabase=supabase,
        user_id=current_user["id"],
        course_id=course_id,
        file_name=file.filename or "upload.bin",
        file_bytes=file_bytes,
        status="pending",
        uploaded_by=current_user["id"],
        doc_type=doc_type,
    )


@router.post("/{course_id}/artifacts/url", response_model=ArtifactOut, status_code=201)
def add_url_artifact(
    course_id: str,
    url: str = Body(..., embed=True),
    display_name: str = Body(default="", embed=True),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """User submits a URL reference — goes to pending."""
    get_course(supabase, course_id)
    return store_url(
        supabase=supabase,
        user_id=current_user["id"],
        course_id=course_id,
        url=url,
        display_name=display_name,
        status="pending",
    )


@router.post("/{course_id}/artifacts/{artifact_id}/unlock", status_code=200)
def unlock_artifact(
    course_id: str,
    artifact_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """花积分解锁文件的深度解析权限（幂等：已解锁则直接返回）。"""
    get_course(supabase, course_id)
    user_id = current_user["id"]

    # 幂等：已解锁直接返回
    unlocked_ids = _get_unlocked_ids(supabase, user_id)
    if artifact_id in unlocked_ids:
        # 重新取该 artifact 的 storage_url
        row = supabase.table("artifacts").select("storage_url").eq("id", artifact_id).execute()
        url = row.data[0]["storage_url"] if row.data else None
        return {"ok": True, "already_unlocked": True, "storage_url": url}

    # 验证 artifact 存在且属于该 course
    row = supabase.table("artifacts").select("*").eq("id", artifact_id).eq("course_id", course_id).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Artifact not found")
    art = row.data[0]

    # 只允许解锁已审核通过的文件
    if art.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Only approved files can be unlocked")

    # 自己上传的文件无需解锁（免费放行，fixes #7: self-upload bypass）
    if art.get("user_id") == user_id:
        return {"ok": True, "already_unlocked": True, "storage_url": art.get("storage_url")}

    # 扣积分（余额不足抛 InsufficientCreditsError → main.py 统一处理为 402）
    unlock_cost = credit_service.COSTS.get("unlock_upload", 50)
    credit_service.spend(
        supabase,
        user_id,
        unlock_cost,
        "unlock_upload",
        ref_id=str(artifact_id),
        note=f"深度解析文件 {art['file_name']}",
    )

    # 写入解锁记录
    try:
        supabase.table("user_unlocked_files").insert({"user_id": user_id, "artifact_id": artifact_id}).execute()
    except Exception:
        # 并发情况下可能唯一约束冲突，忽略
        pass

    return {"ok": True, "already_unlocked": False, "storage_url": art.get("storage_url")}


@router.post("/{course_id}/artifacts/unlock-all", status_code=200)
def unlock_all_artifacts(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """一次性花积分解锁本课程所有锁定文件（幂等：已解锁的不重复扣费）。

    返回 { ok, locked_count, unlocked_count, credits_spent }
    """
    get_course(supabase, course_id)
    user_id = current_user["id"]

    arts = list_artifacts(supabase, user_id, course_id, status="approved")
    arts = freshen_artifact_urls(supabase, arts)
    unlocked_ids = _get_unlocked_ids(supabase, user_id)

    # 找出本课程中对当前用户而言仍然锁定的文件（所有他人上传）
    to_unlock = [
        a for a in arts
        if a.get("user_id") != user_id
        and a["id"] not in unlocked_ids
    ]

    locked_total = len([
        a for a in arts
        if a.get("user_id") != user_id
    ])

    if not to_unlock:
        return {"ok": True, "locked_count": locked_total, "unlocked_count": 0, "credits_spent": 0}

    unlock_cost = credit_service.COSTS.get("unlock_upload", 50)
    cost = len(to_unlock) * unlock_cost

    # 积分不足抛 InsufficientCreditsError → main.py 统一处理为 402
    credit_service.spend(
        supabase, user_id, cost, "unlock_all",
        note=f"一键深度解析课程 {course_id[:8]} 共 {len(to_unlock)} 份文件",
    )

    for a in to_unlock:
        try:
            supabase.table("user_unlocked_files").insert(
                {"user_id": user_id, "artifact_id": a["id"]}
            ).execute()
        except Exception:
            pass  # 唯一约束冲突忽略

    return {"ok": True, "locked_count": locked_total, "unlocked_count": len(to_unlock), "credits_spent": cost}


@router.patch("/{course_id}/artifacts/{artifact_id}/doc-type", response_model=ArtifactOut)
def update_artifact_doc_type(
    course_id: str,
    artifact_id: int,
    doc_type: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """上传者修改自己文件的分类，并异步同步 ChromaDB 向量元数据。

    RAG Sync 架构：
      1. UPDATE artifacts.doc_type → Supabase (同步、快速)
      2. UPDATE ChromaDB chunk metadata → 后台任务 (非阻塞、无重新向量化)
    ChromaDB 只更新 metadata 字段，不重新 embed，零成本。
    """
    if doc_type not in _VALID_DOC_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid doc_type. Must be one of: {sorted(_VALID_DOC_TYPES)}")

    # 仅允许上传者修改自己的文件
    row = supabase.table("artifacts").select("*").eq("id", artifact_id).eq("course_id", course_id).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Artifact not found")
    art = row.data[0]
    if art.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the uploader can change the category")

    # Step 1: 更新关系型数据库
    supabase.table("artifacts").update({"doc_type": doc_type}).eq("id", artifact_id).execute()
    updated = supabase.table("artifacts").select("*").eq("id", artifact_id).execute().data[0]

    # Step 2: 异步同步 ChromaDB 向量元数据（非阻塞）
    try:
        from app.services.rag_service import sync_artifact_doc_type
        import threading
        threading.Thread(
            target=sync_artifact_doc_type,
            args=(course_id, artifact_id, doc_type),
            daemon=True,
        ).start()
    except Exception:
        pass  # RAG sync 失败不影响主流程

    return {**updated, "is_locked": False}


@router.delete("/{course_id}/artifacts/{artifact_id}", status_code=200)
def delete_artifact_route(
    course_id: str,
    artifact_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    from app.services.course_service import list_artifacts_by_ids
    rows = list_artifacts_by_ids(supabase, current_user["id"], course_id, [artifact_id])
    storage_path = rows[0].get("storage_path") if rows else None
    remove_artifact(supabase, current_user["id"], course_id, artifact_id, storage_path)
    return {"ok": True, "id": artifact_id}
