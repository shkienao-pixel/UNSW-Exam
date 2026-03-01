"""Content extraction route.

GET /courses/{course_id}/content?scope_set_id=X
Returns extracted text from all approved artifacts in the given scope.
Called by Next.js API Routes before sending to OpenAI.
"""

from __future__ import annotations

import io
from typing import Any

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AppError
from app.services.artifact_service import download_artifact_bytes
from app.services.course_service import (
    get_course,
    get_scope_set,
    list_artifacts,
    list_artifacts_by_ids,
)

router = APIRouter()


def _extract_text(file_type: str, data: bytes, file_name: str) -> str:
    if file_type == "pdf":
        return _extract_pdf(data)
    elif file_type == "word":
        return _extract_word(data)
    elif file_type == "python":
        return data.decode("utf-8", errors="replace")
    elif file_type == "url":
        return f"[URL reference: see storage_url field]"
    else:
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return f"[Binary file: {file_name}]"


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages:
            text = page.extract_text() or ""
            parts.append(text)
        return "\n\n".join(parts)
    except Exception as exc:
        return f"[PDF extraction failed: {exc}]"


def _extract_word(data: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
        return "\n".join(para.text for para in doc.paragraphs if para.text.strip())
    except Exception as exc:
        return f"[Word extraction failed: {exc}]"


@router.get("/{course_id}/content")
def get_course_content(
    course_id: str,
    scope_set_id: int | None = Query(default=None),
    artifact_ids: str = Query(default=""),  # comma-separated IDs
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """
    Extract text from approved course artifacts.
    Priority: artifact_ids > scope_set_id > all approved artifacts.
    Returns: { course_id, artifacts: [{id, name, type, text}], total_chars }
    """
    get_course(supabase, course_id)

    # Resolve which artifacts to use
    if artifact_ids:
        ids = [int(x) for x in artifact_ids.split(",") if x.strip().isdigit()]
        artifacts = list_artifacts_by_ids(supabase, current_user["id"], course_id, ids)
    elif scope_set_id:
        scope = get_scope_set(supabase, current_user["id"], scope_set_id)
        item_ids = scope.get("artifact_ids") or []
        if item_ids:
            artifacts = list_artifacts_by_ids(supabase, current_user["id"], course_id, item_ids)
        else:
            artifacts = list_artifacts(supabase, current_user["id"], course_id, status="approved")
    else:
        artifacts = list_artifacts(supabase, current_user["id"], course_id, status="approved")

    # Filter to approved only
    artifacts = [a for a in artifacts if a.get("status") == "approved"]

    results = []
    total_chars = 0

    for art in artifacts:
        file_type = art.get("file_type", "pdf")
        storage_path = art.get("storage_path")
        storage_url = art.get("storage_url") or ""

        if file_type == "url":
            text = f"URL: {storage_url}"
        elif storage_path:
            try:
                raw = download_artifact_bytes(supabase, storage_path)
                text = _extract_text(file_type, raw, art["file_name"])
            except AppError as e:
                text = f"[Download error: {e}]"
        else:
            text = f"[No storage path for {art['file_name']}]"

        total_chars += len(text)
        results.append({
            "id": art["id"],
            "name": art["file_name"],
            "type": file_type,
            "text": text,
        })

    return {
        "course_id": course_id,
        "artifacts": results,
        "total_chars": total_chars,
        "artifact_count": len(results),
    }
