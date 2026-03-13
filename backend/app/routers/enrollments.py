"""Enrollment routes.

GET  /enrollments          -> list my enrollments for current term
POST /enrollments          -> enroll in a course (costs credits)
GET  /enrollments/status   -> current term info + enrolled course ids
GET  /enrollments/check/{course_id} -> is enrolled in this course
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AppError, InsufficientCreditsError
from app.services import enrollment_service

router = APIRouter()


class EnrollRequest(BaseModel):
    course_id: str


@router.get("/status")
def get_status(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict:
    """Return current term config + user's enrolled course ids."""
    cfg = get_settings()
    term, year = enrollment_service.get_current_term()
    enrolled_ids = list(enrollment_service.get_enrolled_course_ids(db, current_user["id"], term, year))
    return {
        "current_term": term,
        "current_year": year,
        "enrollment_cost": cfg.enrollment_cost,
        "max_per_term": cfg.enrollment_max_per_term,
        "enrolled_course_ids": enrolled_ids,
        "slots_used": len(enrolled_ids),
        "slots_remaining": max(0, cfg.enrollment_max_per_term - len(enrolled_ids)),
    }


@router.get("")
def list_my_enrollments(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> list:
    term, year = enrollment_service.get_current_term()
    return enrollment_service.list_enrollments(db, current_user["id"], term, year)


@router.post("")
def enroll_course(
    body: EnrollRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict:
    term, year = enrollment_service.get_current_term()
    try:
        row = enrollment_service.enroll(db, current_user["id"], body.course_id, term, year)
    except AppError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "enrollment": row, "term": term, "year": year}


@router.get("/check/{course_id}")
def check_enrollment(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict:
    term, year = enrollment_service.get_current_term()
    enrolled = enrollment_service.is_enrolled(db, current_user["id"], course_id, term, year)
    return {"enrolled": enrolled, "term": term, "year": year}
