"""课程级共享内容服务 - summary / outline 的 CRUD 和解锁逻辑。"""
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
    existing = get_content(db, course_id, content_type)
    if existing:
        db.table("course_content").update({
            "content_json": content_json,
            "status": status,
            "updated_at": now,
        }).eq("course_id", course_id).eq("content_type", content_type).execute()
    else:
        db.table("course_content").insert({
            "course_id": course_id,
            "content_type": content_type,
            "content_json": content_json,
            "status": status,
            "updated_at": now,
        }).execute()
    fetch = (
        db.table("course_content")
        .select("*")
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .limit(1)
        .execute()
    )
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


def record_unlock(db: Client, user_id: str, course_id: str, content_type: str) -> None:
    cost = UNLOCK_COSTS[content_type]
    db.table("user_content_unlocks").insert({
        "user_id": user_id,
        "course_id": course_id,
        "content_type": content_type,
        "credits_spent": cost,
    }).execute()
