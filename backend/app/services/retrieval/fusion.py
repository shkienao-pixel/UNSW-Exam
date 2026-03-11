from __future__ import annotations
from .dense_retriever import ChunkHit

_RRF_K = 60  # Cormack et al. 2009


def rrf_fuse(ranked_lists: list[list[ChunkHit]], top_k: int = 10) -> list[ChunkHit]:
    """Reciprocal Rank Fusion: score(d) = sum(1 / (k + rank(d)))."""
    scores: dict[str, float] = {}
    hit_map: dict[str, ChunkHit] = {}
    for ranked in ranked_lists:
        for rank, hit in enumerate(ranked):
            k = hit.chunk_id
            scores[k] = scores.get(k, 0.0) + 1.0 / (_RRF_K + rank + 1)
            if k not in hit_map:
                hit_map[k] = hit
    return [
        ChunkHit(
            chunk_id=hit_map[k].chunk_id,
            content=hit_map[k].content,
            artifact_id=hit_map[k].artifact_id,
            chunk_index=hit_map[k].chunk_index,
            score=scores[k],
        )
        for k in sorted(scores, key=lambda k: scores[k], reverse=True)[:top_k]
    ]
