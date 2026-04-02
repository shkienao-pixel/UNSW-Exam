"""Default executor: dispatches to generate_service.run_* functions."""
from __future__ import annotations

import logging
from types import SimpleNamespace

from supabase import Client

from app.harness.types import GenerationRequest, GenerationResult, ResolvedContext
from app.services import generate_service

logger = logging.getLogger(__name__)

# job_type → generate_service 中对应的生成函数
_GEN_FN = {
    "quiz":       generate_service.run_quiz,
    "flashcards": generate_service.run_flashcards,
}


class DefaultExecutor:
    """包装 generate_service.run_* 函数。

    阶段二过渡实现：run_* 内部仍自行构建上下文，与 DefaultContextBuilder 存在
    重复，但不影响正确性。阶段三迁移时将 run_* 拆分为纯 LLM 调用部分后消除。
    """

    def execute(
        self,
        db: Client,
        request: GenerationRequest,
        context: ResolvedContext,
    ) -> GenerationResult:
        if request.job_type == "exam_mock":
            return self._execute_exam_mock(db, request)

        fn = _GEN_FN.get(request.job_type)
        if fn is None:
            raise ValueError(f"DefaultExecutor: unsupported job_type={request.job_type!r}")

        body = SimpleNamespace(
            scope_set_id=request.scope_set_id,
            artifact_ids=request.artifact_ids,
            num_questions=request.num_questions,
            exclude_topics=request.exclude_topics,
        )
        output = fn(db, request.user_id, request.course_id, body)
        return GenerationResult(
            content=output.get("content", ""),
            model_used=output.get("model_used", "unknown"),
            sources=output.get("sources", []),
            output_id=output.get("id"),
        )

    def _execute_exam_mock(self, db: Client, request: GenerationRequest) -> GenerationResult:
        from app.services import exam_service
        body = SimpleNamespace(
            num_mcq=request.extra.get("num_mcq", 10),
            num_short=request.extra.get("num_short", 5),
            session_id=request.extra.get("session_id", ""),
        )
        output = exam_service.run_mock_generation(db, request.user_id, request.course_id, body)
        return GenerationResult(
            content="",
            model_used="exam_mock",
            sources=[],
            output_id=output.get("id"),
        )
