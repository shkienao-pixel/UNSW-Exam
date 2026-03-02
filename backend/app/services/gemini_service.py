"""Multi-model collaborative RAG pipeline.

Three-stage chain for the /ask endpoint:
  Stage 1 — GPT-as-Judge   : filters irrelevant RAG chunks (gpt-4o)
  Stage 2 — Gemini Text    : generates the final grounded answer (gemini-2.5-pro)
  Stage 3 — Imagen 4 Ultra : optional visual aid for complex topics (imagen-4.0-ultra-generate-001)

Each stage degrades gracefully:
  - Stage 1 fails → raw chunks used as-is
  - Stage 2 fails → GPT fallback (caller handles this)
  - Stage 3 fails → answer returned without image (no error surfaced to user)
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  SYSTEM PROMPTS
# ═══════════════════════════════════════════════════════════════════════════════

GPT_FILTER_SYSTEM = """\
You are a relevance-filtering judge. Your sole task is to decide which document \
chunks genuinely help answer the user's query, then return only those chunks.

Rules:
• KEEP chunks that directly address the query or provide essential background.
• REMOVE chunks that are off-topic, generic filler, headers, footers, or \
  unrelated administrative content.
• Do NOT add, invent, or rewrite any information — only output text that \
  appears verbatim in the kept chunks.
• Separate retained chunks with a single blank line.
• If ALL chunks are irrelevant, return exactly the four-word string: \
  NO_RELEVANT_CONTENT
"""

GEMINI_ANSWER_SYSTEM = """\
You are an expert academic tutor helping university students prepare for exams.

Your task is to answer the student's question based STRICTLY on the reference \
text extracted from their course materials.

Rules:
1. Ground every claim in the provided reference text. Do not hallucinate facts.
2. Structure your answer clearly — use numbered steps, bullet points, or \
   ## headings where appropriate for readability.
3. Respond in the SAME LANGUAGE as the student's question:
     • Chinese question  → Chinese answer
     • English question  → English answer
4. Do NOT include a "Sources" or "References" section; that will be added separately.
5. If the reference text does not contain enough information to fully answer:
     a) Write exactly: "文档中未包含足够信息。"
     b) Then on a NEW line write: "不过，根据我自身的知识库："
     c) Then provide your best answer from your training knowledge.
