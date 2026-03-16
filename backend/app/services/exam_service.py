"""Exam service: extract real questions, generate mock questions, grade answers, favorites.

Three main workflows:
1. extract_questions_from_artifact() — called as background task on artifact approval
2. run_mock_generation()             — called by generation worker for 'exam_mock' jobs
3. grade_answers()                   — called synchronously on exam submit
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from supabase import Client

from app.core.exceptions import AppError
from app.services.generate_service import _chat, _extract_json, _raw_extract

logger = logging.getLogger(__name__)

_MAX_PDF_CHARS = 80_000
_MIN_TEXT_LEN = 100  # below this, treat PDF as scanned and use Vision

_VISION_SYSTEM = (
    "You are an expert university exam paper parser.\n"
    "Analyze this exam page image and return a JSON object with two fields.\n\n"
    "Field 1 — \"has_visual\": boolean.\n"
    "  Set true if the page contains diagrams, figures, graphs, equations, tables, or any visual element\n"
    "  that is NECESSARY to understand or answer the questions on this page.\n"
    "  Set false if the page is pure text (no visuals needed to answer).\n\n"
    "Field 2 — \"questions\": array of question objects extracted from this page.\n"
    "  Rules for extraction:\n"
    "  1. Extract questions exactly as written — do NOT rephrase.\n"
    "  2. Classify each as \"mcq\" (has A/B/C/D options) or \"short_answer\" (everything else).\n"
    "  3. For MCQ: list options as plain text (no \"A.\" prefix), set correct_answer to the letter if answer key visible, else null.\n"
    "  4. For short_answer: set correct_answer to a concise reference answer if clearly shown, else null.\n"
    "  5. If this page has NO questions (cover page, instructions only), return an empty array [].\n\n"
    "Return ONLY a raw JSON object — no markdown fences, no extra text.\n"
    "Format: {\"has_visual\": true/false, \"questions\": [{\"question_index\":1,\"question_type\":\"mcq\","
    "\"question_text\":\"...\",\"options\":[\"opt\",\"opt\",\"opt\",\"opt\"],"
    "\"correct_answer\":\"A\",\"explanation\":null}, ...]}"
)


_EXAM_PAGES_BUCKET = "exam-pages"
_BUCKET_CREATED = False


def _ensure_exam_pages_bucket(supabase: Client) -> None:
    """Create exam-pages bucket once per process if it doesn't exist."""
    global _BUCKET_CREATED
    if _BUCKET_CREATED:
        return
    try:
        supabase.storage.create_bucket(
            _EXAM_PAGES_BUCKET,
            {"public": True, "allowedMimeTypes": ["image/jpeg", "image/png", "image/webp"]},
        )
        logger.info("Created Supabase bucket: %s", _EXAM_PAGES_BUCKET)
    except Exception:
        pass  # Bucket already exists or creation failed — proceed anyway
    _BUCKET_CREATED = True


def _upload_page_image(supabase: Client, jpeg_bytes: bytes, artifact_id: int, page_num: int) -> str | None:
    """Upload a JPEG page screenshot to Supabase Storage and return its public URL.

    Uses a dedicated 'exam-pages' bucket (public, image/* allowed).
    Caller must supply JPEG bytes (not PNG).
    """
    try:
        _ensure_exam_pages_bucket(supabase)
        path = f"{artifact_id}/page_{page_num + 1}.jpg"
        supabase.storage.from_(_EXAM_PAGES_BUCKET).upload(
            path, jpeg_bytes, {"content-type": "image/jpeg", "upsert": "true"}
        )
        return supabase.storage.from_(_EXAM_PAGES_BUCKET).get_public_url(path)
    except Exception as exc:
        logger.warning("_upload_page_image: failed for artifact %s page %d: %s", artifact_id, page_num + 1, exc)
        return None


