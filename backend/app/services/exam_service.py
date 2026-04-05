"""Exam service: extract real questions, generate mock questions, grade answers, favorites.

Three main workflows:
1. extract_questions_from_artifact() — called as background task on artifact approval
2. run_mock_generation()             — called by generation worker for 'exam_mock' jobs
3. grade_answers()                   — called synchronously on exam submit
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client

from app.core.exceptions import AppError
from app.services.generate_service import _chat, _extract_json, _raw_extract

logger = logging.getLogger(__name__)

_MAX_PDF_CHARS = 80_000
_MIN_TEXT_LEN = 100       # below this, treat PDF as scanned and use Vision
_SIGNIFICANT_IMAGE_PX = 100  # images smaller than this in either dimension are ignored (logos/icons)
_MAX_VISION_PAGES = 50    # safety cap — prevents runaway API cost on very long PDFs

_VISION_SYSTEM = (
    "You are an expert university exam paper parser.\n"
    "Analyze this exam page image and return a JSON object with two fields.\n\n"
    "Field 1 — \"questions\": array of question objects on this page.\n"
    "  Rules:\n"
    "  1. Extract questions exactly as written — do NOT rephrase.\n"
    "  2. Classify each as \"mcq\" (has multiple-choice options labeled A/B/C/D, (A)/(B)/(C)/(D), or similar) or \"short_answer\" (everything else).\n"
    "  3. For MCQ: list options as plain text (strip any leading label like \"A.\", \"(A)\", \"A)\" etc.), set correct_answer to the letter if answer key visible, else null.\n"
    "  4. For short_answer: set correct_answer to a concise reference answer if clearly shown, else null.\n"
    "  5. If this page has NO questions (cover page, instructions only), return an empty array [].\n"
    "  6. MULTI-PART QUESTIONS: If a question has sub-parts labeled (a)(b)(c) or (i)(ii)(iii) or similar,\n"
    "     treat the ENTIRE question including ALL sub-parts as ONE question object.\n"
    "     Include every sub-part verbatim in question_text. Do NOT split sub-parts into separate questions.\n"
    "  7. CROSS-PAGE QUESTIONS:\n"
    "     - Set continues_from_prev=true if this question is a continuation from the previous page\n"
    "       (i.e. its numbering or text implies it started on the prior page).\n"
    "     - Set continues_to_next=true if this question is clearly not finished\n"
    "       (text is cut off, or sub-parts continue beyond this page).\n"
    "  8. Set has_visual=true ONLY if the question contains a diagram, figure, graph, table, or equation image that is ESSENTIAL to answer it.\n"
    "  9. When has_visual=true, provide visual_y_start_pct and visual_y_end_pct (0–100, % from top of page):\n"
    "     - Cover ONLY the visual element(s), NOT the question text.\n"
    "     - Extend 2–3% above and below the visual element to avoid clipping.\n"
    "     - If multiple visuals belong to one question, span all of them in a single range.\n"
    "  10. For MCQ questions, ALWAYS extract all answer options even if they appear below a figure or table.\n"
    "      If the question stem is visible but the A/B/C/D options are not on this page, set continues_to_next=true.\n"
    "      NEVER classify a question as MCQ if you cannot see at least 4 options — use short_answer instead.\n\n"
    "Field 2 — \"page_has_visual\": boolean — true if the page contains ANY visual element.\n\n"
    "Return ONLY a raw JSON object — no markdown fences, no extra text.\n"
    "Format: {\"page_has_visual\": true/false, \"questions\": [{\"question_index\":1,\"question_type\":\"mcq\","
    "\"question_text\":\"...\",\"options\":[\"opt\",\"opt\",\"opt\",\"opt\"],"
    "\"correct_answer\":\"A\",\"explanation\":null,\"has_visual\":false,"
    "\"visual_y_start_pct\":null,\"visual_y_end_pct\":null,"
    "\"continues_from_prev\":false,\"continues_to_next\":false}, ...]}"
)


_EXAM_PAGES_BUCKET = "exam-pages"
_BUCKET_CREATED = False


def purge_artifact_page_images(supabase: Client, artifact_id: int) -> None:
    """Delete all crop images for an artifact from Supabase Storage (exam-pages bucket).

    Called before re-extraction so stale images don't accumulate.
    Best-effort: logs warnings on failure but never raises.
    """
    try:
        _ensure_exam_pages_bucket(supabase)
        prefix = f"{artifact_id}/"
        listed = supabase.storage.from_(_EXAM_PAGES_BUCKET).list(path=str(artifact_id))
        if not listed:
            return
        paths = [f"{prefix}{item['name']}" for item in listed if item.get("name")]
        if paths:
            supabase.storage.from_(_EXAM_PAGES_BUCKET).remove(paths)
            logger.info("purge_artifact_page_images: deleted %d files for artifact %s", len(paths), artifact_id)
    except Exception as exc:
        logger.warning("purge_artifact_page_images: failed for artifact %s: %s", artifact_id, exc)


def _has_significant_images(doc) -> bool:
    """Return True if any page contains an embedded image larger than _SIGNIFICANT_IMAGE_PX × _SIGNIFICANT_IMAGE_PX.

    Filters out page decorations (logos, watermarks, icons) which are typically <100×100 px.
    """
    for page in doc:
        for img in page.get_images(full=True):
            w, h = img[2], img[3]  # pixel dimensions of the stored image
            if w > _SIGNIFICANT_IMAGE_PX and h > _SIGNIFICANT_IMAGE_PX:
                return True
    return False


def _extract_inline_mcq_options(question_text: str) -> tuple[str, list[str] | None]:
    """Try to recover MCQ options if the parser embedded them into question_text."""
    import re

    text = (question_text or "").replace("\r\n", "\n")
    if not text.strip():
        return question_text, None

    pattern = re.compile(
        r"(?:^|\n)\s*(?:\(?([A-D])\)?[.)])\s*(.+?)(?=(?:\n\s*\(?[A-D]\)?[.)]\s*)|\Z)",
        re.S,
    )
    matches = list(pattern.finditer(text))
    if len(matches) < 4:
        return question_text, None

    ordered = sorted(matches, key=lambda m: m.start())
    labels = [m.group(1).upper() for m in ordered[:4]]
    if labels != ["A", "B", "C", "D"]:
        return question_text, None

    options = [" ".join(m.group(2).split()) for m in ordered[:4]]
    stem = text[: ordered[0].start()].strip()
    return stem or question_text, options


def _normalize_past_exam_question(q: dict[str, Any]) -> dict[str, Any]:
    """Repair imperfect OCR/vision output before storing."""
    import re

    row = dict(q)
    q_type = row.get("question_type", "short_answer")
    row["question_text"] = str(row.get("question_text", "")).strip()
    lines = [line.strip() for line in row["question_text"].splitlines() if line.strip()]
    head_line = lines[0] if lines else row["question_text"]

    mcq_phrase = re.search(
        (
            r"\b(which|what)\s+(one\s+of\s+)?the\s+following\b"
            r"|\bwhich statement\b"
            r"|\bwhich option\b"
            r"|\bbest describes?\b"
            r"|\bbest matches?\b"
            r"|\bmost likely\b"
            r"|\b(?:is|are)\s+incorrect\b"
            r"|\b(?:is|are)\s+correct\b"
        ),
        row["question_text"],
        re.I,
    )
    structured_mcq_stem = bool(
        re.search(r"\bfollowing\s+(algorithm|kernel|filter|matrix|diagram|figure|table)\b", head_line, re.I)
        and (
            head_line.rstrip().endswith(":")
            or any(re.match(r"step\s*\d+\s*:", line, re.I) for line in lines[1:])
        )
    )

    if q_type != "mcq" and (mcq_phrase or structured_mcq_stem):
        q_type = "mcq"
        row["question_type"] = "mcq"

    if q_type == "mcq":
        options = row.get("options") or []
        options = [str(opt).strip() for opt in options if str(opt).strip()]
        if len(options) < 4:
            stem, parsed = _extract_inline_mcq_options(row["question_text"])
            if parsed:
                row["question_text"] = stem
                options = parsed
        row["options"] = options[:4] if options else None

    return row


def _merge_cross_page_questions(questions: list[dict]) -> list[dict]:
    """Merge questions that GPT flagged as cross-page continuations.

    When q[i].continues_to_next=True and q[i+1].continues_from_prev=True,
    append q[i+1]'s text to q[i] and drop q[i+1].
    Re-sequence question_index after merging.
    """
    if not questions:
        return questions

    merged: list[dict] = []
    i = 0
    while i < len(questions):
        q = questions[i]
        # While current question says it continues AND next says it's a continuation — merge
        while (
            q.get("continues_to_next")
            and i + 1 < len(questions)
            and questions[i + 1].get("continues_from_prev")
        ):
            i += 1
            nxt = questions[i]
            q["question_text"] = q["question_text"].rstrip() + "\n" + nxt["question_text"].lstrip()
            # Prefer the visual from whichever half has one
            if not q.get("page_image_url") and nxt.get("page_image_url"):
                q["page_image_url"] = nxt["page_image_url"]
            if not q.get("has_visual") and nxt.get("has_visual"):
                q["has_visual"] = True
            # If continuation part is MCQ, promote type and inherit options
            if nxt.get("question_type") == "mcq":
                q["question_type"] = "mcq"
                if not q.get("options") and nxt.get("options"):
                    q["options"] = nxt["options"]
            # Merge correct_answer if absent on the first part
            if not q.get("correct_answer") and nxt.get("correct_answer"):
                q["correct_answer"] = nxt["correct_answer"]
            logger.debug("_merge_cross_page_questions: merged q%d with continuation", q.get("question_index"))
        merged.append(q)
        i += 1

    # Re-sequence question_index starting at 1
    for idx, q in enumerate(merged, 1):
        q["question_index"] = idx
    return merged


def _insert_past_exam_questions(supabase: Client, questions: list[dict], course_id: str, artifact_id: int) -> list[dict]:
    """Build rows and insert past_exam questions into exam_questions table."""
    rows = []
    for q in questions:
        q = _normalize_past_exam_question(q)
        if not q.get("question_text"):
            continue
        rows.append({
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
            "has_visual":      bool(q.get("has_visual", False)),
        })
    if not rows:
        return []
    try:
        result = supabase.table("exam_questions").insert(rows).execute()
        logger.info("_insert_past_exam_questions: inserted %d for artifact %s", len(result.data or []), artifact_id)
        return result.data or []
    except Exception as exc:
        logger.error("_insert_past_exam_questions: DB insert failed for artifact %s: %s", artifact_id, exc)
        return []


def _ensure_exam_pages_bucket(supabase: Client) -> None:
    """Create exam-pages bucket once per process if it doesn't exist."""
    global _BUCKET_CREATED
    if _BUCKET_CREATED:
        return
    try:
        supabase.storage.create_bucket(_EXAM_PAGES_BUCKET, options={"public": True})
        logger.info("Created Supabase bucket: %s", _EXAM_PAGES_BUCKET)
    except Exception:
        pass  # Bucket already exists — proceed anyway
    _BUCKET_CREATED = True


