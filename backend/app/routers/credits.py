"""Credits routes.

User routes:
- GET  /credits/balance
- POST /credits/check
- POST /credits/deduct
- GET  /credits/transactions

Admin route:
- POST /admin/credits/grant
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import InsufficientCreditsError
from app.services import credit_service

router = APIRouter()
admin_router = APIRouter()


class BalanceOut(BaseModel):
    balance: int


class CreditCheckRequest(BaseModel):
    type_: str


class CreditCheckOut(BaseModel):
    ok: bool = True
    balance: int
    required: int


class DeductRequest(BaseModel):
    type_: str


class GrantRequest(BaseModel):
    user_id: str
    amount: int
    note: str | None = None


def _require_admin(
    request: Request,
    x_admin_secret: str = Header(default=""),
) -> None:
    # 复用 admin.py 里的速率限制器，防止暴力枚举 secret
    from app.routers.admin import _check_admin_rate_limit, _record_admin_fail
    import logging as _logging
    ip = request.client.host if request.client else "unknown"
    _check_admin_rate_limit(ip)
    if not x_admin_secret or not any(
        hmac.compare_digest(x_admin_secret, s) for s in get_settings().admin_secrets_set
    ):
        _record_admin_fail(ip)
        _logging.getLogger(__name__).warning("Admin auth failure (credits) from IP=%s", ip)
        raise HTTPException(status_code=403, detail="Forbidden")


def _resolve_cost(type_: str) -> int:
    valid_types = set(credit_service.COSTS.keys())
    if type_ not in valid_types:
        raise HTTPException(status_code=422, detail=f"type_ must be one of: {sorted(valid_types)}")
    return credit_service.COSTS[type_]


@router.get("/balance", response_model=BalanceOut)
def get_balance(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> BalanceOut:
    balance = credit_service.get_balance(db, current_user["id"])
    return BalanceOut(balance=balance)


@router.post("/check", response_model=CreditCheckOut)
def check_credits(
    body: CreditCheckRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> CreditCheckOut:
    """Validate token + verify balance is enough for a credit type (without deducting)."""
    required = _resolve_cost(body.type_)
    balance = credit_service.get_balance(db, current_user["id"])
    if balance < required:
        raise InsufficientCreditsError(balance=balance, required=required)
    return CreditCheckOut(ok=True, balance=balance, required=required)


@router.post("/deduct", response_model=BalanceOut)
def deduct_credits(
    body: DeductRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> BalanceOut:
    """Deduct credits for a specific operation and return latest balance."""
    required = _resolve_cost(body.type_)
    credit_service.spend(db, current_user["id"], required, body.type_)
    balance = credit_service.get_balance(db, current_user["id"])
    return BalanceOut(balance=balance)


@router.get("/transactions")
def get_transactions(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> list:
    return credit_service.list_transactions(db, current_user["id"])


@admin_router.post("/credits/grant")
def admin_grant(
    body: GrantRequest,
    db: Client = Depends(get_db),
    _: None = Depends(_require_admin),
) -> dict:
    txn = credit_service.admin_grant(db, body.user_id, body.amount, body.note)
    new_balance = credit_service.get_balance(db, body.user_id)
    return {"transaction": txn, "new_balance": new_balance}

