"""Default output manager: credit deduction + job status update."""
from __future__ import annotations

import logging

from supabase import Client

from app.harness.types import GenerationRequest, GenerationResult
from app.services import credit_service, job_service

logger = logging.getLogger(__name__)

# job_type → credit_service.COSTS 中对应的 key
_CREDIT_TYPE_MAP: dict[str, str] = {
    "summary":    "gen_summary",
    "quiz":       "gen_quiz",
    "outline":    "gen_outline",
    "flashcards": "gen_flashcards",
    "ask":        "gen_ask",
    "exam_mock":  "gen_exam_mock",
}


class DefaultOutputManager:
    """统一积分扣费 + job 状态更新。

    取代三处独立实现：
    - generate.py credit_guard（同步路径）
    - generate.py ask/stream 手动 spend + earn 退款
    - generation_worker.py 幂等 spend + 手动退款

    mode="sync":      同步路径，直接扣费，调用方负责 try/except 退款
    mode="async_job": 异步路径，先做幂等检查再扣费，成功后更新 job 状态
    """

    def __init__(self, mode: str = "sync") -> None:
        self._mode = mode

    def persist(
        self,
        db: Client,
        request: GenerationRequest,
        result: GenerationResult,
    ) -> GenerationResult:
        credit_type = _CREDIT_TYPE_MAP.get(request.job_type)

        if self._mode == "sync" and credit_type:
            cost = credit_service.COSTS.get(credit_type, 1)
            # 同步路径：直接扣费；异常由 Harness.run_sync 调用方处理退款
            credit_service.spend(db, request.user_id, cost, credit_type, request.job_id)

        elif self._mode == "async_job" and credit_type and request.job_id:
            self._spend_with_idempotency(db, request, credit_type)
            self._update_job_status(db, request, result)

        return result

    def _spend_with_idempotency(
        self, db: Client, request: GenerationRequest, credit_type: str
    ) -> None:
        """幂等扣费：reclaim 重试时跳过已扣过的记录，防止二次扣费。"""
        cost = credit_service.COSTS.get(credit_type, 1)
        try:
            txn_check = (
                db.table("credit_transactions")
                .select("id")
                .eq("ref_id", request.job_id)
                .eq("type", credit_type)
                .limit(1)
                .execute()
            )
            if txn_check.data:
                logger.info(
                    "job %s: credits already charged (reclaim retry), skipping spend", request.job_id
                )
                return
        except Exception as chk_err:
            logger.warning("credit pre-check failed job=%s: %s", request.job_id, chk_err)

        credit_service.spend(db, request.user_id, cost, credit_type, request.job_id)

    def _update_job_status(
        self, db: Client, request: GenerationRequest, result: GenerationResult
    ) -> None:
        if result.output_id is not None:
            job_service.finish_job(db, request.job_id, result.output_id)
        else:
            from app.services.job_service import _patch
            _patch(db, request.job_id, {"status": "done"})
