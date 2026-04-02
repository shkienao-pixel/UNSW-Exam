"""Credits routes.

User routes:
- GET  /credits/balance
- POST /credits/check
- POST /credits/deduct
- GET  /credits/transactions
- POST /credits/checkout
- POST /credits/webhook  (Stripe webhook, no auth)

Admin route:
- POST /admin/credits/grant
"""

from __future__ import annotations

import hmac
import logging

import stripe

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import InsufficientCreditsError
from app.services import credit_service

logger = logging.getLogger(__name__)

# 套餐定义：credits -> (price_cents, display_name)
PACKAGES: dict[str, tuple[int, int, str]] = {
    "1000": (1000,  990, "1,000 Credits"),
    "3000": (3000, 2490, "3,000 Credits"),
    "7000": (7000, 4990, "7,000 Credits"),
}

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


class CheckoutRequest(BaseModel):
    package: str
    success_url: str
    cancel_url: str


class CheckoutOut(BaseModel):
    checkout_url: str
    session_id: str


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


@router.post("/checkout", response_model=CheckoutOut)
def create_checkout(
    body: CheckoutRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> CheckoutOut:
    """创建 Stripe Checkout Session，返回跳转 URL。"""
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Payment not configured")

    if body.package not in PACKAGES:
        raise HTTPException(status_code=422, detail=f"Invalid package. Choose from: {list(PACKAGES)}")

    credits_amount, price_cents, display_name = PACKAGES[body.package]

    stripe.api_key = settings.stripe_secret_key

    session = stripe.checkout.Session.create(
        payment_method_types=["card", "alipay", "wechat_pay"],
        payment_method_options={"wechat_pay": {"client": "web"}},
        line_items=[{
            "price_data": {
                "currency": "aud",
                "unit_amount": price_cents,
                "product_data": {"name": f"ExamMaster {display_name}"},
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        client_reference_id=current_user["id"],
        metadata={"user_id": current_user["id"], "package": body.package, "credits": str(credits_amount)},
    )

    # 记录 pending 订单
    db.table("credit_orders").insert({
        "user_id": current_user["id"],
        "stripe_session_id": session.id,
        "credits_amount": credits_amount,
        "price_cents": price_cents,
        "currency": "aud",
        "status": "pending",
    }).execute()

    return CheckoutOut(checkout_url=session.url, session_id=session.id)


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Client = Depends(get_db)) -> JSONResponse:
    """Stripe Webhook — 处理 checkout.session.completed，发放积分。"""
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if settings.stripe_webhook_secret:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
        except stripe.error.SignatureVerificationError:
            logger.warning("Stripe webhook signature verification failed")
            raise HTTPException(status_code=400, detail="Invalid signature")
    else:
        import json
        event = json.loads(payload)
        logger.warning("stripe_webhook_secret not set — skipping signature verification")

    if event["type"] != "checkout.session.completed":
        return JSONResponse({"received": True})

    session = event["data"]["object"]
    session_id = session["id"]
    user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
    credits_str = session.get("metadata", {}).get("credits")

    if not user_id or not credits_str:
        logger.error("Webhook missing user_id or credits for session %s", session_id)
        return JSONResponse({"received": True})

    # 幂等：检查订单是否已处理
    existing = db.table("credit_orders").select("id,status").eq("stripe_session_id", session_id).limit(1).execute()
    if existing.data and existing.data[0]["status"] == "paid":
        logger.info("Duplicate webhook for session %s, skipping", session_id)
        return JSONResponse({"received": True})

    credits_amount = int(credits_str)
    payment_intent = session.get("payment_intent", "")

    # 更新订单状态
    db.table("credit_orders").update({
        "status": "paid",
        "stripe_payment_intent": payment_intent,
        "paid_at": "now()",
    }).eq("stripe_session_id", session_id).execute()

    # 发放积分
    credit_service.earn(db, user_id, credits_amount, "purchase", ref_id=session_id,
                        note=f"Stripe 充值 {credits_amount} 积分")

    logger.info("Credits granted: user=%s credits=%d session=%s", user_id, credits_amount, session_id)
    return JSONResponse({"received": True})


@admin_router.post("/credits/grant")
def admin_grant(
    body: GrantRequest,
    db: Client = Depends(get_db),
    _: None = Depends(_require_admin),
) -> dict:
    txn = credit_service.admin_grant(db, body.user_id, body.amount, body.note)
    new_balance = credit_service.get_balance(db, body.user_id)
    return {"transaction": txn, "new_balance": new_balance}