def _extract_questions_vision(data: bytes, openai_key: str, supabase: Client, artifact_id: int) -> list[dict]:
    """Convert each PDF page to image, send to gpt-5.4 Vision.

    gpt-5.4 returns has_visual + questions per page.
    If has_visual=True, upload the page screenshot and attach its URL to all questions on that page.
    """
    import base64
    import fitz  # pymupdf

    doc = fitz.open(stream=data, filetype="pdf")
    all_questions: list[dict] = []
    global_index = 1

    from openai import OpenAI
    client = OpenAI(api_key=openai_key, timeout=180.0)

    for page_num in range(len(doc)):
        page = doc[page_num]
        mat = fitz.Matrix(2.0, 2.0)
        pix = page.get_pixmap(matrix=mat)
        # Generate JPEG for upload (smaller); keep PNG for base64 to preserve quality
        jpeg_bytes = pix.tobytes("jpeg", 85)
        b64 = base64.b64encode(pix.tobytes("png")).decode()

        try:
            resp = client.chat.completions.create(
                model="gpt-5.4",
                messages=[
                    {"role": "system", "content": _VISION_SYSTEM},
                    {"role": "user", "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}},
                    ]},
                ],
                max_completion_tokens=4096,
                temperature=0.1,
            )
            raw = resp.choices[0].message.content or "{}"
            raw = _extract_json(raw)
            parsed = json.loads(raw) if raw else {}
            has_visual: bool = bool(parsed.get("has_visual", False))
            page_qs: list = parsed.get("questions", [])
            if not isinstance(page_qs, list):
                page_qs = []
        except Exception as exc:
            logger.warning("_extract_questions_vision: page %d failed: %s", page_num + 1, exc)
            has_visual = False
            page_qs = []

        # Upload page screenshot only when gpt-5.4 says there are visuals
        page_image_url: str | None = None
        if has_visual and page_qs:
            page_image_url = _upload_page_image(supabase, jpeg_bytes, artifact_id, page_num)

        for q in page_qs:
            if q.get("question_text"):
                q["question_index"] = global_index
                q["page_image_url"] = page_image_url
                all_questions.append(q)
                global_index += 1

        logger.info(
            "_extract_questions_vision: page %d -> %d questions, has_visual=%s",
            page_num + 1, len(page_qs), has_visual,
        )

    doc.close()
    return all_questions


# ── Extract questions from past exam PDF ──────────────────────────────────────

