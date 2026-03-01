"""Request models for AI generation endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    scope_set_id: int | None = None
    artifact_ids: list[int] = Field(default_factory=list)


class QuizGenerateRequest(GenerateRequest):
    num_questions: int = Field(default=5, ge=1, le=20)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=8, ge=1, le=20)
