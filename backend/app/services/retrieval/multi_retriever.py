from __future__ import annotations
import logging
import re
from dataclasses import dataclass
from typing import Any
from supabase import Client
from .dense_retriever import ChunkHit, dense_retrieve
from .fusion import rrf_fuse
from .sparse_retriever import sparse_retrieve

logger = logging.getLogger(__name__)


@dataclass
class RetrievalConfig:
    dense_top_k: int = 20
    sparse_top_k: int = 20
    final_top_k: int = 10
    query: str = ""
    bilingual: bool = True
    dense_only: bool = False


FLASHCARD_CONFIG = RetrievalConfig(
    dense_top_k=25, sparse_top_k=25, final_top_k=12,
    query="key concepts definitions algorithms important terms",
)
QUIZ_CONFIG = RetrievalConfig(
    dense_top_k=30, sparse_top_k=30, final_top_k=15,
    query="exam questions practice problems solutions worked examples",
)


def multi_retrieve(
    supabase: Client,
    course_id: str,
    config: RetrievalConfig,
    artifact_ids: list[int] | None = None,
) -> list[dict[str, Any]]:
    """Run dense+sparse retrieval, fuse with RRF, enrich with artifact metadata."""
    query = config.query or "course concepts key points"
    queries = _bilingual_queries(query) if config.bilingual else [query]

    dense_hits = dense_retrieve(course_id, queries, config.dense_top_k, artifact_ids)

    sparse_hits: list[ChunkHit] = []
    if not config.dense_only:
        sparse_hits = sparse_retrieve(supabase, course_id, query, config.sparse_top_k, artifact_ids)

    if dense_hits and sparse_hits:
        fused = rrf_fuse([dense_hits, sparse_hits], top_k=config.final_top_k)
    elif dense_hits:
        fused = dense_hits[:config.final_top_k]
    elif sparse_hits:
        fused = sparse_hits[:config.final_top_k]
    else:
        fused = _db_fallback(supabase, course_id, config.final_top_k, artifact_ids)

    return _enrich(supabase, fused)


def _bilingual_queries(query: str) -> list[str]:
    if len(re.findall(r"[\u4e00-\u9fff]", query)) > max(1, len(query) * 0.1):
        try:
            from app.services.rag_service import _translate_zh_to_en
            en = _translate_zh_to_en(query)
            if en and en.strip().lower() != query.strip().lower():
                return [query, en]
        except Exception:
            pass
    return [query]


def _db_fallback(
    supabase: Client,
    course_id: str,
    top_k: int,
    artifact_ids: list[int] | None,
) -> list[ChunkHit]:
    q = (
        supabase.table("artifact_chunks")
        .select("id, artifact_id, chunk_index, content")
        .eq("course_id", course_id)
        .limit(top_k * 3)
    )
    if artifact_ids:
        q = q.in_("artifact_id", artifact_ids)
    return [
        ChunkHit(
            chunk_id=str(r["id"]),
            content=r["content"],
            artifact_id=r["artifact_id"],
            chunk_index=r["chunk_index"],
            score=0.1,
        )
        for r in (q.execute().data or [])[:top_k]
    ]


def _enrich(supabase: Client, hits: list[ChunkHit]) -> list[dict[str, Any]]:
    if not hits:
        return []
    art_ids = list({h.artifact_id for h in hits})
    arts = (
        supabase.table("artifacts")
        .select("id, file_name, storage_url")
        .in_("id", art_ids)
        .execute()
    ).data or []
    art_map: dict[int, dict] = {a["id"]: a for a in arts}
    return [
        {
            "chunk_id": h.chunk_id,
            "content": h.content,
            "artifact_id": h.artifact_id,
            "chunk_index": h.chunk_index,
            "score": h.score,
            "file_name": art_map.get(h.artifact_id, {}).get("file_name", ""),
            "storage_url": art_map.get(h.artifact_id, {}).get("storage_url", ""),
        }
        for h in hits
    ]
