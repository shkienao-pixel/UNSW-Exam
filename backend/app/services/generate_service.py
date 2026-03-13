"""Core AI generation logic — summary, quiz, outline, flashcards.

Extracted from routers/generate.py to support async job execution.
All functions are synchronous and return the output dict (with "id" field).
They are called from asyncio.to_thread in the router's background tasks.

IMPORTANT: credit_guard is NOT used here — credits are deducted before the
background task starts (in the router), so these functions only do generation.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

from supabase import Client

from app.core.config import get_settings
from app.services.artifact_service import filter_accessible_artifact_ids
from app.services.course_service import (
    create_output,
    get_scope_set,
    list_artifacts,
    list_artifacts_by_ids,
)
from app.services.rag_service import get_artifact_ids_by_doc_type, get_course_chunks_sampled
from app.services.retrieval import multi_retrieve, RetrievalConfig
from app.services.retrieval.multi_retriever import FLASHCARD_CONFIG, QUIZ_CONFIG
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)


# ── Shared helpers (duplicated from generate.py to keep them self-contained) ──

def _resolve_artifact_ids(
    supabase: Client,
    user_id: str,
    course_id: str,
    scope_set_id: int | None,
    artifact_ids: list[int] | None,
    priority_doc_types: list[str] | None = None,
    fallback_doc_types: list[str] | None = None,
) -> list[int] | None:
    if artifact_ids:
        # 过滤未解锁的文件，防止绕过付费机制
        accessible = filter_accessible_artifact_ids(supabase, user_id, artifact_ids)
        return accessible if accessible else None
    if scope_set_id:
        scope = get_scope_set(supabase, user_id, scope_set_id)
        ids = scope.get("artifact_ids") or []
        if ids:
            accessible = filter_accessible_artifact_ids(supabase, user_id, ids)
            return accessible if accessible else None
        return None
    if priority_doc_types:
        ids = get_artifact_ids_by_doc_type(supabase, course_id, priority_doc_types)
        if ids:
            return ids
        if fallback_doc_types:
            ids = get_artifact_ids_by_doc_type(supabase, course_id, fallback_doc_types)
            if ids:
                return ids
    return None


def _get_context_from_chunks(
    supabase: Client,
    course_id: str,
    artifact_ids: list[int] | None,
    max_chars: int = 80_000,
) -> tuple[str, list[dict]]:
    from app.services.rag_service import get_course_chunks
    return get_course_chunks(supabase, course_id, artifact_ids, max_chars)


def _fallback_extract(
    supabase: Client,
    user_id: str,
    course_id: str,
    artifact_ids: list[int] | None,
    max_chars: int = 80_000,
) -> tuple[str, list[dict]]:
    from app.services.artifact_service import download_artifact_bytes

    arts = (
        list_artifacts_by_ids(supabase, user_id, course_id, artifact_ids)
        if artifact_ids
        else list_artifacts(supabase, user_id, course_id)
    )
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
                text = text[: max_chars - total]
            parts.append(f"=== {a['file_name']} ===\n{text}")
            sources.append({
                "artifact_id": a["id"],
                "file_name":   a["file_name"],
                "storage_url": a.get("storage_url", ""),
            })
            total += len(text)
            if total >= max_chars:
                break
        except Exception as exc:
            logger.warning("text extraction failed for artifact %s: %s", a.get("id"), exc)

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
    ctx, sources = _get_context_from_chunks(supabase, course_id, artifact_ids)
    if ctx.strip():
        return ctx, sources
    return _fallback_extract(supabase, user_id, course_id, artifact_ids)


def _extract_json(text: str) -> str:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    for i, ch in enumerate(text):
        if ch in "[{":
            text = text[i:]
            break
    if text.startswith("["):
        idx = text.rfind("]")
        if idx != -1:
            text = text[: idx + 1]
    elif text.startswith("{"):
        idx = text.rfind("}")
        if idx != -1:
            text = text[: idx + 1]
    return text


def _chat(
    system: str,
    user: str,
    openai_key: Optional[str] = None,
    temperature: float = 0.3,
    top_p: float = 1.0,
) -> str:
    from openai import OpenAI
    key = openai_key or get_settings().openai_api_key
    client = OpenAI(api_key=key, timeout=120.0)
    resp = client.chat.completions.create(
        model="gpt-5.4",
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        temperature=temperature,
        top_p=top_p,
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


def _get_openai_key(supabase: Client) -> str:
    from app.services.llm_key_service import get_api_key
    return get_api_key("openai", supabase) or get_settings().openai_api_key


# ── Core generation functions ─────────────────────────────────────────────────

def run_summary(db: Client, user_id: str, course_id: str, body) -> dict:
    """Generate summary. Returns the output dict (contains 'id')."""
    art_ids = _resolve_artifact_ids(
        db, user_id, course_id,
        body.scope_set_id, body.artifact_ids,
        priority_doc_types=["lecture"],
        fallback_doc_types=["tutorial"],
    )
    ctx, sources = _get_context(db, user_id, course_id, art_ids)
    if not ctx.strip():
        raise AppError("No content found — please wait for files to be indexed or upload approved files")

    openai_key = _get_openai_key(db)
    system = (
        "You are a rigorous academic knowledge extractor and study assistant. "
        "Summarize the course materials into clear, structured study notes using ## headings and bullet points. "
        "CRITICAL FILTERING RULES — you MUST exclude the following from the output:\n"
        "  - Course duration, class hours, or timetable information (e.g. '2 hours', '3 units')\n"
        "  - Instructor, tutor, or lecturer names (e.g. 'Tutor: Plum', 'Lecturer: Dr. Smith')\n"
        "  - Administrative details: exam dates, grading schemes, submission deadlines, attendance policies\n"
        "  - Course introduction or overview slides that describe what the course IS rather than what it TEACHES\n"
        "Only extract core concepts, algorithms, formulas, definitions, and theoretical knowledge. "
        "Respond in the same language as the content."
    )
    try:
        content = _chat(system, f"Course materials:\n\n{ctx}", openai_key)
        content += _sources_note(sources)
    except Exception as exc:
        logger.error("run_summary LLM failed: %s", exc, exc_info=True)
        raise AppError(f"摘要生成失败：{str(exc)[:120]}，请稍后重试")

    return create_output(
        db, user_id, course_id, "summary", content,
        scope_set_id=body.scope_set_id, model_used="gpt-5.4",
    )


def run_quiz(db: Client, user_id: str, course_id: str, body) -> dict:
    """Generate quiz questions. Returns the output dict (contains 'id')."""
    art_ids = _resolve_artifact_ids(
        db, user_id, course_id,
        body.scope_set_id, body.artifact_ids,
        priority_doc_types=["past_exam"],
        fallback_doc_types=None,
    )
    raw_hits = multi_retrieve(db, course_id, RetrievalConfig(
        dense_top_k=QUIZ_CONFIG.dense_top_k,
        sparse_top_k=QUIZ_CONFIG.sparse_top_k,
        final_top_k=QUIZ_CONFIG.final_top_k,
        query=QUIZ_CONFIG.query,
    ), art_ids)
    sources: list[dict] = []
    if raw_hits:
        ctx = "\n\n".join(h["content"] for h in raw_hits)
        seen_art: set[int] = set()
        for h in raw_hits:
            aid = h["artifact_id"]
            if aid not in seen_art:
                seen_art.add(aid)
                sources.append({"artifact_id": aid, "file_name": h["file_name"], "storage_url": h["storage_url"]})
    else:
        ctx, sources = get_course_chunks_sampled(db, course_id, art_ids, sample_n=15, fetch_limit=200)
    if not ctx.strip():
        raise AppError("未找到「往年考题」类型的文件。请在管理后台上传往年试卷并将 doc_type 设为「往年考题 (past_exam)」后重试。")

    openai_key = _get_openai_key(db)
    n = min(max(body.num_questions, 3), 20)
    source_names = ", ".join(s["file_name"] for s in sources) if sources else "course material"

    exclude_clause = ""
    if body.exclude_topics:
        topics_str = ", ".join(body.exclude_topics[:20])
        exclude_clause = (
            f"\n\nCRITICAL — Topic exclusion: The following topics already have questions. "
            f"Do NOT generate any questions on these topics: {topics_str}"
        )

    system = f"""You are a creative exam question generator with a talent for finding non-obvious angles.
