"""Flashcard mistakes routes."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.dependencies import get_current_user, get_db

router = APIRouter()


class AddMistakeRequest(BaseModel):
    output_id: int
    card_index: int
    card_front: str
    card_back: str
    card_type: str = "vocab"


class UpdateStatusRequest(BaseModel):
    mistake_status: str  # 'active' | 'mastered'


@router.post("/courses/{course_id}/flashcard-mistakes")
def add_mistake(
    course_id: str,
    body: AddMistakeRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Add or reactivate a flashcard mistake."""
    user_id = current_user["id"]
    row = {
        "user_id":        user_id,
        "course_id":      course_id,
        "output_id":      body.output_id,
        "card_index":     body.card_index,
        "card_front":     body.card_front,
        "card_back":      body.card_back,
        "card_type":      body.card_type,
        "mistake_status": "active",
        "mastered_at":    None,
    }
    # Upsert: if same (user, output, card_index) already exists, set back to active
    result = (
        supabase.table("flashcard_mistakes")
        .upsert(row, on_conflict="user_id,output_id,card_index")
        .select()
        .execute()
        .data
    )
    return result[0] if result else row


@router.get("/flashcard-mistakes")
def list_all_mistakes(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all flashcard mistakes for the current user across all courses."""
    q = (
        supabase.table("flashcard_mistakes")
        .select("*")
        .eq("user_id", current_user["id"])
    )
    if status and status != "all":
        q = q.eq("mistake_status", status)
    return q.order("created_at", desc=True).execute().data or []


@router.get("/courses/{course_id}/flashcard-mistakes")
def list_mistakes(
    course_id: str,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """List flashcard mistakes for a course."""
    q = (
        supabase.table("flashcard_mistakes")
        .select("*")
        .eq("user_id", current_user["id"])
        .eq("course_id", course_id)
    )
    if status and status != "all":
        q = q.eq("mistake_status", status)
    return q.order("created_at", desc=True).execute().data or []


@router.patch("/courses/{course_id}/flashcard-mistakes/{mistake_id}")
def update_status(
    course_id: str,
    mistake_id: int,
    body: UpdateStatusRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Update mistake status (active / mastered)."""
    if body.mistake_status not in ("active", "mastered"):
        raise HTTPException(status_code=400, detail="status must be 'active' or 'mastered'")

    update: dict = {"mistake_status": body.mistake_status}
    if body.mistake_status == "mastered":
        from datetime import datetime, timezone
        update["mastered_at"] = datetime.now(timezone.utc).isoformat()
    else:
        update["mastered_at"] = None

    supabase.table("flashcard_mistakes").update(update) \
        .eq("id", mistake_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.delete("/courses/{course_id}/flashcard-mistakes/{mistake_id}")
def delete_mistake(
    course_id: str,
    mistake_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Remove a flashcard mistake."""
    supabase.table("flashcard_mistakes").delete() \
        .eq("id", mistake_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}
