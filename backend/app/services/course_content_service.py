"""课程级共享内容服务 - summary / outline 的 CRUD 和生成逻辑。"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

UNLOCK_COSTS = {"summary": 200, "outline": 300}


# ── CRUD ─────────────────────────────────────────────────────────────────────

def get_content(db: Client, course_id: str, content_type: str) -> dict | None:
    row = (
        db.table("course_content")
        .select("*")
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .limit(1)
        .execute()
    ).data
    return row[0] if row else None


def upsert_content(
    db: Client,
    course_id: str,
    content_type: str,
    content_json: dict,
    status: str = "draft",
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    db.table("course_content").upsert(
        {
            "course_id": course_id,
            "content_type": content_type,
            "content_json": content_json,
            "status": status,
            "updated_at": now,
        },
        on_conflict="course_id,content_type",
    ).execute()
    fetch = (
        db.table("course_content")
        .select("*")
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .limit(1)
        .execute()
    )
    return fetch.data[0]


def update_status(db: Client, course_id: str, content_type: str, status: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    (
        db.table("course_content")
        .update({"status": status, "updated_at": now})
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .execute()
    )
    fetch = (
        db.table("course_content")
        .select("*")
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .execute()
    )
    if not fetch.data:
        raise ValueError(f"course_content not found: {course_id}/{content_type}")
    return fetch.data[0]


# ── Unlock ────────────────────────────────────────────────────────────────────

def is_unlocked(db: Client, user_id: str, course_id: str, content_type: str) -> bool:
    row = (
        db.table("user_content_unlocks")
        .select("id")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .limit(1)
        .execute()
    ).data
    return bool(row)


def record_unlock(
    db: Client, user_id: str, course_id: str, content_type: str
) -> dict:
    cost = UNLOCK_COSTS[content_type]
    db.table("user_content_unlocks").insert({
        "user_id": user_id,
        "course_id": course_id,
        "content_type": content_type,
        "credits_spent": cost,
    }).execute()
    fetch = (
        db.table("user_content_unlocks")
        .select("*")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .order("unlocked_at", desc=True)
        .limit(1)
        .execute()
    )
    return fetch.data[0]


# ── Generation ────────────────────────────────────────────────────────────────

def _get_week_artifacts(
    db: Client, course_id: str
) -> dict[int, list[dict]]:
    rows = (
        db.table("artifacts")
        .select("id, file_name, file_type, storage_path, week")
        .eq("course_id", course_id)
        .eq("status", "approved")
        .eq("doc_type", "lecture")
        .not_.is_("week", "null")
        .execute()
    ).data or []

    buckets: dict[int, list[dict]] = {}
    for r in rows:
        w = r.get("week")
        if w and 1 <= w <= 10:
            buckets.setdefault(w, []).append(r)
    return buckets


def _parse_text_structure(text: str, week_num: int) -> tuple[str, str]:
    """从原始文本提取结构，返回 (week_title, markdown_block)。"""
    import re

    _noise = re.compile(r'^[\d\s\-–—|•·▪▸►◦»«\[\]()]+$')
    _admin = re.compile(
        r'\b(tutor|lecturer|professor|semester|term|school of|faculty|copyright|all rights|©)\b',
        re.IGNORECASE,
    )

    lines = [l.rstrip() for l in text.splitlines()]

    headings: list[str] = []
    seen: set[str] = set()
    for line in lines:
        s = line.strip()
        if not s or _noise.match(s):
            continue
        if (len(s) <= 80 and not s.endswith(('.', ',', ';', ':', '?', '!'))
                and len(s.split()) >= 2):
            key = s.lower()
            if key not in seen and not _admin.search(s):
                seen.add(key)
                headings.append(s)

    week_title = headings[0] if headings else f"Week {week_num}"
    heading_set = set(h.lower() for h in headings[:20])

    md_lines: list[str] = [f"## {week_title}", ""]
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s.lower() in heading_set and s != week_title:
            md_lines.append(f"\n### {s}")
        else:
            md_lines.append(s)

    return week_title, "\n".join(md_lines)


def generate_summary(db: Client, course_id: str) -> dict:
    from app.services.artifact_service import download_artifact_bytes
    from app.services.text_extractor import extract_text

    week_map = _get_week_artifacts(db, course_id)
    if not week_map:
        raise ValueError("No lecture artifacts with week assigned found for this course")

    blocks: list[str] = []
    for week_num in sorted(week_map.keys()):
        arts = week_map[week_num]
        all_texts: list[str] = []
        for a in arts:
            sp = a.get("storage_path")
            ft = a.get("file_type", "pdf")
            if not sp or ft == "url":
                continue
            try:
                data = download_artifact_bytes(db, sp)
                text = extract_text(ft, data, a["file_name"])
                all_texts.append(text)
            except Exception as exc:
                logger.warning("Failed to extract week %d artifact %s: %s", week_num, a.get("file_name"), exc)

        if not all_texts:
            continue

        combined = "\n\n".join(all_texts)
        _, block = _parse_text_structure(combined, week_num)
        blocks.append(block)

    if not blocks:
        raise ValueError("No content generated - check that lecture artifacts have text")

    markdown = "# 课程摘要\n\n" + "\n\n---\n\n".join(blocks)
    return upsert_content(db, course_id, "summary", {"markdown": markdown}, status="draft")


def generate_outline(db: Client, course_id: str) -> dict:
    """从 summary 的 markdown 中提取 ## 标题作为大纲节点。"""
    import re

    summary = get_content(db, course_id, "summary")
    if not summary:
        raise ValueError("Generate summary first before generating outline")

    markdown = summary["content_json"].get("markdown", "")
    if not markdown:
        raise ValueError("Summary has no markdown content — regenerate summary first")

    nodes = []
    for i, line in enumerate(markdown.splitlines()):
        m = re.match(r'^(#{1,3})\s+(.+)', line)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip()
            nodes.append({
                "id": f"n{i}",
                "title": title,
                "level": level,
            })

    return upsert_content(db, course_id, "outline", {"nodes": nodes}, status="draft")
