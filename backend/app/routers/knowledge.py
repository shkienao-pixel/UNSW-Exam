"""Knowledge outline + graph generation endpoints.

Two-stage pipeline:
  Stage 1 — Extract: grounded in uploaded material chunks (is_ai_generated=False)
  Stage 2 — Fill (optional): AI gap-filling, clearly marked is_ai_generated=True

POST /knowledge/build     body: {course_id, allow_ai_fill, scope_set_id?, artifact_ids?}
GET  /knowledge/outline?course_id=...
GET  /knowledge/graph?course_id=...
GET  /knowledge/node?course_id=...&node_id=...
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AppError
from app.services.course_service import (
    create_output,
    get_course,
    get_scope_set,
    list_outputs,
)
from app.services.rag_service import get_artifact_ids_by_doc_type

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request schema ─────────────────────────────────────────────────────────────

class BuildRequest(BaseModel):
    course_id:     str
    allow_ai_fill: bool              = True
    scope_set_id:  Optional[int]     = None
    artifact_ids:  Optional[list[int]] = None


# ── Mock data (used when no API key) ─────────────────────────────────────────

def _mock_knowledge(course_id: str) -> dict:
    """Return demo knowledge data for UI testing when no API key is available."""
    outline = {
        "course_id": course_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "allow_ai_fill": True,
        "nodes": [
            {
                "id": "intro",
                "title": "Course Introduction",
                "level": 1,
                "parent_id": None,
                "summary": "Overview of course scope and key themes. [MOCK DATA]",
                "key_points": ["Core objectives", "Assessment structure", "Topic overview"],
                "exam_focus": ["Define key terms", "Identify course scope"],
                "evidence": [{"doc": "mock_lecture1.pdf", "page": 1, "chunk_id": "c001", "quote": "This course covers fundamental concepts..."}],
                "is_ai_generated": False,
                "reason": None,
                "confidence": None,
                "related_node_ids": ["concepts"],
            },
            {
                "id": "concepts",
                "title": "Key Concepts",
                "level": 1,
                "parent_id": None,
                "summary": "Fundamental concepts forming the basis of the course. [MOCK DATA]",
                "key_points": ["Concept A — definition and properties", "Concept B — practical application"],
                "exam_focus": ["Compare and contrast Concept A vs B", "Apply Concept B to novel scenarios"],
                "evidence": [{"doc": "mock_lecture2.pdf", "page": 3, "chunk_id": "c002", "quote": "Concept A is defined as..."}],
                "is_ai_generated": False,
                "reason": None,
                "confidence": None,
                "related_node_ids": ["concepts.sub_a", "concepts.sub_b"],
            },
            {
                "id": "concepts.sub_a",
                "title": "Concept A",
                "level": 2,
                "parent_id": "concepts",
                "summary": "Deep-dive into Concept A and its properties. [MOCK DATA]",
                "key_points": ["Property 1: formal definition", "Property 2: computational complexity"],
                "exam_focus": ["Derive property 1 from first principles", "Prove complexity bounds"],
                "evidence": [{"doc": "mock_lecture2.pdf", "page": 5, "chunk_id": "c003", "quote": "Property 1 states that the output satisfies..."}],
                "is_ai_generated": False,
                "reason": None,
                "confidence": None,
                "related_node_ids": [],
            },
            {
                "id": "concepts.sub_b",
                "title": "Concept B",
                "level": 2,
                "parent_id": "concepts",
                "summary": "Application-focused treatment of Concept B. [MOCK DATA]",
                "key_points": ["Use-case 1", "Limitations in practice"],
                "exam_focus": ["Apply Concept B to a given dataset"],
                "evidence": [{"doc": "mock_lecture3.pdf", "page": 2, "chunk_id": "c004", "quote": "Concept B is most effective when..."}],
                "is_ai_generated": False,
                "reason": None,
                "confidence": None,
                "related_node_ids": [],
            },
            {
                "id": "concepts.edge_cases",
                "title": "Edge Cases & Corner Scenarios",
                "level": 2,
                "parent_id": "concepts",
                "summary": "Common edge cases not fully covered in lecture notes — AI supplemented. [MOCK]",
                "key_points": ["Undefined behaviour when input is empty", "Overflow conditions"],
                "exam_focus": ["Analyse edge case in a given exam scenario"],
                "evidence": [{"doc": "No direct evidence in uploaded materials", "page": None, "chunk_id": None, "quote": None}],
                "is_ai_generated": True,
                "reason": "Edge cases are commonly tested in exams but not explicitly addressed in the uploaded lecture slides.",
                "confidence": "medium",
                "related_node_ids": ["concepts.sub_a"],
            },
            {
                "id": "methods",
                "title": "Methods & Algorithms",
                "level": 1,
                "parent_id": None,
                "summary": "Core algorithms and solution methods. [MOCK DATA]",
                "key_points": ["Algorithm X: pseudocode and analysis", "Method Y: iterative vs recursive"],
                "exam_focus": ["Trace Algorithm X on a given input", "Analyse time/space complexity"],
                "evidence": [{"doc": "mock_lecture4.pdf", "page": 8, "chunk_id": "c005", "quote": "Algorithm X operates in O(n log n) time..."}],
                "is_ai_generated": False,
                "reason": None,
                "confidence": None,
                "related_node_ids": ["concepts.sub_a"],
            },
        ],
    }
    graph = {
        "nodes": [
            {"id": "ConceptA", "label": "Concept A", "type": "Concept", "is_ai_generated": False,
             "summary": "Core concept A", "evidence": [{"doc": "mock_lecture2.pdf", "page": 5}]},
            {"id": "ConceptB", "label": "Concept B", "type": "Concept", "is_ai_generated": False,
             "summary": "Core concept B", "evidence": [{"doc": "mock_lecture3.pdf", "page": 2}]},
            {"id": "AlgorithmX", "label": "Algorithm X", "type": "Method", "is_ai_generated": False,
             "summary": "Main solution algorithm", "evidence": [{"doc": "mock_lecture4.pdf", "page": 8}]},
            {"id": "EdgeCases", "label": "Edge Cases", "type": "Concept", "is_ai_generated": True,
             "summary": "AI-supplemented edge case coverage", "evidence": []},
        ],
        "edges": [
            {"id": "e1", "source": "ConceptA", "target": "AlgorithmX", "relation": "used_in",
             "is_ai_generated": False, "evidence": [{"doc": "mock_lecture4.pdf", "page": 8}], "confidence": "high"},
            {"id": "e2", "source": "ConceptB", "target": "AlgorithmX", "relation": "compared_to",
             "is_ai_generated": False, "evidence": [{"doc": "mock_lecture4.pdf", "page": 9}], "confidence": "medium"},
            {"id": "e3", "source": "ConceptA", "target": "EdgeCases", "relation": "extends",
             "is_ai_generated": True, "evidence": [], "confidence": "low"},
        ],
    }
    return {"outline": outline, "graph": graph}


# ── LLM helpers ───────────────────────────────────────────────────────────────

def _extract_json(text: str) -> str:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    for i, ch in enumerate(text):
        if ch in "[{":
            text = text[i:]
            break
    if text.startswith("{"):
        idx = text.rfind("}")
        if idx != -1:
            text = text[: idx + 1]
    return text


def _chat(system: str, user: str, key: str) -> str:
    from openai import OpenAI
    # Issue 1 fix: 120s timeout prevents worker disconnects on slow LLM calls
    client = OpenAI(api_key=key, timeout=120.0)
    resp = client.chat.completions.create(
        model="gpt-5.4",
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content or "{}"


# ── LLM Prompts ───────────────────────────────────────────────────────────────

EXTRACT_SYSTEM = """\
You are a knowledge extraction expert for academic courses.
Extract a STRUCTURED knowledge outline and concept graph from the provided course materials.

