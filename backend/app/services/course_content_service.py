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
    result = (
        db.table("user_content_unlocks")
        .insert({
            "user_id": user_id,
            "course_id": course_id,
            "content_type": content_type,
            "credits_spent": cost,
        })
        .select()
        .execute()
    )
    return result.data[0]


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


def _parse_text_structure(text: str, week_num: int) -> tuple[str, list[str], str]:
    """
    从原始文本中用启发式规则提取结构：
    - 短行（<= 80字符）、非句子结尾、至少2个词 → 视为 slide 标题
    - 第一个有意义标题 → week title
    - 所有标题 → key_points（最多8个）
    - 按标题分段生成 markdown content
    """
    import re

    # 过滤噪声行（页码、单个数字、纯符号等）
    _noise = re.compile(r'^[\d\s\-–—|•·▪▸►◦»«\[\]()]+$')

    lines = [l.rstrip() for l in text.splitlines()]

    headings: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or _noise.match(stripped):
            continue
        word_count = len(stripped.split())
        is_short = len(stripped) <= 80
        ends_with_prose = stripped.endswith(('.', ',', ';', ':', '?', '!'))
        if is_short and not ends_with_prose and word_count >= 2:
            headings.append(stripped)

    # 去重保序
    seen: set[str] = set()
    unique_headings: list[str] = []
    for h in headings:
        key = h.lower()
        if key not in seen:
            seen.add(key)
            unique_headings.append(h)

    # 过滤管理类信息（讲师、学期、课程编号等）
    _admin = re.compile(
        r'\b(tutor|lecturer|professor|semester|term|school of|faculty|week \d+|copyright|all rights|©)\b',
        re.IGNORECASE,
    )
    content_headings = [h for h in unique_headings if not _admin.search(h)]

    title = content_headings[0] if content_headings else f"Week {week_num}"
    key_points = content_headings[1:9] if len(content_headings) > 1 else content_headings[:8]

    # 构建 markdown：遇到标题加 ##，其余行原样
    heading_set = set(h.lower() for h in content_headings[:20])
    md_parts: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.lower() in heading_set:
            md_parts.append(f"\n## {stripped}")
        else:
            md_parts.append(stripped)

    content = "\n".join(md_parts).strip()
    return title, key_points, content


def generate_summary(db: Client, course_id: str) -> dict:
    from app.services.artifact_service import download_artifact_bytes
    from app.services.text_extractor import extract_text

    week_map = _get_week_artifacts(db, course_id)
    if not week_map:
        raise ValueError("No lecture artifacts with week assigned found for this course")

    weeks_output = []
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
        title, key_points, content = _parse_text_structure(combined, week_num)

        weeks_output.append({
            "week": week_num,
            "title": title,
            "key_points": key_points,
            "content": content,
        })

    if not weeks_output:
        raise ValueError("No content generated - check that lecture artifacts have text")

    content_json = {"weeks": weeks_output}
    return upsert_content(db, course_id, "summary", content_json, status="draft")


def generate_outline(db: Client, course_id: str) -> dict:
    summary = get_content(db, course_id, "summary")
    if not summary:
        raise ValueError("Generate summary first before generating outline")

    weeks_data = summary["content_json"].get("weeks", [])
    weeks_output = []
    for w in weeks_data:
        nodes = []
        for i, kp in enumerate(w.get("key_points", [])):
            nodes.append({
                "id": f"w{w['week']}_n{i}",
                "title": kp,
                "level": 1,
            })
        weeks_output.append({
            "week": w["week"],
            "title": w.get("title", f"Week {w['week']}"),
            "nodes": nodes,
        })

    content_json = {"weeks": weeks_output}
    return upsert_content(db, course_id, "outline", content_json, status="draft")
