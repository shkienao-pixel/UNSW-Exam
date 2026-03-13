"""AI generation endpoints 鈥?summary, quiz, outline, flashcards, ask, translate.

All generation uses pre-cleaned, chunked content from artifact_chunks table.

Q&A (/ask) uses a 4-stage multi-model pipeline:
  Stage 1 鈥?Supabase pgvector / ChromaDB  : retrieve top-K relevant chunks
  Stage 2 鈥?GPT-4o-mini (judge)           : filter irrelevant chunks
  Stage 3 鈥?Gemini 2.0 Flash              : generate grounded final answer
  Stage 4 鈥?Imagen 3 (optional)           : visual aid for complex topics

Other endpoints (summary, quiz, outline, flashcards) are ASYNC:
  POST 鈫?{job_id} immediately (~100ms)
  Persistent DB queue + background worker runs the generation
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

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.services.course_service import (
    get_course,
    get_scope_set,
)
from app.services.rag_service import get_artifact_ids_by_doc_type, get_course_chunks_sampled
from app.services import job_service, generate_service
from app.services.credit_service import credit_guard

router = APIRouter()
logger = logging.getLogger(__name__)


# 鈹€鈹€ Request schemas 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

class GenerateRequest(BaseModel):
    scope_set_id:   int | None       = None
    artifact_ids:   list[int] | None = None
    num_questions:  int               = 10
    exclude_topics: list[str]         = []  # 鍘嗗彶棰樼洰涓婚锛岀敓鎴愭椂鍥為伩


class AskRequest(BaseModel):
    question:     str
    scope_set_id: int | None = None
    context_mode: str = "all"  # "all" | "revision"


class TranslateRequest(BaseModel):
    texts:       list[str]
    target_lang: str = "en"  # 'en' or 'zh'


def _serialize_generate_payload(body: GenerateRequest) -> dict[str, Any]:
    return {
        "scope_set_id": body.scope_set_id,
        "artifact_ids": body.artifact_ids,
        "num_questions": body.num_questions,
        "exclude_topics": body.exclude_topics,
    }


def _enqueue_generation_job(
    supabase: Client,
    user_id: str,
    course_id: str,
    job_type: str,
    body: GenerateRequest,
) -> str:
    max_inflight = get_settings().generation_max_inflight_per_user
    job_id = job_service.create_job_with_limit(
        supabase,
        user_id,
        course_id,
        job_type,
        max_inflight=max_inflight,
        request_payload=_serialize_generate_payload(body),
    )
    if not job_id:
        raise HTTPException(
            status_code=429,
            detail=f"Too many generation jobs in progress. Limit={max_inflight}.",
        )
    return job_id


# 鈹€鈹€ Job status endpoint 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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


# 鈹€鈹€ Async POST endpoints 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

@router.post("/{course_id}/generate/summary")
async def gen_summary(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Kick off async summary generation. Returns {job_id} immediately."""
    get_course(supabase, course_id)
    job_id = _enqueue_generation_job(supabase, current_user["id"], course_id, "summary", body)
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
    job_id = _enqueue_generation_job(supabase, current_user["id"], course_id, "quiz", body)
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
    job_id = _enqueue_generation_job(supabase, current_user["id"], course_id, "outline", body)
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
    job_id = _enqueue_generation_job(supabase, current_user["id"], course_id, "flashcards", body)
    return {"job_id": job_id}


# 鈹€鈹€ Synchronous endpoints (unchanged) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

