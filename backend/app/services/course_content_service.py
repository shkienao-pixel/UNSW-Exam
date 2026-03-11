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
    result = (
        db.table("course_content")
        .upsert(
            {
                "course_id": course_id,
                "content_type": content_type,
                "content_json": content_json,
                "status": status,
                "updated_at": now,
            },
            on_conflict="course_id,content_type",
        )
        .select()
        .execute()
    )
    return result.data[0]


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


def generate_summary(db: Client, course_id: str) -> dict:
    from app.services.artifact_service import download_artifact_bytes
    from app.services.text_extractor import extract_text
    from app.core.config import get_settings
    from openai import OpenAI
    import json

    week_map = _get_week_artifacts(db, course_id)
    if not week_map:
        raise ValueError("No lecture artifacts with week assigned found for this course")

    settings = get_settings()
    client = OpenAI(api_key=settings.openai_api_key, timeout=120.0)

    weeks_output = []
    for week_num in sorted(week_map.keys()):
        arts = week_map[week_num]
        parts = []
        for a in arts:
            sp = a.get("storage_path")
            ft = a.get("file_type", "pdf")
            if not sp or ft == "url":
                continue
            try:
                data = download_artifact_bytes(db, sp)
                text = extract_text(ft, data, a["file_name"])
                parts.append(f"=== {a['file_name']} ===\n{text[:8000]}")
            except Exception as exc:
                logger.warning("Failed to extract week %d artifact %s: %s", week_num, a.get("file_name"), exc)

        if not parts:
            continue

        week_text = "\n\n".join(parts)
        resp = client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an academic knowledge extractor. "
                        "Given lecture slides for one week, extract: "
                        "1) a short title for the week (5-10 words), "
                        "2) 5-8 key_points as short phrases, "
                        "3) a detailed markdown summary of the week's content. "
                        "Exclude administrative info (tutor names, dates, grading). "
                        "Respond ONLY as JSON: "
                        '{\"title\":\"...\",\"key_points\":[\"...\"],\"content\":\"markdown...\"}'
                    ),
                },
                {"role": "user", "content": f"Week {week_num} lecture materials:\n\n{week_text[:12000]}"},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        try:
            parsed = json.loads(resp.choices[0].message.content or "{}")
        except Exception:
            parsed = {"title": f"Week {week_num}", "key_points": [], "content": ""}

        weeks_output.append({
            "week": week_num,
            "title": parsed.get("title", f"Week {week_num}"),
            "key_points": parsed.get("key_points", []),
            "content": parsed.get("content", ""),
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
