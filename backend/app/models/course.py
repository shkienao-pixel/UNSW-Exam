"""Course and Artifact models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=120)


class CourseOut(BaseModel):
    id: str
    code: str
    name: str
    created_at: datetime
    updated_at: datetime


class ArtifactOut(BaseModel):
    id: int
    course_id: str
    file_name: str
    file_hash: str
    file_path: str | None = None
    file_type: str = "pdf"
    status: str = "approved"
    storage_path: str | None = None
    storage_url: str | None = None
    reject_reason: str | None = None
    uploaded_by: str | None = None
    created_at: datetime


class ScopeSetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ScopeSetOut(BaseModel):
    id: int
    course_id: str
    name: str
    is_default: bool
    artifact_ids: list[int] = []
    created_at: datetime
    updated_at: datetime


class ScopeSetItemsUpdate(BaseModel):
    artifact_ids: list[int]


class OutputOut(BaseModel):
    id: int
    course_id: str
    output_type: str
    scope_set_id: int | None
    scope_artifact_ids: list[int]
    model_used: str
    status: str
    content: str | None
    created_at: datetime
