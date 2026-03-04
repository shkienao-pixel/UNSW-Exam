"""积分路由：查询余额、流水，管理员赠送。

GET  /credits/balance
GET  /credits/transactions
POST /admin/credits/grant
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.services import credit_service

router = APIRouter()
admin_router = APIRouter()


class BalanceOut(BaseModel):
    balance: int


class GrantRequest(BaseModel):
    user_id: str
    amount: int
    note: str | None = None


def _require_admin(x_admin_secret: str = Header(default="")) -> None:
    if not x_admin_secret or x_admin_secret not in get_settings().admin_secrets_set:
        raise HTTPException(status_code=403, detail="Forbidden")


# ── 用户端 ────────────────────────────────────────────────────

@router.get("/balance", response_model=BalanceOut)
def get_balance(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> BalanceOut:
    balance = credit_service.get_balance(db, current_user["id"])
    return BalanceOut(balance=balance)


@router.get("/transactions")
def get_transactions(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> list:
    return credit_service.list_transactions(db, current_user["id"])


# ── 管理员端 ──────────────────────────────────────────────────

@admin_router.post("/credits/grant")
def admin_grant(
    body: GrantRequest,
    db: Client = Depends(get_db),
    _: None = Depends(_require_admin),
) -> dict:
    txn = credit_service.admin_grant(db, body.user_id, body.amount, body.note)
    new_balance = credit_service.get_balance(db, body.user_id)
    return {"transaction": txn, "new_balance": new_balance}
