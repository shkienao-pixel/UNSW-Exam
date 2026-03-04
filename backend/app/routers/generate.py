"""AI generation endpoints — summary, quiz, outline, flashcards, ask, translate.

All generation uses pre-cleaned, chunked content from artifact_chunks table.

Q&A (/ask) uses a 4-stage multi-model pipeline:
  Stage 1 — Supabase pgvector / ChromaDB  : retrieve top-K relevant chunks
  Stage 2 — GPT-4o-mini (judge)           : filter irrelevant chunks
  Stage 3 — Gemini 2.0 Flash              : generate grounded final answer
  Stage 4 — Imagen 3 (optional)           : visual aid for complex topics

Other endpoints (summary, quiz, outline, flashcards) are ASYNC:
  POST → {job_id} immediately (~100ms)
  Background asyncio task runs the generation
  GET /{course_id}/jobs/{job_id} to poll status

POST /courses/{id}/generate/summary
POST /courses/{id}/generate/quiz
POST /courses/{id}/generate/outline
POST /courses/{id}/generate/flashcards
POST /courses/{id}/generate/ask
POST /courses/{id}/generate/translate
GET  /courses/{id}/jobs/{job_id}
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AppError
from app.services.credit_service import credit_guard
from app.services.course_service import (
    get_course,
    get_scope_set,
    list_artifacts_by_ids,
    list_artifacts,
)
from app.services.rag_service import get_artifact_ids_by_doc_type, get_course_chunks_sampled
from app.services import job_service, generate_service

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request schemas ───────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    scope_set_id:   int | None       = None
    artifact_ids:   list[int] | None = None
    num_questions:  int               = 10
    exclude_topics: list[str]         = []  # 历史题目主题，生成时回避


class AskRequest(BaseModel):
    question:     str
    scope_set_id: int | None = None
    context_mode: str = "all"  # "all" | "revision"


class TranslateRequest(BaseModel):
    texts:       list[str]
    target_lang: str = "en"  # 'en' or 'zh'


# ── Background job runner ─────────────────────────────────────────────────────

_GEN_FN = {
    "summary":    generate_service.run_summary,
    "quiz":       generate_service.run_quiz,
    "outline":    generate_service.run_outline,
    "flashcards": generate_service.run_flashcards,
}


async def _run_job_bg(
    db: Client,
    job_id: str,
    job_type: str,
    user_id: str,
    course_id: str,
    body: GenerateRequest,
) -> None:
    """Background coroutine: run sync generation in thread pool, update job status."""
    job_service.set_processing(db, job_id)
    try:
        gen_fn = _GEN_FN[job_type]
        output = await asyncio.to_thread(gen_fn, db, user_id, course_id, body)
        job_service.finish_job(db, job_id, output["id"])
        logger.info("job %s done → output_id=%s", job_id, output["id"])
    except Exception as exc:
        logger.error("job %s failed: %s", job_id, exc, exc_info=True)
        job_service.fail_job(db, job_id, str(exc))


# ── Job status endpoint ───────────────────────────────────────────────────────

@router.get("/{course_id}/jobs/{job_id}")
def get_job_status(
    course_id: str,
    job_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Poll async generation job status."""
    job = job_service.get_job(supabase, job_id)
    if not job or job["user_id"] != current_user["id"]:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ── Async POST endpoints ──────────────────────────────────────────────────────

