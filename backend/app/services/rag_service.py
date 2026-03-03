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

import io
import re
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.core.config import get_settings
from app.core.exceptions import AppError

# ── Constants ─────────────────────────────────────────────────────────────────

_CHUNK_TARGET   = 800   # target chars per chunk
_CHUNK_MAX      = 1200  # hard max before forced split
_CHUNK_MIN      = 80    # discard chunks shorter than this
_TOP_K          = 6     # default retrieval count

_CHINESE_RE = re.compile(r'[\u4e00-\u9fff]')

# ── Text extraction ───────────────────────────────────────────────────────────

def _extract_raw(file_type: str, data: bytes) -> str:
    if file_type == "pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            pages: list[str] = []
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    pages.append(f"[Page {i+1}]\n{text}")
            return "\n\n".join(pages)
        except Exception as exc:
            return f"[PDF extraction failed: {exc}]"

    if file_type == "word":
        try:
            from docx import Document
            doc = Document(io.BytesIO(data))
            return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as exc:
            return f"[Word extraction failed: {exc}]"

    return data.decode("utf-8", errors="replace")


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

def _chunk(text: str) -> list[str]:
    """Paragraph-aware chunking with overlap."""
    paras = [p.strip() for p in re.split(r'\n\n+', text) if p.strip()]

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for para in paras:
        para_len = len(para)

        # If adding this paragraph would exceed target, flush current chunk
        if current_len + para_len > _CHUNK_TARGET and current:
            chunks.append('\n\n'.join(current))
            # Overlap: keep last paragraph for context continuity
            overlap = current[-1]
            current = [overlap, para]
            current_len = len(overlap) + para_len
        else:
            current.append(para)
            current_len += para_len

        # Hard-split oversized paragraphs (e.g., dense slides)
        if current_len > _CHUNK_MAX:
            chunks.append('\n\n'.join(current))
            current = []
            current_len = 0

    if current:
        chunks.append('\n\n'.join(current))

    return [c for c in chunks if len(c.strip()) >= _CHUNK_MIN]


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

    chunks = _chunk(clean)
    if not chunks:
        return 0

    # Delete existing chunks for this artifact (idempotent)
    supabase.table("artifact_chunks").delete().eq("artifact_id", artifact_id).execute()

    # Insert chunks into Supabase
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "artifact_id": artifact_id,
            "course_id":   course_id,
            "chunk_index": i,
            "content":     chunk,
            "char_count":  len(chunk),
            "created_at":  now,
        }
        for i, chunk in enumerate(chunks)
    ]
    resp = supabase.table("artifact_chunks").insert(rows).execute()
    chunk_ids = [r["id"] for r in (resp.data or [])]
    if not chunk_ids:
        return 0

    # Embed + store in ChromaDB
    try:
        embeddings = _embed(chunks)
        col = _chroma_collection(course_id)
        # Remove stale docs for this artifact
        try:
            col.delete(where={"artifact_id": str(artifact_id)})
        except Exception:
            pass
        col.add(
            ids        = [str(cid) for cid in chunk_ids],
            embeddings = embeddings,
            documents  = chunks,
            metadatas  = [
                {
                    "artifact_id": str(artifact_id),
                    "course_id":   course_id,
                    "file_name":   file_name,
                    "chunk_index": i,
                }
                for i in range(len(chunks))
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


# ── Get all chunks (for full-doc generation) ─────────────────────────────────

def get_course_chunks(
    supabase: Client,
    course_id: str,
    artifact_ids: list[int] | None = None,
    max_chars: int = 80_000,
) -> tuple[str, list[dict[str, Any]]]:
    """
    Return (context_text, sources) for generation.
    context_text: concatenated clean chunks (truncated to max_chars)
    sources:      [{artifact_id, file_name, storage_url}]
    """
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

    if not chunks:
        return "", []

    # Fetch source artifact metadata
    art_ids = list({c["artifact_id"] for c in chunks})
    arts = (
        supabase.table("artifacts")
        .select("id, file_name, storage_url")
        .in_("id", art_ids)
        .execute()
    ).data or []
    art_map: dict[int, dict] = {a["id"]: a for a in arts}

    # Build context text
    parts: list[str] = []
    total = 0
    for c in chunks:
        content = c["content"]
        if total + len(content) > max_chars:
            break
        parts.append(content)
        total += len(content)

    context = "\n\n".join(parts)

    sources = [
        {
            "artifact_id": aid,
            "file_name":   art_map[aid]["file_name"] if aid in art_map else "unknown",
            "storage_url": art_map[aid].get("storage_url", "") if aid in art_map else "",
        }
        for aid in art_ids
    ]

    return context, sources


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
    queries = [query]
    if _is_chinese(query):
        try:
            en = _translate_zh_to_en(query)
            if en and en.strip().lower() != query.strip().lower():
                queries.append(en)
        except Exception:
            pass

    # ── Vector search via ChromaDB ────────────────────────────────────────────
    try:
        col = _chroma_collection(course_id)
        if col.count() == 0:
            raise ValueError("empty collection")

        embeddings = _embed(queries)
        seen: set[str] = set()
        results: list[dict[str, Any]] = []

        for emb in embeddings:
            n = min(top_k, col.count())
            qr = col.query(query_embeddings=[emb], n_results=n)
            for i, doc_id in enumerate(qr["ids"][0]):
                if doc_id not in seen:
                    seen.add(doc_id)
                    meta = qr["metadatas"][0][i]
                    art_id = int(meta.get("artifact_id", 0))
                    if artifact_ids and art_id not in artifact_ids:
                        continue
                    results.append({
                        "chunk_id":    doc_id,
                        "content":     qr["documents"][0][i],
                        "artifact_id": art_id,
                        "file_name":   meta.get("file_name", ""),
                        "chunk_index": meta.get("chunk_index", 0),
                        "distance":    qr["distances"][0][i] if qr.get("distances") else 0.5,
                    })

        results.sort(key=lambda x: x.get("distance", 1))
        results = results[:top_k]

    except Exception:
        # ── Fallback: keyword-style DB scan ──────────────────────────────────
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
                "chunk_id":    str(r["id"]),
                "content":     r["content"],
                "artifact_id": r["artifact_id"],
                "chunk_index": r["chunk_index"],
                "file_name":   "",
                "distance":    0.5,
            }
            for r in rows[:top_k]
        ]

    if not results:
        return []

    # ── Enrich with storage_url from artifacts table ──────────────────────────
    art_ids = list({r["artifact_id"] for r in results})
    arts = (
        supabase.table("artifacts")
        .select("id, file_name, storage_url")
        .in_("id", art_ids)
        .execute()
    ).data or []
    art_map: dict[int, dict] = {a["id"]: a for a in arts}

    for r in results:
        aid = r["artifact_id"]
        if aid in art_map:
            r["file_name"]   = art_map[aid]["file_name"]
            r["storage_url"] = art_map[aid].get("storage_url", "")
        else:
            r.setdefault("storage_url", "")

    return results
