"""Notes routes: block-note editor."""

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.services import notes_service

router = APIRouter()

_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


class UpsertBlockNoteRequest(BaseModel):
    content: List[Any]
    course_id: Optional[str] = None
    page: int = 1


@router.get("/notes/block/pages")
def get_block_note_pages(
    course_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    pages = notes_service.list_block_note_pages(supabase, current_user["id"], course_id)
    return {"pages": pages}


@router.get("/notes/block")
def get_block_note(
    course_id: Optional[str] = None,
    page: int = 1,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    content = notes_service.get_block_note(supabase, current_user["id"], course_id, page)
    return {"content": content}


@router.put("/notes/block")
def upsert_block_note(
    body: UpsertBlockNoteRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    notes_service.upsert_block_note(
        supabase, current_user["id"], body.content, body.course_id, body.page
    )
    return {"ok": True}


@router.post("/notes/block/upload")
async def upload_block_image(
    image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Upload an image for use inside BlockNote editor. Returns the public URL."""
    if current_user.get("is_guest"):
        raise HTTPException(status_code=403, detail="演示账号不支持该功能")
    content_type = image.content_type or "image/jpeg"
    if content_type not in _ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="仅支持 JPEG / PNG / WebP / GIF 格式")
    data = await image.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="图片大小不能超过 10 MB")
    url = notes_service.upload_block_image(supabase, current_user["id"], data, content_type)
    return {"url": url}
