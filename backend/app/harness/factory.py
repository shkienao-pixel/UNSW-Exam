"""Factory functions for pre-assembled GenerationHarness instances."""
from __future__ import annotations

from app.harness.context_builders.default import DefaultContextBuilder
from app.harness.executors.ask import AskExecutor
from app.harness.executors.default import DefaultExecutor
from app.harness.harness import GenerationHarness
from app.harness.output_managers.default import DefaultOutputManager


def make_generation_harness(job_type: str, mode: str = "sync") -> GenerationHarness:
    """返回预组装的 GenerationHarness 实例。

    Args:
        job_type: "summary" | "quiz" | "outline" | "flashcards" | "ask" | "exam_mock"
        mode:     "sync"（/ask 端点）| "async_job"（worker 执行）
    """
    builder = DefaultContextBuilder()
    executor = AskExecutor() if job_type == "ask" else DefaultExecutor()
    output_mgr = DefaultOutputManager(mode=mode)
    return GenerationHarness(builder, executor, output_mgr)
