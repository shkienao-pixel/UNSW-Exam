"""互动课堂路由。

POST /classroom/generate            — 启动生成（扣积分 + 后台任务）
GET  /classroom/jobs/{job_id}       — 轮询 job 状态
GET  /classroom/{classroom_id}      — 获取课堂数据
GET  /classroom/list/{course_id}    — 列出历史课堂
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import InsufficientCreditsError
from app.services import credit_service
from app.services.classroom_service import (
    create_job,
    get_classroom,
    get_job,
    list_classrooms,
    run_classroom_generation,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class GenerateRequest(BaseModel):
    course_id: str
    artifact_ids: list[int]


@router.post("/classroom/generate")
async def start_classroom_generation(
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    user_id = current_user["id"]

    if not body.artifact_ids:
        raise HTTPException(status_code=400, detail="请选择至少一个 PDF 文件")

    # 先扣积分，失败直接抛错（前端看到 402 / InsufficientCredits）
    try:
        await asyncio.to_thread(
            credit_service.spend, db, user_id, credit_service.COSTS["gen_classroom"], "gen_classroom"
        )
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))

    job_id = create_job(user_id, body.course_id, body.artifact_ids)

    # 启动后台任务；失败时自动退款
    async def _run_with_refund():
        try:
            await run_classroom_generation(job_id, user_id, body.course_id, body.artifact_ids, db)
        except Exception:
            pass  # classroom_service 内部已记录状态为 failed
        # 如果 job 失败则退款
        job = get_job(job_id)
        if job and job.get("status") == "failed":
            try:
                await asyncio.to_thread(
                    credit_service.earn, db, user_id,
                    credit_service.COSTS["gen_classroom"], "refund", None,
                    "gen_classroom 失败退款",
                )
            except Exception as ref_err:
                logger.error("refund failed for job %s: %s", job_id, ref_err)

    asyncio.create_task(_run_with_refund())

    return {"job_id": job_id, "status": "queued", "message": "已提交，正在生成…"}


@router.get("/classroom/jobs/{job_id}")
def poll_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/classroom/list/{course_id}")
def list_course_classrooms(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> list[dict]:
    return list_classrooms(db, current_user["id"], course_id)


@router.get("/classroom/{classroom_id}")
def get_classroom_detail(
    classroom_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    classroom = get_classroom(db, classroom_id, current_user["id"])
    if not classroom:
        raise HTTPException(status_code=404, detail="classroom not found")
    return classroom