Generate exactly {n} multiple-choice questions STRICTLY from the provided course content.
Available source files: {source_names}

【Anti-repetition rules — MUST follow】
- Dig into underappreciated details, common misconceptions, boundary conditions, and deep reasoning.
- Vary question types across: application, comparison, error-analysis, multi-step reasoning, "what-if" scenarios.
- Do NOT focus only on basic definitions — challenge students to apply and analyse.
- Each question must test a DIFFERENT concept or angle from the others.{exclude_clause}

Strict content rules:
- ONLY generate questions based on facts explicitly stated in the provided course content below.
- Do NOT invent, extrapolate, or use knowledge from outside the provided materials.
- Every question MUST be answerable from the provided text.
- Return ONLY a raw JSON array — absolutely no markdown fences, no ```json, no extra text before or after
- Each option must be the answer text ONLY (no "A.", "B." prefix — the frontend adds that)
- answer field must be a single uppercase letter: "A", "B", "C", or "D"
- Include a source_file field with the most relevant source filename

Format:
[{{"question":"...","options":["option text","option text","option text","option text"],"answer":"A","explanation":"...","source_file":"filename.pdf"}}]"""

    try:
        raw = _chat(system, f"Course content:\n\n{ctx}", openai_key, temperature=0.7, top_p=0.9)
    except Exception as exc:
        logger.error("run_quiz LLM failed: %s", exc, exc_info=True)
        raise AppError(f"题目生成失败：{str(exc)[:120]}，请稍后重试")

    content_str = _extract_json(raw)
    try:
        questions = json.loads(content_str)
        if not isinstance(questions, list):
            questions = []
    except Exception:
        questions = []

    source_map = {s["file_name"]: s for s in sources}
    for q in questions:
        sf = q.get("source_file", "")
        match = source_map.get(sf) or next(
            (v for k, v in source_map.items() if sf and sf.lower() in k.lower()), None
        )
        if match:
            q["source_artifact_id"] = match.get("artifact_id")
            q["source_url"] = match.get("storage_url", "")
        q.pop("source_file", None)

    content = json.dumps({"questions": questions, "sources": sources}, ensure_ascii=False)
    return create_output(
        db, user_id, course_id, "quiz", content,
        scope_set_id=body.scope_set_id, model_used="gpt-5.4",
    )


def run_outline(db: Client, user_id: str, course_id: str, body) -> dict:
    """Generate course outline. Returns the output dict (contains 'id')."""
    art_ids = _resolve_artifact_ids(
        db, user_id, course_id,
        body.scope_set_id, body.artifact_ids,
        priority_doc_types=["revision"],
        fallback_doc_types=None,
    )
    ctx, _ = _get_context(db, user_id, course_id, art_ids)
    if not ctx.strip():
        raise AppError("未找到「复习总结」类型的文件。请在管理后台上传复习资料并将 doc_type 设为「复习总结 (revision)」后重试。")

    openai_key = _get_openai_key(db)
    system = (
        "You are a strict academic knowledge extractor for computer science courses. "
        "Create a hierarchical study outline using nested markdown (## headings, ### subheadings, bullet points). "
        "CRITICAL FILTERING RULES — you MUST NEVER include:\n"
        "  - Course duration, hours, or scheduling (e.g. '2 hours', '3 weeks')\n"
        "  - Instructor, tutor, or lecturer names (e.g. 'Tutor: Plum', 'Lecturer: Dr. Smith')\n"
        "  - Administrative details: exam schedules, grading criteria, attendance, deadlines\n"
        "  - Course introduction slides describing meta-information about the course itself\n"
        "ONLY extract: core algorithms, technical concepts, formulas, definitions, theoretical principles. "
        "Base the outline STRICTLY on the provided course content. "
        "Do NOT add topics not present in the provided text. "
        "Respond in the same language as the content."
    )
    try:
        content = _chat(system, f"Course content:\n\n{ctx}", openai_key)
    except Exception as exc:
        logger.error("run_outline LLM failed: %s", exc, exc_info=True)
        raise AppError(f"大纲生成失败：{str(exc)[:120]}，请稍后重试")

    return create_output(
        db, user_id, course_id, "outline", content,
        scope_set_id=body.scope_set_id, model_used="gpt-5.4",
    )


def run_flashcards(db: Client, user_id: str, course_id: str, body) -> dict:
    """Generate flashcards. Returns the output dict (contains 'id')."""
    art_ids = _resolve_artifact_ids(
        db, user_id, course_id,
        body.scope_set_id, body.artifact_ids,
        priority_doc_types=["lecture"],
        fallback_doc_types=["tutorial"],
    )

    raw_hits = multi_retrieve(db, course_id, RetrievalConfig(
        dense_top_k=FLASHCARD_CONFIG.dense_top_k,
        sparse_top_k=FLASHCARD_CONFIG.sparse_top_k,
        final_top_k=FLASHCARD_CONFIG.final_top_k,
        query=FLASHCARD_CONFIG.query,
    ), art_ids)
    if raw_hits:
        ctx = "\n\n".join(h["content"] for h in raw_hits)
    else:
        ctx, _ = _get_context(db, user_id, course_id, art_ids)
    if not ctx.strip():
        raise AppError("No content found — please wait for files to be indexed")

    openai_key = _get_openai_key(db)

    exclude_clause = ""
    if body.exclude_topics:
        topics_str = "、".join(body.exclude_topics[:20])
        exclude_clause = (
            f"\n\n⚠️ 以下主题已有闪卡覆盖，本次生成必须完全回避，不得重复：{topics_str}"
        )

    system = f"""你是一个富有创造力的出题专家。请根据提供的课程资料生成 15 张闪卡（flashcard）。

【出题原则 — 必须严格遵守】
1. 挖掘容易被忽略的细节、易混淆概念、边界条件和深层原理进行出题。
2. 每次生成的题目必须在角度和考点上具有高度的随机性和差异性。
3. 不要只盯着最基础的定义出题，要覆盖：应用题、对比题、推理题、错误排查题等多种题型。
4. 词汇卡（vocab）侧重隐含含义、典型使用场景或易混淆点，而非字面定义。{exclude_clause}

【格式要求】
- 仅返回原始 JSON 数组，绝对不加 markdown 代码块或其他文字
- MCQ 选项只写答案文本，不加"A."前缀
- answer 字段只用单个大写字母："A"、"B"、"C" 或 "D"

格式示例：
[
  {{"type":"vocab","front":"概念名称","back":"深层含义或典型使用场景"}},
  {{"type":"mcq","question":"...","options":["文本","文本","文本","文本"],"answer":"A","explanation":"..."}}
]"""

    try:
        raw = _chat(system, f"课程资料：\n\n{ctx}", openai_key, temperature=0.75, top_p=0.9)
    except Exception as exc:
        logger.error("run_flashcards LLM failed: %s", exc, exc_info=True)
        raise AppError(f"闪卡生成失败：{str(exc)[:120]}，请稍后重试")

    content = _extract_json(raw)
    try:
        cards = json.loads(content)
        if not isinstance(cards, list):
            cards = []
        content = json.dumps(cards, ensure_ascii=False)
    except Exception:
        content = "[]"

    return create_output(
        db, user_id, course_id, "flashcards", content,
        scope_set_id=body.scope_set_id, model_used="gpt-5.4",
    )
