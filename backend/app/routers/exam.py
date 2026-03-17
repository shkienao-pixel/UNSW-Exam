"""Exam routes: real past-exam questions + mock generation + grading + favorites.

Mounted at two prefixes in main.py:
  /courses/{course_id}  → router      (course-scoped routes)
  (root)                → global_router (GET /exam/favorites — all courses)
"""

from __future__ import annotations

import uuid
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.services import exam_service, job_service
from app.services.generate_service import _get_openai_key

router = APIRouter()
global_router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request schemas ───────────────────────────────────────────────────────────

class SubmitAnswerItem(BaseModel):
    question_id: int
    user_answer: str


class SubmitRequest(BaseModel):
    answers: list[SubmitAnswerItem]


class MockGenerateRequest(BaseModel):
    num_mcq: int = 10
    num_short: int = 5


# ── Past exam list ─────────────────────────────────────────────────────────────

@router.get("/exam/past-exams")
def list_past_exams(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List past exam files with unlock status for the current user."""
    return exam_service.get_past_exam_list(supabase, course_id, user_id=current_user["id"])


@router.post("/exam/past/{artifact_id}/unlock")
def unlock_past_exam(
    course_id: str,
    artifact_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Unlock a past exam paper for the current user (costs 150 credits, one-time)."""
    if current_user.get("is_guest"):
        raise HTTPException(status_code=403, detail="演示账号不支持该功能，请注册正式账号")
    from app.services.credit_service import InsufficientCreditsError
    try:
        newly_unlocked = exam_service.unlock_past_exam(supabase, current_user["id"], artifact_id)
        return {"ok": True, "newly_unlocked": newly_unlocked}
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=f"积分不足：当前 {e.balance} 积分，需要 {e.required} 积分")


# ── Questions ─────────────────────────────────────────────────────────────────

@router.get("/exam/questions")
def get_questions(
    course_id: str,
    artifact_id: Optional[int] = None,
    mock_session_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Get all questions for a past exam artifact or mock session.

    Also returns per-question is_favorite and prev_answer (last attempt) for the user.
    """
    if artifact_id is None and mock_session_id is None:
        raise HTTPException(status_code=422, detail="Provide artifact_id or mock_session_id")

    if artifact_id is not None:
        # Verify the user has unlocked this past exam
        unlock_row = (
            supabase.table("exam_unlocks")
            .select("artifact_id")
            .eq("user_id", current_user["id"])
            .eq("artifact_id", artifact_id)
            .limit(1)
            .execute()
            .data
        )
        if not unlock_row:
            raise HTTPException(status_code=403, detail="请先解锁该试卷（150积分）")

    q = supabase.table("exam_questions").select("*").eq("course_id", course_id)
    if artifact_id is not None:
        q = q.eq("artifact_id", artifact_id).eq("source_type", "past_exam")
    else:
        q = q.eq("mock_session_id", mock_session_id).eq("source_type", "mock")

    rows = q.order("question_index").execute().data or []

    if rows:
        q_ids = [r["id"] for r in rows]
        uid = current_user["id"]

        fav_rows = (
            supabase.table("exam_question_favorites")
            .select("question_id")
            .eq("user_id", uid)
            .in_("question_id", q_ids)
            .execute()
            .data
        ) or []
        fav_ids = {r["question_id"] for r in fav_rows}

        attempt_rows = (
            supabase.table("exam_attempts")
            .select("question_id, user_answer, is_correct, feedback")
            .eq("user_id", uid)
            .in_("question_id", q_ids)
            .execute()
            .data
        ) or []
        attempt_map = {r["question_id"]: r for r in attempt_rows}

        for row in rows:
            row["is_favorite"] = row["id"] in fav_ids
            attempt = attempt_map.get(row["id"])
            row["prev_answer"]  = attempt["user_answer"] if attempt else None
            row["prev_correct"] = attempt["is_correct"]  if attempt else None
            row["prev_feedback"] = attempt["feedback"]   if attempt else None

    return {"questions": rows, "total": len(rows)}


# ── Mock generation (async job) ───────────────────────────────────────────────

@router.post("/exam/mock/generate")
async def generate_mock(
    course_id: str,
    body: MockGenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Trigger async mock question generation. Returns {job_id, session_id}.

    session_id == job_id — frontend uses it as mock_session_id to fetch questions.
    """
    if current_user.get("is_guest"):
        raise HTTPException(status_code=403, detail="演示账号不支持该功能，请注册正式账号")

    session_id = str(uuid.uuid4())
    max_inflight = get_settings().generation_max_inflight_per_user

    job_id = job_service.create_job_with_limit(
        supabase,
        current_user["id"],
        course_id,
        "exam_mock",
        max_inflight=max_inflight,
        request_payload={
            "num_mcq":    body.num_mcq,
            "num_short":  body.num_short,
            "session_id": session_id,
        },
    )
    if not job_id:
        raise HTTPException(status_code=429, detail="Too many generation jobs in progress")

    return {"job_id": job_id, "session_id": session_id}


@router.get("/exam/mock/sessions")
def list_mock_sessions(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List historical mock question sessions for this course."""
    return exam_service.get_mock_sessions(supabase, course_id)


# ── Submit & grade ─────────────────────────────────────────────────────────────

@router.post("/exam/submit")
def submit_answers(
    course_id: str,
    body: SubmitRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Submit answers for AI grading. MCQ graded locally; short answers via GPT."""
    if current_user.get("is_guest"):
        raise HTTPException(status_code=403, detail="演示账号不支持该功能，请注册正式账号")

    openai_key = _get_openai_key(supabase)
    answers = [{"question_id": a.question_id, "user_answer": a.user_answer} for a in body.answers]
    results = exam_service.grade_answers(
        supabase, current_user["id"], course_id, answers, openai_key
    )
    return {"results": results}


# ── Favorites (per course) ─────────────────────────────────────────────────────

@router.post("/exam/favorites/{question_id}")
def toggle_favorite(
    course_id: str,
    question_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Toggle favorite status for a question. Returns current state."""
    is_fav = exam_service.toggle_favorite(
        supabase, current_user["id"], question_id, course_id
    )
    return {"is_favorite": is_fav}


@router.get("/exam/favorites")
def list_course_favorites(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List user's favorited questions in this course."""
    return exam_service.list_favorites(supabase, current_user["id"], course_id)


# ── Global favorites (all courses, for mistakes/favorites page) ────────────────

@global_router.get("/exam/favorites")
def list_all_favorites(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all favorited questions across all courses (for the Mistakes page)."""
    return exam_service.list_favorites(supabase, current_user["id"])


# ── Mistakes (per course) ──────────────────────────────────────────────────────

@router.get("/exam/mistakes")
def list_course_mistakes(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List user's mistakes for this course."""
    return exam_service.list_mistakes(supabase, current_user["id"], course_id)


# ── Global mistakes (all courses) ─────────────────────────────────────────────

@global_router.get("/exam/mistakes")
def list_all_mistakes(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all mistakes across all courses."""
    return exam_service.list_mistakes(supabase, current_user["id"])


@global_router.patch("/exam/mistakes/{question_id}/master")
def master_mistake(
    question_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Mark a mistake as mastered."""
    exam_service.set_mistake_status(supabase, current_user["id"], question_id, "mastered")
    return {"ok": True}


@global_router.delete("/exam/mistakes/{question_id}")
def delete_mistake(
    question_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Remove a question from the mistakes list."""
    exam_service.set_mistake_status(supabase, current_user["id"], question_id, None)
    return {"ok": True}
