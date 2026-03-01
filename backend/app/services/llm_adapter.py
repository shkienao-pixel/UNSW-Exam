"""LLM adapter — wraps src/services/llm_service.py and quiz_generator.py.

API key is read from the environment (platform-managed); callers do NOT
pass an api_key argument.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any

# Allow importing from the existing src/ service layer
_SRC = Path(__file__).resolve().parents[4] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from app.core.config import get_settings  # noqa: E402


def _api_key() -> str:
    return get_settings().openai_api_key


# ── Summary ───────────────────────────────────────────────────────────────────


def generate_summary(text: str) -> str:
    from services.llm_service import LLMProcessor  # type: ignore[import]

    return LLMProcessor().generate_summary(text, _api_key())


# ── Quiz ──────────────────────────────────────────────────────────────────────


def generate_quiz(text: str, num_questions: int = 5) -> dict[str, Any]:
    from services.quiz_generator import QuizGenerator  # type: ignore[import]

    return QuizGenerator().generate_quiz(text, num_questions=num_questions, api_key=_api_key())


# ── Graph ─────────────────────────────────────────────────────────────────────


def generate_graph(text: str) -> dict[str, Any]:
    from services.graph_service import GraphGenerator  # type: ignore[import]

    return GraphGenerator().generate_graph_data(text, api_key=_api_key())


# ── Outline / Syllabus ────────────────────────────────────────────────────────


def generate_outline(text: str) -> dict[str, Any]:
    from services.llm_service import LLMProcessor  # type: ignore[import]

    return LLMProcessor().generate_syllabus_checklist(text, _api_key())


# ── Flashcards ────────────────────────────────────────────────────────────────


def generate_flashcards_raw(text: str) -> list[dict[str, Any]]:
    """Return raw flashcard dicts from the LLM (front/back vocab style)."""
    from services.llm_service import LLMProcessor  # type: ignore[import]

    return LLMProcessor().generate_flashcards(text, _api_key())


# ── RAG search ────────────────────────────────────────────────────────────────


def rag_search(
    chroma_path: str, collection_name: str, query: str, top_k: int = 8
) -> list[dict[str, Any]]:
    from services.vector_store_service import DocumentVectorStore  # type: ignore[import]

    store = DocumentVectorStore(persist_dir=chroma_path, course_id=collection_name)
    return store.search(query, _api_key(), top_k=top_k)
