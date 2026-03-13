"""RAG pipeline — clean, chunk, embed, store, retrieve.

Processing flow (triggered on artifact approval / admin upload):
  1. Download file from Supabase Storage
  2. Extract raw text  (PDF / Word / plain text)
  3. Clean            (remove page numbers, headers, garbage)
  4. Chunk            (paragraph-aware, ~800 chars, 100-char overlap)
  5. Embed            (OpenAI text-embedding-3-small — multilingual)
  6. Store chunks     → Supabase  artifact_chunks  table  (clean text, searchable)
  7. Store vectors    → ChromaDB  (persistent on disk)

Retrieval flow (for generation / Q&A):
  - Embed query
  - Bilingual: if query is Chinese → also translate to English, embed both
  - ChromaDB cosine similarity → top-k chunks
  - Return chunks + source file metadata (file_name, storage_url)
  - Fallback: if no ChromaDB data, return all chunks from Supabase DB
"""

from __future__ import annotations

import logging
import random
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

from supabase import Client

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.services.text_extractor import extract_text as _extract_raw_text

# ── Constants ─────────────────────────────────────────────────────────────────

_CHUNK_TARGET_TOKENS  = 400   # target tokens per chunk
_CHUNK_MAX_TOKENS     = 700   # hard max tokens (force-split above this)
_CHUNK_MIN_CHARS      = 80    # discard chunks shorter than this (chars)
_CHUNK_OVERLAP_SENTS  = 2     # sentences to carry over as overlap
_TINY_SLIDE_TOKENS    = 80    # slide smaller than this merges with the next one
_TOP_K                = 6     # default retrieval count

_CHINESE_RE = re.compile(r'[\u4e00-\u9fff]')
_SENT_SPLIT_RE = re.compile(r'(?<=[.!?。！？…;；])\s*')


def _extract_raw(file_type: str, data: bytes) -> str:
    return _extract_raw_text(file_type, data, page_markers=True)


# ── Text cleaning ─────────────────────────────────────────────────────────────

_GARBAGE: list[tuple[str, str]] = [
    # Standalone page numbers (e.g., "7", "  12  ")
    (r'(?m)^\s*\d{1,3}\s*$', ''),
    # "Page N of M" or "Slide N/M"
    (r'(?m)^(Page|Slide)\s+\d+\s*(of|/)\s*\d+\s*$', ''),
    # Copyright lines
    (r'(?m)^\s*©.*$', ''),
    # Lines that are just course code + year (repeated slide headers)
    (r'(?m)^(COMP|MATH|ELEC|ENGG)\d{4}[\w\s\-–]*\d{4}\s*$', ''),
    # "UNSW" standalone
    (r'(?m)^\s*UNSW\s*$', ''),
    # Empty page markers from extraction
    (r'\[Page \d+\]\n(?=\[Page \d+\])', ''),
    (r'\[Page \d+\]\n\s*$', ''),
    # Issue 3 fix: strip administrative/intro content common in lecture slides
    # Tutor / Lecturer / Instructor lines
    (r'(?mi)^\s*(tutor|lecturer|instructor|demonstrator|coordinator)\s*[:\-–]\s*.{0,80}$', ''),
    # Duration / Hours lines (e.g. "Duration: 2 hours", "时长：2小时")
    (r'(?mi)^\s*(duration|时长|class\s+hours?|lecture\s+hours?)\s*[:\-–]\s*.{0,60}$', ''),
    # "Credits:", "Units:", "UoC:" lines
    (r'(?mi)^\s*(credits?|units?\s*of\s*credit|uoc)\s*[:\-–]\s*.{0,40}$', ''),
    # Exam/assessment schedule lines
    (r'(?mi)^\s*(final\s+exam|mid.?term|quiz|assignment|assessment)\s*(date|due|schedule|worth)\s*[:\-–]?.{0,80}$', ''),
    # "Welcome to / Introduction to COMPXXXX" slide titles
    (r'(?mi)^(welcome\s+to|introduction\s+to)\s+(comp|math|elec|engg)\d{4}.*$', ''),
]

def _clean(text: str) -> str:
    for pattern, repl in _GARBAGE:
        text = re.sub(pattern, repl, text, flags=re.MULTILINE)
    # Collapse 3+ blank lines → 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Collapse 3+ spaces/tabs → 1 space (preserve newlines)
    text = re.sub(r'[ \t]{3,}', ' ', text)
    return text.strip()


# ── Chunking ──────────────────────────────────────────────────────────────────

