"""Admin-only routes.

Protected by X-Admin-Secret header (compared against ADMIN_SECRET env var).
Used by the Streamlit admin panel — never exposed to end users.
# reload trigger: 1
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, Header, HTTPException, UploadFile
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.supabase_client import get_supabase
from app.models.course import ArtifactOut, CourseCreate, CourseOut
from app.services.artifact_service import remove_artifact, store_file, store_url
from app.services.course_service import (
    create_course,
    delete_course,
    list_all_artifacts_admin,
    list_artifacts_by_ids,
    update_artifact_status,
)

router = APIRouter()


def _require_admin(x_admin_secret: str = Header(default="")) -> None:
    cfg = get_settings()
    if not cfg.admin_secret or x_admin_secret != cfg.admin_secret:
        raise HTTPException(status_code=403, detail="Admin access required")


def _bg_process(supabase: Client, artifact: dict) -> None:
    """Background task: chunk + embed one artifact."""
    sp = artifact.get("storage_path")
    ft = artifact.get("file_type", "pdf")
    if not sp or ft == "url":
        return
    try:
        from app.services.rag_service import process_artifact
        process_artifact(
            supabase,
            artifact["id"],
            artifact["course_id"],
            artifact["file_name"],
            ft,
            sp,
        )
    except Exception:
        pass  # non-fatal — artifact is stored, just not yet indexed


# ── File Review Queue ─────────────────────────────────────────────────────────

@router.get("/artifacts", response_model=list[ArtifactOut])
def list_pending_artifacts(
    status: str = "pending",
    course_id: str | None = None,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List artifacts by status (default: pending review)."""
    return list_all_artifacts_admin(supabase, status=status, course_id=course_id)


@router.patch("/artifacts/{artifact_id}/approve", response_model=ArtifactOut)
def approve_artifact(
    artifact_id: int,
    background_tasks: BackgroundTasks,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Approve a user-uploaded file — triggers background RAG indexing."""
    art = update_artifact_status(supabase, artifact_id, status="approved")
    background_tasks.add_task(_bg_process, supabase, art)
    return art


@router.patch("/artifacts/{artifact_id}/reject", response_model=ArtifactOut)
def reject_artifact(
    artifact_id: int,
    reason: str = Body(default="", embed=True),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Reject a user-uploaded file with optional reason."""
    return update_artifact_status(
        supabase, artifact_id, status="rejected", reject_reason=reason or None
    )


# ── Admin Direct Upload (bypasses review) ─────────────────────────────────────

@router.post("/courses/{course_id}/artifacts", response_model=ArtifactOut, status_code=201)
def admin_upload_file(
    course_id: str,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Admin uploads a file directly — immediately approved, triggers RAG indexing."""
    file_bytes = file.file.read()
    art = store_file(
        supabase=supabase,
        user_id=None,
        course_id=course_id,
        file_name=file.filename or "upload.bin",
        file_bytes=file_bytes,
        status="approved",
        uploaded_by=None,
    )
    background_tasks.add_task(_bg_process, supabase, art)
    return art


@router.post("/courses/{course_id}/artifacts/url", response_model=ArtifactOut, status_code=201)
def admin_add_url(
    course_id: str,
    url: str = Body(..., embed=True),
    display_name: str = Body(default="", embed=True),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Admin adds a URL reference — immediately approved (no text to index)."""
    return store_url(
        supabase=supabase,
        user_id=None,
        course_id=course_id,
        url=url,
        display_name=display_name,
        status="approved",
    )


# ── RAG Index Management ───────────────────────────────────────────────────────

@router.post("/courses/{course_id}/reindex")
def reindex_course(
    course_id: str,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Reprocess all approved artifacts in a course (clean → chunk → embed).
    Synchronous — may take several minutes for large courses.
    """
    from app.services.rag_service import reindex_course as _reindex
    result = _reindex(supabase, course_id)
    return {"ok": True, "course_id": course_id, **result}


# ── User Management (admin only) ──────────────────────────────────────────────

@router.get("/users")
def admin_list_users(
    _: None = Depends(_require_admin),
) -> list[dict[str, Any]]:
    """List all registered users via Supabase Admin API."""
    supabase = get_supabase()
    try:
        resp = supabase.auth.admin.list_users()
        # supabase-py v2 may return a list or a response object with .users
        user_list = resp.users if hasattr(resp, "users") else list(resp or [])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Supabase admin API error: {exc}") from exc

    users: list[dict[str, Any]] = []
    for u in user_list:
        try:
            users.append({
                "id":             u.id,
                "email":          u.email or "",
                "created_at":     str(u.created_at) if u.created_at else "",
                "last_sign_in_at": str(u.last_sign_in_at) if getattr(u, "last_sign_in_at", None) else None,
                "email_confirmed": getattr(u, "email_confirmed_at", None) is not None,
            })
        except Exception:
            continue  # skip malformed user objects

    return users


# ── Course Management (admin only) ────────────────────────────────────────────

@router.get("/courses", response_model=list[CourseOut])
def admin_list_courses(
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all courses (admin only, no Bearer token needed)."""
    from app.services.course_service import list_courses
    return list_courses(supabase)


@router.post("/courses", response_model=CourseOut, status_code=201)
def admin_create_course(
    body: CourseCreate,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Create a shared course (admin only)."""
    return create_course(supabase, code=body.code, name=body.name)


@router.delete("/courses/{course_id}", status_code=200)
def admin_delete_course(
    course_id: str,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Delete a course and all related data (admin only)."""
    delete_course(supabase, course_id)
    return {"ok": True, "id": course_id}


# ── Artifact Management ────────────────────────────────────────────────────────

@router.delete("/artifacts/{artifact_id}", status_code=200)
def admin_delete_artifact(
    artifact_id: int,
    course_id: str,
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    rows = list_all_artifacts_admin(supabase, course_id=course_id)
    row = next((r for r in rows if r["id"] == artifact_id), None)
    storage_path = row.get("storage_path") if row else None
    user_id = row.get("user_id") if row else None
    remove_artifact(supabase, user_id, course_id, artifact_id, storage_path)
    return {"ok": True, "id": artifact_id}
