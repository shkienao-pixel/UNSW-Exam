from __future__ import annotations
import logging
import re
from supabase import Client
from .dense_retriever import ChunkHit

logger = logging.getLogger(__name__)
_MAX_WORDS = 12


def _build_tsquery(query: str) -> str:
    """Convert natural language to PostgreSQL tsquery (OR between tokens)."""
    tokens = re.findall(r"[\w\u4e00-\u9fff]{2,}", query.lower())
    tokens = [t for t in tokens if not t.isdigit()][:_MAX_WORDS]
    return " | ".join(tokens) if tokens else ""


def sparse_retrieve(
    supabase: Client,
    course_id: str,
    query: str,
    top_k: int = 20,
    artifact_ids: list[int] | None = None,
) -> list[ChunkHit]:
    """Search via PostgreSQL FTS. Falls back gracefully on any error."""
    tsquery = _build_tsquery(query)
    if not tsquery:
        return []
    try:
        rows = supabase.rpc("search_chunks_fts", {
            "p_course_id": course_id,
            "p_tsquery": tsquery,
            "p_top_k": top_k,
            "p_artifact_ids": artifact_ids or [],
        }).execute().data or []
    except Exception:
        try:
            q = (
                supabase.table("artifact_chunks")
                .select("id, artifact_id, chunk_index, content")
                .eq("course_id", course_id)
                .text_search("content_tsv", tsquery, config="simple")
                .limit(top_k)
            )
            if artifact_ids:
                q = q.in_("artifact_id", artifact_ids)
            rows = q.execute().data or []
            for r in rows:
                r["ts_rank"] = 0.5
        except Exception as exc2:
            logger.warning("Sparse retrieval failed %s: %s", course_id, exc2)
            return []
    return [
        ChunkHit(
            chunk_id=str(r.get("id", "")),
            content=r.get("content", ""),
            artifact_id=int(r.get("artifact_id", 0)),
            chunk_index=int(r.get("chunk_index", 0)),
            score=float(r.get("ts_rank", 0.5)),
        )
        for r in rows
        if not artifact_ids or r.get("artifact_id") in artifact_ids
    ]
