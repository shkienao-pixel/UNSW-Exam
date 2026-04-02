"""Unified AI execution pipeline: ContextBuilder → Executor → OutputManager."""
from __future__ import annotations

import asyncio
import logging

from app.harness.protocols import ContextBuilderProtocol, ExecutorProtocol, OutputManagerProtocol
from app.harness.types import GenerationRequest, GenerationResult

logger = logging.getLogger(__name__)


class GenerationHarness:
    """统一执行管道，驱动三个组件顺序执行。"""

    def __init__(
        self,
        context_builder: ContextBuilderProtocol,
        executor: ExecutorProtocol,
        output_manager: OutputManagerProtocol,
    ) -> None:
        self._builder = context_builder
        self._executor = executor
        self._output_mgr = output_manager

    def run_sync(self, db, request: GenerationRequest) -> GenerationResult:
        """同步执行（/ask 路径）。"""
        context = self._builder.build(db, request)
        result = self._executor.execute(db, request, context)
        return self._output_mgr.persist(db, request, result)

    async def run_async(self, db, request: GenerationRequest) -> GenerationResult:
        """异步执行（worker 路径），每阶段用 asyncio.to_thread 包装同步调用。"""
        context = await asyncio.to_thread(self._builder.build, db, request)
        result = await asyncio.to_thread(self._executor.execute, db, request, context)
        return await asyncio.to_thread(self._output_mgr.persist, db, request, result)
