"""Default context builder: scope filtering + doc_type routing + RAG retrieval."""
from __future__ import annotations

import logging

from supabase import Client

from app.harness.types import GenerationRequest, ResolvedContext
from app.services.artifact_service import filter_accessible_artifact_ids, get_all_accessible_artifact_ids
from app.services.course_service import get_scope_set
from app.services.generate_service import _fallback_extract, _get_context_from_chunks, _resolve_artifact_ids
from app.services.rag_service import get_artifact_ids_by_doc_type

logger = logging.getLogger(__name__)

# doc_type routing 表：job_type → (priority_doc_types, fallback_doc_types)
# 新增 job_type 只需在此处加一行，无需修改其他代码
_DOC_TYPE_ROUTING: dict[str, tuple[list[str] | None, list[str] | None]] = {
    "summary":    (["lecture"], ["tutorial"]),
    "quiz":       (["past_exam"], None),
    "outline":    (["revision"], None),
    "flashcards": (["lecture"], ["tutorial"]),
    "exam_mock":  (["past_exam"], None),
    "ask":        (None, None),   # ask 由 context_mode 控制，走专属分支
}


class DefaultContextBuilder:
    """统一的上下文构建器。

    统一了两处独立的 artifact_id 解析逻辑：
    - generate.py ask_question() 第 213–226 行的 inline 分支
    - generate_service._resolve_artifact_ids() 的三路分支

    对于 generate 系列（summary/quiz/outline/flashcards），直接复用
    generate_service._resolve_artifact_ids + _get_context_from_chunks。

    对于 ask，走专属 _resolve_ask_ids + search_chunks 路径。
    """

    def build(self, db: Client, request: GenerationRequest) -> ResolvedContext:
        if request.job_type == "ask":
            return self._build_ask_context(db, request)
        return self._build_generate_context(db, request)

    def _build_generate_context(self, db: Client, request: GenerationRequest) -> ResolvedContext:
        priority, fallback = _DOC_TYPE_ROUTING.get(request.job_type, (None, None))
        art_ids = _resolve_artifact_ids(
            db,
            request.user_id,
            request.course_id,
            request.scope_set_id,
            request.artifact_ids,
            priority_doc_types=priority,
            fallback_doc_types=fallback,
        )
        ctx_text, sources = _get_context_from_chunks(db, request.course_id, art_ids)
        if not ctx_text.strip():
            logger.info("No indexed chunks found, trying fallback extract job_type=%s", request.job_type)
            ctx_text, sources = _fallback_extract(db, request.user_id, request.course_id, art_ids)
        return ResolvedContext(artifact_ids=art_ids, text=ctx_text, sources=sources, chunks=[])

    def _build_ask_context(self, db: Client, request: GenerationRequest) -> ResolvedContext:
        """把 generate.py ask_question() 第 213–226 行的 inline 分支迁移到此处。"""
        art_ids = self._resolve_ask_ids(db, request)

        from app.services.rag_service import search_chunks
        chunks = search_chunks(db, request.course_id, request.question, top_k=8, artifact_ids=art_ids)

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

        return ResolvedContext(artifact_ids=art_ids, text="", sources=sources, chunks=chunks)

    def _resolve_ask_ids(self, db: Client, request: GenerationRequest) -> list[int] | None:
        if request.scope_set_id:
            scope = get_scope_set(db, request.user_id, request.scope_set_id)
            ids = scope.get("artifact_ids") or []
            return filter_accessible_artifact_ids(db, request.user_id, ids) if ids else None
        if request.context_mode == "revision":
            revision_ids = get_artifact_ids_by_doc_type(db, request.course_id, ["revision"])
            if not revision_ids:
                logger.info("context_mode=revision but no revision files for course %s", request.course_id)
            return filter_accessible_artifact_ids(db, request.user_id, revision_ids) if revision_ids else None
        accessible = get_all_accessible_artifact_ids(db, request.user_id, request.course_id)
        return accessible if accessible else None
