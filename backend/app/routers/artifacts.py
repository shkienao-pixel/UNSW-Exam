"""Artifact routes — file upload and management."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, UploadFile, Body
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.models.course import ArtifactOut
from app.services.artifact_service import freshen_artifact_urls, remove_artifact, store_file, store_url
from app.services.course_service import get_course, list_artifacts

router = APIRouter()


@router.get("/{course_id}/artifacts", response_model=list[ArtifactOut])
def get_artifacts(
    course_id: str,
    status: str = "approved",
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List artifacts for a course. Defaults to approved only."""
    get_course(supabase, course_id)
    arts = list_artifacts(supabase, current_user["id"], course_id, status=status)
    return freshen_artifact_urls(supabase, arts)


@router.post("/{course_id}/artifacts", response_model=ArtifactOut, status_code=201)
def upload_artifact(
    course_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """User upload — goes to pending review queue."""
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
