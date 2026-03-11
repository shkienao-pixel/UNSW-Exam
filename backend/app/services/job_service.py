"""Generation job queue service.

Provides thin CRUD helpers for the generation_jobs table.
All functions are synchronous (called from asyncio.to_thread or regular sync code).
"""

from __future__ import annotations

import datetime
import uuid
from typing import Any

from supabase import Client


def create_job(
    db: Client,
    user_id: str,
    course_id: str,
    job_type: str,
    request_payload: dict[str, Any] | None = None,
) -> str:
    """Insert a new pending job and return its UUID string."""
    job_id = str(uuid.uuid4())
    db.table("generation_jobs").insert({
        "id":        job_id,
        "user_id":   user_id,
        "course_id": course_id,
        "job_type":  job_type,
        "status":    "pending",
        "request_payload": request_payload or {},
    }).execute()
    return job_id


def create_job_with_limit(
    db: Client,
    user_id: str,
    course_id: str,
    job_type: str,
    max_inflight: int,
    request_payload: dict[str, Any] | None = None,
) -> str | None:
    """Create a pending job only if user inflight jobs are below max_inflight.

    Preferred path:
      - DB RPC enqueue_generation_job() for atomic check+insert
    Fallback path:
      - best-effort local check then insert
    """
    if max_inflight < 0:
        max_inflight = 0

    try:
        rpc_result = db.rpc(
            "enqueue_generation_job",
            {
                "p_user_id": user_id,
                "p_course_id": course_id,
                "p_job_type": job_type,
                "p_request_payload": request_payload or {},
                "p_max_inflight": max_inflight,
            },
        ).execute()
        data = rpc_result.data
        row = data[0] if isinstance(data, list) and data else (data if isinstance(data, dict) else None)
        if row and row.get("accepted") and row.get("job_id"):
            return str(row["job_id"])
        return None
    except Exception:
        # Fallback for environments not yet migrated.
        if count_inflight_jobs(db, user_id) >= max_inflight:
            return None
        return create_job(db, user_id, course_id, job_type, request_payload=request_payload)


def count_inflight_jobs(db: Client, user_id: str) -> int:
    """Return the user's pending + processing job count."""
    rows = (
        db.table("generation_jobs")
        .select("id")
        .eq("user_id", user_id)
        .in_("status", ["pending", "processing"])
        .execute()
        .data
    ) or []
    return len(rows)


def reclaim_stale_processing_jobs(db: Client, timeout_seconds: int) -> int:
    """Requeue processing jobs whose updated_at exceeded timeout."""
    cutoff = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=timeout_seconds)
    ).isoformat()
    result = (
        db.table("generation_jobs")
        .update(
            {
                "status": "pending",
                "error_msg": "Recovered from stale processing state",
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
        )
        .eq("status", "processing")
        .lt("updated_at", cutoff)
        .execute()
    )
    return len(result.data or [])


def claim_next_pending_job(db: Client) -> dict | None:
    """Atomically claim the oldest pending job.

    Preferred path:
      - DB RPC function claim_next_generation_job() with SKIP LOCKED semantics
    Fallback path:
      - best-effort read-then-conditional-update for environments not yet migrated
    """
    try:
        rpc_result = db.rpc("claim_next_generation_job", {}).execute()
        data = rpc_result.data
        if isinstance(data, list):
            return data[0] if data else None
        if isinstance(data, dict):
            return data
    except Exception:
        # Fallback for older environments where migration 018 isn't applied yet.
        pass

    # Legacy fallback: best-effort claim with status guard.
    rows = (
        db.table("generation_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .execute()
        .data
    ) or []
    if not rows:
        return None

    job_id = rows[0]["id"]
    result = (
        db.table("generation_jobs")
        .update(
            {
                "status": "processing",
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
        )
        .eq("id", job_id)
        .eq("status", "pending")
        .execute()
    )
    updated = result.data or []
    return updated[0] if updated else None


def finish_job(db: Client, job_id: str, output_id: int) -> None:
    _patch(db, job_id, {"status": "done", "output_id": output_id})


def fail_job(db: Client, job_id: str, error_msg: str) -> None:
    _patch(db, job_id, {"status": "failed", "error_msg": error_msg[:500]})


def get_job(db: Client, job_id: str) -> dict | None:
    rows = db.table("generation_jobs").select("*").eq("id", job_id).execute().data
    return rows[0] if rows else None


def _patch(db: Client, job_id: str, patch: dict) -> None:
    patch["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    db.table("generation_jobs").update(patch).eq("id", job_id).execute()