def _approx_tokens(text: str) -> int:
    """Approximate token count without tiktoken.
    CJK chars ≈ 2 tokens each; all other chars ≈ 0.3 tokens each.
    Accurate to within ~20% for mixed Chinese/English lecture content.
    """
    cjk = len(re.findall(r'[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]', text))
    return int(cjk * 2 + (len(text) - cjk) * 0.3)


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences at punctuation boundaries."""
    parts = _SENT_SPLIT_RE.split(text)
    return [s.strip() for s in parts if s.strip()]


def _parse_pages(text: str) -> list[tuple[int, str]]:
    """Split text into (page_num, content) pairs using [Page N] markers.
    Returns [(0, full_text)] when no markers are present (e.g. Word / plain text).
    """
    parts = re.split(r'\[Page (\d+)\]\n?', text)
    pages: list[tuple[int, str]] = []
    for i in range(1, len(parts) - 1, 2):
        content = parts[i + 1].strip() if i + 1 < len(parts) else ''
        if content:
            pages.append((int(parts[i]), content))
    if not pages and parts[0].strip():
        pages.append((0, parts[0].strip()))
    return pages


def _sentences_to_chunks(
    sentences: list[str],
    target_tok: int,
    max_tok: int,
    overlap: int,
) -> list[str]:
    """Pack sentences into token-budgeted chunks with sentence-level overlap."""
    if not sentences:
        return []
    chunks: list[str] = []
    buf: list[str] = []
    buf_tok = 0
    for sent in sentences:
        t = _approx_tokens(sent)
        if buf and buf_tok + t > target_tok:
            chunks.append(' '.join(buf))
            # Carry last N sentences as overlap into the next chunk
            buf = buf[-overlap:] if len(buf) >= overlap else buf[:]
            buf_tok = sum(_approx_tokens(s) for s in buf)
        buf.append(sent)
        buf_tok += t
        # Hard-max guard: flush immediately
        if buf_tok > max_tok:
            chunks.append(' '.join(buf))
            buf = buf[-overlap:] if len(buf) >= overlap else []
            buf_tok = sum(_approx_tokens(s) for s in buf)
    if buf:
        chunks.append(' '.join(buf))
    return chunks


def _chunk(text: str) -> list[tuple[str, int]]:
    """Slide-boundary-aware chunking with sentence-level splitting and overlap.

    Returns list of (chunk_text, page_num) tuples.

    Strategy:
      1. Split by [Page N] markers — each page = one slide in a lecture PDF.
      2. Merge consecutive *tiny* slides (< _TINY_SLIDE_TOKENS) into the next
         slide to avoid orphan title-only chunks.
      3. Keep each proper slide as its own chunk (no cross-slide merging).
      4. Split large slides at sentence boundaries with sentence-level overlap.
      5. Prepend [Slide N] prefix so the LLM has positional context.
    """
    pages = _parse_pages(text)
    if not pages:
        return []

    # ── Step 1: merge tiny leading slides into the next one ──────────────────
    groups: list[tuple[int, str]] = []
    cur_page, cur_text = pages[0]
    cur_tok = _approx_tokens(cur_text)

    for page_num, page_text in pages[1:]:
        page_tok = _approx_tokens(page_text)
        if cur_tok <= _TINY_SLIDE_TOKENS:
            # Current group is just a title slide — absorb it into the next
            cur_text = cur_text + '\n\n' + page_text
            cur_tok += page_tok
        else:
            groups.append((cur_page, cur_text))
            cur_page, cur_text, cur_tok = page_num, page_text, page_tok
    groups.append((cur_page, cur_text))

    # ── Step 2: chunk each group ──────────────────────────────────────────────
    result: list[tuple[str, int]] = []
    for page_num, group_text in groups:
        prefix = f'[Slide {page_num}]\n' if page_num > 0 else ''
        group_tok = _approx_tokens(group_text)

        if group_tok <= _CHUNK_MAX_TOKENS:
            chunk = (prefix + group_text).strip()
            if len(chunk) >= _CHUNK_MIN_CHARS:
                result.append((chunk, page_num))
        else:
            # Large slide: split at sentence boundaries with overlap
            sents = _split_sentences(group_text)
            sub_chunks = _sentences_to_chunks(
                sents, _CHUNK_TARGET_TOKENS, _CHUNK_MAX_TOKENS, _CHUNK_OVERLAP_SENTS,
            )
            for sub in sub_chunks:
                chunk = (prefix + sub).strip()
                if len(chunk) >= _CHUNK_MIN_CHARS:
                    result.append((chunk, page_num))

    return result


# ── Embedding ─────────────────────────────────────────────────────────────────

def _embed(texts: list[str]) -> list[list[float]]:
    """OpenAI text-embedding-3-small — multilingual, 1536 dims."""
    from openai import OpenAI
    client = OpenAI(api_key=get_settings().openai_api_key)
    all_embs: list[list[float]] = []
    for i in range(0, len(texts), 100):
        batch = texts[i:i + 100]
        resp = client.embeddings.create(model="text-embedding-3-small", input=batch)
        all_embs.extend(item.embedding for item in resp.data)
    return all_embs


# ── ChromaDB ──────────────────────────────────────────────────────────────────

def _chroma_collection(course_id: str):
    import chromadb
    path = str(get_settings().chroma_path)
    client = chromadb.PersistentClient(path=path)
    name = "c_" + course_id.replace("-", "")[:30]
    return client.get_or_create_collection(name=name, metadata={"hnsw:space": "cosine"})


# ── Main: process one artifact ────────────────────────────────────────────────

def process_artifact(
    supabase: Client,
    artifact_id: int,
    course_id: str,
    file_name: str,
    file_type: str,
    storage_path: str,
) -> int:
    """Download → clean → chunk → embed → store.  Returns chunk count."""
    from app.services.artifact_service import download_artifact_bytes

    try:
        data = download_artifact_bytes(supabase, storage_path)
    except AppError as e:
        raise AppError(f"Download failed for {file_name}: {e}") from e

    raw   = _extract_raw(file_type, data)
    clean = _clean(raw)
    if len(clean) < 100:
        return 0

    chunk_tuples = _chunk(clean)   # list of (text, page_num)
    if not chunk_tuples:
        return 0

    chunk_texts = [t for t, _ in chunk_tuples]
    chunk_pages = [p for _, p in chunk_tuples]

    # Delete existing chunks for this artifact (idempotent)
    supabase.table("artifact_chunks").delete().eq("artifact_id", artifact_id).execute()

    # Insert chunks into Supabase
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "artifact_id": artifact_id,
            "course_id":   course_id,
            "chunk_index": i,
            "content":     text,
            "char_count":  len(text),
            "created_at":  now,
        }
        for i, text in enumerate(chunk_texts)
    ]
    resp = supabase.table("artifact_chunks").insert(rows).execute()
    chunk_ids = [r["id"] for r in (resp.data or [])]
    if not chunk_ids:
        return 0

    # Embed + store in ChromaDB (page_num stored as metadata)
    try:
        embeddings = _embed(chunk_texts)
        col = _chroma_collection(course_id)
        try:
            col.delete(where={"artifact_id": str(artifact_id)})
        except Exception as exc:
            logger.warning("ChromaDB stale chunk deletion failed for artifact %s: %s", artifact_id, exc)
        col.add(
            ids        = [str(cid) for cid in chunk_ids],
            embeddings = embeddings,
            documents  = chunk_texts,
            metadatas  = [
                {
                    "artifact_id": str(artifact_id),
                    "course_id":   course_id,
                    "file_name":   file_name,
                    "chunk_index": i,
                    "page_num":    chunk_pages[i],
                }
                for i in range(len(chunk_texts))
            ],
        )
    except Exception:
        pass  # ChromaDB failure is non-fatal; DB chunks still usable

    return len(chunk_ids)


# ── Bulk reindex ──────────────────────────────────────────────────────────────

def reindex_course(supabase: Client, course_id: str) -> dict[str, int]:
    """Reprocess all approved artifacts in a course. Returns {processed, chunks, errors}."""
    from app.services.artifact_service import download_artifact_bytes  # noqa: F401

    arts = (
        supabase.table("artifacts")
        .select("id, file_name, file_type, storage_path, status")
        .eq("course_id", course_id)
        .eq("status", "approved")
        .execute()
    ).data or []

    processed = errors = total_chunks = 0
    for a in arts:
        sp = a.get("storage_path")
        ft = a.get("file_type", "pdf")
        if not sp or ft == "url":
            continue
        try:
            n = process_artifact(
                supabase, a["id"], course_id,
                a["file_name"], ft, sp,
            )
            total_chunks += n
            processed += 1
        except Exception:
            errors += 1

    return {"processed": processed, "chunks": total_chunks, "errors": errors}


# ── Doc-type–aware artifact ID resolution ─────────────────────────────────────

def get_artifact_ids_by_doc_type(
    supabase: Client,
    course_id: str,
    doc_types: list[str],
) -> list[int]:
    """Return IDs of approved artifacts matching any of the given doc_types.

    Used by RAG routing to build a focused context from semantically-tagged docs.
    Returns an empty list if no matching artifacts exist.
    """
    rows = (
        supabase.table("artifacts")
        .select("id")
        .eq("course_id", course_id)
        .eq("status", "approved")
        .in_("doc_type", doc_types)
        .execute()
    ).data or []
    return [r["id"] for r in rows]


# ── Shared helpers ────────────────────────────────────────────────────────────

def _build_context_and_sources(
    supabase: Client,
    chunks: list[dict[str, Any]],
    max_chars: int,
) -> tuple[str, list[dict[str, Any]]]:
    """Build (context_text, sources) from a pre-fetched list of chunk rows."""
    if not chunks:
        return "", []

    art_ids = list({c["artifact_id"] for c in chunks})
    arts = (
        supabase.table("artifacts")
        .select("id, file_name, storage_url")
        .in_("id", art_ids)
        .execute()
    ).data or []
    art_map: dict[int, dict] = {a["id"]: a for a in arts}

    parts: list[str] = []
    total = 0
    for c in chunks:
        content = c["content"]
        if total + len(content) > max_chars:
            break
        parts.append(content)
        total += len(content)

    sources = [
        {
            "artifact_id": aid,
            "file_name":   art_map[aid]["file_name"] if aid in art_map else "unknown",
            "storage_url": art_map[aid].get("storage_url", "") if aid in art_map else "",
        }
        for aid in art_ids
    ]
    return "\n\n".join(parts), sources


# ── Get all chunks (for full-doc generation) ─────────────────────────────────

def get_course_chunks(
    supabase: Client,
    course_id: str,
    artifact_ids: list[int] | None = None,
    max_chars: int = 80_000,
) -> tuple[str, list[dict[str, Any]]]:
    """Return (context_text, sources) for generation — all chunks, ordered."""
    q = (
        supabase.table("artifact_chunks")
        .select("id, artifact_id, chunk_index, content")
        .eq("course_id", course_id)
        .order("artifact_id")
        .order("chunk_index")
    )
    if artifact_ids:
        q = q.in_("artifact_id", artifact_ids)
    chunks = q.execute().data or []
    return _build_context_and_sources(supabase, chunks, max_chars)


# ── Sampled context (anti-repetition generation) ─────────────────────────────

def get_course_chunks_sampled(
    supabase: Client,
    course_id: str,
    artifact_ids: list[int] | None = None,
    sample_n: int = 12,
    fetch_limit: int = 200,
    max_chars: int = 60_000,
) -> tuple[str, list[dict[str, Any]]]:
    """带随机采样的上下文构建，专为防重复生成设计。

    每次随机打乱 fetch_limit 个 chunks，取前 sample_n 个，
    确保 LLM 每次看到不同的知识面切片，避免重复题目。
    """
    q = (
        supabase.table("artifact_chunks")
        .select("id, artifact_id, chunk_index, content")
        .eq("course_id", course_id)
        .limit(fetch_limit)
    )
    if artifact_ids:
        q = q.in_("artifact_id", artifact_ids)
    chunks = q.execute().data or []
    if not chunks:
        return "", []
    random.shuffle(chunks)
    return _build_context_and_sources(supabase, chunks[:sample_n], max_chars)


# ── Metadata sync (doc_type 变更时同步到 ChromaDB) ───────────────────────────

def sync_artifact_doc_type(course_id: str, artifact_id: int, doc_type: str) -> int:
    """artifact.doc_type 被修改后，将新值同步写入 ChromaDB chunk metadata。

    Architecture note:
    - RAG 路由通过 artifacts 表的 doc_type 列拿到 artifact_id 列表，再过滤 chunks。
      因此更新 artifacts.doc_type 已足够让 RAG 路由生效。
    - 本函数额外同步 ChromaDB metadata 是为了未来支持向量侧直接按 doc_type 过滤。
    - 不重新调用 Embedding API，只修改 metadata 字段 — 零向量成本。

    Returns: 更新的 chunk 数量（0 = ChromaDB 无该 artifact 的记录，非错误）
    """
    try:
        col = _chroma_collection(course_id)
        if col.count() == 0:
            return 0

        # 查出该 artifact 的全部 chunk ID 及现有 metadata
        results = col.get(where={"artifact_id": str(artifact_id)})
        ids: list[str] = results.get("ids") or []
        if not ids:
            return 0

        # 在现有 metadata 基础上 patch doc_type，不触碰其他字段
        existing_metas: list[dict] = results.get("metadatas") or [{}] * len(ids)
        new_metas = [{**m, "doc_type": doc_type} for m in existing_metas]

        col.update(ids=ids, metadatas=new_metas)
        logger.info(
            "ChromaDB doc_type synced: artifact_id=%d, doc_type=%s, chunks=%d",
            artifact_id, doc_type, len(ids),
        )
        return len(ids)

    except Exception as exc:
        # 非阻塞 — ChromaDB 同步失败不影响主流程（artifacts 表已更新）
        logger.warning(
            "ChromaDB doc_type sync failed artifact_id=%d doc_type=%s: %s",
            artifact_id, doc_type, exc,
        )
        return 0


def purge_artifact_chunks(supabase: Client, course_id: str, artifact_id: int) -> int:
    """文件被拒绝时，清除 ChromaDB 向量 + Supabase artifact_chunks 表里该文件的所有记录。

    熔断器：确保被拒绝的文件不会污染 RAG 知识库。
    大多数 pending 文件从未被索引，此函数对空集合安全（直接返回 0）。
    """
    deleted = 0

    # 1. 清理 ChromaDB 向量
    try:
        col = _chroma_collection(course_id)
        if col.count() > 0:
            results = col.get(where={"artifact_id": str(artifact_id)})
            ids: list[str] = results.get("ids") or []
            if ids:
                col.delete(ids=ids)
                deleted += len(ids)
                logger.info("ChromaDB purged: artifact_id=%d, chunks=%d", artifact_id, len(ids))
    except Exception as exc:
        logger.warning("ChromaDB purge failed artifact_id=%d: %s", artifact_id, exc)

    # 2. 清理 Supabase artifact_chunks 表
    try:
        supabase.table("artifact_chunks").delete().eq("artifact_id", artifact_id).execute()
        logger.info("artifact_chunks purged for artifact_id=%d", artifact_id)
    except Exception as exc:
        logger.warning("artifact_chunks purge failed artifact_id=%d: %s", artifact_id, exc)

    return deleted


# ── Search (RAG retrieval) ────────────────────────────────────────────────────

def _is_chinese(text: str) -> bool:
    cjk = len(_CHINESE_RE.findall(text))
    return cjk > max(1, len(text) * 0.1)


def _translate_zh_to_en(text: str) -> str:
    """Translate Chinese to English for bilingual vector search."""
    from openai import OpenAI
    client = OpenAI(api_key=get_settings().openai_api_key)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Translate to English. Output only the translation."},
            {"role": "user",   "content": text},
        ],
        temperature=0,
        max_tokens=300,
    )
    return resp.choices[0].message.content or text


def search_chunks(
    supabase: Client,
    course_id: str,
    query: str,
    top_k: int = _TOP_K,
    artifact_ids: list[int] | None = None,
) -> list[dict[str, Any]]:
    """
    Find the most relevant chunks for a query.
    - Bilingual: Chinese queries are also translated to English; both embeddings searched
    - Falls back to DB scan if ChromaDB is unavailable or empty
    Returns list of {content, artifact_id, file_name, storage_url, chunk_index}
    """
    from app.services.retrieval import multi_retrieve, RetrievalConfig
    cfg = RetrievalConfig(
        dense_top_k=max(top_k * 3, 15),
        sparse_top_k=max(top_k * 3, 15),
        final_top_k=top_k,
        query=query,
        bilingual=_is_chinese(query),
    )
    enriched = multi_retrieve(supabase, course_id, cfg, artifact_ids)
    if enriched:
        return enriched

    # DB 兜底（保留原有逻辑）
    q = (
        supabase.table("artifact_chunks")
        .select("id, artifact_id, chunk_index, content")
        .eq("course_id", course_id)
        .limit(top_k * 3)
    )
    if artifact_ids:
        q = q.in_("artifact_id", artifact_ids)
    rows = q.execute().data or []
    results = [
        {
            "chunk_id": str(r["id"]),
            "content": r["content"],
            "artifact_id": r["artifact_id"],
            "chunk_index": r["chunk_index"],
            "file_name": "",
            "storage_url": "",
            "distance": 0.5,
        }
        for r in rows[:top_k]
    ]
    if not results:
        return []
    art_ids_list = list({r["artifact_id"] for r in results})
    arts = (
        supabase.table("artifacts")
        .select("id, file_name, storage_url")
        .in_("id", art_ids_list)
        .execute()
    ).data or []
    art_map = {a["id"]: a for a in arts}
    for r in results:
        aid = r["artifact_id"]
        r["file_name"] = art_map.get(aid, {}).get("file_name", "")
        r["storage_url"] = art_map.get(aid, {}).get("storage_url", "")
    return results
