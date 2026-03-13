# RAG 多路召回系统实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为闪卡、模拟题、问答三个生成端点实现 Dense+Sparse 双路召回 + RRF 融合。

**Architecture:** 在 ChromaDB 向量检索（Dense）基础上新增 PostgreSQL FTS（Sparse），通过 RRF（Reciprocal Rank Fusion）合并两路结果。召回时引入语义查询，替代当前随机采样策略。

**Tech Stack:** PostgreSQL tsvector/tsquery（Supabase 内置）、ChromaDB（现有）、OpenAI text-embedding-3-small（现有）

---

## 背景：现状 vs 目标

| 端点 | 当前策略 | 问题 |
|------|---------|------|
| run_flashcards | get_course_chunks_sampled(sample_n=12) 随机采样 | 无语义引导，重复率高 |
| run_quiz | get_course_chunks_sampled(sample_n=15) 随机采样 | 稀疏 past_exam 时质量差 |
| search_chunks (/ask) | ChromaDB 单路向量检索 | 词汇匹配盲区 |

目标：引入查询向导 + 双路融合，让召回结果同时覆盖语义相关（Dense）和关键词精确匹配（Sparse）两个维度。

---

## Task 1: PostgreSQL FTS 索引 Migration

**Files:**
- Create: `backend/migrations/016_fts_artifact_chunks.sql`

**Step 1: 创建文件**

```sql
-- 016_fts_artifact_chunks.sql
ALTER TABLE artifact_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_artifact_chunks_content_tsv
  ON artifact_chunks USING GIN (content_tsv);
```

**Step 2: 在 Supabase SQL Editor 手动执行**

打开 https://supabase.com/dashboard/project/izmdvtyxqqxbaoblvhec/sql/new，粘贴后 Run。

**Step 3: 验证**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'artifact_chunks' AND column_name = 'content_tsv';
```

预期：返回 1 行

**Step 4: 提交**

```bash
git add backend/migrations/016_fts_artifact_chunks.sql
git commit -m "feat(rag): add PostgreSQL FTS index on artifact_chunks"
```

---

## Task 2: ts_rank RPC 函数

**Files:**
- Create: `backend/migrations/017_fts_rpc.sql`

**Step 1: 创建文件**

```sql
-- 017_fts_rpc.sql
CREATE OR REPLACE FUNCTION search_chunks_fts(
    p_course_id    TEXT,
    p_tsquery      TEXT,
    p_top_k        INTEGER DEFAULT 20,
    p_artifact_ids INTEGER[] DEFAULT '{}'
)
RETURNS TABLE(id BIGINT, artifact_id INTEGER, chunk_index INTEGER, content TEXT, ts_rank FLOAT4)
LANGUAGE SQL STABLE AS
$$
    SELECT ac.id, ac.artifact_id, ac.chunk_index, ac.content,
           ts_rank(ac.content_tsv, to_tsquery('simple', p_tsquery)) AS ts_rank
    FROM artifact_chunks ac
    WHERE ac.course_id = p_course_id
      AND ac.content_tsv @@ to_tsquery('simple', p_tsquery)
      AND (cardinality(p_artifact_ids) = 0 OR ac.artifact_id = ANY(p_artifact_ids))
    ORDER BY ts_rank DESC
    LIMIT p_top_k;
$$;
```

**Step 2: 在 Supabase SQL Editor 执行**

**Step 3: 提交**

```bash
git add backend/migrations/017_fts_rpc.sql
git commit -m "feat(rag): add FTS RPC with ts_rank scoring"
```

---

## Task 3: 创建 retrieval 包（5 个文件）

**Files:**
- Create: `backend/app/services/retrieval/__init__.py`
- Create: `backend/app/services/retrieval/dense_retriever.py`
- Create: `backend/app/services/retrieval/sparse_retriever.py`
- Create: `backend/app/services/retrieval/fusion.py`
- Create: `backend/app/services/retrieval/multi_retriever.py`

**Step 1: __init__.py**

```python
from .multi_retriever import multi_retrieve, RetrievalConfig
__all__ = ["multi_retrieve", "RetrievalConfig"]
```

**Step 2: dense_retriever.py**

```python
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
                    chunk_id=doc_id, content=qr["documents"][0][i],
                    artifact_id=art_id, chunk_index=int(meta.get("chunk_index", 0)),
                    score=1.0 - min(dist, 1.0),
                ))
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:top_k]
    except Exception as exc:
        logger.warning("Dense retrieval failed %s: %s", course_id, exc)
        return []
```

**Step 3: sparse_retriever.py**

```python
from __future__ import annotations
import logging
import re
from supabase import Client
from .dense_retriever import ChunkHit

logger = logging.getLogger(__name__)
_MAX_WORDS = 12


