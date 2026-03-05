"""Course management service — Supabase-backed, user-scoped.

All public functions require ``supabase`` and ``user_id`` arguments.
Data isolation is enforced via explicit ``.eq("user_id", user_id)`` filters
(service-role key bypasses RLS, so we must filter manually).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.core.exceptions import AppError, NotFoundError

_COURSE_CODE_RE = re.compile(r"[^A-Z0-9]")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_course_code(code: str) -> str:
    return _COURSE_CODE_RE.sub("", code.upper().strip())


# ── Courses ──────────────────────────────────────────────────────────────────


def list_courses(supabase: Client) -> list[dict[str, Any]]:
    """List all courses — courses are shared/admin-managed, visible to all users."""
    resp = (
        supabase.table("courses")
        .select("id, code, name, exam_date, created_at, updated_at")
        .order("code")
        .execute()
    )
    return resp.data or []


def get_course(supabase: Client, course_id: str, user_id: str | None = None) -> dict[str, Any]:
    """Get a course by ID. user_id is accepted but not used for filtering (courses are shared)."""
    resp = (
        supabase.table("courses")
        .select("id, code, name, exam_date, created_at, updated_at")
        .eq("id", course_id)
        .single()
        .execute()
    )
    if not resp.data:
        raise NotFoundError("Course")
    return resp.data


def create_course(
    supabase: Client, code: str, name: str, created_by: str | None = None
) -> dict[str, Any]:
    """Admin only: create a shared course."""
    normalized = _normalize_course_code(code)
    if not normalized:
        raise AppError("Course code must contain at least one alphanumeric character")

    now = _now_iso()
    payload: dict[str, Any] = {
        "code": normalized,
        "name": name.strip(),
        "created_at": now,
        "updated_at": now,
    }
    if created_by:
        payload["created_by"] = created_by

    resp = supabase.table("courses").insert(payload).execute()
    if not resp.data:
        raise AppError("Failed to create course")
    return resp.data[0]


def delete_course(supabase: Client, course_id: str) -> None:
    """Admin only: delete a course."""
    supabase.table("courses").delete().eq("id", course_id).execute()


def set_exam_date(supabase: Client, course_id: str, exam_date: "datetime | None") -> dict[str, Any]:
    """Admin only: set or clear the exam date for a course."""
    value = exam_date.isoformat() if exam_date is not None else None
    resp = (
        supabase.table("courses")
        .update({"exam_date": value, "updated_at": _now_iso()})
        .eq("id", course_id)
        .select("id, code, name, exam_date, created_at, updated_at")
        .execute()
    )
    if not resp.data:
        raise NotFoundError("Course")
    return resp.data[0]


# ── Artifacts ─────────────────────────────────────────────────────────────────


_ARTIFACT_COLS = (
    "id, course_id, user_id, file_name, file_hash, file_path, file_type, doc_type, status, "
    "storage_path, storage_url, reject_reason, uploaded_by, created_at"
)


def list_artifacts(
    supabase: Client,
    user_id: str,
    course_id: str,
    status: str | None = "approved",
) -> list[dict[str, Any]]:
    q = (
        supabase.table("artifacts")
        .select(_ARTIFACT_COLS)
        .eq("course_id", course_id)
        .order("created_at", desc=False)
    )
    if status:
        q = q.eq("status", status)
    # For non-approved statuses, show only the user's own files
    if status and status != "approved":
        q = q.or_(f"user_id.eq.{user_id},uploaded_by.eq.{user_id}")
    return q.execute().data or []


def list_all_artifacts_admin(
    supabase: Client,
    status: str | None = None,
    course_id: str | None = None,
) -> list[dict[str, Any]]:
    """Admin-only: list artifacts across all users."""
    q = supabase.table("artifacts").select(_ARTIFACT_COLS).order("created_at", desc=True)
    if status:
        q = q.eq("status", status)
    if course_id:
        q = q.eq("course_id", course_id)
    return q.execute().data or []


def list_artifacts_by_ids(
    supabase: Client, user_id: str, course_id: str, artifact_ids: list[int]
) -> list[dict[str, Any]]:
    """Return artifacts by IDs within a course. No user_id filter — admin-uploaded artifacts (user_id=NULL) must be visible."""
    if not artifact_ids:
        return []
    return (
        supabase.table("artifacts")
        .select(_ARTIFACT_COLS)
        .eq("course_id", course_id)
        .in_("id", artifact_ids)
        .execute()
    ).data or []


def save_artifact(
    supabase: Client,
    user_id: str | None,
    course_id: str,
    file_name: str,
    file_hash: str,
    file_type: str = "pdf",
    doc_type: str = "lecture",
    status: str = "approved",
    storage_path: str | None = None,
    storage_url: str | None = None,
    file_path: str | None = None,
    uploaded_by: str | None = None,
) -> dict[str, Any]:
    now = _now_iso()
    payload: dict[str, Any] = {
        "course_id": course_id,
        "file_name": file_name,
        "file_hash": file_hash,
        "file_type": file_type,
        "doc_type":  doc_type,
        "status": status,
        "created_at": now,
    }
    if user_id is not None:
        payload["user_id"] = user_id
    if storage_path is not None:
        payload["storage_path"] = storage_path
    if storage_url is not None:
        payload["storage_url"] = storage_url
    if file_path is not None:
        payload["file_path"] = file_path
    if uploaded_by is not None:
        payload["uploaded_by"] = uploaded_by

    # Check for an existing record with the same (course_id, file_hash).
    # Using upsert would silently overwrite status/user_id/doc_type when a
    # different user uploads the same file — instead, return the existing row.
    existing = (
        supabase.table("artifacts")
        .select("*")
        .eq("course_id", course_id)
        .eq("file_hash", file_hash)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    try:
        resp = supabase.table("artifacts").insert(payload).execute()
    except Exception as exc:
        raise AppError(f"Failed to save artifact: {exc}") from exc

    if not resp.data:
        raise AppError("Failed to save artifact record")
    return resp.data[0]


def update_artifact_status(
    supabase: Client,
    artifact_id: int,
    status: str,
    reject_reason: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": status}
    if reject_reason is not None:
        payload["reject_reason"] = reject_reason
    # supabase-py update().eq() 返回 SyncFilterRequestBuilder，不支持 .select()
    # 改为先 update 再单独 select 取回完整行
    supabase.table("artifacts").update(payload).eq("id", artifact_id).execute()
    fetch = supabase.table("artifacts").select("*").eq("id", artifact_id).execute()
    if not fetch.data:
        raise NotFoundError("Artifact")
    return fetch.data[0]


def delete_artifact(
    supabase: Client, user_id: str | None, course_id: str, artifact_id: int
) -> None:
    """Delete an artifact DB record.

    user_id may be None for admin-uploaded files — in that case we skip the
    user_id filter and rely on id+course_id uniqueness (fixes #8).
    """
    q = (
        supabase.table("artifacts")
        .delete()
        .eq("id", artifact_id)
        .eq("course_id", course_id)
    )
    if user_id is not None:
        q = q.eq("user_id", user_id)
    q.execute()


# ── Scope Sets ────────────────────────────────────────────────────────────────


def list_scope_sets(
    supabase: Client, user_id: str, course_id: str
) -> list[dict[str, Any]]:
    # Courses are shared/admin-managed, so scope sets are visible to all users
    resp = (
        supabase.table("scope_sets")
        .select("id, course_id, name, is_default, created_at, updated_at")
        .eq("course_id", course_id)
        .order("is_default", desc=True)
        .order("created_at")
        .execute()
    )
    rows = resp.data or []
    for row in rows:
        row["artifact_ids"] = _get_scope_set_artifact_ids(supabase, row["id"])
    return rows


def get_scope_set(
    supabase: Client, user_id: str, scope_set_id: int
) -> dict[str, Any]:
    resp = (
        supabase.table("scope_sets")
        .select("id, course_id, name, is_default, created_at, updated_at")
        .eq("id", scope_set_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not resp.data:
        raise NotFoundError("ScopeSet")
    row = dict(resp.data)
    row["artifact_ids"] = _get_scope_set_artifact_ids(supabase, scope_set_id)
    return row


def _get_scope_set_artifact_ids(supabase: Client, scope_set_id: int) -> list[int]:
    resp = (
        supabase.table("scope_set_items")
        .select("artifact_id")
        .eq("scope_set_id", scope_set_id)
        .execute()
    )
    return [r["artifact_id"] for r in (resp.data or [])]


def ensure_default_scope_set(
    supabase: Client, user_id: str, course_id: str
) -> dict[str, Any]:
    # Query without user_id filter to find any existing default scope set for this course
    resp = (
        supabase.table("scope_sets")
        .select("*")
        .eq("course_id", course_id)
        .eq("is_default", True)
        .limit(1)
        .execute()
    )
    if resp.data:
        row = dict(resp.data[0])
        row["artifact_ids"] = _get_scope_set_artifact_ids(supabase, row["id"])
        return row

    now = _now_iso()
    upsert_resp = (
        supabase.table("scope_sets")
        .upsert(
            {
                "course_id": course_id,
                "user_id": user_id,
                "name": "All Files",
                "is_default": True,
                "created_at": now,
                "updated_at": now,
            },
            on_conflict="course_id,name",
        )
        .execute()
    )
    row = dict(upsert_resp.data[0])
    row["artifact_ids"] = []
    return row


def create_scope_set(
    supabase: Client, user_id: str, course_id: str, name: str
) -> dict[str, Any]:
    now = _now_iso()
    resp = (
        supabase.table("scope_sets")
        .insert(
            {
                "course_id": course_id,
                "user_id": user_id,
                "name": name.strip(),
                "is_default": False,
                "created_at": now,
                "updated_at": now,
            }
        )
        .execute()
    )
    if not resp.data:
        raise AppError("Failed to create scope set")
    row = dict(resp.data[0])
    row["artifact_ids"] = []
    return row


def rename_scope_set(
    supabase: Client, user_id: str, scope_set_id: int, name: str
) -> dict[str, Any]:
    resp = (
        supabase.table("scope_sets")
        .update({"name": name.strip(), "updated_at": _now_iso()})
        .eq("id", scope_set_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not resp.data:
        raise NotFoundError("ScopeSet")
    return get_scope_set(supabase, user_id, scope_set_id)


def delete_scope_set(
    supabase: Client, user_id: str, scope_set_id: int
) -> None:
    supabase.table("scope_sets").delete().eq("id", scope_set_id).eq(
        "user_id", user_id
    ).execute()


def replace_scope_set_items(
    supabase: Client, scope_set_id: int, artifact_ids: list[int]
) -> int:
    supabase.table("scope_set_items").delete().eq("scope_set_id", scope_set_id).execute()
    if not artifact_ids:
        return 0
    now = _now_iso()
    rows = [
        {"scope_set_id": scope_set_id, "artifact_id": aid, "created_at": now}
        for aid in artifact_ids
    ]
    supabase.table("scope_set_items").insert(rows).execute()
    return len(rows)


# ── Outputs ───────────────────────────────────────────────────────────────────


def create_output(
    supabase: Client,
    user_id: str,
    course_id: str,
    output_type: str,
    content: str,
    scope_artifact_ids: list[int] | None = None,
    scope_set_id: int | None = None,
    model_used: str = "gpt-4o",
    status: str = "success",
) -> dict[str, Any]:
    now = _now_iso()
    resp = (
        supabase.table("outputs")
        .insert(
            {
                "course_id": course_id,
                "user_id": user_id,
                "output_type": output_type,
                "scope_set_id": scope_set_id,
                "scope_artifact_ids": scope_artifact_ids or [],
                "model_used": model_used,
                "status": status,
                "content": content,
                "created_at": now,
            }
        )
        .execute()
    )
    if not resp.data:
        raise AppError("Failed to save output")
    return resp.data[0]


def list_outputs(
    supabase: Client, user_id: str, course_id: str, output_type: str = ""
) -> list[dict[str, Any]]:
    q = (
        supabase.table("outputs")
        .select(
            "id, course_id, output_type, scope_set_id, scope_artifact_ids, "
            "model_used, status, content, created_at"
        )
        .eq("course_id", course_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )
    if output_type:
        q = q.eq("output_type", output_type)
    return q.execute().data or []


def get_output(
    supabase: Client, user_id: str, output_id: int
) -> dict[str, Any]:
    resp = (
        supabase.table("outputs")
        .select(
            "id, course_id, output_type, scope_set_id, scope_artifact_ids, "
            "model_used, status, content, created_at"
        )
        .eq("id", output_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not resp.data:
        raise NotFoundError("Output")
    return resp.data


def delete_output(supabase: Client, user_id: str, output_id: int) -> None:
    supabase.table("outputs").delete().eq("id", output_id).eq(
        "user_id", user_id
    ).execute()
