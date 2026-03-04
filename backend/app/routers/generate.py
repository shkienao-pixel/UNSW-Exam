"""AI generation endpoints — summary, quiz, outline, flashcards, ask, translate.

All generation uses pre-cleaned, chunked content from artifact_chunks table.

Q&A (/ask) uses a 4-stage multi-model pipeline:
  Stage 1 — Supabase pgvector / ChromaDB  : retrieve top-K relevant chunks
  Stage 2 — GPT-4o-mini (judge)           : filter irrelevant chunks
  Stage 3 — Gemini 2.0 Flash              : generate grounded final answer
  Stage 4 — Imagen 3 (optional)           : visual aid for complex topics

Other endpoints (summary, quiz, outline, flashcards) continue to use GPT-4o.
All endpoints dynamically load API keys from DB (admin panel) → env fallback.

POST /courses/{id}/generate/summary
POST /courses/{id}/generate/quiz
POST /courses/{id}/generate/outline
POST /courses/{id}/generate/flashcards
POST /courses/{id}/generate/ask
POST /courses/{id}/generate/translate
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AppError
from app.services.credit_service import credit_guard
from app.services.course_service import (
    create_output,
    get_course,
    get_scope_set,
    list_artifacts,
    list_artifacts_by_ids,
)
from app.services.rag_service import get_artifact_ids_by_doc_type, get_course_chunks_sampled

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request schemas ───────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    scope_set_id:   int | None       = None
    artifact_ids:   list[int] | None = None
    num_questions:  int               = 10
    exclude_topics: list[str]         = []  # Step 4: 历史题目主题，生成时回避


class AskRequest(BaseModel):
    question:     str
    scope_set_id: int | None = None
    context_mode: str = "all"  # "all" | "revision" — controls RAG scope for Q&A


class TranslateRequest(BaseModel):
    texts:       list[str]
    target_lang: str = "en"  # 'en' or 'zh'


# ── Generic helpers ───────────────────────────────────────────────────────────

def _resolve_artifact_ids(
    supabase: Client,
    user_id: str,
    course_id: str,
    scope_set_id: int | None,
    artifact_ids: list[int] | None,
    priority_doc_types: list[str] | None = None,
    fallback_doc_types: list[str] | None = None,
) -> list[int] | None:
    """Return an explicit artifact_id filter list, or None (= all approved).

    Resolution order:
      1. Explicit artifact_ids from request body
      2. Scope-set artifact list
      3. Doc-type routing (priority → fallback)
      4. None  →  full-corpus search
    """
    if artifact_ids:
        return artifact_ids
    if scope_set_id:
        scope = get_scope_set(supabase, user_id, scope_set_id)
        ids = scope.get("artifact_ids") or []
        return ids if ids else None
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
    """Load pre-indexed chunks from DB. Returns (context_text, sources)."""
    from app.services.rag_service import get_course_chunks
    return get_course_chunks(supabase, course_id, artifact_ids, max_chars)


def _fallback_extract(
    supabase: Client,
    user_id: str,
    course_id: str,
    artifact_ids: list[int] | None,
    max_chars: int = 80_000,
) -> tuple[str, list[dict]]:
    """Direct extraction from Storage when chunks not yet indexed."""
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
    """Preferred: DB chunks. Fallback: direct Storage extraction."""
    ctx, sources = _get_context_from_chunks(supabase, course_id, artifact_ids)
    if ctx.strip():
        return ctx, sources
    return _fallback_extract(supabase, user_id, course_id, artifact_ids)


def _extract_json(text: str) -> str:
    """Strip markdown fences and isolate the first JSON array/object."""
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
    """Call GPT-4o with a system+user message pair.

    ``openai_key`` is resolved in this order:
      1. Passed-in key (from DB via llm_key_service)
      2. Config / environment variable

    Issue 1 fix: Added 120s timeout to prevent worker disconnects on slow LLM calls.
    temperature / top_p 可调，用于闪卡/题目生成时提升多样性。
    """
    from openai import OpenAI
    key = openai_key or get_settings().openai_api_key
    client = OpenAI(api_key=key, timeout=120.0)
    resp = client.chat.completions.create(
        model="gpt-4o",
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
    """Resolve the active OpenAI key from DB → env."""
    from app.services.llm_key_service import get_api_key
    return get_api_key("openai", supabase) or get_settings().openai_api_key


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{course_id}/generate/summary")
def gen_summary(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Generate a structured knowledge summary from cleaned course chunks."""
    get_course(supabase, course_id)
    # summary → lecture (authoritative source), fallback tutorial
    art_ids = _resolve_artifact_ids(
        supabase, current_user["id"], course_id,
        body.scope_set_id, body.artifact_ids,
        priority_doc_types=["lecture"],
        fallback_doc_types=["tutorial"],
    )
    ctx, sources = _get_context(supabase, current_user["id"], course_id, art_ids)
    if not ctx.strip():
        raise AppError("No content found — please wait for files to be indexed or upload approved files")

    openai_key = _get_openai_key(supabase)
    # Issue 2+3 fix: try-catch prevents 500; strict prompt filters administrative content
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
    with credit_guard(supabase, current_user["id"], "gen_summary"):
        try:
            content = _chat(system, f"Course materials:\n\n{ctx}", openai_key)
            content += _sources_note(sources)
        except Exception as exc:
            logger.error("gen_summary LLM failed: %s", exc, exc_info=True)
            raise AppError(f"摘要生成失败：{str(exc)[:120]}，请稍后重试")

        return create_output(
            supabase, current_user["id"], course_id, "summary", content,
            scope_set_id=body.scope_set_id, model_used="gpt-4o",
        )


