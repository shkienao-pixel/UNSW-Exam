"""积分路由：查询余额、流水，管理员赠送。

GET  /credits/balance
GET  /credits/transactions
POST /admin/credits/grant
"""
from __future__ import annotations

import hmac

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


class DeductRequest(BaseModel):
    """用于 Next.js 服务端路由代扣积分（如带图问答 VQA）。"""
    type_: str  # 与 COSTS 表一致，如 'gen_ask'


class GrantRequest(BaseModel):
    user_id: str
    amount: int
    note: str | None = None


def _require_admin(x_admin_secret: str = Header(default="")) -> None:
    if not x_admin_secret or not any(
        hmac.compare_digest(x_admin_secret, s) for s in get_settings().admin_secrets_set
    ):
        raise HTTPException(status_code=403, detail="Forbidden")


# ── 用户端 ────────────────────────────────────────────────────

@router.get("/balance", response_model=BalanceOut)
def get_balance(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> BalanceOut:
    balance = credit_service.get_balance(db, current_user["id"])
    return BalanceOut(balance=balance)


@router.post("/deduct", response_model=BalanceOut)
def deduct_credits(
    body: DeductRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> BalanceOut:
    """Next.js 服务端路由调用：扣积分后返回新余额。

    用于带图问答（VQA）等无法在 FastAPI 内部走 credit_guard 的场景。
    token 合法性通过 get_current_user 验证，余额不足抛 402。
    """
    valid_types = set(credit_service.COSTS.keys())
    if body.type_ not in valid_types:
        raise HTTPException(status_code=422, detail=f"type_ must be one of: {sorted(valid_types)}")
    credit_service.spend(db, current_user["id"], credit_service.COSTS[body.type_], body.type_)
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
