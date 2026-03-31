"""Notes service: store/retrieve user screenshot notes in Supabase Storage."""

from __future__ import annotations

import base64
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


def _analyze_with_vision(image_bytes: bytes, content_type: str, openai_key: str) -> str:
    """Call GPT-4o Vision to extract text and describe the screenshot for studying.

    Returns extracted content string, or empty string on any failure.
    """
    try:
        import openai

        b64 = base64.b64encode(image_bytes).decode()
        data_url = f"data:{content_type};base64,{b64}"

        client = openai.OpenAI(api_key=openai_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=1500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "这是一张学习截图。请：\n"
                                "1. 提取截图中所有文字内容（保持原有结构）\n"
                                "2. 如果有图表/公式/代码，用文字简要描述\n"
                                "3. 输出格式：纯文本，保留层级结构，不要加额外说明\n"
                                "如果截图内容不清晰，尽量提取可见文字。"
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url, "detail": "high"},
                        },
                    ],
                }
            ],
        )
        return resp.choices[0].message.content or ""
    except Exception as exc:
        logger.warning("Vision analysis failed: %s", exc)
        return ""


def upload_note(
    supabase: Client,
    user_id: str,
    image_bytes: bytes,
    content_type: str,
    caption: str = "",
    course_id: Optional[str] = None,
) -> dict:
    """Upload image to Storage, run Vision analysis, save to user_notes, return the note row."""
    # supabase-py v2 replaces the shared client's auth header when auth.sign_up()
    # or auth.verify_otp() is called. Restore service-role key before Storage ops.
    from app.core.supabase_client import restore_service_role_auth
    restore_service_role_auth()

    _ensure_bucket(supabase)

    ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else "png"
    path = f"{user_id}/{uuid.uuid4().hex}.{ext}"

    supabase.storage.from_(_NOTES_BUCKET).upload(
        path, image_bytes, {"content-type": content_type, "upsert": "true"}
    )
    image_url = supabase.storage.from_(_NOTES_BUCKET).get_public_url(path)

    # Run Vision analysis (best-effort — failure won't block the upload)
    from app.services.llm_key_service import get_api_key
    openai_key = get_api_key("openai", supabase) or ""
    ai_content = _analyze_with_vision(image_bytes, content_type, openai_key) if openai_key else ""

    row: dict = {
        "user_id":      user_id,
        "image_url":    image_url,
        "storage_path": path,
        "caption":      caption,
    }
    if course_id:
        row["course_id"] = course_id

    # Try to include ai_content (requires migration 033 to have been run).
    # Fall back silently if the column doesn't exist yet.
    try:
        result = supabase.table("user_notes").insert({**row, "ai_content": ai_content}).select().execute().data
        return result[0] if result else {**row, "ai_content": ai_content}
    except Exception:
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
