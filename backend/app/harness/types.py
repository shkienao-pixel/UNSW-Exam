"""Shared data types for the AI Execution Harness."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

GenerationMode = Literal["sync", "async_job"]


@dataclass(frozen=True)
class GenerationRequest:
    user_id: str
    course_id: str
    job_type: str
    """
    "summary" | "quiz" | "outline" | "flashcards" | "ask" | "exam_mock"
    """
    scope_set_id: int | None = None
    artifact_ids: list[int] | None = None
    num_questions: int = 10
    exclude_topics: list[str] = field(default_factory=list)
    question: str = ""
    """ask 专用：用户问题"""
    context_mode: str = "all"
    """ask 专用：'all' | 'revision'"""
    history: list[dict] | None = None
    """ask 专用：对话历史"""
    course_name: str = ""
    """ask/stream 专用"""
    job_id: str | None = None
    """异步路径：关联的 job_id"""
    extra: dict[str, Any] = field(default_factory=dict)
    """扩展字段（exam_mock 等）"""


@dataclass
class ResolvedContext:
    artifact_ids: list[int] | None
    """过滤后可用的 artifact id 列表"""
    text: str
    """构建好的上下文文本（generate 系列用）"""
    sources: list[dict]
    """[{"artifact_id", "file_name", "storage_url"}]"""
    chunks: list[dict]
    """RAG 检索的原始 chunk 列表（ask 用）"""


@dataclass
class GenerationResult:
    content: str
    """生成的主体内容（Markdown 或 JSON 字符串）"""
    model_used: str
    sources: list[dict]
    output_id: int | None = None
    """create_output 后写入的 DB id"""
    extra: dict[str, Any] = field(default_factory=dict)
    """附加字段，如 image_url"""