"""

# ═══════════════════════════════════════════════════════════════════════════════
#  VISUAL AID HEURISTIC
# ═══════════════════════════════════════════════════════════════════════════════

# Keywords (Chinese + English) that suggest a diagram would help comprehension.
_VISUAL_KEYWORDS = [
    # Chinese
    "流程", "架构", "结构", "步骤", "拓扑", "算法", "比较", "对比",
    "示意图", "数据结构", "网络", "模型", "图示", "原理图", "管道",
    "层次", "关系", "框架", "系统", "组件",
    # English
    "process", "flow", "workflow", "pipeline", "architecture", "structure",
    "diagram", "compare", "comparison", "difference", "steps", "procedure",
    "topology", "algorithm", "data structure", "tree", "graph", "network",
    "model", "hierarchy", "layer", "framework", "system", "component",
    "relationship",
]

_VISUAL_THRESHOLD = 2  # require at least this many keyword matches


# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 1 — GPT-as-Judge: filter irrelevant chunks
# ═══════════════════════════════════════════════════════════════════════════════

def gpt_filter_chunks(
    query: str,
    chunks: list[dict],
    openai_key: str,
) -> str:
    """Filter RAG chunks to only those relevant to *query*.

    Uses GPT-4o-mini as a cheap, fast relevance judge.

    Args:
        query:      The user's question.
        chunks:     List of chunk dicts from ``search_chunks()``.
        openai_key: OpenAI API key.

    Returns:
        Filtered context text ready to pass to Gemini, or the original
        concatenated chunks if filtering fails.
    """
    if not chunks:
        return ""

    chunk_text = "\n\n---\n\n".join(
        f"[来源：{c.get('file_name', 'unknown')} — 片段 {c.get('chunk_index', 0) + 1}]\n"
        f"{c['content']}"
        for c in chunks
    )

    user_msg = (
        f"User Query:\n{query}\n\n"
        f"===\nDocument Chunks to evaluate:\n\n{chunk_text}"
    )

    try:
        from openai import OpenAI
        client = OpenAI(api_key=openai_key)
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": GPT_FILTER_SYSTEM},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.0,
            max_tokens=4096,
        )
        result = (resp.choices[0].message.content or "").strip()
        if result == "NO_RELEVANT_CONTENT":
            logger.debug("GPT judge: all chunks irrelevant for query=%r", query[:80])
            return ""
        return result
    except Exception as exc:
        logger.warning("GPT filter failed — using raw chunks as fallback: %s", exc)
        return chunk_text  # graceful fallback: pass all chunks through


# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 2 — Gemini Text: generate the final answer
# ═══════════════════════════════════════════════════════════════════════════════

def gemini_generate_answer(
    query: str,
    filtered_context: str,
    gemini_key: str,
) -> str:
    """Generate a grounded final answer using Gemini 2.0 Flash.

    Args:
        query:            The user's question.
        filtered_context: Pre-filtered reference text from Stage 1.
        gemini_key:       Google Gemini API key.

    Returns:
        Markdown-formatted answer string, or empty string on failure
        (caller should fall back to GPT).
    """
    if filtered_context.strip():
        user_content = (
            f"Reference text from course materials:\n\n{filtered_context}"
            f"\n\n---\n\nStudent question: {query}"
        )
    else:
        user_content = (
            f"Student question: {query}\n\n"
            "(No relevant document context was found. "
            "Apply the fallback protocol from your instructions.)"
        )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        resp = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=GEMINI_ANSWER_SYSTEM,
                temperature=0.4,
                max_output_tokens=2048,
            ),
        )
        return (resp.text or "").strip()
    except Exception as exc:
        logger.warning("Gemini text generation failed: %s", exc)
        return ""


# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 3a — Should we generate a visual aid?
# ═══════════════════════════════════════════════════════════════════════════════

def should_generate_image(query: str, answer: str) -> bool:
    """Heuristic check: does this question/answer warrant a diagram?

    Returns True when the combined text contains ≥ 2 visual-hint keywords,
    suggesting the topic is complex, abstract, or process-oriented.
    """
    combined = (query + " " + answer).lower()
    hits = sum(1 for kw in _VISUAL_KEYWORDS if kw in combined)
    return hits >= _VISUAL_THRESHOLD


# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 3b — Imagen 3: generate and store a visual aid
# ═══════════════════════════════════════════════════════════════════════════════

def gemini_generate_image(
    query: str,
    answer: str,
    gemini_key: str,
    supabase=None,
    bucket: str = "artifacts",
) -> Optional[str]:
    """Generate an illustrative diagram via Imagen 3 and upload to Supabase Storage.

    Args:
        query:      Original user question (used to craft the image prompt).
        answer:     Generated answer (used to refine the image prompt).
        gemini_key: Google Gemini API key with Imagen 3 access.
        supabase:   Supabase client for storage upload.
        bucket:     Storage bucket name.

    Returns:
        Signed URL of the uploaded image, or None if generation/upload fails.
    """
    image_prompt = _build_image_prompt(query, answer)

    image_bytes = _call_imagen(image_prompt, gemini_key)
    if not image_bytes:
        return None

    return _upload_to_supabase(image_bytes, supabase, bucket)


def _build_image_prompt(query: str, answer: str) -> str:
    """Craft a focused prompt for Imagen 3."""
    # Extract the first sentence of the answer as context hint (max 120 chars)
    hint = answer.split("\n")[0][:120] if answer else ""
    return (
        f"Create a clear, educational diagram that visually explains: {query[:180]}. "
        f"Context: {hint}. "
        "Style: clean minimal infographic, white background, labeled components, "
        "use simple shapes and arrows. Suitable for university-level academic study."
    )


def _call_imagen(prompt: str, gemini_key: str) -> Optional[bytes]:
    """Call Imagen 3 API and return raw PNG bytes."""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        response = client.models.generate_images(
            model="imagen-4.0-ultra-generate-001",
            prompt=prompt,
            config=types.GenerateImagesConfig(number_of_images=1),
        )
        if response.generated_images:
            return response.generated_images[0].image.image_bytes
        return None
    except Exception as exc:
        logger.warning("Imagen 3 generation failed: %s", exc)
        return None


def _upload_to_supabase(
    image_bytes: bytes,
    supabase,
    bucket: str,
) -> Optional[str]:
    """Upload PNG bytes to Supabase Storage and return a long-lived signed URL."""
    if supabase is None:
        return None
    try:
        file_path = f"generated/{uuid.uuid4().hex}.png"
        supabase.storage.from_(bucket).upload(
            path=file_path,
            file=image_bytes,
            file_options={"content-type": "image/png"},
        )
        url_resp = supabase.storage.from_(bucket).create_signed_url(
            path=file_path,
            expires_in=315_360_000,  # 10 years in seconds
        )
        # Supabase SDK returns dict with 'signedURL' or 'signedUrl'
        return url_resp.get("signedURL") or url_resp.get("signedUrl")
    except Exception as exc:
        logger.warning("Failed to upload generated image to Supabase Storage: %s", exc)
        return None