def extract_questions_from_artifact(
    supabase: Client,
    artifact_id: int,
    course_id: str,
    openai_key: str,
) -> list[dict]:
    """Extract questions from a past_exam artifact into exam_questions table.

    Idempotent: if questions already exist for this artifact_id, returns them directly.
    """
    existing = (
        supabase.table("exam_questions")
        .select("id")
        .eq("artifact_id", artifact_id)
        .limit(1)
        .execute()
        .data
    )
    if existing:
        rows = (
            supabase.table("exam_questions")
            .select("*")
            .eq("artifact_id", artifact_id)
            .order("question_index")
            .execute()
            .data
        )
        return rows or []

    art_rows = (
        supabase.table("artifacts")
        .select("storage_path, file_type, file_name")
        .eq("id", artifact_id)
        .execute()
        .data
    )
    if not art_rows:
        logger.warning("extract_questions: artifact %s not found", artifact_id)
        return []

    art = art_rows[0]
    sp = art.get("storage_path")
    ft = art.get("file_type", "pdf")
    if not sp or ft not in ("pdf", "word", "text"):
        logger.warning(
            "extract_questions: unsupported file type %s for artifact %s", ft, artifact_id
        )
        return []

    from app.services.artifact_service import download_artifact_bytes
    try:
        data = download_artifact_bytes(supabase, sp)
    except Exception as exc:
        logger.error("extract_questions: download failed for artifact %s: %s", artifact_id, exc)
        return []

    # For PDF: try text extraction first; use Vision if scanned OR has embedded images (figures/diagrams)
    if ft == "pdf":
        text = _raw_extract(ft, data)
        use_vision = len(text.strip()) < _MIN_TEXT_LEN
        if not use_vision:
            try:
                import fitz as _fitz
                _doc = _fitz.open(stream=data, filetype="pdf")
                use_vision = any(bool(_p.get_images()) for _p in _doc)
                _doc.close()
                if use_vision:
                    logger.info(
                        "extract_questions: artifact %s has embedded images, using gpt-5.4 Vision",
                        artifact_id,
                    )
            except Exception:
                pass
        if use_vision:
            try:
                questions = _extract_questions_vision(data, openai_key, supabase, artifact_id)
            except Exception as exc:
                logger.error("extract_questions: Vision failed for artifact %s: %s", artifact_id, exc)
                return []
            if not questions:
                logger.warning("extract_questions: no questions from Vision for artifact %s", artifact_id)
                return []
            # Skip to insert
            rows_to_insert = []
            for q in questions:
                if not q.get("question_text"):
                    continue
                rows_to_insert.append({
                    "course_id":       course_id,
                    "artifact_id":     artifact_id,
                    "source_type":     "past_exam",
                    "question_type":   q.get("question_type", "short_answer"),
                    "question_index":  int(q.get("question_index", 0)),
                    "question_text":   str(q.get("question_text", "")),
                    "options":         q.get("options") if q.get("question_type") == "mcq" else None,
                    "correct_answer":  q.get("correct_answer"),
                    "explanation":     q.get("explanation"),
                    "mock_session_id": None,
                    "page_image_url":  q.get("page_image_url"),
                })
            if not rows_to_insert:
                return []
            try:
                result = supabase.table("exam_questions").insert(rows_to_insert).execute()
                logger.info("extract_questions(vision): inserted %d for artifact %s", len(result.data or []), artifact_id)
                return result.data or []
            except Exception as exc:
                logger.error("extract_questions(vision): DB insert failed for artifact %s: %s", artifact_id, exc)
                return []
    else:
        text = _raw_extract(ft, data)

    if not text.strip():
        return []

    if len(text) > _MAX_PDF_CHARS:
        text = text[:_MAX_PDF_CHARS]

    system = (
        "You are an expert exam paper parser. Extract ALL questions from the provided past exam paper.\n\n"
        "Rules:\n"
        "1. Extract questions exactly as written — do NOT rephrase or simplify.\n"
        "2. Classify each question as \"mcq\" (multiple choice with clear A/B/C/D options) "
        "or \"short_answer\" (any other type: written answer, calculation, essay, etc.).\n"
        "3. For MCQ: extract all options as plain text (no \"A.\" prefix), "
        "identify correct answer letter if answer key is present in the paper.\n"
        "4. For short_answer: provide a concise reference answer if clearly inferable from context; otherwise null.\n"
        "5. Preserve original question ordering with question_index starting at 1.\n"
        "6. Return ONLY a raw JSON array — no markdown fences, no extra text.\n\n"
        "Output format:\n"
        "[{\"question_index\":1,\"question_type\":\"mcq\","
        "\"question_text\":\"...\",\"options\":[\"opt\",\"opt\",\"opt\",\"opt\"],"
        "\"correct_answer\":\"A\",\"explanation\":\"...\"},"
        "{\"question_index\":2,\"question_type\":\"short_answer\","
        "\"question_text\":\"...\",\"options\":null,"
        "\"correct_answer\":\"reference answer or null\",\"explanation\":null}]"
    )

    try:
        raw = _chat(system, f"Exam paper content:\n\n{text}", openai_key, temperature=0.1)
    except Exception as exc:
        logger.error("extract_questions: LLM call failed for artifact %s: %s", artifact_id, exc)
        return []

    content_str = _extract_json(raw)
    try:
        questions = json.loads(content_str)
        if not isinstance(questions, list):
            questions = []
    except Exception:
        questions = []

    if not questions:
        logger.warning("extract_questions: no questions parsed for artifact %s", artifact_id)
        return []

    rows_to_insert = []
    for q in questions:
        if not q.get("question_text"):
            continue
        rows_to_insert.append({
            "course_id":      course_id,
            "artifact_id":    artifact_id,
            "source_type":    "past_exam",
            "question_type":  q.get("question_type", "short_answer"),
            "question_index": int(q.get("question_index", 0)),
            "question_text":  str(q.get("question_text", "")),
            "options":        q.get("options") if q.get("question_type") == "mcq" else None,
            "correct_answer": q.get("correct_answer"),
            "explanation":    q.get("explanation"),
            "mock_session_id": None,
        })

    if not rows_to_insert:
        return []

    try:
        result = supabase.table("exam_questions").insert(rows_to_insert).execute()
        logger.info(
            "extract_questions: inserted %d questions for artifact %s",
            len(result.data or []), artifact_id,
        )
        return result.data or []
    except Exception as exc:
        logger.error("extract_questions: DB insert failed for artifact %s: %s", artifact_id, exc)
        return []


