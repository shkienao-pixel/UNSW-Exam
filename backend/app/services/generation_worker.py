"""Background generation worker for persistent job execution."""

from __future__ import annotations

import asyncio
import logging
import os
import socket
from types import SimpleNamespace
from typing import Any

from supabase import Client

from app.core.config import get_settings
from app.core.exceptions import InsufficientCreditsError
from app.core.supabase_client import get_supabase
from app.services import credit_service, exam_service, generate_service, job_service

logger = logging.getLogger(__name__)

_GEN_FN = {
    "summary":    generate_service.run_summary,
    "quiz":       generate_service.run_quiz,
    "outline":    generate_service.run_outline,
    "flashcards": generate_service.run_flashcards,
    "exam_mock":  exam_service.run_mock_generation,
}

# job_type → credit type（与 credit_service.COSTS 中的 key 对应）
_JOB_CREDIT_TYPE: dict[str, str] = {
    "summary":    "gen_summary",
    "quiz":       "gen_quiz",
    "outline":    "gen_outline",
    "flashcards": "gen_flashcards",
    "exam_mock":  "gen_exam_mock",
}


def _payload_to_body(payload: dict[str, Any]) -> SimpleNamespace:
    """Convert persisted payload JSON to the body object expected by generate_service."""
    return SimpleNamespace(
        scope_set_id=payload.get("scope_set_id"),
        artifact_ids=payload.get("artifact_ids"),
        num_questions=int(payload.get("num_questions", 10)),
        exclude_topics=list(payload.get("exclude_topics") or []),
        # exam_mock fields
        num_mcq=int(payload.get("num_mcq", 10)),
        num_short=int(payload.get("num_short", 5)),
        session_id=payload.get("session_id", ""),
    )


async def _run_job(db: Client, job: dict[str, Any], worker_id: str) -> None:
    job_id = job["id"]
    job_type = str(job.get("job_type", ""))
    user_id = str(job.get("user_id", ""))
    course_id = str(job.get("course_id", ""))
    payload = job.get("request_payload") or {}
    credit_type = _JOB_CREDIT_TYPE.get(job_type)

    if job_type not in _GEN_FN:
        await asyncio.to_thread(job_service.fail_job, db, job_id, f"Unsupported job_type: {job_type}")
        return

    credit_spent = False
    try:
        body = _payload_to_body(payload if isinstance(payload, dict) else {})

        # 在实际生成时才扣积分（不是入队时）
        # 先检查是否已扣（job 被 reclaim 重试时避免二次扣费）
        if credit_type:
            cost = credit_service.COSTS.get(credit_type, 1)
            already_charged = False
            try:
                txn_check = await asyncio.to_thread(
                    lambda: db.table("credit_transactions")
                               .select("id")
                               .eq("ref_id", job_id)
                               .eq("type", credit_type)
                               .limit(1)
                               .execute()
                )
                already_charged = bool(txn_check.data)
            except Exception as chk_err:
                logger.warning("credit pre-check failed job=%s: %s", job_id, chk_err)

            if already_charged:
                credit_spent = True
                logger.info("job %s: credits already charged (reclaim retry), skipping spend", job_id)
            else:
                try:
                    await asyncio.to_thread(
                        credit_service.spend, db, user_id, cost, credit_type, job_id
                    )
                    credit_spent = True
                except InsufficientCreditsError as e:
                    await asyncio.to_thread(
                        job_service.fail_job, db, job_id,
                        f"积分不足：当前 {e.balance} 积分，需要 {e.required} 积分"
                    )
                    return

        output = await asyncio.to_thread(_GEN_FN[job_type], db, user_id, course_id, body)
        # exam_mock returns {"id": None} — no outputs row, finish without output_id
        if output.get("id") is not None:
            await asyncio.to_thread(job_service.finish_job, db, job_id, output["id"])
        else:
            from app.services.job_service import _patch
            await asyncio.to_thread(_patch, db, job_id, {"status": "done"})
        logger.info("generation job done worker=%s job=%s output=%s", worker_id, job_id, output["id"])

    except Exception as exc:
        logger.error("generation job failed worker=%s job=%s err=%s", worker_id, job_id, exc, exc_info=True)
        # 生成失败时退款（如果已扣）
        if credit_spent and credit_type:
            cost = credit_service.COSTS.get(credit_type, 1)
            try:
                await asyncio.to_thread(
                    credit_service.earn, db, user_id, cost, "refund", job_id,
                    f"{credit_type} 生成失败退款"
                )
            except Exception as refund_err:
                logger.error("credit refund failed job=%s: %s", job_id, refund_err)
        # 不将原始异常（可能含 API key 片段）直接存入 DB，仅记录类型
        safe_msg = f"{type(exc).__name__}: 生成失败，请重试或联系管理员"
        await asyncio.to_thread(job_service.fail_job, db, job_id, safe_msg)


async def _dispatch_loop(worker_id: str) -> None:
    cfg = get_settings()
    db = get_supabase()
    inflight: set[asyncio.Task] = set()
    poll_interval = max(0.2, float(cfg.generation_worker_poll_interval))
    max_concurrency = max(1, int(cfg.generation_worker_max_concurrency))
    stale_reclaim_every = max(5.0, poll_interval * 10.0)
    last_reclaim = 0.0

    logger.info(
        "generation worker started id=%s max_concurrency=%s poll=%.2fs",
        worker_id,
        max_concurrency,
        poll_interval,
    )

    try:
        while True:
            now = asyncio.get_running_loop().time()
            if now - last_reclaim >= stale_reclaim_every:
                try:
                    reclaimed = await asyncio.to_thread(
                        job_service.reclaim_stale_processing_jobs,
                        db,
                        int(cfg.generation_job_timeout_seconds),
                    )
                    if reclaimed:
                        logger.warning("reclaimed %s stale processing jobs", reclaimed)
                except Exception as exc:
                    logger.warning("stale-job reclaim failed: %s", exc)
                last_reclaim = now

            claimed_any = False
            while len(inflight) < max_concurrency:
                try:
                    job = await asyncio.to_thread(job_service.claim_next_pending_job, db)
                except Exception as exc:
                    logger.warning("job claim failed: %s", exc)
                    break
                if not job:
                    break
                claimed_any = True
                task = asyncio.create_task(_run_job(db, job, worker_id))
                inflight.add(task)
                task.add_done_callback(inflight.discard)

            if not inflight and not claimed_any:
                await asyncio.sleep(poll_interval)
                continue

            done, _ = await asyncio.wait(inflight, timeout=poll_interval, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                try:
                    task.result()
                except Exception:
                    logger.exception("unexpected unhandled exception in generation worker task")
    except asyncio.CancelledError:
        logger.info("generation worker stopping id=%s", worker_id)
        for task in inflight:
            task.cancel()
        if inflight:
            await asyncio.gather(*inflight, return_exceptions=True)
        raise


def start_generation_worker() -> list[asyncio.Task]:
    """Start generation worker task(s) for this process."""
    cfg = get_settings()
    if not cfg.generation_worker_enabled:
        logger.info("generation worker disabled by config")
        return []
    if os.getenv("PYTEST_CURRENT_TEST"):
        logger.info("generation worker disabled under pytest")
        return []

    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    task = asyncio.create_task(_dispatch_loop(worker_id), name=f"generation-worker-{worker_id}")
    return [task]


async def stop_generation_workers(tasks: list[asyncio.Task]) -> None:
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
