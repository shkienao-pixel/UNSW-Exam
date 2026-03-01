"""Flashcard and Mistake request/response models."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class ReviewRequest(BaseModel):
    action: Literal["known", "unknown"]


class SubmitRequest(BaseModel):
    selected_option: Any


class FlashcardOut(BaseModel):
    id: str
    user_id: str
    course_id: str
    deck_id: str
    card_type: str
    scope: dict[str, Any]
    front: dict[str, Any]
    back: dict[str, Any]
    stats: dict[str, Any]
    source_refs: list[dict[str, Any]] | None = None


class MistakeOut(BaseModel):
    id: int
    user_id: str
    flashcard_id: str
    status: str
    added_at: str
    wrong_count: int
    last_wrong_at: str