@router.post("/{course_id}/generate/summary")
async def gen_summary(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Kick off async summary generation. Returns {job_id} immediately."""
    get_course(supabase, course_id)
    with credit_guard(supabase, current_user["id"], "gen_summary"):
        job_id = job_service.create_job(supabase, current_user["id"], course_id, "summary")
    asyncio.create_task(_run_job_bg(supabase, job_id, "summary", current_user["id"], course_id, body))
    return {"job_id": job_id}


@router.post("/{course_id}/generate/quiz")
async def gen_quiz(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Kick off async quiz generation. Returns {job_id} immediately."""
    get_course(supabase, course_id)
    with credit_guard(supabase, current_user["id"], "gen_quiz"):
        job_id = job_service.create_job(supabase, current_user["id"], course_id, "quiz")
    asyncio.create_task(_run_job_bg(supabase, job_id, "quiz", current_user["id"], course_id, body))
    return {"job_id": job_id}


@router.post("/{course_id}/generate/outline")
async def gen_outline(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Kick off async outline generation. Returns {job_id} immediately."""
    get_course(supabase, course_id)
    with credit_guard(supabase, current_user["id"], "gen_outline"):
        job_id = job_service.create_job(supabase, current_user["id"], course_id, "outline")
    asyncio.create_task(_run_job_bg(supabase, job_id, "outline", current_user["id"], course_id, body))
    return {"job_id": job_id}


@router.post("/{course_id}/generate/flashcards")
async def gen_flashcards(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Kick off async flashcards generation. Returns {job_id} immediately."""
    get_course(supabase, course_id)
    with credit_guard(supabase, current_user["id"], "gen_flashcards"):
        job_id = job_service.create_job(supabase, current_user["id"], course_id, "flashcards")
    asyncio.create_task(_run_job_bg(supabase, job_id, "flashcards", current_user["id"], course_id, body))
    return {"job_id": job_id}


# ── Synchronous endpoints (unchanged) ────────────────────────────────────────

@router.post("/{course_id}/generate/ask")
def ask_question(
    course_id: str,
    body: AskRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """4-stage multi-model RAG Q&A with optional visual aid.

    Pipeline:
      Stage 1 — Supabase pgvector / ChromaDB : retrieve top-8 chunks (bilingual)
      Stage 2 — GPT-4o-mini (judge)          : filter irrelevant chunks
      Stage 3 — Gemini 2.0 Flash             : generate grounded answer
                 └→ GPT-4o fallback if Gemini key missing or call fails
      Stage 4 — Imagen 3 (optional)          : diagram for complex/abstract topics
    """
    get_course(supabase, course_id)

    art_ids: list[int] | None = None
    if body.scope_set_id:
        scope = get_scope_set(supabase, current_user["id"], body.scope_set_id)
        ids = scope.get("artifact_ids") or []
        art_ids = ids if ids else None
    elif body.context_mode == "revision":
        revision_ids = get_artifact_ids_by_doc_type(supabase, course_id, ["revision"])
        art_ids = revision_ids if revision_ids else None

    from app.services.llm_key_service import get_api_key
    openai_key: str  = get_api_key("openai", supabase) or get_settings().openai_api_key
    gemini_key: Optional[str] = get_api_key("gemini", supabase)

    from app.services.gemini_service import (
        gpt_filter_chunks,
        gemini_generate_answer,
        should_generate_image,
        gemini_generate_image,
    )

    from app.services.rag_service import search_chunks
    chunks = search_chunks(supabase, course_id, body.question, top_k=8, artifact_ids=art_ids)

    sources: list[dict] = []
    if chunks:
        seen: set[int] = set()
        for c in chunks:
            aid = c["artifact_id"]
            if aid not in seen:
                seen.add(aid)
                sources.append({
                    "artifact_id": aid,
                    "file_name":   c.get("file_name", ""),
                    "storage_url": c.get("storage_url", ""),
                })

    with credit_guard(supabase, current_user["id"], "gen_ask"):
        if chunks:
            filtered_context = gpt_filter_chunks(body.question, chunks, openai_key)
        else:
            logger.info("No indexed chunks found, falling back to direct extraction")
            ctx, sources = generate_service._fallback_extract(
                supabase, current_user["id"], course_id, art_ids, max_chars=60_000
            )
            if not ctx.strip():
                return {
                    "question":   body.question,
                    "answer":     "暂无可用的课程材料，请等待文件审核通过或联系管理员建立索引。",
                    "sources":    [],
                    "image_url":  None,
                    "model_used": "none",
                }
            filtered_context = ctx

        answer = ""
        model_used = "gpt-4o"

        if gemini_key:
            answer = gemini_generate_answer(body.question, filtered_context, gemini_key)
            if answer:
                model_used = "gemini-2.5-pro"

        if not answer:
            system = (
                "You are a knowledgeable course tutor. "
                "Answer the student's question based the course material excerpts provided. "
                "Be clear and educational. Synthesize information across multiple sources. "
                "Respond in the same language as the question. "
                "Do NOT add a sources section."
            )
            context_msg = (
                f"Course material:\n\n{filtered_context}\n\n---\n\nQuestion: {body.question}"
                if filtered_context.strip()
                else body.question
            )
            answer = generate_service._chat(system, context_msg, openai_key)
            model_used = "gpt-4o"

        image_url: Optional[str] = None
        if gemini_key and should_generate_image(body.question, answer):
            logger.info("Generating visual aid for query=%r", body.question[:60])
            image_url = gemini_generate_image(
                query=body.question,
                answer=answer,
                gemini_key=gemini_key,
                supabase=supabase,
                bucket=get_settings().supabase_storage_bucket,
            )
            if image_url:
                answer += f"\n\n---\n\n![辅助图解]({image_url})"

        return {
            "question":   body.question,
            "answer":     answer,
            "sources":    sources,
            "image_url":  image_url,
            "model_used": model_used,
        }


@router.post("/{course_id}/generate/translate")
def translate_texts(
    course_id: str,
    body: TranslateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Translate a batch of texts using GPT-4o-mini."""
    get_course(supabase, course_id)

    if not body.texts:
        return {"translations": []}

    openai_key = generate_service._get_openai_key(supabase)

    if body.target_lang == "zh":
        system_prompt = (
            "你的唯一任务是将用户输入的英文文本翻译成简体中文（zh-CN）。"
            "【强制规则】：\n"
            "1. 所有输出必须是中文，不得保留英文原文。\n"
            "2. 技术术语必须给出中文译名（例：Convolutional Neural Network → 卷积神经网络）。\n"
            "3. 专有名词若无通用译名，可在括号内附英文：如 ResNet（残差网络）。\n"
            "4. 仅输出翻译结果，禁止任何解释或评论。\n"
            "5. 返回格式：纯 JSON 数组，例：[\"翻译1\",\"翻译2\"]，不带 markdown 代码块。"
        )
    else:
        system_prompt = (
            "Translate each numbered text to English. "
            "Keep code identifiers and proper nouns unchanged. "
            "Return ONLY a raw JSON array of translated strings. "
            'No markdown fences, no extra text. Example: ["translation1","translation2"]'
        )

    numbered = "\n---\n".join(f"[{i+1}] {t}" for i, t in enumerate(body.texts))

    from openai import OpenAI
    client = OpenAI(api_key=openai_key, timeout=60.0)
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": numbered},
        ],
        temperature=0.1,
    )
    raw = generate_service._extract_json(resp.choices[0].message.content or "[]")

    try:
        translations = json.loads(raw)
        if not isinstance(translations, list):
            translations = body.texts
    except Exception:
        translations = body.texts

    while len(translations) < len(body.texts):
        translations.append(body.texts[len(translations)])

    return {"translations": translations[: len(body.texts)]}