def _build_tsquery(query: str) -> str:
    tokens = re.findall(r"[\w\u4e00-\u9fff]{2,}", query.lower())
    tokens = [t for t in tokens if not t.isdigit()][:_MAX_WORDS]
    return " | ".join(tokens) if tokens else ""


def sparse_retrieve(
    supabase: Client, course_id: str, query: str,
    top_k: int = 20, artifact_ids: list[int] | None = None,
) -> list[ChunkHit]:
    tsquery = _build_tsquery(query)
    if not tsquery:
        return []
    try:
        rows = supabase.rpc("search_chunks_fts", {
            "p_course_id": course_id, "p_tsquery": tsquery,
            "p_top_k": top_k, "p_artifact_ids": artifact_ids or [],
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
            chunk_id=str(r.get("id", "")), content=r.get("content", ""),
            artifact_id=int(r.get("artifact_id", 0)),
            chunk_index=int(r.get("chunk_index", 0)),
            score=float(r.get("ts_rank", 0.5)),
        )
        for r in rows
        if not artifact_ids or r.get("artifact_id") in artifact_ids
    ]
```

**Step 4: fusion.py**

```python
from __future__ import annotations
from .dense_retriever import ChunkHit

_RRF_K = 60  # Cormack et al. 2009


def rrf_fuse(ranked_lists: list[list[ChunkHit]], top_k: int = 10) -> list[ChunkHit]:
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
            chunk_id=hit_map[k].chunk_id, content=hit_map[k].content,
            artifact_id=hit_map[k].artifact_id, chunk_index=hit_map[k].chunk_index,
            score=scores[k],
        )
        for k in sorted(scores, key=lambda k: scores[k], reverse=True)[:top_k]
    ]
```

**Step 5: multi_retriever.py**

```python
from __future__ import annotations
import logging, re
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
    supabase: Client, course_id: str, config: RetrievalConfig,
    artifact_ids: list[int] | None = None,
) -> list[dict[str, Any]]:
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


def _db_fallback(supabase, course_id, top_k, artifact_ids):
    q = (
        supabase.table("artifact_chunks")
        .select("id, artifact_id, chunk_index, content")
        .eq("course_id", course_id).limit(top_k * 3)
    )
    if artifact_ids:
        q = q.in_("artifact_id", artifact_ids)
    return [
        ChunkHit(chunk_id=str(r["id"]), content=r["content"],
                 artifact_id=r["artifact_id"], chunk_index=r["chunk_index"], score=0.1)
        for r in (q.execute().data or [])[:top_k]
    ]


def _enrich(supabase, hits: list[ChunkHit]) -> list[dict[str, Any]]:
    if not hits:
        return []
    art_ids = list({h.artifact_id for h in hits})
    arts = (
        supabase.table("artifacts").select("id, file_name, storage_url")
        .in_("id", art_ids).execute()
    ).data or []
    art_map = {a["id"]: a for a in arts}
    return [
        {
            "chunk_id": h.chunk_id, "content": h.content,
            "artifact_id": h.artifact_id, "chunk_index": h.chunk_index, "score": h.score,
            "file_name": art_map.get(h.artifact_id, {}).get("file_name", ""),
            "storage_url": art_map.get(h.artifact_id, {}).get("storage_url", ""),
        }
        for h in hits
    ]
```

**Step 6: 提交所有文件**

```bash
git add backend/app/services/retrieval/
git commit -m "feat(rag): retrieval package with dense+sparse+RRF"
```

---

## Task 4: 接入 generate_service.py（Flashcards + Quiz）

**Files:**
- Modify: `backend/app/services/generate_service.py`

**Step 1: 在文件顶部 import 区（第 27 行后）添加**

```python
from app.services.retrieval import multi_retrieve, RetrievalConfig
from app.services.retrieval.multi_retriever import FLASHCARD_CONFIG, QUIZ_CONFIG
```

**Step 2: 替换 run_flashcards 召回逻辑（约第 372-378 行）**

将：
```python
ctx, _ = get_course_chunks_sampled(
    db, course_id, art_ids, sample_n=12, fetch_limit=200,
)
if not ctx.strip():
    ctx, _ = _get_context(db, user_id, course_id, art_ids)
```

替换为：
```python
raw_hits = multi_retrieve(db, course_id, RetrievalConfig(
    dense_top_k=FLASHCARD_CONFIG.dense_top_k,
    sparse_top_k=FLASHCARD_CONFIG.sparse_top_k,
    final_top_k=FLASHCARD_CONFIG.final_top_k,
    query=FLASHCARD_CONFIG.query,
), art_ids)
if raw_hits:
    ctx = "\n\n".join(h["content"] for h in raw_hits)
else:
    ctx, _ = _get_context(db, user_id, course_id, art_ids)