# ── Generate mock questions (called by generation worker) ─────────────────────

def run_mock_generation(db: Client, user_id: str, course_id: str, body: Any) -> dict:
    """Generate mock exam questions and store in exam_questions table.

    Returns {"id": None, "session_id": ...} — no outputs table row.
    Called by generation_worker for job_type='exam_mock'.
    """
    from app.services.generate_service import _get_openai_key
    openai_key = _get_openai_key(db)

    num_mcq = int(getattr(body, "num_mcq", 10))
    num_short = int(getattr(body, "num_short", 5))
    session_id = str(getattr(body, "session_id", ""))

    past_rows = (
        db.table("exam_questions")
        .select("question_type, question_text, options, correct_answer")
        .eq("course_id", course_id)
        .eq("source_type", "past_exam")
        .limit(20)
        .execute()
        .data
    ) or []

    if not past_rows:
        raise AppError("没有找到往年真题，请先上传并审核 past_exam 类型文件")

    sample_parts: list[str] = []
    for i, q in enumerate(past_rows[:20], 1):
        sample_parts.append(f"[{i}] type={q['question_type']}, Q: {q['question_text']}")
        if q.get("options"):
            sample_parts.append(f"    options: {q['options']}")
        if q.get("correct_answer"):
            sample_parts.append(f"    answer: {q['correct_answer']}")
    past_sample = "\n".join(sample_parts)

    system = (
        f"You are a creative exam question generator for university-level courses.\n"
        f"Generate exactly {num_mcq} multiple-choice questions and {num_short} short-answer questions "
        f"in the style of the provided past exam questions.\n\n"
        "Rules:\n"
        "1. Questions must be DIFFERENT from the examples — do NOT copy them.\n"
        "2. Test similar concepts and difficulty level.\n"
        "3. For MCQ: 4 options (plain text, no A./B. prefix), one correct answer (A/B/C/D), include explanation.\n"
        "4. For short_answer: include a concise reference answer.\n"
        f"5. Number sequentially: MCQ first (indices 1–{num_mcq}), "
        f"then short_answer (indices {num_mcq + 1}–{num_mcq + num_short}).\n"
        "6. Return ONLY a raw JSON array — no markdown fences, no extra text.\n\n"
        "Output format:\n"
        "[{\"question_index\":1,\"question_type\":\"mcq\","
        "\"question_text\":\"...\",\"options\":[\"opt\",\"opt\",\"opt\",\"opt\"],"
        "\"correct_answer\":\"A\",\"explanation\":\"...\"},"
        f"{{\"question_index\":{num_mcq + 1},\"question_type\":\"short_answer\","
        "\"question_text\":\"...\",\"options\":null,"
        "\"correct_answer\":\"reference answer\",\"explanation\":null}]"
    )

    try:
        raw = _chat(
            system,
            f"Past exam questions (style reference):\n\n{past_sample}",
            openai_key,
            temperature=0.75,
            top_p=0.9,
        )
    except Exception as exc:
        raise AppError(f"模拟题生成失败：{str(exc)[:120]}")

    content_str = _extract_json(raw)
    try:
        questions = json.loads(content_str)
        if not isinstance(questions, list):
            questions = []
    except Exception:
        questions = []

    if not questions:
        raise AppError("AI 未能生成有效题目，请重试")

    rows_to_insert = []
    for q in questions:
        if not q.get("question_text"):
            continue
        rows_to_insert.append({
            "course_id":      course_id,
            "artifact_id":    None,
            "source_type":    "mock",
            "question_type":  q.get("question_type", "short_answer"),
            "question_index": int(q.get("question_index", 0)),
            "question_text":  str(q.get("question_text", "")),
            "options":        q.get("options") if q.get("question_type") == "mcq" else None,
            "correct_answer": q.get("correct_answer"),
            "explanation":    q.get("explanation"),
            "mock_session_id": session_id,
        })

    if not rows_to_insert:
        raise AppError("AI 未能生成有效题目，请重试")

    db.table("exam_questions").insert(rows_to_insert).execute()
    logger.info(
        "run_mock_generation: inserted %d questions for session %s", len(rows_to_insert), session_id
    )
    # Return a sentinel dict — generation_worker checks for id=None to skip finish_job output_id
    return {"id": None, "session_id": session_id}


