"""Course content routes — admin paste/refine + user unlock/view."""
from __future__ import annotations

import asyncio
import hmac
import logging
import traceback
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.services import course_content_service as svc
import app.services.credit_service as credit_svc
import app.services.llm_key_service as key_svc
from app.services.content_schema_service import generate_schema_from_context

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_CONTENT_TYPES = ("summary", "outline")
VALID_STATUSES = ("draft", "published", "hidden")


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _require_admin(x_admin_secret: str = Header(default="")) -> None:
    cfg = get_settings()
    if not x_admin_secret or not any(
        hmac.compare_digest(x_admin_secret, s) for s in cfg.admin_secrets_set
    ):
        raise HTTPException(status_code=403, detail="Admin access required")


def _validate_content_type(content_type: str) -> str:
    if content_type not in VALID_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail="content_type must be summary or outline")
    return content_type


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.get("/{course_id}/course-content/{content_type}/admin")
def admin_get_content(
    course_id: str,
    content_type: str,
    _: None = Depends(_require_admin),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    _validate_content_type(content_type)
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
    _validate_content_type(content_type)

    if body.status is not None and body.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid status")

    existing = svc.get_content(db, course_id, content_type)
    content_json = body.content_json if body.content_json is not None else (existing["content_json"] if existing else {})
    status = body.status if body.status is not None else (existing["status"] if existing else "draft")
    return svc.upsert_content(db, course_id, content_type, content_json, status=status)


class RefineRequest(BaseModel):
    context: str


@router.post("/{course_id}/course-content/{content_type}/refine")
async def admin_refine_content(
    course_id: str,
    content_type: str,
    body: RefineRequest,
    _: None = Depends(_require_admin),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    """Use LLM to convert raw context text into summary_v1 schema, save as draft."""
    _validate_content_type(content_type)
    if not body.context.strip():
        raise HTTPException(status_code=422, detail="context must not be empty")

    openai_key = key_svc.get_api_key("openai", db)
    if not openai_key:
        raise HTTPException(status_code=400, detail="OpenAI API key not configured")

    try:
        schema = await asyncio.to_thread(
            generate_schema_from_context, body.context, content_type, openai_key
        )
        return svc.upsert_content(db, course_id, content_type, schema, status="draft")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("refine_content failed %s/%s:\n%s", course_id, content_type, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"AI refinement failed: {str(exc)[:200]}")


# ── User endpoints ────────────────────────────────────────────────────────────

@router.get("/{course_id}/course-content/{content_type}/status")
def get_content_status(
    course_id: str,
    content_type: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    _validate_content_type(content_type)
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
    _validate_content_type(content_type)
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
    _validate_content_type(content_type)
    if not svc.is_unlocked(db, current_user["id"], course_id, content_type):
        raise HTTPException(status_code=403, detail="Content not unlocked")
    row = svc.get_content(db, course_id, content_type)
    if not row or row["status"] != "published":
        raise HTTPException(status_code=404, detail="Content not available")
    return row