STRICT RULES:
1. Every node MUST be grounded in the provided text. Include evidence (doc, page, chunk_id, quote).
2. Set is_ai_generated = false for ALL extracted nodes/edges.
3. reason and confidence must be null for all extracted nodes.
4. Output ONLY valid JSON matching the schema below — no extra keys.
5. Outline: max 30 nodes, levels 1-3. Graph: max 50 nodes, 80 edges.
6. Use concise slug-style IDs (e.g. "week1.intro", "rcnn", "loss_function").

OUTPUT JSON (respond with ONLY this object):
{
  "outline": {
    "nodes": [
      {
        "id": "slug_id",
        "title": "Node Title",
        "level": 1,
        "parent_id": null,
        "summary": "1-2 sentence summary",
        "key_points": ["point 1", "point 2"],
        "exam_focus": ["likely exam question type 1"],
        "evidence": [{"doc": "filename.pdf", "page": 5, "chunk_id": "cXXX", "quote": "short quote"}],
        "is_ai_generated": false,
        "reason": null,
        "confidence": null,
        "related_node_ids": []
      }
    ]
  },
  "graph": {
    "nodes": [
      {"id": "ConceptName", "label": "Concept Name", "type": "Concept",
       "is_ai_generated": false, "summary": "brief", "evidence": [{"doc": "x.pdf", "page": 2}]}
    ],
    "edges": [
      {"id": "e1", "source": "NodeA", "target": "NodeB", "relation": "uses",
       "is_ai_generated": false, "evidence": [{"doc": "x.pdf", "page": 3}], "confidence": "high"}
    ]
  }
}\
"""

FILL_SYSTEM = """\
You are a knowledge completeness expert for academic courses.
Identify and fill ONLY the GAPS in the existing knowledge outline and graph.

