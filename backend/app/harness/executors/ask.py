"""Ask executor: GPT filter → Gemini generate → Imagen optional."""
from __future__ import annotations

import logging
from typing import Optional

from supabase import Client

from app.core.config import get_settings
from app.harness.types import GenerationRequest, GenerationResult, ResolvedContext
from app.services import generate_service
from app.services.llm_key_service import get_api_key

logger = logging.getLogger(__name__)


class AskExecutor:
    """把 generate.py ask_question() 第 229–318 行的 LLM 调用逻辑提取为独立类。

    三个阶段：
      1. GPT-4o-mini 过滤 chunks（或 fallback 直接提取文本）
      2. Gemini 3.1 Pro 生成答案（GPT-4o 兜底）
      3. Imagen 3 可选配图
    """

    def execute(
        self,
        db: Client,
        request: GenerationRequest,
        context: ResolvedContext,
    ) -> GenerationResult:
        from app.services.gemini_service import (
            gemini_generate_answer,
            gemini_generate_image,
            gpt_filter_chunks,
            should_generate_image,
        )

        openai_key: str = get_api_key("openai", db) or get_settings().openai_api_key
        gemini_key: Optional[str] = get_api_key("gemini", db)

        # ── Stage 1: 构建过滤后的上下文 ──────────────────────────────────────
        if context.chunks:
            filtered_context = gpt_filter_chunks(request.question, context.chunks, openai_key)
        else:
            logger.info("No indexed chunks found for /ask, falling back to direct extraction")
            ctx, fallback_sources = generate_service._fallback_extract(
                db, request.user_id, request.course_id, context.artifact_ids, max_chars=60_000
            )
            if not ctx.strip():
                return GenerationResult(
                    content="No course material is available yet. Please wait for file approval/indexing.",
                    model_used="none",
                    sources=[],
                )
            filtered_context = ctx

        # ── Stage 2: 生成答案 ────────────────────────────────────────────────
        history = request.history or []
        answer = ""
        model_used = "gpt-5.4"

        if gemini_key:
            answer = gemini_generate_answer(request.question, filtered_context, gemini_key, history=history)
            if answer:
                model_used = "gemini-3.1-pro-preview"

        if not answer:
            system = (
                "You are a knowledgeable course tutor. "
                "Answer the student's question based the course material excerpts provided. "
                "Be clear and educational. Synthesize information across multiple sources. "
                "Respond in the same language as the question. "
                "Do NOT add a sources section."
            )
            context_msg = (
                f"Course material:\n\n{filtered_context}\n\n---\n\nQuestion: {request.question}"
                if filtered_context.strip()
                else request.question
            )
            answer = generate_service._chat(system, context_msg, openai_key)
            model_used = "gpt-5.4"

        # ── Stage 3: 可选配图 ────────────────────────────────────────────────
        image_url: Optional[str] = None
        if gemini_key and should_generate_image(request.question, answer):
            logger.info("Generating visual aid for query=%r", request.question[:60])
            image_url = gemini_generate_image(
                query=request.question,
                answer=answer,
                gemini_key=gemini_key,
                supabase=db,
                bucket=get_settings().supabase_storage_bucket,
            )
            if image_url:
                answer += f"\n\n---\n\n![辅助图解]({image_url})"

        return GenerationResult(
            content=answer,
            model_used=model_used,
            sources=context.sources,
            extra={"image_url": image_url},
        )
