"""Planner routes.

User routes:
- GET  /courses/{course_id}/planner       -> generate_plan
- POST /courses/{course_id}/planner/toggle -> toggle item done/undone

Admin route:
- GET    /admin/planner/{course_id}        -> get blueprint
- PUT    /admin/planner/{course_id}        -> upsert blueprint
- DELETE /admin/planner/{course_id}        -> delete blueprint
"""

from __future__ import annotations

import hmac
import logging
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.services import planner_service

router = APIRouter()
admin_router = APIRouter()
logger = logging.getLogger(__name__)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ToggleRequest(BaseModel):
    item_type: str   # 'kp' | 'paper'
    item_id: str
    done: bool


class BlueprintUpsertRequest(BaseModel):
    blueprint: dict


# ── Admin auth ────────────────────────────────────────────────────────────────

def _require_admin(
    request: Request,
    x_admin_secret: str = Header(default=""),
) -> None:
    from app.routers.admin import _check_admin_rate_limit, _record_admin_fail
    ip = request.client.host if request.client else "unknown"
    _check_admin_rate_limit(ip)
    if not x_admin_secret or not any(
        hmac.compare_digest(x_admin_secret, s) for s in get_settings().admin_secrets_set
    ):
        _record_admin_fail(ip)
        logger.warning("Admin auth failure (planner) from IP=%s", ip)
        raise HTTPException(status_code=403, detail="Forbidden")


# ── User endpoints ────────────────────────────────────────────────────────────

@router.get("/planner")
def get_plan(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict:
    """Generate the user's exam plan for this course."""
    # Get exam date from course
    resp = (
        db.table("courses")
        .select("exam_date")
        .eq("id", course_id)
        .limit(1)
        .execute()
    )
    exam_date: date | None = None
    if resp.data and resp.data[0].get("exam_date"):
        try:
            exam_date = date.fromisoformat(resp.data[0]["exam_date"][:10])
        except (ValueError, TypeError):
            pass

    return planner_service.generate_plan(
        supabase=db,
        user_id=current_user["id"],
        course_id=course_id,
        exam_date=exam_date,
    )


@router.post("/planner/toggle")
def toggle_item(
    course_id: str,
    body: ToggleRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict:
    if body.item_type not in ("kp", "paper"):
        raise HTTPException(status_code=422, detail="item_type must be 'kp' or 'paper'")
    planner_service.toggle_item(
        supabase=db,
        user_id=current_user["id"],
        course_id=course_id,
        item_type=body.item_type,
        item_id=body.item_id,
        done=body.done,
    )
    return {"ok": True}


# ── Admin endpoints ───────────────────────────────────────────────────────────

@admin_router.get("/planner/{course_id}")
def admin_get_blueprint(
    course_id: str,
    db: Client = Depends(get_db),
    _: None = Depends(_require_admin),
) -> dict:
    bp = planner_service.get_blueprint(db, course_id)
    if bp is None:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    return bp


@admin_router.put("/planner/{course_id}")
def admin_upsert_blueprint(
    course_id: str,
    body: BlueprintUpsertRequest,
    db: Client = Depends(get_db),
    _: None = Depends(_require_admin),
) -> dict:
    return planner_service.upsert_blueprint(db, course_id, body.blueprint)


@admin_router.delete("/planner/{course_id}")
def admin_delete_blueprint(
    course_id: str,
    db: Client = Depends(get_db),
    _: None = Depends(_require_admin),
) -> dict:
    planner_service.delete_blueprint(db, course_id)
    return {"ok": True}
