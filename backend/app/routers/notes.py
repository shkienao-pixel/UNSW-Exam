"""Notes routes: user screenshot notes (upload, list, update caption, delete)."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.services import notes_service

router = APIRouter()

_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


class UpdateCaptionRequest(BaseModel):
    caption: str


@router.post("/notes")
async def upload_note(
    image: UploadFile = File(...),
    caption: str = Form(""),
    course_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Upload a screenshot note. Returns the saved note row."""
    if current_user.get("is_guest"):
        raise HTTPException(status_code=403, detail="演示账号不支持该功能，请注册正式账号")

    content_type = image.content_type or "image/jpeg"
    if content_type not in _ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="仅支持 JPEG / PNG / WebP / GIF 格式")

    data = await image.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="图片大小不能超过 10 MB")

    note = notes_service.upload_note(
        supabase,
        user_id=current_user["id"],
        image_bytes=data,
        content_type=content_type,
        caption=caption,
        course_id=course_id or None,
    )
    return note


@router.get("/notes")
def list_notes(
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all notes for the current user (optionally filtered by course)."""
    return notes_service.list_notes(supabase, current_user["id"], course_id)


@router.patch("/notes/{note_id}")
def update_caption(
    note_id: int,
    body: UpdateCaptionRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Update the caption of a note."""
    notes_service.update_note_caption(supabase, current_user["id"], note_id, body.caption)
    return {"ok": True}


@router.delete("/notes/{note_id}")
def delete_note(
    note_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Delete a note and its image from storage."""
    deleted = notes_service.delete_note(supabase, current_user["id"], note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return {"ok": True}