# ── Grade submitted answers ───────────────────────────────────────────────────

def grade_answers(
    supabase: Client,
    user_id: str,
    course_id: str,
    answers: list[dict],
    openai_key: str,
) -> list[dict]:
    """Grade a list of answers. MCQ: local comparison. Short answer: AI batch.

    Writes results to exam_attempts (UPSERT).
    Returns [{"question_id", "is_correct", "feedback"}].
    """
    if not answers:
        return []

    question_ids = [a["question_id"] for a in answers]
    q_rows = (
        supabase.table("exam_questions")
        .select("id, question_type, question_text, correct_answer")
        .in_("id", question_ids)
        .execute()
        .data
    ) or []
    q_map: dict[int, dict] = {row["id"]: row for row in q_rows}

    results: list[dict] = []
    short_batch: list[tuple[int, dict, str]] = []  # (result_index, question_row, user_answer)

    for ans in answers:
        qid = ans["question_id"]
        user_ans = (ans.get("user_answer") or "").strip()
        q = q_map.get(qid)

        if not q:
            results.append({"question_id": qid, "is_correct": None, "feedback": "题目不存在"})
            continue

        if q["question_type"] == "mcq":
            correct = (q.get("correct_answer") or "").upper().strip()
            if correct:
                is_correct = user_ans.upper().strip() == correct
                feedback = "回答正确！" if is_correct else f"正确答案是 {correct}"
            else:
                is_correct = None
                feedback = "暂无参考答案"
            results.append({"question_id": qid, "is_correct": is_correct, "feedback": feedback})
        else:
            results.append({"question_id": qid, "is_correct": None, "feedback": None})
            short_batch.append((len(results) - 1, q, user_ans))

    if short_batch:
        _grade_short_answers_batch(results, short_batch, openai_key)

    # Upsert all attempts
    for ans in answers:
        qid = ans["question_id"]
        r = next((x for x in results if x["question_id"] == qid), None)
        if not r:
            continue
        try:
            supabase.table("exam_attempts").upsert(
                {
                    "user_id":     user_id,
                    "question_id": qid,
                    "course_id":   course_id,
                    "user_answer": ans.get("user_answer", ""),
                    "is_correct":  r["is_correct"],
                    "feedback":    r["feedback"],
                },
                on_conflict="user_id,question_id",
            ).execute()
        except Exception as exc:
            logger.warning("grade_answers upsert failed for question %s: %s", qid, exc)

    return results


def _grade_short_answers_batch(
    results: list[dict],
    batch: list[tuple[int, dict, str]],
    openai_key: str,
) -> None:
    """Grade short answer questions in one AI call. Mutates results in-place."""
    if not batch:
        return

    lines: list[str] = []
    for idx, (_, q, user_ans) in enumerate(batch, 1):
        ref = q.get("correct_answer") or "N/A"
        lines.append(
            f"[{idx}] Question: {q['question_text']}\n"
            f"Reference: {ref}\n"
            f"Student: {user_ans}"
        )

    system = (
        "You are a strict but fair exam marker. Grade each numbered student answer.\n"
        "Judge ONLY correct or incorrect — accept alternative phrasing if core concept is right.\n"
        "Provide brief feedback (1-2 sentences) in the same language as the question.\n"
        "Return ONLY a raw JSON array in the same order as the input.\n"
        'Format: [{"is_correct": true/false, "feedback": "..."}]'
    )

    try:
        from openai import OpenAI
        client = OpenAI(api_key=openai_key, timeout=120.0)
        resp = client.chat.completions.create(
            model="gpt-5.4",
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": "\n\n".join(lines)},
            ],
            temperature=0.1,
        )
        raw = resp.choices[0].message.content or "[]"
    except Exception as exc:
        logger.error("AI short-answer grading failed: %s", exc)
        for result_idx, q, _ in batch:
            results[result_idx]["feedback"] = (
                "AI 批改失败，请对照参考答案自行判断"
                if q.get("correct_answer") else
                "此题无参考答案，请自行对照教材"
            )
        return

    raw = _extract_json(raw)
    try:
        graded = json.loads(raw)
        if not isinstance(graded, list):
            graded = []
    except Exception:
        graded = []

    for i, (result_idx, q, _) in enumerate(batch):
        if i < len(graded) and isinstance(graded[i], dict):
            results[result_idx]["is_correct"] = graded[i].get("is_correct")
            results[result_idx]["feedback"]   = graded[i].get("feedback", "")
        else:
            results[result_idx]["feedback"] = (
                "AI 批改失败，请自行判断"
                if q.get("correct_answer") else
                "此题无参考答案，请自行对照教材"
            )


