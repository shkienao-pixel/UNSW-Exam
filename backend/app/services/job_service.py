"""Generation job queue service.

Provides thin CRUD helpers for the generation_jobs table.
All functions are synchronous (called from asyncio.to_thread or regular sync code).
"""

from __future__ import annotations

import datetime
import uuid

from supabase import Client


def create_job(db: Client, user_id: str, course_id: str, job_type: str) -> str:
    """Insert a new pending job and return its UUID string."""
    job_id = str(uuid.uuid4())
    db.table("generation_jobs").insert({
        "id":        job_id,
        "user_id":   user_id,
        "course_id": course_id,
        "job_type":  job_type,
        "status":    "pending",
    }).execute()
    return job_id


def set_processing(db: Client, job_id: str) -> None:
    _patch(db, job_id, {"status": "processing"})


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
