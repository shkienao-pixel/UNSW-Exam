"""Course routes — read-only for regular users.

Course creation and deletion are admin-only (see admin.py router).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.models.course import CourseOut
from app.services.course_service import get_course, list_courses

router = APIRouter()


@router.get("", response_model=list[CourseOut])
def get_courses(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all shared courses (admin-managed)."""
    return list_courses(supabase)


@router.get("/{course_id}", response_model=CourseOut)
def get_course_by_id(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    return get_course(supabase, course_id)
