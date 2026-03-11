"""Course content routes - admin generation + user unlock/view."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.services import course_content_service as svc
import app.services.credit_service as credit_svc

logger = logging.getLogger(__name__)
router = APIRouter()


import hmac
from app.core.config import get_settings

def _require_admin(x_admin_secret: str = Header(default="")) -> None:
    cfg = get_settings()
    if not x_admin_secret or not any(
        hmac.compare_digest(x_admin_secret, s) for s in cfg.admin_secrets_set
    ):
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/{course_id}/course-content/{content_type}/admin")
def admin_get_content(
    course_id: str,
    content_type: str,
    _: None = Depends(_require_admin),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="content_type must be summary or outline")
    row = svc.get_content(db, course_id, content_type)
    if not row:
        return {"status": "not_generated", "content_json": {}, "updated_at": None}
    return row



class UpdateContentRequest(BaseModel):
    content_json: dict | None = None
    status: str | None = None


@router.put("/{course_id}/course-content/{content_type}/admin")
def admin_update_content(
    course_id: str,
    content_type: str,
    body: UpdateContentRequest,
    _: None = Depends(_require_admin),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="content_type must be summary or outline")
    row = svc.get_content(db, course_id, content_type)
    if not row:
        raise HTTPException(status_code=404, detail="Content not found - generate first")

    from datetime import datetime, timezone
    update: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.content_json is not None:
        update["content_json"] = body.content_json
    if body.status is not None:
        if body.status not in ("draft", "published", "hidden"):
            raise HTTPException(status_code=422, detail="Invalid status")
        update["status"] = body.status

    (
        db.table("course_content")
        .update(update)
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
    return fetch.data[0] if fetch.data else {}


@router.get("/{course_id}/course-content/{content_type}/status")
def get_content_status(
    course_id: str,
    content_type: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="Invalid content_type")
    row = svc.get_content(db, course_id, content_type)
    if not row or row["status"] != "published":
        return {"status": "not_published", "credits_required": svc.UNLOCK_COSTS[content_type]}
    unlocked = svc.is_unlocked(db, current_user["id"], course_id, content_type)
    return {
        "status": "unlocked" if unlocked else "locked",
        "credits_required": svc.UNLOCK_COSTS[content_type],
    }


@router.post("/{course_id}/course-content/{content_type}/unlock")
def unlock_content(
    course_id: str,
    content_type: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="Invalid content_type")
    row = svc.get_content(db, course_id, content_type)
    if not row or row["status"] != "published":
        raise HTTPException(status_code=404, detail="Content not available yet")
    if svc.is_unlocked(db, current_user["id"], course_id, content_type):
        return {"ok": True, "already_unlocked": True}
    cost = svc.UNLOCK_COSTS[content_type]
    credit_svc.spend(db, current_user["id"], cost, f"unlock_{content_type}", course_id)
    svc.record_unlock(db, current_user["id"], course_id, content_type)
    return {"ok": True, "already_unlocked": False, "credits_spent": cost}


@router.get("/{course_id}/course-content/{content_type}")
def get_content_for_user(
    course_id: str,
    content_type: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="Invalid content_type")
    if not svc.is_unlocked(db, current_user["id"], course_id, content_type):
        raise HTTPException(status_code=403, detail="Content not unlocked")
    row = svc.get_content(db, course_id, content_type)
    if not row or row["status"] != "published":
        raise HTTPException(status_code=404, detail="Content not available")
    return row