def _upload_page_image(supabase: Client, jpeg_bytes: bytes, artifact_id: int, page_num: int, q_index: int = 0) -> str | None:
    """Upload a JPEG question crop to Supabase Storage and return its public URL."""
    try:
        _ensure_exam_pages_bucket(supabase)
        path = f"{artifact_id}/p{page_num + 1}_q{q_index}.jpg"
        supabase.storage.from_(_EXAM_PAGES_BUCKET).upload(
            path, jpeg_bytes, {"content-type": "image/jpeg", "upsert": "true"}
        )
        return supabase.storage.from_(_EXAM_PAGES_BUCKET).get_public_url(path)
    except Exception as exc:
        logger.warning("_upload_page_image: failed for artifact %s page %d q %d: %s", artifact_id, page_num + 1, q_index, exc)
        return None


def _repair_missing_mcq_options(
    questions: list[dict],
    pdf_data: bytes,
    openai_key: str,
    supabase: Client,
    artifact_id: int,
) -> list[dict]:
    """For text-extracted MCQ questions with < 4 options: locate the page via fitz,
    render it as an image, and call GPT Vision to recover the options.
    If Vision also fails, attach the full page image so users can see the original.
    """
    import base64
    import fitz

    broken = [
        (i, q) for i, q in enumerate(questions)
        if q.get("question_type") == "mcq" and len(q.get("options") or []) < 4
    ]
    if not broken:
        return questions

    try:
        doc = fitz.open(stream=pdf_data, filetype="pdf")
    except Exception:
        return questions

    mat = fitz.Matrix(1.5, 1.5)
    page_texts = [doc[p].get_text() for p in range(len(doc))]

    from openai import OpenAI
    client = OpenAI(api_key=openai_key, timeout=60.0)

    result = list(questions)
    for q_idx, q in broken:
        stem = (q.get("question_text") or "")[:80].strip()
        # Find which page contains this question's first ~40 chars
        found_page: int | None = None
        for page_num, ptext in enumerate(page_texts):
            if stem[:40] in ptext:
                found_page = page_num
                break

        if found_page is None:
            logger.debug("_repair_missing_mcq_options: could not locate q%d in PDF", q.get("question_index"))
            continue

        pix = doc[found_page].get_pixmap(matrix=mat)
        b64 = base64.b64encode(pix.tobytes("png")).decode()
        full_page_jpeg = pix.tobytes("jpeg", 88)

        # If options might be on the next page, also render it and ask GPT to look at both
        next_page_b64: str | None = None
        if found_page + 1 < len(doc):
            nxt_pix = doc[found_page + 1].get_pixmap(matrix=mat)
            next_page_b64 = base64.b64encode(nxt_pix.tobytes("png")).decode()

        system = (
            "You are an expert exam parser. A multiple-choice question's options are missing from our text extraction.\n"
            f"The question stem is:\n\"\"\"{stem}\"\"\"\n\n"
            "Look at the exam page image(s) and extract ONLY the 4 answer options for this specific question.\n"
            "Return ONLY a raw JSON array of exactly 4 strings — no labels like A/B/C/D, no markdown.\n"
            "Example: [\"First option text\", \"Second option text\", \"Third option text\", \"Fourth option text\"]\n"
            "If you cannot find 4 options, return []."
        )
        user_content: list[dict] = [
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}},
        ]
        if next_page_b64:
            user_content.append(
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{next_page_b64}", "detail": "high"}},
            )

        try:
            resp = client.chat.completions.create(
                model="gpt-5.4",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user_content},
                ],
                max_completion_tokens=512,
                temperature=0.1,
            )
            raw = _extract_json(resp.choices[0].message.content or "[]")
            opts = json.loads(raw) if raw else []
            if isinstance(opts, list) and len(opts) >= 4:
                result[q_idx] = {**q, "options": [str(o).strip() for o in opts[:4]]}
                logger.info(
                    "_repair_missing_mcq_options: recovered options for q%d via Vision",
                    q.get("question_index"),
                )
            else:
                # Vision couldn't find options either — attach full page image as reference
                url = _upload_page_image(supabase, full_page_jpeg, artifact_id, found_page, q.get("question_index", 0))
                if url:
                    result[q_idx] = {**q, "page_image_url": url}
                logger.debug(
                    "_repair_missing_mcq_options: Vision found no options for q%d, attached page image",
                    q.get("question_index"),
                )
        except Exception as exc:
            logger.warning("_repair_missing_mcq_options: Vision call failed for q%d: %s", q.get("question_index"), exc)

    doc.close()
    return result


