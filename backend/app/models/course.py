"""Course and Artifact models."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Semantic document category — drives RAG routing at query time.
# lecture    → 讲义 / Lecture slides
# tutorial   → 辅导课 / Lab notes
# revision   → 复习总结 (priority source for knowledge outline/graph)
# past_exam  → 往年考题 (priority source for quiz generation)
# assignment → 作业 / Project specs
# other      → 其他
DocType = Literal["lecture", "tutorial", "revision", "past_exam", "assignment", "other"]

_DOC_TYPE_LABELS: dict[str, str] = {
    "lecture":    "讲义",
    "tutorial":   "辅导/Lab",
    "revision":   "复习总结",
    "past_exam":  "往年考题",
    "assignment": "作业/Project",
    "other":      "其他",
}


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
    doc_type: DocType = "lecture"
    status: str = "approved"
    storage_path: str | None = None
    storage_url: str | None = None
    reject_reason: str | None = None
    uploaded_by: str | None = None
    is_locked: bool = False
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
