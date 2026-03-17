"""Notes service: store/retrieve user screenshot notes in Supabase Storage."""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from supabase import Client

logger = logging.getLogger(__name__)

_NOTES_BUCKET = "note-images"
_BUCKET_CREATED = False


def _ensure_bucket(supabase: Client) -> None:
    global _BUCKET_CREATED
    if _BUCKET_CREATED:
        return
    try:
        supabase.storage.create_bucket(_NOTES_BUCKET, options={"public": True})
        logger.info("Created Supabase bucket: %s", _NOTES_BUCKET)
    except Exception:
        pass  # Already exists
    _BUCKET_CREATED = True


def upload_note(
    supabase: Client,
    user_id: str,
    image_bytes: bytes,
    content_type: str,
    caption: str = "",
    course_id: Optional[str] = None,
) -> dict:
    """Upload image to Storage, save metadata to user_notes, return the note row."""
    _ensure_bucket(supabase)

    ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else "png"
    path = f"{user_id}/{uuid.uuid4().hex}.{ext}"

    supabase.storage.from_(_NOTES_BUCKET).upload(
        path, image_bytes, {"content-type": content_type, "upsert": "true"}
    )
    image_url = supabase.storage.from_(_NOTES_BUCKET).get_public_url(path)

    row = {
        "user_id":      user_id,
        "image_url":    image_url,
        "storage_path": path,
        "caption":      caption,
    }
    if course_id:
        row["course_id"] = course_id

    result = supabase.table("user_notes").insert(row).select().execute().data
    return result[0] if result else row


def list_notes(
    supabase: Client,
    user_id: str,
    course_id: Optional[str] = None,
) -> list[dict]:
    """List notes for a user, optionally filtered by course."""
    q = (
        supabase.table("user_notes")
        .select("*")
        .eq("user_id", user_id)
    )
    if course_id:
        q = q.eq("course_id", course_id)
    return q.order("created_at", desc=True).execute().data or []


def update_note_caption(
    supabase: Client,
    user_id: str,
    note_id: int,
    caption: str,
) -> bool:
    supabase.table("user_notes").update({"caption": caption}) \
        .eq("id", note_id).eq("user_id", user_id).execute()
    return True


def delete_note(
    supabase: Client,
    user_id: str,
    note_id: int,
) -> bool:
    rows = (
        supabase.table("user_notes")
        .select("storage_path")
        .eq("id", note_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not rows:
        return False
    path = rows[0].get("storage_path")
    if path:
        try:
            supabase.storage.from_(_NOTES_BUCKET).remove([path])
        except Exception as exc:
            logger.warning("delete_note: storage remove failed for %s: %s", path, exc)
    supabase.table("user_notes").delete().eq("id", note_id).eq("user_id", user_id).execute()
    return True
