"""Planner service — 14-Day Exam Planner logic.

Blueprint JSON schema (set by admin):
{
  "knowledge_points": [
    {"id": "kp_1", "title": "...", "topic": "..."},
    ...
  ],
  "papers": [
    {"id": "paper_1", "title": "..."},
    ...
  ]
}

Plan generation:
- remaining_days = max(1, (exam_date - today).days)
- remaining_kps   = [kp not in done_kp_ids]
- remaining_papers = [p not in done_paper_ids]
- kps_per_day[i]   = ceil(remaining_kps / remaining_days) with last day getting the remainder
- papers on days evenly distributed

Returns list of DayPlan objects.
"""

from __future__ import annotations

import math
import logging
from datetime import date, datetime, timezone
from typing import Any

from supabase import Client

from app.core.exceptions import AppError, NotFoundError

logger = logging.getLogger(__name__)


# ── Blueprint CRUD ─────────────────────────────────────────────────────────────

def get_blueprint(supabase: Client, course_id: str) -> dict[str, Any] | None:
    resp = (
        supabase.table("planner_blueprints")
        .select("id, course_id, blueprint, updated_at")
        .eq("course_id", course_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def upsert_blueprint(supabase: Client, course_id: str, blueprint: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    # Try update first, then insert
    existing = get_blueprint(supabase, course_id)
    if existing:
        supabase.table("planner_blueprints").update(
            {"blueprint": blueprint, "updated_at": now}
        ).eq("course_id", course_id).execute()
        fetch = (
            supabase.table("planner_blueprints")
            .select("id, course_id, blueprint, updated_at")
            .eq("course_id", course_id)
            .limit(1)
            .execute()
        )
        return fetch.data[0]
    else:
        resp = supabase.table("planner_blueprints").insert({
            "course_id": course_id,
            "blueprint": blueprint,
            "created_at": now,
            "updated_at": now,
        }).execute()
        if not resp.data:
            raise AppError("Failed to save blueprint")
        return resp.data[0]


def delete_blueprint(supabase: Client, course_id: str) -> None:
    supabase.table("planner_blueprints").delete().eq("course_id", course_id).execute()


# ── Progress CRUD ──────────────────────────────────────────────────────────────

def get_done_ids(supabase: Client, user_id: str, course_id: str) -> dict[str, set[str]]:
    """Return {item_type -> set of done item_ids}."""
    resp = (
        supabase.table("planner_progress")
        .select("item_type, item_id")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .eq("done", True)
        .execute()
    )
    result: dict[str, set[str]] = {"kp": set(), "paper": set()}
    for row in (resp.data or []):
        t = row["item_type"]
        if t in result:
            result[t].add(row["item_id"])
    return result


def toggle_item(
    supabase: Client,
    user_id: str,
    course_id: str,
    item_type: str,
    item_id: str,
    done: bool,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    # Upsert by unique (user_id, course_id, item_type, item_id)
    supabase.table("planner_progress").upsert(
        {
            "user_id": user_id,
            "course_id": course_id,
            "item_type": item_type,
            "item_id": item_id,
            "done": done,
            "updated_at": now,
        },
        on_conflict="user_id,course_id,item_type,item_id",
    ).execute()


# ── Plan generation ────────────────────────────────────────────────────────────

def _distribute(items: list[Any], n_days: int) -> list[list[Any]]:
    """Distribute items evenly across n_days, ceil distribution.
    First days get ceil(total/n_days), last day gets the remainder.
    """
    if not items or n_days <= 0:
        return [[] for _ in range(max(n_days, 0))]
    total = len(items)
    per_day = math.ceil(total / n_days)
    buckets: list[list[Any]] = []
    idx = 0
    for day_i in range(n_days):
        remaining_days = n_days - day_i
        remaining_items = total - idx
        count = math.ceil(remaining_items / remaining_days)
        buckets.append(items[idx: idx + count])
        idx += count
    return buckets


def generate_plan(
    supabase: Client,
    user_id: str,
    course_id: str,
    exam_date: date | None,
    today: date | None = None,
) -> dict[str, Any]:
    """Generate the full exam plan for a user.

    Returns:
    {
      "blueprint_exists": bool,
      "exam_date": ISO str | null,
      "today": ISO str,
      "total_days": int,
      "remaining_days": int,
      "elapsed_days": int,
      "stats": {
        "total_kp": int, "done_kp": int,
        "total_paper": int, "done_paper": int,
      },
      "days": [
        {
          "day_number": int,         # 1-based from today
          "date": ISO str,
          "is_today": bool,
          "is_past": bool,
          "knowledge_points": [...],
          "papers": [...],
        },
        ...
      ]
    }
    """
    if today is None:
        today = date.today()

    blueprint_row = get_blueprint(supabase, course_id)
    if not blueprint_row:
        return {
            "blueprint_exists": False,
            "exam_date": exam_date.isoformat() if exam_date else None,
            "today": today.isoformat(),
            "total_days": 0,
            "remaining_days": 0,
            "elapsed_days": 0,
            "stats": {"total_kp": 0, "done_kp": 0, "total_paper": 0, "done_paper": 0},
            "days": [],
        }

    blueprint = blueprint_row["blueprint"]
    all_kps: list[dict] = blueprint.get("knowledge_points", [])
    all_papers: list[dict] = blueprint.get("papers", [])

    done = get_done_ids(supabase, user_id, course_id)
    done_kp_ids = done["kp"]
    done_paper_ids = done["paper"]

    # Mark done status into all items
    for kp in all_kps:
        kp["done"] = kp["id"] in done_kp_ids
    for paper in all_papers:
        paper["done"] = paper["id"] in done_paper_ids

    if exam_date is None:
        # No exam date — return blueprint with progress but no day plan
        return {
            "blueprint_exists": True,
            "exam_date": None,
            "today": today.isoformat(),
            "total_days": 0,
            "remaining_days": 0,
            "elapsed_days": 0,
            "stats": {
                "total_kp": len(all_kps),
                "done_kp": len(done_kp_ids),
                "total_paper": len(all_papers),
                "done_paper": len(done_paper_ids),
            },
            "days": [],
        }

    delta = (exam_date - today).days
    remaining_days = max(1, delta)
    elapsed_days = max(0, -delta) if delta < 0 else 0

    # Only remaining (not done) items get distributed
    remaining_kps = [kp for kp in all_kps if not kp["done"]]
    remaining_papers = [p for p in all_papers if not p["done"]]

    kp_buckets = _distribute(remaining_kps, remaining_days)
    paper_buckets = _distribute(remaining_papers, remaining_days)

    days = []
    from datetime import timedelta
    for i in range(remaining_days):
        day_date = today + timedelta(days=i)
        days.append({
            "day_number": i + 1,
            "date": day_date.isoformat(),
            "is_today": day_date == today,
            "is_past": day_date < today,
            "knowledge_points": kp_buckets[i] if i < len(kp_buckets) else [],
            "papers": paper_buckets[i] if i < len(paper_buckets) else [],
        })

    return {
        "blueprint_exists": True,
        "exam_date": exam_date.isoformat(),
        "today": today.isoformat(),
        "total_days": remaining_days,
        "remaining_days": remaining_days,
        "elapsed_days": elapsed_days,
        "stats": {
            "total_kp": len(all_kps),
            "done_kp": len(done_kp_ids),
            "total_paper": len(all_papers),
            "done_paper": len(done_paper_ids),
        },
        "days": days,
    }
