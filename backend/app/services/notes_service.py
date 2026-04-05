"""Notes service: BlockNote rich-text notes."""

from __future__ import annotations

import logging
import uuid
from typing import Any, List, Optional

from supabase import Client

logger = logging.getLogger(__name__)

_NOTES_BUCKET = "note-images"
_BUCKET_CREATED = False


# ── Block notes (BlockNote editor) ───────────────────────────────────────────

def get_block_note(supabase: Client, user_id: str, course_id: Optional[str] = None) -> list:
    """Return the BlockNote content array for this user/course, or [] if not found."""
    q = supabase.table("block_notes").select("content").eq("user_id", user_id)
    if course_id:
        q = q.eq("course_id", course_id)
    else:
        q = q.is_("course_id", "null")
    result = q.limit(1).execute()
    return result.data[0]["content"] if result.data else []


def upsert_block_note(
    supabase: Client,
    user_id: str,
    content: List[Any],
    course_id: Optional[str] = None,
) -> None:
    """Create or update the BlockNote document for this user/course."""
    q = supabase.table("block_notes").select("id").eq("user_id", user_id)
    if course_id:
        q = q.eq("course_id", course_id)
    else:
        q = q.is_("course_id", "null")
    existing = q.limit(1).execute()

    if existing.data:
        supabase.table("block_notes").update({
            "content": content,
        }).eq("id", existing.data[0]["id"]).execute()
    else:
        row: dict = {"user_id": user_id, "content": content}
        if course_id:
            row["course_id"] = course_id
        supabase.table("block_notes").insert(row).execute()


def upload_block_image(
    supabase: Client,
    user_id: str,
    image_bytes: bytes,
    content_type: str,
) -> str:
    """Upload an image for use inside a BlockNote editor block. Returns the public URL."""
    from app.core.supabase_client import restore_service_role_auth
    restore_service_role_auth()
    _ensure_bucket(supabase)
    ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else "png"
    path = f"{user_id}/blocks/{uuid.uuid4().hex}.{ext}"
    supabase.storage.from_(_NOTES_BUCKET).upload(
        path, image_bytes, {"content-type": content_type, "upsert": "true"}
    )
    return supabase.storage.from_(_NOTES_BUCKET).get_public_url(path)


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