# ── Favorites ─────────────────────────────────────────────────────────────────

def toggle_favorite(
    supabase: Client,
    user_id: str,
    question_id: int,
    course_id: str,
) -> bool:
    """Toggle favorite. Returns True if now favorited, False if unfavorited."""
    existing = (
        supabase.table("exam_question_favorites")
        .select("id")
        .eq("user_id", user_id)
        .eq("question_id", question_id)
        .execute()
        .data
    )
    if existing:
        supabase.table("exam_question_favorites").delete() \
            .eq("user_id", user_id).eq("question_id", question_id).execute()
        return False
    supabase.table("exam_question_favorites").insert({
        "user_id":     user_id,
        "question_id": question_id,
        "course_id":   course_id,
    }).execute()
    return True


def list_favorites(
    supabase: Client,
    user_id: str,
    course_id: Optional[str] = None,
) -> list[dict]:
    """List favorited questions. course_id=None returns all courses."""
    q = (
        supabase.table("exam_question_favorites")
        .select("question_id, course_id, created_at, exam_questions(*)")
        .eq("user_id", user_id)
    )
    if course_id:
        q = q.eq("course_id", course_id)
    rows = q.order("created_at", desc=True).execute().data or []

    result: list[dict] = []
    for row in rows:
        q_data = row.get("exam_questions")
        if q_data:
            q_data["is_favorite"] = True
            q_data["favorited_at"] = row.get("created_at")
            result.append(q_data)
    return result


# ── List helpers ──────────────────────────────────────────────────────────────

def get_past_exam_list(supabase: Client, course_id: str) -> list[dict]:
    """List past exam artifacts that have extracted questions, with question counts."""
    rows = (
        supabase.table("exam_questions")
        .select("artifact_id")
        .eq("course_id", course_id)
        .eq("source_type", "past_exam")
        .execute()
        .data
    ) or []

    counts: dict[int, int] = {}
    for row in rows:
        aid = row.get("artifact_id")
        if aid:
            counts[aid] = counts.get(aid, 0) + 1

    if not counts:
        return []

    arts = (
        supabase.table("artifacts")
        .select("id, file_name, created_at")
        .in_("id", list(counts.keys()))
        .execute()
        .data
    ) or []

    return [
        {
            "artifact_id":    a["id"],
            "file_name":      a["file_name"],
            "question_count": counts.get(a["id"], 0),
            "created_at":     a["created_at"],
        }
        for a in arts
    ]


def get_mock_sessions(supabase: Client, course_id: str) -> list[dict]:
    """List mock question sessions for this course."""
    rows = (
        supabase.table("exam_questions")
        .select("mock_session_id, created_at")
        .eq("course_id", course_id)
        .eq("source_type", "mock")
        .not_.is_("mock_session_id", "null")
        .execute()
        .data
    ) or []

    sessions: dict[str, dict] = {}
    for row in rows:
        sid = row.get("mock_session_id")
        if not sid:
            continue
        if sid not in sessions:
            sessions[sid] = {
                "session_id":     sid,
                "question_count": 0,
                "created_at":     row["created_at"],
            }
        sessions[sid]["question_count"] += 1

    return sorted(sessions.values(), key=lambda x: x["created_at"], reverse=True)
