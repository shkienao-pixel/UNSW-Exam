"""Protocol interfaces for the AI Execution Harness components."""
from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from supabase import Client
    from app.harness.types import GenerationRequest, GenerationResult, ResolvedContext


@runtime_checkable
class ContextBuilderProtocol(Protocol):
    def build(
        self,
        db: "Client",
        request: "GenerationRequest",
    ) -> "ResolvedContext":
        """scope filtering + doc_type routing + RAG/chunk 检索，返回已构建的上下文。"""
        ...


@runtime_checkable
class ExecutorProtocol(Protocol):
    def execute(
        self,
        db: "Client",
        request: "GenerationRequest",
        context: "ResolvedContext",
    ) -> "GenerationResult":
        """调用 LLM，返回生成结果（不含持久化）。"""
        ...


@runtime_checkable
class OutputManagerProtocol(Protocol):
    def persist(
        self,
        db: "Client",
        request: "GenerationRequest",
        result: "GenerationResult",
    ) -> "GenerationResult":
        """持久化结果 + 积分扣费 + job 状态更新，返回带 output_id 的 result。"""
        ...