@router.post("/{course_id}/generate/ask")
def ask_question(
    course_id: str,
    body: AskRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """4-stage multi-model RAG Q&A with optional visual aid.

    Pipeline:
      Stage 1 鈥?Supabase pgvector / ChromaDB : retrieve top-8 chunks (bilingual)
      Stage 2 鈥?GPT-4o-mini (judge)          : filter irrelevant chunks
      Stage 3 鈥?Gemini 2.0 Flash             : generate grounded answer
                 鈹斺啋 GPT-4o fallback if Gemini key missing or call fails
      Stage 4 鈥?Imagen 3 (optional)          : diagram for complex/abstract topics
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
                    "answer":     "No course material is available yet. Please wait for file approval/indexing.",
                    "sources":    [],
                    "image_url":  None,
                    "model_used": "none",
                }
            filtered_context = ctx

        answer = ""
        model_used = "gpt-5.4"

        if gemini_key:
            answer = gemini_generate_answer(body.question, filtered_context, gemini_key)
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
                f"Course material:\n\n{filtered_context}\n\n---\n\nQuestion: {body.question}"
                if filtered_context.strip()
                else body.question
            )
            answer = generate_service._chat(system, context_msg, openai_key)
            model_used = "gpt-5.4"

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
                answer += f"\n\n---\n\n![杈呭姪鍥捐В]({image_url})"

        return {
            "question":   body.question,
            "answer":     answer,
            "sources":    sources,
            "image_url":  image_url,
            "model_used": model_used,
        }


@router.post("/{course_id}/generate/ask/stream")
def ask_question_stream(
    course_id: str,
    body: AskRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> StreamingResponse:
    """流式 SSE 版 /ask：tokens 实时推送给前端，降低用户等待焦虑。

    SSE 事件格式（data: JSON）：
      {"type": "status",  "phase": "filtering"|"generating"}
      {"type": "token",   "text": "..."}
      {"type": "done",    "answer": "...", "sources": [...], "image_url": null, "model_used": "..."}
      {"type": "error",   "message": "...", "code": "INSUFFICIENT_CREDITS"|null}
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
        gemini_generate_answer_stream,
    )
    from app.services.rag_service import search_chunks
    from app.services.credit_service import spend, earn, COSTS
    from app.core.exceptions import InsufficientCreditsError

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

    def _sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    def event_stream():
        # Stage 1: GPT filter
        yield _sse({"type": "status", "phase": "filtering"})

        if chunks:
            filtered_context = gpt_filter_chunks(body.question, chunks, openai_key)
        else:
            ctx, _ = generate_service._fallback_extract(
                supabase, current_user["id"], course_id, art_ids, max_chars=60_000
            )
            if not ctx.strip():
                yield _sse({
                    "type": "done",
                    "answer": "No course material is available yet. Please wait for file approval/indexing.",
                    "sources": [],
                    "image_url": None,
                    "model_used": "none",
                })
                return
            filtered_context = ctx

        # 扣积分
        cost = COSTS.get("gen_ask", 3)
        try:
            spend(supabase, current_user["id"], cost, "gen_ask")
        except InsufficientCreditsError as e:
            yield _sse({"type": "error", "message": str(e), "code": "INSUFFICIENT_CREDITS"})
            return
        except Exception as e:
            yield _sse({"type": "error", "message": str(e)})
            return

        yield _sse({"type": "status", "phase": "generating"})

        full_answer = ""
        model_used  = "gpt-4o"

        try:
            if gemini_key:
                for token in gemini_generate_answer_stream(body.question, filtered_context, gemini_key):
                    full_answer += token
                    yield _sse({"type": "token", "text": token})
                if full_answer:
                    model_used = "gemini-3.1-pro-preview"

            if not full_answer:
                # GPT-4o 兜底（整块输出）
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
                full_answer = generate_service._chat(system, context_msg, openai_key)
                yield _sse({"type": "token", "text": full_answer})
                model_used = "gpt-5.4"

            yield _sse({
                "type":       "done",
                "answer":     full_answer,
                "sources":    sources,
                "image_url":  None,
                "model_used": model_used,
            })

        except Exception as e:
            # 生成失败 → 自动退款
            try:
                earn(supabase, current_user["id"], cost, "refund", note="gen_ask 失败退款")
            except Exception as refund_err:
                logger.error("Streaming refund failed: %s", refund_err)
            yield _sse({"type": "error", "message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


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
            "Translate each numbered text to Simplified Chinese (zh-CN). "
            "Do not output explanations. Keep code identifiers unchanged. "
            "Return ONLY a raw JSON array of translated strings. "
            'No markdown fences, no extra text. Example: ["翻译1","翻译2"]'
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
        model="gpt-5.4",
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