```

**Step 3: 替换 run_quiz 召回逻辑（约第 252-255 行）**

将：
```python
ctx, sources = get_course_chunks_sampled(
    db, course_id, art_ids, sample_n=15, fetch_limit=200,
)
```

替换为：
```python
raw_hits = multi_retrieve(db, course_id, RetrievalConfig(
    dense_top_k=QUIZ_CONFIG.dense_top_k,
    sparse_top_k=QUIZ_CONFIG.sparse_top_k,
    final_top_k=QUIZ_CONFIG.final_top_k,
    query=QUIZ_CONFIG.query,
), art_ids)
sources: list[dict] = []
if raw_hits:
    ctx = "\n\n".join(h["content"] for h in raw_hits)
    seen_art: set[int] = set()
    for h in raw_hits:
        aid = h["artifact_id"]
        if aid not in seen_art:
            seen_art.add(aid)
            sources.append({"artifact_id": aid, "file_name": h["file_name"], "storage_url": h["storage_url"]})
else:
    ctx, sources = get_course_chunks_sampled(db, course_id, art_ids, sample_n=15, fetch_limit=200)
```

**Step 4: 提交**

```bash
git add backend/app/services/generate_service.py
git commit -m "feat(rag): flashcards+quiz use multi-path retrieval"
```

---

## Task 5: 接入 rag_service.py（/ask 端点）

**Files:**
- Modify: `backend/app/services/rag_service.py` (search_chunks 函数，第 472-570 行)

**Step 1: 替换函数体（保留签名不变）**

将函数体中 `queries = [query]` 到末尾全部替换为：

```python
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

    # DB 兜底（同原有逻辑）
    q = (
        supabase.table("artifact_chunks")
        .select("id, artifact_id, chunk_index, content")
        .eq("course_id", course_id).limit(top_k * 3)
    )
    if artifact_ids:
        q = q.in_("artifact_id", artifact_ids)
    rows = q.execute().data or []
    results = [
        {"chunk_id": str(r["id"]), "content": r["content"],
         "artifact_id": r["artifact_id"], "chunk_index": r["chunk_index"],
         "file_name": "", "storage_url": "", "distance": 0.5}
        for r in rows[:top_k]
    ]
    if not results:
        return []
    art_ids_list = list({r["artifact_id"] for r in results})
    arts = (
        supabase.table("artifacts").select("id, file_name, storage_url")
        .in_("id", art_ids_list).execute()
    ).data or []
    art_map = {a["id"]: a for a in arts}
    for r in results:
        aid = r["artifact_id"]
        r["file_name"] = art_map.get(aid, {}).get("file_name", "")
        r["storage_url"] = art_map.get(aid, {}).get("storage_url", "")
    return results
```

**Step 2: 提交**

```bash
git add backend/app/services/rag_service.py
git commit -m "feat(rag): /ask uses multi-path retrieval"
```

---

## Task 6: 部署到 VPS

**Step 1: 推送代码**
```bash
git push origin main
```

**Step 2: VPS 重建**
```bash
/d/pppppppp/python.exe C:/Users/Administrator/Desktop/UNSWExam/vps_ssh.py "cd /opt/exammaster && git pull && docker compose up -d --build backend"
```

**Step 3: 查看日志确认无报错**
```bash
/d/pppppppp/python.exe C:/Users/Administrator/Desktop/UNSWExam/vps_ssh.py "cd /opt/exammaster && docker compose logs --tail=30 backend"
```

预期：看到 Uvicorn running on，无 ImportError。

**Step 4: 冒烟测试（手动）**
1. 生成闪卡 → 15 张相关卡片，不再随机跳跃
2. 生成模拟题 → 题目与 past_exam 内容更贴近
3. 问答输入问题 → 返回带来源引用的答案

---

## 快速参考

| 组件 | 文件 | 职责 |
|------|------|------|
| Migration FTS | migrations/016_fts_artifact_chunks.sql | content_tsv 列 + GIN 索引 |
| Migration RPC | migrations/017_fts_rpc.sql | ts_rank 评分函数 |
| Dense | retrieval/dense_retriever.py | ChromaDB 向量检索 |
| Sparse | retrieval/sparse_retriever.py | PostgreSQL FTS |
| Fusion | retrieval/fusion.py | RRF 融合（k=60） |
| Orchestrator | retrieval/multi_retriever.py | 统一入口 + 预设配置 |
| Flashcards | generate_service.py:run_flashcards | 接入多路召回 |
| Quiz | generate_service.py:run_quiz | 接入多路召回 |
| Ask | rag_service.py:search_chunks | 接入多路召回 |

## 降级策略（每层都有 fallback）

Dense 失败 → 只用 Sparse
Sparse 失败 → 只用 Dense
两者都失败 → DB 全扫描（原有逻辑）
DB 也空 → [] → 上层 AppError
