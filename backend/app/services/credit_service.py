"""积分服务 — earn / spend / balance / transactions.

积分类型（type 字段）：
  Earn: welcome_bonus | artifact_approved | feedback_adopted | admin_grant | purchase | refund
  Spend: gen_flashcards | gen_quiz | gen_summary | gen_outline | gen_plan | gen_ask | unlock_upload
"""
from __future__ import annotations

from typing import Any
from supabase import Client

from app.core.exceptions import AppError


# ── 消费定价表 ────────────────────────────────────────────────
COSTS: dict[str, int] = {
    "gen_flashcards":  1,
    "gen_quiz":        1,
    "gen_summary":     1,
    "gen_outline":     5,
    "gen_plan":        5,
    "gen_ask":         1,
    "unlock_upload":   1,
}


class InsufficientCreditsError(AppError):
    def __init__(self, balance: int, required: int) -> None:
        super().__init__(f"积分不足：当前 {balance} ✦，需要 {required} ✦")
        self.balance = balance
        self.required = required


# ── 内部工具 ──────────────────────────────────────────────────

def _ensure_row(db: Client, user_id: str) -> int:
    """确保 user_credits 行存在，返回当前余额。"""
    row = db.table("user_credits").select("balance").eq("user_id", user_id).limit(1).execute()
    if row.data:
        return row.data[0]["balance"]
    # 首次：插入 0 余额
    db.table("user_credits").insert({"user_id": user_id, "balance": 0}).execute()
    return 0


def _append_txn(db: Client, user_id: str, amount: int, type_: str, ref_id: str | None, note: str | None) -> dict:
    txn = {"user_id": user_id, "amount": amount, "type": type_}
    if ref_id is not None:
        txn["ref_id"] = str(ref_id)
    if note is not None:
        txn["note"] = note
    result = db.table("credit_transactions").insert(txn).execute()
    return result.data[0]


# ── 公开 API ──────────────────────────────────────────────────

def get_balance(db: Client, user_id: str) -> int:
    return _ensure_row(db, user_id)


def earn(
    db: Client,
    user_id: str,
    amount: int,
    type_: str,
    ref_id: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """增加积分，返回流水记录。"""
    current = _ensure_row(db, user_id)
    new_balance = current + amount
    db.table("user_credits").update(
        {"balance": new_balance, "updated_at": "now()"}
    ).eq("user_id", user_id).execute()
    return _append_txn(db, user_id, amount, type_, ref_id, note)


def spend(
    db: Client,
    user_id: str,
    amount: int,
    type_: str,
    ref_id: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """扣除积分，余额不足时抛 InsufficientCreditsError。返回流水记录。"""
    current = _ensure_row(db, user_id)
    if current < amount:
        raise InsufficientCreditsError(balance=current, required=amount)
    new_balance = current - amount
    db.table("user_credits").update(
        {"balance": new_balance, "updated_at": "now()"}
    ).eq("user_id", user_id).execute()
    return _append_txn(db, user_id, -amount, type_, ref_id, note)


def list_transactions(db: Client, user_id: str, limit: int = 30) -> list[dict]:
    result = (
        db.table("credit_transactions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


def admin_grant(db: Client, user_id: str, amount: int, note: str | None = None) -> dict:
    """管理员手动赠送积分（amount 可为负数）。"""
    if amount >= 0:
        return earn(db, user_id, amount, "admin_grant", note=note)
    # 扣减：忽略余额下限检查（admin 特权）
    current = _ensure_row(db, user_id)
    new_balance = max(0, current + amount)
    db.table("user_credits").update(
        {"balance": new_balance, "updated_at": "now()"}
    ).eq("user_id", user_id).execute()
    return _append_txn(db, user_id, amount, "admin_grant", None, note)
