"""AI generation endpoints — summary, quiz, outline, flashcards, ask, translate.

All generation uses pre-cleaned, chunked content from artifact_chunks table.
Q&A uses RAG (ChromaDB vector search, bilingual: Chinese + English).

POST /courses/{id}/generate/summary
POST /courses/{id}/generate/quiz
POST /courses/{id}/generate/outline
POST /courses/{id}/generate/flashcards
POST /courses/{id}/generate/ask
POST /courses/{id}/generate/translate
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AppError
from app.services.course_service import (
    create_output,
    get_course,
    get_scope_set,
    list_artifacts,
    list_artifacts_by_ids,
)

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    scope_set_id: int | None = None
    artifact_ids: list[int] | None = None
    num_questions: int = 10


class AskRequest(BaseModel):
    question: str
    scope_set_id: int | None = None


class TranslateRequest(BaseModel):
    texts: list[str]
    target_lang: str = "en"  # 'en' or 'zh'


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_artifact_ids(
    supabase: Client,
    user_id: str,
    course_id: str,
    scope_set_id: int | None,
    artifact_ids: list[int] | None,
) -> list[int] | None:
    """Return explicit artifact_id filter, or None (= all approved)."""
    if artifact_ids:
        return artifact_ids
    if scope_set_id:
        scope = get_scope_set(supabase, user_id, scope_set_id)
        ids = scope.get("artifact_ids") or []
        return ids if ids else None
    return None


def _get_context_from_chunks(
    supabase: Client,
    course_id: str,
    artifact_ids: list[int] | None,
    max_chars: int = 80_000,
) -> tuple[str, list[dict]]:
    """Get cleaned, chunked context from DB. Returns (text, sources)."""
    from app.services.rag_service import get_course_chunks
    ctx, sources = get_course_chunks(supabase, course_id, artifact_ids, max_chars)
    return ctx, sources


def _fallback_extract(
    supabase: Client,
    user_id: str,
    course_id: str,
    artifact_ids: list[int] | None,
    max_chars: int = 80_000,
) -> tuple[str, list[dict]]:
    """Fallback: extract text directly from storage (when chunks not yet built)."""
    import io
    from app.services.artifact_service import download_artifact_bytes

    if artifact_ids:
        arts = list_artifacts_by_ids(supabase, user_id, course_id, artifact_ids)
    else:
        arts = list_artifacts(supabase, user_id, course_id)
    arts = [a for a in arts if a.get("status") == "approved"]

    parts: list[str] = []
    sources: list[dict] = []
    total = 0

    for a in arts:
        ft = a.get("file_type", "pdf")
        sp = a.get("storage_path")
        if ft == "url" or not sp:
            continue
        try:
            data = download_artifact_bytes(supabase, sp)
            text = _raw_extract(ft, data)
            if total + len(text) > max_chars:
                text = text[:max_chars - total]
            parts.append(f"=== {a['file_name']} ===\n{text}")
            sources.append({
                "artifact_id": a["id"],
                "file_name":   a["file_name"],
                "storage_url": a.get("storage_url", ""),
            })
            total += len(text)
            if total >= max_chars:
                break
        except Exception:
            pass

    return "\n\n".join(parts), sources


def _raw_extract(file_type: str, data: bytes) -> str:
    import io
    if file_type == "pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            return "\n\n".join(p.extract_text() or "" for p in reader.pages)
        except Exception:
            return ""
    if file_type == "word":
        try:
            from docx import Document
            doc = Document(io.BytesIO(data))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception:
            return ""
    return data.decode("utf-8", errors="replace")


def _get_context(
    supabase: Client,
    user_id: str,
    course_id: str,
    artifact_ids: list[int] | None,
) -> tuple[str, list[dict]]:
    """Get context text + sources. Prefers DB chunks, falls back to direct extraction."""
    ctx, sources = _get_context_from_chunks(supabase, course_id, artifact_ids)
    if ctx.strip():
        return ctx, sources
    # Chunks not yet built — fall back to direct extraction
    return _fallback_extract(supabase, user_id, course_id, artifact_ids)


def _extract_json(text: str) -> str:
    """Strip markdown fences and extract the first JSON array/object from LLM output."""
    text = text.strip()
    # Remove ```json ... ``` or ``` ... ``` fences
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    # Find start of JSON array or object
    for i, ch in enumerate(text):
        if ch in "[{":
            text = text[i:]
            break
    # Trim to matching close bracket
    if text.startswith("["):
        idx = text.rfind("]")
        if idx != -1:
            text = text[: idx + 1]
    elif text.startswith("{"):
        idx = text.rfind("}")
        if idx != -1:
            text = text[: idx + 1]
    return text


def _chat(system: str, user: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=get_settings().openai_api_key)
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        temperature=0.3,
    )
    return resp.choices[0].message.content or ""


def _sources_note(sources: list[dict]) -> str:
    if not sources:
        return ""
    lines = ["\n\n---\n**参考来源：**"]
    for s in sources:
        name = s.get("file_name", "unknown")
        url  = s.get("storage_url", "")
        lines.append(f"- [{name}]({url})" if url else f"- {name}")
    return "\n".join(lines)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{course_id}/generate/summary")
def gen_summary(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Generate a structured knowledge summary from cleaned course chunks."""
    get_course(supabase, course_id)
    art_ids = _resolve_artifact_ids(supabase, current_user["id"], course_id, body.scope_set_id, body.artifact_ids)
    ctx, sources = _get_context(supabase, current_user["id"], course_id, art_ids)
    if not ctx.strip():
        raise AppError("No content found — please wait for files to be indexed or upload approved files")

    system = (
        "You are a study assistant. Summarize the course materials into clear, structured notes. "
        "Use markdown with ## headings and bullet points. "
        "Cover all major topics. Respond in the same language as the content."
    )
    content = _chat(system, f"Course materials:\n\n{ctx}")
    content += _sources_note(sources)

    return create_output(
        supabase, current_user["id"], course_id, "summary", content,
        scope_set_id=body.scope_set_id, model_used="gpt-4o",
    )