STRICT RULES:
1. ONLY add MISSING nodes/edges — NEVER modify or re-output existing ones.
2. is_ai_generated = true for ALL additions.
3. reason: explain why this concept is missing but important for study.
4. confidence: "high", "medium", or "low".
5. If no direct evidence, use {"doc": "No direct evidence in uploaded materials", "page": null, "chunk_id": null, "quote": null}.
6. Output ONLY valid JSON matching the schema below.

OUTPUT JSON:
{
  "outline_additions": [
    {
      "id": "slug_id",
      "title": "Missing Concept",
      "level": 2,
      "parent_id": "existing_parent_id_or_null",
      "summary": "...",
      "key_points": ["..."],
      "exam_focus": ["..."],
      "evidence": [{"doc": "No direct evidence in uploaded materials", "page": null, "chunk_id": null, "quote": null}],
      "is_ai_generated": true,
      "reason": "This concept is typically part of this topic but not found in the provided materials.",
      "confidence": "medium",
      "related_node_ids": []
    }
  ],
  "graph_additions": {
    "nodes": [{"id": "NewConcept", "label": "New Concept", "type": "Concept",
               "is_ai_generated": true, "summary": "...", "evidence": []}],
    "edges": [{"id": "e_fill1", "source": "Existing", "target": "NewConcept", "relation": "extends",
               "is_ai_generated": true, "evidence": [], "confidence": "low"}]
  }
}\
"""


# ── Context helper ────────────────────────────────────────────────────────────

def _get_context(
    supabase: Client,
    course_id: str,
    artifact_ids: list[int] | None,
) -> tuple[str, list[dict]]:
    from app.services.rag_service import get_course_chunks
    return get_course_chunks(supabase, course_id, artifact_ids, max_chars=60_000)


# ── Stage 1: Extract ──────────────────────────────────────────────────────────

def _stage_extract(ctx: str, openai_key: str) -> dict:
    user = f"Course materials (extract outline + concept graph grounded in this text):\n\n{ctx[:55_000]}"
    raw  = _chat(EXTRACT_SYSTEM, user, openai_key)
    try:
        parsed = json.loads(_extract_json(raw))
    except json.JSONDecodeError as exc:
        logger.warning("Extract stage JSON parse error: %s", exc)
        raise AppError("LLM returned invalid JSON in extraction stage")

    outline = parsed.get("outline", {})
    graph   = parsed.get("graph", {})
    if not isinstance(outline.get("nodes"), list):
        outline["nodes"] = []
    if not isinstance(graph.get("nodes"), list):
        graph["nodes"] = []
    if not isinstance(graph.get("edges"), list):
        graph["edges"] = []
    return {"outline": outline, "graph": graph}


# ── Stage 2: Fill ─────────────────────────────────────────────────────────────

def _stage_fill(existing: dict, ctx: str, openai_key: str) -> dict:
    existing_summary = json.dumps({
        "outline_node_ids":    [n["id"]    for n in existing["outline"].get("nodes", [])],
        "outline_titles":      [n["title"] for n in existing["outline"].get("nodes", [])],
        "graph_node_ids":      [n["id"]    for n in existing["graph"].get("nodes", [])],
        "graph_edge_relations": [f"{e['source']}->{e['target']}" for e in existing["graph"].get("edges", [])],
    }, ensure_ascii=False)

    user = (
        f"Existing knowledge structure:\n{existing_summary}\n\n"
        f"Course materials (for context, first 20 000 chars):\n{ctx[:20_000]}\n\n"
        "Now output ONLY the gap-filling additions as JSON."
    )
    raw = _chat(FILL_SYSTEM, user, openai_key)
    try:
        parsed = json.loads(_extract_json(raw))
    except json.JSONDecodeError as exc:
        logger.warning("Fill stage JSON parse error: %s", exc)
        return existing  # graceful: skip fill on error

    additions    = parsed.get("outline_additions", []) or []
    graph_adds   = parsed.get("graph_additions", {}) or {}
    new_nodes    = graph_adds.get("nodes", []) or []
    new_edges    = graph_adds.get("edges", []) or []

    # Merge — never overwrite existing
    existing["outline"]["nodes"] = existing["outline"].get("nodes", []) + additions
    existing["graph"]["nodes"]   = existing["graph"].get("nodes", [])   + new_nodes
    existing["graph"]["edges"]   = existing["graph"].get("edges", [])   + new_edges
    return existing


# ── Persistence helpers ───────────────────────────────────────────────────────

def _save_knowledge(
    supabase: Client,
    user_id: str,
    course_id: str,
    result: dict,
    scope_set_id: int | None = None,
) -> None:
    """Upsert outline and graph into the shared outputs table."""
    for otype in ("knowledge_outline", "knowledge_graph"):
        existing = list_outputs(supabase, user_id, course_id, otype)
        for o in existing:
            supabase.table("outputs").delete().eq("id", o["id"]).execute()

    create_output(
        supabase, user_id, course_id, "knowledge_outline",
        json.dumps(result["outline"], ensure_ascii=False),
        scope_set_id=scope_set_id, model_used="gpt-4o",
    )
    create_output(
        supabase, user_id, course_id, "knowledge_graph",
        json.dumps(result["graph"], ensure_ascii=False),
        scope_set_id=scope_set_id, model_used="gpt-4o",
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/knowledge/build")
def build_knowledge(
    body: BuildRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client   = Depends(get_db),
) -> dict[str, Any]:
    """Two-stage knowledge extraction + optional AI fill."""
    get_course(supabase, body.course_id)

    # Resolve OpenAI key
    try:
        from app.services.llm_key_service import get_api_key
        openai_key: str = get_api_key("openai", supabase) or get_settings().openai_api_key
    except Exception:
        openai_key = get_settings().openai_api_key

    if not openai_key:
        result = _mock_knowledge(body.course_id)
        _save_knowledge(supabase, current_user["id"], body.course_id, result, body.scope_set_id)
        return result

    # ── Resolve artifact scope ─────────────────────────────────────────────────
    # Priority: explicit artifact_ids > scope_set > doc_type routing > full corpus

    artifact_ids: list[int] | None = None
    doc_type_hint: str | None = None   # for user-facing warning

    if body.artifact_ids:
        # Caller supplied explicit IDs — use them directly
        artifact_ids = body.artifact_ids
    elif body.scope_set_id:
        scope        = get_scope_set(supabase, current_user["id"], body.scope_set_id)
        artifact_ids = scope.get("artifact_ids") or None
    else:
        # Data-centric routing: revision STRICT (知识大纲/图谱只用复习资料，无降级)
        revision_ids = get_artifact_ids_by_doc_type(supabase, body.course_id, ["revision"])
        if revision_ids:
            artifact_ids = revision_ids
            doc_type_hint = "revision"
        # else: artifact_ids stays None → will trigger error below

    try:
        ctx, _ = _get_context(supabase, body.course_id, artifact_ids)
        if not ctx.strip():
            raise AppError(
                "未找到「复习总结」类型的文件。"
                "请在管理后台上传复习资料并将 doc_type 设为「复习总结 (revision)」，"
                "然后执行「重新索引」后重试。"
            )

        result = _stage_extract(ctx, openai_key)
        result["outline"]["course_id"]     = body.course_id
        result["outline"]["generated_at"]  = datetime.now(timezone.utc).isoformat()
        result["outline"]["allow_ai_fill"] = body.allow_ai_fill

        if body.allow_ai_fill:
            result = _stage_fill(result, ctx, openai_key)

        _save_knowledge(supabase, current_user["id"], body.course_id, result, body.scope_set_id)
        return result

    except AppError:
        raise
    except Exception as exc:
        logger.error("Knowledge build failed: %s", exc, exc_info=True)
        result = _mock_knowledge(body.course_id)
        _save_knowledge(supabase, current_user["id"], body.course_id, result, body.scope_set_id)
        return result


@router.get("/knowledge/outline")
def get_outline(
    course_id: str  = Query(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client   = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    rows = list_outputs(supabase, current_user["id"], course_id, "knowledge_outline")
    if not rows:
        return {}
    try:
        return json.loads(rows[0]["content"])
    except Exception:
        return {}


@router.get("/knowledge/graph")
def get_graph(
    course_id: str  = Query(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client   = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    rows = list_outputs(supabase, current_user["id"], course_id, "knowledge_graph")
    if not rows:
        return {}
    try:
        return json.loads(rows[0]["content"])
    except Exception:
        return {}


@router.get("/knowledge/node")
def get_node(
    course_id: str  = Query(...),
    node_id:   str  = Query(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client   = Depends(get_db),
) -> dict[str, Any]:
    get_course(supabase, course_id)
    rows = list_outputs(supabase, current_user["id"], course_id, "knowledge_outline")
    if not rows:
        return {}
    try:
        outline = json.loads(rows[0]["content"])
        for node in outline.get("nodes", []):
            if node.get("id") == node_id:
                return node
        return {}
    except Exception:
        return {}
