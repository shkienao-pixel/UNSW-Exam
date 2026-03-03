"""Review plan endpoints.

GET  /review/settings    ?course_id=...
POST /review/settings    body: {course_id, review_start_at?, exam_at?}
GET  /review/progress    ?course_id=...
POST /review/progress    body: {course_id, updates: [...]}
POST /review/today_plan  body: {course_id, outline_nodes, budget_minutes?, allow_spacing?}
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from supabase import Client

from app.core.dependencies import get_current_user, get_db

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request schemas ───────────────────────────────────────────────────────────

class ReviewSettingsBody(BaseModel):
    course_id: str
    review_start_at: Optional[str] = None   # ISO 8601 datetime string
    exam_at: Optional[str] = None           # ISO 8601 datetime string


class NodeProgressItem(BaseModel):
    node_id: str
    done: Optional[bool] = None
    priority: Optional[str] = None
    estimate_minutes: Optional[int] = None
    status: Optional[str] = None
    last_reviewed_at: Optional[str] = None
    next_review_at: Optional[str] = None


class ProgressBody(BaseModel):
    course_id: str
    updates: list[NodeProgressItem]


class OutlineNodeRef(BaseModel):
    node_id: str
    title: str = ""
    level: int = 1
    done: bool = False
    priority: Optional[str] = None
    estimate_minutes: Optional[int] = None
    status: Optional[str] = None


class TodayPlanBody(BaseModel):
    course_id: str
    outline_nodes: list[OutlineNodeRef]
    budget_minutes: int = 60
    allow_spacing: bool = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/review/settings")
def get_settings(
    course_id: str = Query(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Return review settings for the current user + course.
    Returns empty defaults if none exist yet."""
    user_id = current_user["id"]
    resp = (
        supabase.table("course_review_settings")
        .select("*")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if rows:
        return rows[0]
    return {
        "id": None,
        "user_id": user_id,
        "course_id": course_id,
        "review_start_at": None,
        "exam_at": None,
    }


@router.post("/review/settings")
def save_settings(
    body: ReviewSettingsBody,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Upsert review settings for the current user + course.

    Bug 4 fix: wrapped in try/except — Supabase upsert failures (e.g. migration not
    yet applied, network error) now return a proper 422 instead of an unhandled 500.
    Reminder: run backend/migrations/009_review_plan.sql in Supabase dashboard first.
    """
    from fastapi import HTTPException
    user_id = current_user["id"]
    now = datetime.now(timezone.utc).isoformat()

    try:
        resp = (
            supabase.table("course_review_settings")
            .upsert(
                {
                    "user_id":          user_id,
                    "course_id":        body.course_id,
                    "review_start_at":  body.review_start_at,
                    "exam_at":          body.exam_at,
                    "updated_at":       now,
                },
                on_conflict="user_id,course_id",
            )
            .execute()
        )
        rows = resp.data or []
        if rows:
            return rows[0]
        # Upsert succeeded but returned no rows — re-fetch the record
        fetch = (
            supabase.table("course_review_settings")
            .select("*")
            .eq("user_id", user_id)
            .eq("course_id", body.course_id)
            .limit(1)
            .execute()
        )
        return (fetch.data or [{}])[0]
    except Exception as exc:
        logger.error("save_settings failed (check migration 009): %s", exc, exc_info=True)
        raise HTTPException(
            status_code=422,
            detail=f"保存失败：{str(exc)[:200]}。请确认 migrations/009_review_plan.sql 已在 Supabase 中执行。",
        )


@router.get("/review/progress")
def get_progress(
    course_id: str = Query(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return all node progress records for the current user + course."""
    user_id = current_user["id"]
    resp = (
        supabase.table("course_review_nodes")
        .select("*")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .execute()
    )
    return resp.data or []


@router.post("/review/progress")
def save_progress(
    body: ProgressBody,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Batch upsert node progress. Only provided fields are updated."""
    user_id = current_user["id"]
    now = datetime.now(timezone.utc).isoformat()

    rows: list[dict] = []
    for u in body.updates:
        row: dict = {
            "user_id": user_id,
            "course_id": body.course_id,
            "node_id": u.node_id,
            "updated_at": now,
        }
        if u.done is not None:
            row["done"] = u.done
        if u.priority is not None:
            row["priority"] = u.priority
        if u.estimate_minutes is not None:
            row["estimate_minutes"] = u.estimate_minutes
        if u.status is not None:
            row["status"] = u.status
        if u.last_reviewed_at is not None:
            row["last_reviewed_at"] = u.last_reviewed_at
        if u.next_review_at is not None:
            row["next_review_at"] = u.next_review_at
        rows.append(row)

    if rows:
        supabase.table("course_review_nodes").upsert(
            rows, on_conflict="user_id,course_id,node_id"
        ).execute()

    return {"ok": True, "updated": len(rows)}


@router.post("/review/today_plan")
def get_today_plan(
    body: TodayPlanBody,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Compute today's recommended review node IDs.

    Algorithm:
      1. Remaining days = (exam_at - now).days, default 30
      2. daily_target = ceil(undone / remaining_days), clamped [3, 15]
      3. Priority order: review_due first, then high > medium > low, then level order
      4. If budget_minutes set and estimate_minutes available, stop when budget exhausted
    """
    user_id = current_user["id"]

    # ── Get exam date for remaining-days calculation ──────────────────────────
    settings_resp = (
        supabase.table("course_review_settings")
        .select("exam_at")
        .eq("user_id", user_id)
        .eq("course_id", body.course_id)
        .limit(1)
        .execute()
    )
    settings = (settings_resp.data or [{}])[0]
    exam_at_str = settings.get("exam_at")

    remaining_days = 30
    if exam_at_str:
        try:
            exam_dt = datetime.fromisoformat(exam_at_str.replace("Z", "+00:00"))
            remaining_days = max(1, (exam_dt - datetime.now(timezone.utc)).days + 1)
        except Exception:
            pass

    # ── Filter undone nodes ───────────────────────────────────────────────────
    undone = [n for n in body.outline_nodes if not n.done]

    if not undone:
        return {
            "node_ids": [],
            "target_count": 0,
            "remaining_days": remaining_days,
            "total_undone": 0,
        }

    daily_target = min(15, max(3, math.ceil(len(undone) / remaining_days)))

    # ── Get spaced-repetition status from DB ─────────────────────────────────
    progress_resp = (
        supabase.table("course_review_nodes")
        .select("node_id, status, next_review_at")
        .eq("user_id", user_id)
        .eq("course_id", body.course_id)
        .execute()
    )
    progress_map: dict[str, dict] = {
        p["node_id"]: p for p in (progress_resp.data or [])
    }

    now_iso = datetime.now(timezone.utc).isoformat()

    # ── Sort: review_due → priority → level ──────────────────────────────────
    prio_order = {"high": 0, "medium": 1, "low": 2}

    def sort_key(node: OutlineNodeRef) -> tuple:
        p = progress_map.get(node.node_id, {})
        status = p.get("status", "not_started")
        next_review = p.get("next_review_at") or ""
        is_due = (
            body.allow_spacing
            and status == "review_due"
            and (not next_review or next_review <= now_iso)
        )
        return (
            0 if is_due else 1,
            prio_order.get(node.priority or "medium", 1),
            node.level,
        )

    sorted_nodes = sorted(undone, key=sort_key)

    # ── Apply daily budget ───────────────────────────────────────────────────
    selected: list[str] = []
    total_minutes = 0

    for node in sorted_nodes:
        if len(selected) >= daily_target:
            break
        est = node.estimate_minutes
        if body.budget_minutes > 0 and est is not None:
            if total_minutes + est > body.budget_minutes and selected:
                # Don't exceed budget unless list is still empty
                continue
            total_minutes += est
        selected.append(node.node_id)

    return {
        "node_ids": selected,
        "target_count": daily_target,
        "remaining_days": remaining_days,
        "total_undone": len(undone),
    }
