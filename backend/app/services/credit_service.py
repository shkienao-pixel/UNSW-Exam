"""积分服务 — earn / spend / balance / transactions.

积分类型（type 字段）：
  Earn: welcome_bonus | artifact_approved | feedback_adopted | admin_grant | purchase | refund
  Spend: gen_flashcards | gen_quiz | gen_summary | gen_outline | gen_plan | gen_ask | unlock_upload | unlock_all
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Generator
from supabase import Client

from app.core.exceptions import InsufficientCreditsError

logger = logging.getLogger(__name__)


# ── 消费定价表 ────────────────────────────────────────────────
COSTS: dict[str, int] = {
    "gen_flashcards":  100,
    "gen_quiz":        100,
    "gen_summary":     1,
    "gen_outline":     5,
    "gen_plan":        5,
    # Gemini 3.1 Pro 直接生成，单次 20 积分
    "gen_ask":         20,
    # 单文件深度解析（解锁 + 考点提取）
    "unlock_upload":   50,
    "enroll_course":   100,
}




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
    """增加积分，返回流水记录。

    使用乐观锁（WHERE balance = current）避免并发 lost-update：
    - 若并发写导致 UPDATE 影响 0 行，重试至多 3 次。
    - 三次均失败则强制写入（earn 不能丢失）。
    """
    for attempt in range(3):
        current = _ensure_row(db, user_id)
        new_balance = current + amount
        result = db.table("user_credits").update(
            {"balance": new_balance, "updated_at": "now()"}
        ).eq("user_id", user_id).eq("balance", current).execute()
        if result.data:
            return _append_txn(db, user_id, amount, type_, ref_id, note)
        logger.warning("credit earn optimistic lock miss (attempt %d/3) user=%s", attempt + 1, user_id)
    # 重试耗尽：强制写入，earn 必须成功
    logger.error("credit earn: optimistic lock exhausted, forcing write for user=%s", user_id)
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
    """扣除积分，余额不足时抛 InsufficientCreditsError。返回流水记录。

    使用乐观锁（WHERE balance = current）避免并发超扣：
    - 若 UPDATE 影响 0 行（说明并发修改已发生），重试至多 3 次。
    - 三次均失败则抛错，业务上等同余额不足。
    """
    for attempt in range(3):
        current = _ensure_row(db, user_id)
        if current < amount:
            raise InsufficientCreditsError(balance=current, required=amount)  # type: ignore[call-arg]
        new_balance = current - amount
        # 乐观锁：WHERE user_id=X AND balance=current，并发修改后 balance 已变则更新失败
        result = db.table("user_credits").update(
            {"balance": new_balance, "updated_at": "now()"}
        ).eq("user_id", user_id).eq("balance", current).execute()
        if result.data:
            return _append_txn(db, user_id, -amount, type_, ref_id, note)
        # 并发冲突 — 重试
        logger.warning("credit spend optimistic lock miss (attempt %d/3) user=%s", attempt + 1, user_id)
    # 重试耗尽
    final = _ensure_row(db, user_id)
    raise InsufficientCreditsError(balance=final, required=amount)  # type: ignore[call-arg]


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


@contextmanager
def credit_guard(
    db: Client,
    user_id: str,
    type_: str,
    ref_id: str | None = None,
) -> Generator[None, None, None]:
    """扣除积分 Context Manager：进入时扣，异常时自动退款。

    用法：
        with credit_guard(db, user_id, "gen_summary"):
            result = call_llm(...)   # 失败自动退款
    """
    cost = COSTS.get(type_, 1)
    spend(db, user_id, cost, type_, ref_id)
    try:
        yield
    except Exception:
        try:
            earn(db, user_id, cost, "refund", ref_id, note=f"{type_} 失败退款")
        except Exception as refund_err:
            logger.error("credit refund failed for %s/%s: %s", user_id, type_, refund_err)
        raise


def admin_grant(db: Client, user_id: str, amount: int, note: str | None = None) -> dict:
    """管理员手动赠送积分（amount 可为负数）。"""
    if amount >= 0:
        return earn(db, user_id, amount, "admin_grant", note=note)
    # 扣减：忽略余额下限检查（admin 特权），但 txn 记录实际扣减量保持一致
    current = _ensure_row(db, user_id)
    new_balance = max(0, current + amount)
    actual_deducted = new_balance - current  # 负数，例如 -50（即使 amount=-100 但余额只有 50）
    db.table("user_credits").update(
        {"balance": new_balance, "updated_at": "now()"}
    ).eq("user_id", user_id).execute()
    return _append_txn(db, user_id, actual_deducted, "admin_grant", None, note)
