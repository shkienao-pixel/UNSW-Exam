"""Artifact routes — file upload and management."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Body
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.models.course import ArtifactOut
from app.services.artifact_service import freshen_artifact_urls, remove_artifact, store_file, store_url
from app.services.course_service import get_course, list_artifacts
import app.services.credit_service as credit_service

router = APIRouter()

# doc_type 需要花积分解锁才能查看下载链接
_LOCKED_DOC_TYPES = {"past_exam", "assignment"}


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

    past_exam / assignment files uploaded by others are 'locked' by default:
    storage_url is hidden and is_locked=True until the user unlocks with 1 credit.
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
            a.get("doc_type") in _LOCKED_DOC_TYPES
            and a.get("user_id") != user_id  # 自己上传的不锁
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
    """花 1 积分解锁 past_exam / assignment 文件的下载权限（幂等：已解锁则直接返回）。"""
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

    if art.get("doc_type") not in _LOCKED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="This file does not require unlocking")

    # 扣 1 积分（余额不足会抛 InsufficientCreditsError → 422）
    from app.core.exceptions import InsufficientCreditsError
    try:
        credit_service.spend(supabase, user_id, 1, "unlock_upload", ref_id=str(artifact_id), note=f"解锁文件 {art['file_name']}")
    except InsufficientCreditsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # 写入解锁记录
    try:
        supabase.table("user_unlocked_files").insert({"user_id": user_id, "artifact_id": artifact_id}).execute()
    except Exception:
        # 并发情况下可能唯一约束冲突，忽略
        pass

    return {"ok": True, "already_unlocked": False, "storage_url": art.get("storage_url")}


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
