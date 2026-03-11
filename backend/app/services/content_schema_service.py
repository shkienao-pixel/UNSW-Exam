"""LLM-powered structured schema generation for course content.

The "summary_v1" schema is a richly structured JSON format designed for
exam-prep UI rendering:  exam weights, key terms, tips, formulas, etc.
The LLM converts any raw input (markdown, notes, rough outline) into this schema.
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── Schema prompt ──────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert academic content organizer specialising in university exam preparation.

Transform the provided course material into a structured JSON object following this exact schema:

{
  "format": "summary_v1",
  "title": "<concise topic/course title>",
  "overview": "<2-3 sentence high-level summary of the content>",
  "sections": [
    {
      "heading": "<section title>",
      "content": "<clear explanation, 2-4 short paragraphs>",
      "exam_weight": "<exactly one of: high | medium | low>",
      "key_terms": [
        { "term": "<technical term>", "definition": "<concise 1-sentence definition>" }
      ],
      "exam_tips": ["<specific, actionable exam advice — not generic>"],
      "formulas": ["<formula or key equation, LaTeX-style is fine>"]
    }
  ],
  "quick_recap": "<3-sentence TL;DR of the entire content — the minimum a student must know>",
  "likely_exam_questions": ["<realistic university exam question>"]
}

Rules:
- exam_weight: use "high" for core testable concepts, "medium" for supporting material, "low" for background context
- key_terms: capture only technical vocabulary essential for exams (5-15 terms per section)
- exam_tips: specific, actionable advice (e.g. "Always state both time and space complexity" not "Study hard")
- formulas: include ONLY if truly present in the content — omit the field if empty
- likely_exam_questions: 4-8 realistic questions the professor would actually ask
- Output ONLY the JSON object — no markdown fences, no explanation, no preamble
"""


# ── Main generation function ───────────────────────────────────────────────────

def generate_schema_from_context(
    context: str,
    content_type: str,
    openai_key: str,
    model: str = "gpt-4.1",
) -> dict[str, Any]:
    """Call OpenAI to convert raw context text into summary_v1 schema JSON.

    Args:
        context:      Raw input — markdown notes, rough outline, GPT output, anything.
        content_type: "summary" or "outline" (used in the user prompt for framing).
        openai_key:   OpenAI API key.
        model:        OpenAI model ID. Defaults to gpt-4.1.

    Returns:
        Parsed JSON dict matching the summary_v1 schema.

    Raises:
        ValueError: If the LLM response cannot be parsed as valid JSON.
        Exception:  Any network / API error from OpenAI.
    """
    from openai import OpenAI

    client = OpenAI(api_key=openai_key)

    user_msg = (
        f"Content type: {content_type}\n\n"
        "--- CONTENT START ---\n"
        f"{context[:14000]}\n"
        "--- CONTENT END ---\n\n"
        "Transform the above into the summary_v1 JSON schema. Output only the JSON object."
    )

    logger.info("Calling %s to generate schema for content_type=%s (%d chars)",
                model, content_type, len(context))

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )

    raw = response.choices[0].message.content or ""
    logger.info("LLM response: %d chars", len(raw))

    try:
        result: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {exc}") from exc

    # Enforce format tag
    result["format"] = "summary_v1"

    # Coerce exam_weight to valid values across all sections
    for sec in result.get("sections", []):
        if sec.get("exam_weight") not in ("high", "medium", "low"):
            sec["exam_weight"] = "medium"
        # Ensure required list fields exist
        sec.setdefault("key_terms", [])
        sec.setdefault("exam_tips", [])

    result.setdefault("likely_exam_questions", [])
    result.setdefault("quick_recap", "")

    return result
