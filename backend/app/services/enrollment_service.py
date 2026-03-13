"""Enrollment service — term-based course access.

Rules:
- Max 4 enrollments per user per term/year
- Cost: 100 credits per enrollment (configurable)
- Enrollment is unique per (user_id, course_id, term, year)
- Access expires when the term changes
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.core.config import get_settings
from app.core.exceptions import AppError, InsufficientCreditsError
from app.services import credit_service

logger = logging.getLogger(__name__)


def get_current_term() -> tuple[str, int]:
    cfg = get_settings()
    return cfg.current_term, cfg.current_year


def list_enrollments(
    supabase: Client, user_id: str, term: str, year: int
) -> list[dict[str, Any]]:
    resp = (
        supabase.table("enrollments")
        .select("id, user_id, course_id, term, year, created_at")
        .eq("user_id", user_id)
        .eq("term", term)
        .eq("year", year)
        .order("created_at")
        .execute()
    )
    return resp.data or []


def is_enrolled(
    supabase: Client, user_id: str, course_id: str, term: str, year: int
) -> bool:
    resp = (
        supabase.table("enrollments")
        .select("id")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .eq("term", term)
        .eq("year", year)
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def enroll(
    supabase: Client, user_id: str, course_id: str, term: str, year: int
) -> dict[str, Any]:
    """Enroll user in a course for the given term/year. Deducts credits.

    Raises:
        AppError: already enrolled or over the 4-course limit
        InsufficientCreditsError: not enough credits
    """
    cfg = get_settings()

    # Already enrolled?
    if is_enrolled(supabase, user_id, course_id, term, year):
        raise AppError("已选此课程，无需重复选课")

    # Check term limit
    existing = list_enrollments(supabase, user_id, term, year)
    if len(existing) >= cfg.enrollment_max_per_term:
        raise AppError(f"每学期最多选 {cfg.enrollment_max_per_term} 门课，本学期已达上限")

    # Deduct credits (raises InsufficientCreditsError if balance low)
    credit_service.spend(supabase, user_id, cfg.enrollment_cost, "enroll_course")

    # Create enrollment record
    now = datetime.now(timezone.utc).isoformat()
    resp = supabase.table("enrollments").insert({
        "user_id": user_id,
        "course_id": course_id,
        "term": term,
        "year": year,
        "created_at": now,
    }).execute()

    if not resp.data:
        raise AppError("选课失败，请重试")

    return resp.data[0]


def get_enrolled_course_ids(
    supabase: Client, user_id: str, term: str, year: int
) -> set[str]:
    rows = list_enrollments(supabase, user_id, term, year)
    return {r["course_id"] for r in rows}