@router.post("/{course_id}/generate/quiz")
def gen_quiz(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Generate multiple-choice exam questions from cleaned course chunks."""
    get_course(supabase, course_id)
    art_ids = _resolve_artifact_ids(supabase, current_user["id"], course_id, body.scope_set_id, body.artifact_ids)
    ctx, sources = _get_context(supabase, current_user["id"], course_id, art_ids)
    if not ctx.strip():
        raise AppError("No content found — please wait for files to be indexed")

    n = min(max(body.num_questions, 3), 20)
    source_names = ", ".join(s["file_name"] for s in sources) if sources else "course material"
    system = f"""You are an exam question generator.
Generate exactly {n} multiple-choice questions from the course content.
Available source files: {source_names}

IMPORTANT rules:
- Return ONLY a raw JSON array — absolutely no markdown fences, no ```json, no extra text before or after
- Each option must be the answer text ONLY (no "A.", "B." prefix — the frontend adds that)
- answer field must be a single uppercase letter: "A", "B", "C", or "D"
- Include a source_file field with the most relevant source filename

Format:
[{{"question":"...","options":["option text","option text","option text","option text"],"answer":"A","explanation":"...","source_file":"filename.pdf"}}]"""
    raw = _chat(system, f"Course content:\n\n{ctx}")
    content_str = _extract_json(raw)

    # Validate and repair JSON
    try:
        questions = json.loads(content_str)
        if not isinstance(questions, list):
            questions = []
    except Exception:
        questions = []

    # Enrich sources: attach storage_url by matching source_file names
    source_map = {s["file_name"]: s for s in sources}
    for q in questions:
        sf = q.get("source_file", "")
        match = source_map.get(sf) or next(
            (v for k, v in source_map.items() if sf and sf.lower() in k.lower()), None
        )
        if match:
            q["source_artifact_id"] = match.get("artifact_id")
            q["source_url"] = match.get("storage_url", "")
        q.pop("source_file", None)  # remove raw field

    # Store structured JSON: {questions, sources}
    content = json.dumps({"questions": questions, "sources": sources}, ensure_ascii=False)

    return create_output(
        supabase, current_user["id"], course_id, "quiz", content,
        scope_set_id=body.scope_set_id, model_used="gpt-4o",
    )


@router.post("/{course_id}/generate/outline")
def gen_outline(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Generate a hierarchical course outline from cleaned course chunks."""
    get_course(supabase, course_id)
    art_ids = _resolve_artifact_ids(supabase, current_user["id"], course_id, body.scope_set_id, body.artifact_ids)
    ctx, sources = _get_context(supabase, current_user["id"], course_id, art_ids)
    if not ctx.strip():
        raise AppError("No content found — please wait for files to be indexed")

    system = (
        "You are a curriculum designer. Create a comprehensive study outline with topics, "
        "subtopics, and key concepts. Use nested markdown bullet points. "
        "Respond in the same language as the content."
    )
    content = _chat(system, f"Course content:\n\n{ctx}")
    content += _sources_note(sources)

    return create_output(
        supabase, current_user["id"], course_id, "outline", content,
        scope_set_id=body.scope_set_id, model_used="gpt-4o",
    )


@router.post("/{course_id}/generate/flashcards")
def gen_flashcards(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Generate flashcards from cleaned course chunks."""
    get_course(supabase, course_id)
    art_ids = _resolve_artifact_ids(supabase, current_user["id"], course_id, body.scope_set_id, body.artifact_ids)
    ctx, _ = _get_context(supabase, current_user["id"], course_id, art_ids)
    if not ctx.strip():
        raise AppError("No content found — please wait for files to be indexed")

    system = """You are a flashcard generator.
Generate 15 flashcards from the course content. Mix vocabulary cards and MCQ cards.

IMPORTANT rules:
- Return ONLY a raw JSON array — absolutely no markdown fences, no ```json, no extra text
- For MCQ cards: each option is answer text ONLY (no "A.", "B." prefix)
- answer field must be a single uppercase letter: "A", "B", "C", or "D"

Format:
[
  {"type":"vocab","front":"term or concept","back":"definition or explanation"},
  {"type":"mcq","question":"...","options":["text","text","text","text"],"answer":"A","explanation":"..."}
]"""
    raw = _chat(system, f"Course content:\n\n{ctx}")
    content = _extract_json(raw)

    # Validate
    try:
        cards = json.loads(content)
        if not isinstance(cards, list):
            cards = []
        content = json.dumps(cards, ensure_ascii=False)
    except Exception:
        content = "[]"

    return create_output(
        supabase, current_user["id"], course_id, "flashcards", content,
        scope_set_id=body.scope_set_id, model_used="gpt-4o",
    )


@router.post("/{course_id}/generate/ask")
def ask_question(
    course_id: str,
    body: AskRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """
    RAG-powered Q&A with source citations.
    - Searches cleaned chunks (bilingual: Chinese → also translated to English)
    - Returns answer + source file list with links
    - Falls back to GPT-4o with full context if no chunks found
    """
    get_course(supabase, course_id)

    art_ids = None
    if body.scope_set_id:
        scope = get_scope_set(supabase, current_user["id"], body.scope_set_id)
        ids = scope.get("artifact_ids") or []
        art_ids = ids if ids else None

    # RAG: retrieve relevant chunks (bilingual)
    from app.services.rag_service import search_chunks
    chunks = search_chunks(supabase, course_id, body.question, top_k=6, artifact_ids=art_ids)

    if chunks:
        # Build context from retrieved chunks
        context_parts = [
            f"[来源：{c['file_name']} — 片段 {c['chunk_index']+1}]\n{c['content']}"
            for c in chunks
        ]
        context = "\n\n---\n\n".join(context_parts)

        system = """You are a knowledgeable course tutor.
Answer the student's question based on the course material excerpts provided below.
Be clear and educational. If the answer spans multiple sources, synthesize them.
Respond in the same language as the question (Chinese question → Chinese answer).
Do NOT add a sources section — that will be added separately."""

        answer = _chat(system, f"Course material excerpts:\n\n{context}\n\n---\n\nQuestion: {body.question}")

        # Deduplicate sources (by artifact_id)
        seen: set[int] = set()
        sources: list[dict] = []
        for c in chunks:
            aid = c["artifact_id"]
            if aid not in seen:
                seen.add(aid)
                sources.append({
                    "artifact_id": aid,
                    "file_name":   c.get("file_name", ""),
                    "storage_url": c.get("storage_url", ""),
                })

    else:
        # Fallback: use full context when no chunks are indexed yet
        ctx, sources = _fallback_extract(supabase, current_user["id"], course_id, art_ids, max_chars=60_000)

        if not ctx.strip():
            return {
                "question": body.question,
                "answer":   "暂无可用的课程材料，请等待文件审核通过或联系管理员建立索引。",
                "sources":  [],
            }

        system = f"""You are a knowledgeable course tutor.
Answer based strictly on the course materials below.
Respond in the same language as the question.

Course materials:
{ctx}"""
        answer = _chat(system, body.question)

    return {
        "question": body.question,
        "answer":   answer,
        "sources":  sources,
    }


@router.post("/{course_id}/generate/translate")
def translate_texts(
    course_id: str,
    body: TranslateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Translate a batch of texts using GPT-4o-mini. Used for bilingual content display."""
    get_course(supabase, course_id)

    if not body.texts:
        return {"translations": []}

    target = "English" if body.target_lang == "en" else "Simplified Chinese (简体中文)"
    source = "Chinese" if body.target_lang == "en" else "English"

    numbered = "\n---\n".join(f"[{i+1}] {t}" for i, t in enumerate(body.texts))

    from openai import OpenAI
    client = OpenAI(api_key=get_settings().openai_api_key)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    f"Translate each numbered text from {source} to {target}. "
                    "Keep technical terms, proper nouns, and code unchanged. "
                    "Return ONLY a raw JSON array of translated strings in the same order. "
                    'No markdown fences, no extra text. Example: ["translation1","translation2"]'
                ),
            },
            {"role": "user", "content": numbered},
        ],
        temperature=0.1,
    )
    raw = resp.choices[0].message.content or "[]"
    raw = _extract_json(raw)

    try:
        translations = json.loads(raw)
        if not isinstance(translations, list):
            translations = body.texts
    except Exception:
        translations = body.texts  # fallback: return originals

    # Ensure same length as input
    while len(translations) < len(body.texts):
        translations.append(body.texts[len(translations)])

    return {"translations": translations[: len(body.texts)]}
