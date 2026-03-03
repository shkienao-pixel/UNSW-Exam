"""Artifact storage service — Supabase Storage backend.

Supports: PDF, Word (.docx), Python (.py), URL references.
Admin uploads → status='approved' immediately.
User uploads  → status='pending', requires admin review.
"""

from __future__ import annotations

import hashlib
import mimetypes
import re
from pathlib import Path
from typing import Literal

from supabase import Client

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.services.course_service import delete_artifact, save_artifact

_UNSAFE_CHARS = re.compile(r"[^a-zA-Z0-9.\-]")

# Signed URL validity — 10 years (effectively permanent for this app)
_SIGNED_URL_EXPIRY = 10 * 365 * 24 * 3600

FileType = Literal["pdf", "word", "python", "url", "other"]

_EXT_TO_TYPE: dict[str, FileType] = {
    ".pdf":  "pdf",
    ".docx": "word",
    ".doc":  "word",
    ".py":   "python",
}

_TYPE_TO_MIME: dict[FileType, str] = {
    "pdf":    "application/pdf",
    "word":   "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "python": "text/x-python",
    "other":  "application/octet-stream",
}


def _detect_file_type(filename: str) -> FileType:
    ext = Path(filename).suffix.lower()
    return _EXT_TO_TYPE.get(ext, "other")


def _sanitize_filename(name: str) -> str:
    stem = Path(name).stem
    suffix = Path(name).suffix or ".bin"
    clean = _UNSAFE_CHARS.sub("_", stem)[:80]
    return f"{clean}{suffix}"


def _file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _make_signed_url(supabase: Client, storage_path: str) -> str:
    """Generate a signed URL with 10-year expiry. Returns '' on failure."""
    cfg = get_settings()
    try:
        signed = supabase.storage.from_(cfg.supabase_storage_bucket).create_signed_url(
            storage_path, expires_in=_SIGNED_URL_EXPIRY
        )
        return signed.get("signedURL") or signed.get("signed_url") or ""
    except Exception:
        return ""


def freshen_artifact_urls(supabase: Client, artifacts: list[dict]) -> list[dict]:
    """Refresh signed URLs for a list of artifacts and write updates back to DB.

    Called on every GET /artifacts so the stored URL never goes stale.
    """
    result: list[dict] = []
    for a in artifacts:
        sp = a.get("storage_path")
        if not sp:
            result.append(a)
            continue
        fresh = _make_signed_url(supabase, sp)
        if fresh and fresh != a.get("storage_url", ""):
            try:
                supabase.table("artifacts").update({"storage_url": fresh}).eq("id", a["id"]).execute()
            except Exception:
                pass
            a = {**a, "storage_url": fresh}
        result.append(a)
    return result


def store_file(
    supabase: Client,
    user_id: str | None,
    course_id: str,
    file_name: str,
    file_bytes: bytes,
    status: str = "pending",
    uploaded_by: str | None = None,
    doc_type: str = "lecture",
) -> dict:
    """Upload a file to Supabase Storage and record metadata.

    status='approved'  → admin upload, immediately usable
    status='pending'   → user upload, needs admin review
    """
    if not file_bytes:
        raise AppError("Uploaded file is empty")

    cfg = get_settings()
    safe_name = _sanitize_filename(file_name)
    file_hash = _file_hash(file_bytes)
    file_type = _detect_file_type(safe_name)

    # Storage path: {course_id}/{hash[:12]}_{filename}
    storage_path = f"{course_id}/{file_hash[:12]}_{safe_name}"
    content_type = _TYPE_TO_MIME.get(file_type, "application/octet-stream")

    # Upload to Supabase Storage (upsert = overwrite if same path)
    try:
        supabase.storage.from_(cfg.supabase_storage_bucket).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as exc:
        # If it's a duplicate (already exists), that's fine
        if "already exists" not in str(exc).lower():
            raise AppError(f"Storage upload failed: {exc}") from exc

    # Get a signed URL (10-year expiry — effectively permanent)
    storage_url = _make_signed_url(supabase, storage_path)

    return save_artifact(
        supabase=supabase,
        user_id=user_id,
        course_id=course_id,
        file_name=safe_name,
        file_hash=file_hash,
        file_type=file_type,
        doc_type=doc_type,
        status=status,
        storage_path=storage_path,
        storage_url=storage_url,
        uploaded_by=uploaded_by,
    )


def store_url(
    supabase: Client,
    user_id: str,
    course_id: str,
    url: str,
    display_name: str = "",
    status: str = "pending",
    doc_type: str = "other",
) -> dict:
    """Record a URL reference (no file upload, just metadata)."""
    import hashlib
    url_hash = hashlib.sha256(url.encode()).hexdigest()
    name = display_name or url[:80]

    return save_artifact(
        supabase=supabase,
        user_id=user_id,
        course_id=course_id,
        file_name=name,
        file_hash=url_hash,
        file_type="url",
        doc_type=doc_type,
        status=status,
        storage_path=None,
        storage_url=url,
        file_path=url,
        uploaded_by=user_id,
    )


def remove_artifact(
    supabase: Client,
    user_id: str,
    course_id: str,
    artifact_id: int,
    storage_path: str | None = None,
) -> None:
    """Delete file from Supabase Storage and remove DB record."""
    cfg = get_settings()
    if storage_path:
        try:
            supabase.storage.from_(cfg.supabase_storage_bucket).remove([storage_path])
        except Exception:
            pass  # best-effort

    delete_artifact(supabase, user_id, course_id, artifact_id)


def download_artifact_bytes(supabase: Client, storage_path: str) -> bytes:
    """Download raw bytes from Supabase Storage."""
    cfg = get_settings()
    try:
        data = supabase.storage.from_(cfg.supabase_storage_bucket).download(storage_path)
        return data
    except Exception as exc:
        raise AppError(f"Failed to download artifact: {exc}") from exc
