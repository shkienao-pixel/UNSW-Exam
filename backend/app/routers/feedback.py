"""User feedback endpoints.

User-facing:
  POST /feedback                   — submit feedback (requires auth)

Admin-only:
  GET  /admin/feedback             — list all feedback, newest first
  GET  /admin/feedback/ai-summary  — AI triage report via DeepSeek
  PATCH /admin/feedback/{id}       — update status (pending → in_progress → resolved)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from supabase import Client

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    content:  str = Field(min_length=1, max_length=2000)
    page_url: str = Field(min_length=1, max_length=500)


class FeedbackStatusUpdate(BaseModel):
    status: str = Field(pattern=r"^(pending|in_progress|resolved)$")


# ── Admin auth helper ──────────────────────────────────────────────────────────

def _require_admin(x_admin_secret: str | None = Header(default=None)) -> None:
    if not x_admin_secret or x_admin_secret not in get_settings().admin_secrets_set:
        raise HTTPException(status_code=403, detail="Forbidden")


# ── User endpoint ──────────────────────────────────────────────────────────────

@router.post("/feedback", status_code=201)
def submit_feedback(
    body: FeedbackCreate,
    current_user: dict = Depends(get_current_user),
    supabase: Client   = Depends(get_db),
) -> dict[str, Any]:
    """Submit feedback from any page. page_url is captured client-side."""
    resp = (
        supabase.table("user_feedback")
        .insert({
            "user_id":  current_user["id"],
            "content":  body.content,
            "page_url": body.page_url,
        })
        .execute()
    )
    row = (resp.data or [{}])[0]
    return {"ok": True, "id": row.get("id")}


# ── Admin endpoints ────────────────────────────────────────────────────────────

@router.get("/admin/feedback")
def list_feedback(
    status: str | None    = None,
    _: None               = Depends(_require_admin),
    supabase: Client      = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all feedback, newest first. Optional ?status= filter."""
    q = (
        supabase.table("user_feedback")
        .select("id, user_id, content, page_url, status, created_at")
        .order("created_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    return q.execute().data or []


_AI_SYSTEM_PROMPT = """\
你是一个资深的 AI 产品经理和全栈架构师。请分析以下来自用户的系统反馈列表（JSON 数组，每项含 content 内容和 page_url 来源页面）。

请按以下 Markdown 格式输出总结报告：

## 🔴 紧急 Bug（Crash / 核心逻辑错误）
归纳同类问题，指出可能出错的路由（page_url），并给出后端或前端的排查思路。

## 🟡 体验与数据问题（幻觉 / UI 错位 / 翻译失效）
归纳 RAG 数据未清洗或样式问题，建议改动方向。

## 🟢 新需求与建议
提取用户合理的新增功能请求，注明来源页面。

## 💡 今日行动指南（Action Items）
总结今天开发者最应该优先修改的 3 个代码模块或 Prompt 文件，格式为有序列表。

如果没有发现对应类别的问题，该节写「无」即可。请保持简洁，每节不超过 200 字。\
"""


@router.get("/admin/feedback/ai-summary")
def ai_feedback_summary(
    _: None          = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Call DeepSeek to triage pending feedback and return a Markdown PM report."""
    settings = get_settings()

    # ── Fetch pending (or recent 24-h) feedback ────────────────────────────────
    rows = (
        supabase.table("user_feedback")
        .select("content, page_url, created_at")
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    ).data or []

    if not rows:
        return {
            "summary": "✅ 当前没有待处理的反馈记录，无需分析。",
            "feedback_count": 0,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }

    # ── Resolve DeepSeek API key (DB priority → env fallback) ─────────────────
    try:
        from app.services.llm_key_service import get_api_key
        ds_key = get_api_key("deepseek", supabase) or settings.deepseek_api_key
    except Exception:
        ds_key = settings.deepseek_api_key

    if not ds_key:
        raise HTTPException(
            status_code=503,
            detail="DeepSeek API key not configured. Set DEEPSEEK_API_KEY in .env or add it via Admin → API Keys.",
        )

    # ── Call DeepSeek (OpenAI-compatible SDK) ─────────────────────────────────
    from openai import OpenAI
    client = OpenAI(api_key=ds_key, base_url=settings.deepseek_base_url)

    user_content = json.dumps(
        [{"content": r["content"], "page_url": r["page_url"]} for r in rows],
        ensure_ascii=False,
        indent=2,
    )

    resp = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": _AI_SYSTEM_PROMPT},
            {"role": "user",   "content": f"以下是 {len(rows)} 条待处理用户反馈：\n\n{user_content}"},
        ],
        temperature=0.3,
        max_tokens=2000,
    )

    summary = resp.choices[0].message.content or "（DeepSeek 返回空内容）"

    return {
        "summary": summary,
        "feedback_count": len(rows),
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }


@router.patch("/admin/feedback/{feedback_id}")
def update_feedback_status(
    feedback_id: str,
    body: FeedbackStatusUpdate,
    _: None          = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Update feedback status. Returns updated row."""
    (
        supabase.table("user_feedback")
        .update({"status": body.status})
        .eq("id", feedback_id)
        .execute()
    )
    rows = (
        supabase.table("user_feedback")
        .select("*")
        .eq("id", feedback_id)
        .execute()
    ).data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"ok": True, **rows[0]}