def _extract_questions_vision(data: bytes, openai_key: str, supabase: Client, artifact_id: int) -> list[dict]:
    """Convert each PDF page to image, send to gpt-5.4 Vision.

    gpt-5.4 returns has_visual + questions per page.
    If has_visual=True, upload the page screenshot and attach its URL to all questions on that page.
    """
    import base64
    import fitz  # pymupdf

    doc = fitz.open(stream=data, filetype="pdf")
    total_pages = len(doc)
    if total_pages > _MAX_VISION_PAGES:
        logger.warning(
            "_extract_questions_vision: artifact %s has %d pages, capping at %d",
            artifact_id, total_pages, _MAX_VISION_PAGES,
        )
        total_pages = _MAX_VISION_PAGES
    all_questions: list[dict] = []
    global_index = 1

    from openai import OpenAI
    client = OpenAI(api_key=openai_key, timeout=180.0)

    for page_num in range(total_pages):
        page = doc[page_num]
        mat = fitz.Matrix(1.5, 1.5)  # 108 DPI — sufficient for Vision, 40% smaller than 2x
        pix = page.get_pixmap(matrix=mat)
        b64 = base64.b64encode(pix.tobytes("png")).decode()
        full_page_jpeg = pix.tobytes("jpeg", 88)

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
            page_has_visual: bool = bool(parsed.get("page_has_visual", False))
            page_qs: list = parsed.get("questions", [])
            if not isinstance(page_qs, list):
                page_qs = []
        except Exception as exc:
            logger.warning("_extract_questions_vision: page %d failed: %s", page_num + 1, exc)
            page_has_visual = False
            page_qs = []

        page_rect = page.rect  # page size in points
        page_h_pt = page_rect.height
        page_w_pt = page_rect.width
        pad_pt = 10.0  # small padding around the visual element only
        for q in page_qs:
            q = _normalize_past_exam_question(q)
            if not q.get("question_text"):
                continue
            q_image_url: str | None = None
            if q.get("has_visual") and page_has_visual:
                v_start = q.get("visual_y_start_pct")
                v_end = q.get("visual_y_end_pct")
                if v_start is None or v_end is None or float(v_start) >= float(v_end):
                    logger.debug(
                        "has_visual=True but coords invalid for q%d (v_start=%s v_end=%s), skipping",
                        global_index, v_start, v_end,
                    )
                else:
                    y_start_pt = max(0.0, float(v_start) / 100.0 * page_h_pt - pad_pt)
                    y_end_pt = min(page_h_pt, float(v_end) / 100.0 * page_h_pt + pad_pt)
                    clip = fitz.Rect(0, y_start_pt, page_w_pt, y_end_pt)
                    crop_pix = page.get_pixmap(matrix=mat, clip=clip)
                    crop_jpeg = crop_pix.tobytes("jpeg", 88)
                    mcq_options = q.get("options") or []
                    image_bytes = full_page_jpeg if q.get("question_type") == "mcq" and len(mcq_options) < 4 else crop_jpeg
                    q_image_url = _upload_page_image(supabase, image_bytes, artifact_id, page_num, global_index)
            # MCQ with missing options but no visual declared → still attach full page so user can see original
            if q_image_url is None and q.get("question_type") == "mcq" and len(q.get("options") or []) < 4:
                q_image_url = _upload_page_image(supabase, full_page_jpeg, artifact_id, page_num, global_index)
                logger.debug(
                    "_extract_questions_vision: MCQ q%d missing options, attached full-page fallback",
                    global_index,
                )
            q["question_index"] = global_index
            q["page_image_url"] = q_image_url
            all_questions.append(q)
            global_index += 1
        logger.info(
            "_extract_questions_vision: page %d -> %d questions, page_has_visual=%s",
            page_num + 1, len(page_qs), page_has_visual,
        )

    doc.close()
    return _merge_cross_page_questions(all_questions)


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

    # Hash cache: if another artifact with the same file_hash already has questions, copy them
    file_hash = art.get("file_hash")
    if file_hash:
        donor_rows = (
            supabase.table("artifacts")
            .select("id")
            .eq("file_hash", file_hash)
            .eq("doc_type", "past_exam")
            .neq("id", artifact_id)
            .execute()
            .data or []
        )
        for donor in donor_rows:
            donor_id = donor["id"]
            source_qs = (
                supabase.table("exam_questions")
                .select("*")
                .eq("artifact_id", donor_id)
                .eq("source_type", "past_exam")
                .order("question_index")
                .execute()
                .data or []
            )
            if source_qs:
                copies = []
                for q in source_qs:
                    row = {k: v for k, v in q.items() if k not in ("id", "created_at")}
                    row["artifact_id"] = artifact_id
                    row["course_id"] = course_id
                    copies.append(row)
                try:
                    result = supabase.table("exam_questions").insert(copies).execute()
                    logger.info(
                        "extract_questions: hash-cache hit — copied %d questions from artifact %s to %s",
                        len(result.data or []), donor_id, artifact_id,
                    )
                    return result.data or []
                except Exception as exc:
                    logger.warning("extract_questions: hash-cache copy failed: %s", exc)
                    # Fall through to normal extraction

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
                use_vision = _has_significant_images(_doc)
                _doc.close()
                if use_vision:
                    logger.info(
                        "extract_questions: artifact %s has significant embedded images, using gpt-5.4 Vision",
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
            return _insert_past_exam_questions(supabase, questions, course_id, artifact_id)
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
        "2. Classify each question as \"mcq\" (has multiple-choice options labeled A/B/C/D, (A)/(B)/(C)/(D), or similar) "
        "or \"short_answer\" (any other type: written answer, calculation, essay, etc.).\n"
        "3. For MCQ: extract all options as plain text (strip leading labels like \"A.\", \"(A)\", \"A)\" etc.), "
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

    # Repair MCQ questions whose options GPT missed in text extraction
    if ft == "pdf":
        questions = _repair_missing_mcq_options(questions, data, openai_key, supabase, artifact_id)

    return _insert_past_exam_questions(supabase, questions, course_id, artifact_id)


# ── Generate mock questions (called by generation worker) ─────────────────────

def _trim_prompt_text(text: str, limit: int = 280) -> str:
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _build_mock_reference(past_rows: list[dict], num_mcq: int, num_short: int) -> str:
    """Summarize the available past-paper style so mock papers feel less generic."""
    total = len(past_rows)
    mcqs = [row for row in past_rows if row.get("question_type") == "mcq"]
    shorts = [row for row in past_rows if row.get("question_type") != "mcq"]

    paper_map: dict[str, dict[str, int]] = {}
    for row in past_rows:
        paper_key = str(row.get("artifact_id") or "unknown")
        if paper_key not in paper_map:
            paper_map[paper_key] = {"total": 0, "mcq": 0, "short": 0}
        paper_map[paper_key]["total"] += 1
        if row.get("question_type") == "mcq":
            paper_map[paper_key]["mcq"] += 1
        else:
            paper_map[paper_key]["short"] += 1

    paper_lines = [
        f"- Paper {paper_id}: total={stats['total']}, mcq={stats['mcq']}, short={stats['short']}"
        for paper_id, stats in list(paper_map.items())[:6]
    ]

    mcq_examples: list[str] = []
    for idx, row in enumerate(mcqs[: min(16, max(num_mcq * 2, 8))], 1):
        mcq_examples.append(
            f"[MCQ {idx}] Q{row.get('question_index')}: {_trim_prompt_text(row.get('question_text', ''))}"
        )
        options = row.get("options") or []
        if options:
            mcq_examples.append(
                "    options: " + " | ".join(_trim_prompt_text(str(opt), 90) for opt in options[:4])
            )

    short_examples: list[str] = []
    for idx, row in enumerate(shorts[: min(12, max(num_short * 2, 6))], 1):
        short_examples.append(
            f"[SHORT {idx}] Q{row.get('question_index')}: {_trim_prompt_text(row.get('question_text', ''))}"
        )
        if row.get("correct_answer"):
            short_examples.append(
                f"    reference: {_trim_prompt_text(str(row['correct_answer']), 120)}"
            )

    return (
        "Observed paper structure:\n"
        f"- total past questions available: {total}\n"
        f"- mcq available: {len(mcqs)}\n"
        f"- short-answer available: {len(shorts)}\n"
        f"- target output: {num_mcq} mcq + {num_short} short-answer\n"
        + ("\n".join(paper_lines) if paper_lines else "- No per-paper grouping available")
        + "\n\nRepresentative MCQ style:\n"
        + ("\n".join(mcq_examples) if mcq_examples else "- none")
        + "\n\nRepresentative short-answer style:\n"
        + ("\n".join(short_examples) if short_examples else "- none")
    )


def _build_mock_visual_reference(visual_rows: list[dict], target_visual: int) -> str:
    refs: list[str] = []
    for idx, row in enumerate(visual_rows[: min(8, len(visual_rows))], 1):
        refs.append(
            f"[V{idx}] type={row.get('question_type')} "
            f"Q{row.get('question_index')}: {_trim_prompt_text(row.get('question_text', ''), 220)}"
        )
    return (
        f"Visual references available: {len(visual_rows)}\n"
        f"Target visual mock questions: {target_visual}\n"
        "When you want a generated question to use one of these visuals, return visual_ref as V1/V2/... .\n"
        "If a question does not use a visual, return visual_ref as null.\n\n"
        "Available visual references:\n"
        + ("\n".join(refs) if refs else "- none")
    )


def _normalize_mock_questions(questions: list[dict], num_mcq: int, num_short: int) -> list[dict]:
    """Keep valid generated questions, enforce counts, and re-sequence them."""
    cleaned: list[dict] = []
    mcq_seen = 0
    short_seen = 0

    for row in questions:
        q_text = str(row.get("question_text", "")).strip()
        q_type = row.get("question_type", "short_answer")
        if not q_text:
            continue

        if q_type == "mcq":
            options = row.get("options") or []
            if len(options) < 4 or mcq_seen >= num_mcq:
                continue
            mcq_seen += 1
            cleaned.append({
                "question_type": "mcq",
                "question_text": q_text,
                "options": [str(opt).strip() for opt in options[:4]],
                "correct_answer": str(row.get("correct_answer", "")).strip().upper()[:1] or None,
                "explanation": row.get("explanation"),
                "visual_ref": row.get("visual_ref"),
            })
        else:
            if short_seen >= num_short:
                continue
            short_seen += 1
            cleaned.append({
                "question_type": "short_answer",
                "question_text": q_text,
                "options": None,
                "correct_answer": row.get("correct_answer"),
                "explanation": row.get("explanation"),
                "visual_ref": row.get("visual_ref"),
            })

    ordered = [q for q in cleaned if q["question_type"] == "mcq"] + [
        q for q in cleaned if q["question_type"] == "short_answer"
    ]
    for idx, row in enumerate(ordered, 1):
        row["question_index"] = idx
    return ordered


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
        .select("artifact_id, question_index, question_type, question_text, options, correct_answer, has_visual, page_image_url")
        .eq("course_id", course_id)
        .eq("source_type", "past_exam")
        .order("artifact_id", desc=True)
        .order("question_index")
        .limit(80)
        .execute()
        .data
    ) or []

    if not past_rows:
        raise AppError("没有找到往年真题，请先上传并审核 past_exam 类型文件")

    past_sample = _build_mock_reference(past_rows, num_mcq, num_short)
    visual_rows = [
        row for row in past_rows
        if row.get("has_visual") and row.get("page_image_url")
    ]
    target_visual = min(len(visual_rows), max(1, min(num_mcq, (num_mcq + num_short) // 4))) if visual_rows else 0
    visual_sample = _build_mock_visual_reference(visual_rows, target_visual) if visual_rows else "Visual references available: 0"
    visual_ref_map = {
        f"V{idx}": row for idx, row in enumerate(visual_rows[: min(8, len(visual_rows))], 1)
    }

    system = (
        "You are a careful university exam-paper writer.\n"
        f"Generate exactly {num_mcq} multiple-choice questions and {num_short} short-answer questions "
        "using the real past-paper style shown below.\n\n"
        "Rules:\n"
        "1. Questions must be DIFFERENT from the examples — do NOT copy them.\n"
        "2. Match the voice of the real papers: wording, difficulty, pacing, and distractor style.\n"
        "3. Preserve the course's exam feel, not just the topic coverage.\n"
        "4. For MCQ: provide exactly 4 options as plain text, one correct answer (A/B/C/D), and a short explanation.\n"
        "5. For short_answer: provide a concise reference answer that a marker could use.\n"
        f"6. If visual references are available, create {target_visual} generated questions that explicitly use one of them.\n"
        "   For those questions set visual_ref to the chosen reference id such as V1. Otherwise set visual_ref to null.\n"
        "   The question must genuinely depend on the referenced visual to answer it.\n"
        f"6. Number sequentially: MCQ first (indices 1–{num_mcq}), "
        f"then short_answer (indices {num_mcq + 1}–{num_mcq + num_short}).\n"
        "7. Return ONLY a raw JSON array — no markdown fences, no extra text.\n\n"
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
            "Use the following real-paper evidence as style reference.\n"
            "First infer the common exam voice and structure, then write the new paper.\n\n"
            f"{past_sample}\n\n{visual_sample}\n\n"
            "Additional output rule:\n"
            "Return visual_ref for each generated question. Use null for non-visual questions.\n"
            "If you use a visual reference, set visual_ref to V1/V2/etc and write a question that depends on that visual.",
            openai_key,
            temperature=0.55,
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

    questions = _normalize_mock_questions(questions, num_mcq, num_short)

    rows_to_insert = []
    for q in questions:
        if not q.get("question_text"):
            continue
        visual_ref = str(q.get("visual_ref") or "").strip().upper()
        visual_row = visual_ref_map.get(visual_ref) if visual_ref else None
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
            "page_image_url": visual_row.get("page_image_url") if visual_row else None,
            "has_visual": bool(visual_row),
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
    # 答错时设 mistake_status='active'；答对/未知时不传该字段（保留已有状态）
    for ans in answers:
        qid = ans["question_id"]
        r = next((x for x in results if x["question_id"] == qid), None)
        if not r:
            continue
        try:
            row: dict = {
                "user_id":     user_id,
                "question_id": qid,
                "course_id":   course_id,
                "user_answer": ans.get("user_answer", ""),
                "is_correct":  r["is_correct"],
                "feedback":    r["feedback"],
            }
            if r["is_correct"] is False:
                row["mistake_status"] = "active"
            supabase.table("exam_attempts").upsert(
                row, on_conflict="user_id,question_id",
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

def get_past_exam_list(supabase: Client, course_id: str, user_id: str | None = None) -> list[dict]:
    """List past exam artifacts that have extracted questions, with question counts and unlock status."""
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

    # Fetch which artifacts this user has already unlocked
    unlocked_ids: set[int] = set()
    if user_id:
        unlock_rows = (
            supabase.table("exam_unlocks")
            .select("artifact_id")
            .eq("user_id", user_id)
            .in_("artifact_id", list(counts.keys()))
            .execute()
            .data
        ) or []
        unlocked_ids = {r["artifact_id"] for r in unlock_rows}

    return [
        {
            "artifact_id":    a["id"],
            "file_name":      a["file_name"],
            "question_count": counts.get(a["id"], 0),
            "created_at":     a["created_at"],
            "is_unlocked":    a["id"] in unlocked_ids,
        }
        for a in arts
    ]


def unlock_past_exam(supabase: Client, user_id: str, artifact_id: int) -> bool:
    """Check if already unlocked. If not, charge credits and record unlock.

    Returns True if newly unlocked, False if already unlocked.
    Raises InsufficientCreditsError if balance too low.
    """
    from app.services.credit_service import spend, COSTS

    # Check already unlocked
    existing = (
        supabase.table("exam_unlocks")
        .select("artifact_id")
        .eq("user_id", user_id)
        .eq("artifact_id", artifact_id)
        .limit(1)
        .execute()
        .data
    )
    if existing:
        return False  # already unlocked, no charge

    spend(supabase, user_id, COSTS["exam_past_unlock"], "exam_past_unlock", str(artifact_id))
    supabase.table("exam_unlocks").insert({"user_id": user_id, "artifact_id": artifact_id}).execute()
    return True


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


# ── Mistakes ───────────────────────────────────────────────────────────────────

def list_mistakes(
    supabase: Client,
    user_id: str,
    course_id: Optional[str] = None,
) -> list[dict]:
    """List user's mistakes (exam_attempts where mistake_status is not null), joined with question data."""
    q = (
        supabase.table("exam_attempts")
        .select(
            "question_id, course_id, user_answer, is_correct, feedback, "
            "mistake_status, mastered_at, created_at, "
            "exam_questions(id, question_text, question_type, options, correct_answer, explanation, source_type)"
        )
        .eq("user_id", user_id)
        .not_.is_("mistake_status", "null")
    )
    if course_id:
        q = q.eq("course_id", course_id)
    rows = q.order("created_at", desc=True).execute().data or []

    result: list[dict] = []
    for row in rows:
        q_data = row.get("exam_questions")
        if not q_data:
            continue
        item = {
            "question_id":    row["question_id"],
            "course_id":      row["course_id"],
            "user_answer":    row.get("user_answer"),
            "is_correct":     row.get("is_correct"),
            "feedback":       row.get("feedback"),
            "mistake_status": row.get("mistake_status"),
            "mastered_at":    row.get("mastered_at"),
            "created_at":     row.get("created_at"),
            "question_text":  q_data.get("question_text"),
            "question_type":  q_data.get("question_type"),
            "options":        q_data.get("options"),
            "correct_answer": q_data.get("correct_answer"),
            "explanation":    q_data.get("explanation"),
            "source_type":    q_data.get("source_type"),
        }
        result.append(item)
    return result


def set_mistake_status(
    supabase: Client,
    user_id: str,
    question_id: int,
    status: Optional[str],
) -> bool:
    """Update mistake_status for a specific attempt. status=None removes from mistake list."""
    update_data: dict = {"mistake_status": status}
    if status == "mastered":
        update_data["mastered_at"] = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("exam_attempts").update(update_data) \
            .eq("user_id", user_id).eq("question_id", question_id).execute()
        return True
    except Exception as exc:
        logger.warning("set_mistake_status failed for question %s: %s", question_id, exc)
        return False
