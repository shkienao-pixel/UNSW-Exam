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
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.services.course_service import get_course
from app.services import job_service, generate_service

router = APIRouter()
logger = logging.getLogger(__name__)


# 鈹€鈹€ Request schemas 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

class GenerateRequest(BaseModel):
    scope_set_id:   int | None       = None
    artifact_ids:   list[int] | None = None
    num_questions:  int               = 10
    exclude_topics: list[str]         = []  # 鍘嗗彶棰樼洰涓婚锛岀敓鎴愭椂鍥為伩


class HistoryMessage(BaseModel):
    role:    str   # "user" | "assistant"
    content: str


class AskRequest(BaseModel):
    question:     str
    scope_set_id: int | None = None
    context_mode: str = "all"
    history:      list[HistoryMessage] = []
    course_name:  str = ""


class TranslateRequest(BaseModel):
    texts:       list[str]
    target_lang: str = "en"  # 'en' or 'zh'


def _deny_guest(current_user: dict) -> None:
    """guest 账号不允许调用生成接口。"""
    if current_user.get("is_guest"):
        raise HTTPException(status_code=403, detail="演示账号不支持该功能，请注册正式账号")


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
        request_payload={
            "scope_set_id": body.scope_set_id,
            "artifact_ids": body.artifact_ids,
            "num_questions": body.num_questions,
            "exclude_topics": body.exclude_topics,
        },
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

@router.post("/{course_id}/generate/quiz")
async def gen_quiz(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Kick off async quiz generation. Returns {job_id} immediately."""
    _deny_guest(current_user)
    get_course(supabase, course_id)
    job_id = _enqueue_generation_job(supabase, current_user["id"], course_id, "quiz", body)
    return {"job_id": job_id}


@router.post("/{course_id}/generate/flashcards")
async def gen_flashcards(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Kick off async flashcards generation. Returns {job_id} immediately."""
    _deny_guest(current_user)
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
      Stage 1 — Supabase pgvector / ChromaDB : retrieve top-8 chunks (bilingual)
      Stage 2 — GPT-4o-mini (judge)          : filter irrelevant chunks
      Stage 3 — Gemini 3.1 Pro               : generate grounded answer
                 └→ GPT-4o fallback if Gemini key missing or call fails
      Stage 4 — Imagen 3 (optional)          : diagram for complex/abstract topics

    Execution is delegated to GenerationHarness (harness/factory.py).
    """
    from app.core.exceptions import InsufficientCreditsError
    from app.harness.factory import make_generation_harness
    from app.harness.types import GenerationRequest

    _deny_guest(current_user)
    get_course(supabase, course_id)

    request = GenerationRequest(
        user_id=current_user["id"],
        course_id=course_id,
        job_type="ask",
        scope_set_id=body.scope_set_id,
        question=body.question,
        context_mode=body.context_mode,
        history=[{"role": m.role, "content": m.content} for m in (body.history or [])],
        course_name=body.course_name,
    )

    harness = make_generation_harness("ask", mode="sync")
    try:
        result = harness.run_sync(supabase, request)
    except InsufficientCreditsError:
        raise
    except Exception as exc:
        logger.error("ask_question failed course=%s err=%s", course_id, exc, exc_info=True)
        raise

    return {
        "question":   body.question,
        "answer":     result.content,
        "sources":    result.sources,
        "image_url":  result.extra.get("image_url"),
        "model_used": result.model_used,
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
    _deny_guest(current_user)
    get_course(supabase, course_id)

    from app.services.llm_key_service import get_api_key
    gemini_key: str | None = get_api_key("gemini", supabase)

    from app.services.gemini_service import gemini_generate_answer_stream
    from app.services.credit_service import spend, earn, COSTS
    from app.core.exceptions import InsufficientCreditsError

    if not gemini_key:
        return StreamingResponse(
            iter([f"data: {json.dumps({'type': 'error', 'message': 'Gemini API key not configured'})}\n\n"]),
            media_type="text/event-stream",
        )

    def _sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    def event_stream():
        cost = COSTS.get("gen_ask", 20)
        try:
            spend(supabase, current_user["id"], cost, "gen_ask")
        except InsufficientCreditsError as e:
            yield _sse({"type": "error", "message": str(e), "code": "INSUFFICIENT_CREDITS"})
            return
        except Exception as e:
            yield _sse({"type": "error", "message": str(e)})
            return

        yield _sse({"type": "status", "phase": "generating"})

        history = [{"role": m.role, "content": m.content} for m in (body.history or [])]
        full_answer = ""

        try:

            for token in gemini_generate_answer_stream(body.question, "", gemini_key, history=history, course_name=body.course_name):
                full_answer += token
                yield _sse({"type": "token", "text": token})

            yield _sse({
                "type":       "done",
                "answer":     full_answer,
                "sources":    [],
                "image_url":  None,
                "model_used": "gemini-3.1-pro-preview",
            })

        except Exception as e:
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

