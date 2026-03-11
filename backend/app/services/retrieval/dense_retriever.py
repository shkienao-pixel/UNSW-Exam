from __future__ import annotations
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ChunkHit:
    chunk_id: str
    content: str
    artifact_id: int
    chunk_index: int
    score: float  # higher = more relevant


def dense_retrieve(
    course_id: str,
    queries: list[str],
    top_k: int = 20,
    artifact_ids: list[int] | None = None,
) -> list[ChunkHit]:
    """Search ChromaDB with one or more query embeddings. Returns [] on any failure."""
    from app.services.rag_service import _chroma_collection, _embed
    try:
        col = _chroma_collection(course_id)
        if col.count() == 0:
            return []
        embeddings = _embed(queries)
        seen: set[str] = set()
        hits: list[ChunkHit] = []
        for emb in embeddings:
            n = min(top_k, col.count())
            qr = col.query(query_embeddings=[emb], n_results=n)
            for i, doc_id in enumerate(qr["ids"][0]):
                if doc_id in seen:
                    continue
                seen.add(doc_id)
                meta = qr["metadatas"][0][i]
                art_id = int(meta.get("artifact_id", 0))
                if artifact_ids and art_id not in artifact_ids:
                    continue
                dist = qr["distances"][0][i] if qr.get("distances") else 0.5
                hits.append(ChunkHit(
                    chunk_id=doc_id,
                    content=qr["documents"][0][i],
                    artifact_id=art_id,
                    chunk_index=int(meta.get("chunk_index", 0)),
                    score=1.0 - min(dist, 1.0),
                ))
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:top_k]
    except Exception as exc:
        logger.warning("Dense retrieval failed %s: %s", course_id, exc)
        return []