@router.post("/{course_id}/generate/quiz")
def gen_quiz(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Generate multiple-choice exam questions from cleaned course chunks.

    Step 1 — 向量检索随机化: 从最多 200 个 chunks 中随机采样 15 个作为本次上下文，
              确保每次生成覆盖不同知识点。
    Step 2 — Temperature 调高至 0.7 + top_p=0.9，最大化题目形态多样性。
    Step 3 — Prompt 加入防重复指令，要求挖掘细节、对比、应用等多种角度。
    Step 4 — 支持 exclude_topics 字段，回避已存在的题目主题。
    """
    get_course(supabase, course_id)
    # quiz → past_exam STRICT (往年真题唯一来源，无降级)
    art_ids = _resolve_artifact_ids(
        supabase, current_user["id"], course_id,
        body.scope_set_id, body.artifact_ids,
        priority_doc_types=["past_exam"],
        fallback_doc_types=None,
    )

    # Step 1: 随机采样 chunks — 每次生成的原材料不同
    ctx, sources = get_course_chunks_sampled(
        supabase, course_id, art_ids,
        sample_n=15, fetch_limit=200,
    )
    if not ctx.strip():
        raise AppError("未找到「往年考题」类型的文件。请在管理后台上传往年试卷并将 doc_type 设为「往年考题 (past_exam)」后重试。")

    openai_key = _get_openai_key(supabase)
    n = min(max(body.num_questions, 3), 20)
    source_names = ", ".join(s["file_name"] for s in sources) if sources else "course material"

    # Step 4: 已存在题目主题排除指令
    exclude_clause = ""
    if body.exclude_topics:
        topics_str = ", ".join(body.exclude_topics[:20])
        exclude_clause = (
            f"\n\nCRITICAL — Topic exclusion: The following topics already have questions. "
            f"Do NOT generate any questions on these topics: {topics_str}"
        )

    # Step 3: 防重复出题 Prompt
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

    with credit_guard(supabase, current_user["id"], "gen_quiz"):
        try:
            # Step 2: 提高 temperature 增加多样性
            raw = _chat(system, f"Course content:\n\n{ctx}", openai_key, temperature=0.7, top_p=0.9)
        except Exception as exc:
            logger.error("gen_quiz LLM failed: %s", exc, exc_info=True)
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
            supabase, current_user["id"], course_id, "quiz", content,
            scope_set_id=body.scope_set_id, model_used="gpt-4o",
        )


@router.post("/{course_id}/generate/outline")
def gen_outline(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Generate a hierarchical course outline from cleaned course chunks."""
    get_course(supabase, course_id)
    # outline → revision STRICT (复习资料唯一来源，无降级)
    art_ids = _resolve_artifact_ids(
        supabase, current_user["id"], course_id,
        body.scope_set_id, body.artifact_ids,
        priority_doc_types=["revision"],
        fallback_doc_types=None,
    )
    ctx, sources = _get_context(supabase, current_user["id"], course_id, art_ids)
    if not ctx.strip():
        raise AppError("未找到「复习总结」类型的文件。请在管理后台上传复习资料并将 doc_type 设为「复习总结 (revision)」后重试。")

    openai_key = _get_openai_key(supabase)
    # Issue 2+3 fix: strict admin-content filter + try-catch + NO sources appended to outline
    # (Issue 4 fix: _sources_note removed — outline content is parsed as tree by frontend;
    #  Markdown links in outline break the tree renderer and show as raw text)
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
    with credit_guard(supabase, current_user["id"], "gen_outline"):
        try:
            content = _chat(system, f"Course content:\n\n{ctx}", openai_key)
            # NOTE: Do NOT append _sources_note here — outline content is parsed as a tree
            # by ReviewOutlineTab; Markdown links would render as raw text nodes.
        except Exception as exc:
            logger.error("gen_outline LLM failed: %s", exc, exc_info=True)
            raise AppError(f"大纲生成失败：{str(exc)[:120]}，请稍后重试")

        return create_output(
            supabase, current_user["id"], course_id, "outline", content,
            scope_set_id=body.scope_set_id, model_used="gpt-4o",
        )


@router.post("/{course_id}/generate/flashcards")
def gen_flashcards(
    course_id: str,
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client  = Depends(get_db),
) -> dict[str, Any]:
    """Generate flashcards from cleaned course chunks.

    Step 1 — 向量检索随机化: 从最多 200 个 chunks 中随机采样 12 个，
              确保每次闪卡覆盖课程不同章节。
    Step 2 — Temperature 调高至 0.75 + top_p=0.9，最大化闪卡形态多样性。
    Step 3 — Prompt 要求挖掘细节、易错点、应用场景，不只出基础定义。
    Step 4 — 支持 exclude_topics 字段，回避已存在的闪卡主题。
    """
    get_course(supabase, course_id)
    # flashcards → lecture knowledge points, fallback tutorial
    art_ids = _resolve_artifact_ids(
        supabase, current_user["id"], course_id,
        body.scope_set_id, body.artifact_ids,
        priority_doc_types=["lecture"],
        fallback_doc_types=["tutorial"],
    )

    # Step 1: 随机采样 chunks — 每次生成覆盖不同章节
    ctx, _ = get_course_chunks_sampled(
        supabase, course_id, art_ids,
        sample_n=12, fetch_limit=200,
    )
    if not ctx.strip():
        # 回退到完整顺序上下文（兜底，防止 sampled 为空）
        ctx, _ = _get_context(supabase, current_user["id"], course_id, art_ids)
    if not ctx.strip():
        raise AppError("No content found — please wait for files to be indexed")

    openai_key = _get_openai_key(supabase)

    # Step 4: 已存在闪卡主题排除指令
    exclude_clause = ""
    if body.exclude_topics:
        topics_str = "、".join(body.exclude_topics[:20])
        exclude_clause = (
            f"\n\n⚠️ 以下主题已有闪卡覆盖，本次生成必须完全回避，不得重复：{topics_str}"
        )

    # Step 3: 防重复出题 Prompt（中文，匹配课程语境）
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

    with credit_guard(supabase, current_user["id"], "gen_flashcards"):
        try:
            # Step 2: 提高 temperature 增加多样性
            raw = _chat(system, f"课程资料：\n\n{ctx}", openai_key, temperature=0.75, top_p=0.9)
        except Exception as exc:
            logger.error("gen_flashcards LLM failed: %s", exc, exc_info=True)
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
            supabase, current_user["id"], course_id, "flashcards", content,
            scope_set_id=body.scope_set_id, model_used="gpt-4o",
        )


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

    Returns:
      {question, answer, sources, image_url, model_used}
    """
    get_course(supabase, course_id)

    # Resolve scope → artifact IDs
    # Priority: explicit scope_set > context_mode routing > full corpus
    art_ids: list[int] | None = None
    if body.scope_set_id:
        scope = get_scope_set(supabase, current_user["id"], body.scope_set_id)
        ids = scope.get("artifact_ids") or []
        art_ids = ids if ids else None
    elif body.context_mode == "revision":
        revision_ids = get_artifact_ids_by_doc_type(supabase, course_id, ["revision"])
        art_ids = revision_ids if revision_ids else None

    # Resolve API keys (DB priority → env fallback)
    from app.services.llm_key_service import get_api_key
    openai_key: str  = get_api_key("openai", supabase) or get_settings().openai_api_key
    gemini_key: Optional[str] = get_api_key("gemini", supabase)

    from app.services.gemini_service import (
        gpt_filter_chunks,
        gemini_generate_answer,
        should_generate_image,
        gemini_generate_image,
    )

    # ── Stage 1: Vector retrieval ──────────────────────────────────────────────
    from app.services.rag_service import search_chunks
    chunks = search_chunks(supabase, course_id, body.question, top_k=8, artifact_ids=art_ids)

    # Deduplicate sources from retrieved chunks
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
        # ── Stage 2: GPT filters chunks ────────────────────────────────────────────
        if chunks:
            filtered_context = gpt_filter_chunks(body.question, chunks, openai_key)
        else:
            # No indexed chunks — fall back to full document extraction
            logger.info("No indexed chunks found, falling back to direct extraction")
            ctx, sources = _fallback_extract(
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

        # ── Stage 3: Generate answer ───────────────────────────────────────────────
        answer = ""
        model_used = "gpt-4o"

        if gemini_key:
            answer = gemini_generate_answer(body.question, filtered_context, gemini_key)
            if answer:
                model_used = "gemini-2.5-pro"

        # GPT-4o fallback when Gemini is unavailable or fails
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
            answer = _chat(system, context_msg, openai_key)
            model_used = "gpt-4o"

        # ── Stage 4: Optional image generation ────────────────────────────────────
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
    """Translate a batch of texts using GPT-4o-mini. Used for bilingual content display."""
    get_course(supabase, course_id)

    if not body.texts:
        return {"translations": []}

    openai_key = _get_openai_key(supabase)

    # Issue 5 fix: explicit language-enforcement system prompt
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
    raw = _extract_json(resp.choices[0].message.content or "[]")

    try:
        translations = json.loads(raw)
        if not isinstance(translations, list):
            translations = body.texts
    except Exception:
        translations = body.texts

    while len(translations) < len(body.texts):
        translations.append(body.texts[len(translations)])

    return {"translations": translations[: len(body.texts)]}
