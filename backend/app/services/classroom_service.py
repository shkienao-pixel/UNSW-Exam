"""互动课堂生成服务。

流程：
  1. 取 artifact 文本（复用 content.py 的逻辑）
  2. 调 Gemini（或 OpenAI 兜底）生成结构化 JSON
  3. 存入 Supabase classrooms 表
  4. job 状态存进程内存 dict

Job 状态字段：
  status: queued | running | succeeded | failed
  progress: 0-100
  message: 当前步骤描述
  classroom_id: 完成后填入
  error: 失败原因
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from typing import Any

from supabase import Client

from app.services.artifact_service import download_artifact_bytes
from app.services.course_service import list_artifacts_by_ids
from app.services.text_extractor import extract_text
from app.services.llm_key_service import get_api_key
from app.core.config import get_settings
settings = get_settings()

logger = logging.getLogger(__name__)

# ── 进程内 job 存储 ────────────────────────────────────────────────────────────
_jobs: dict[str, dict] = {}
_lock = asyncio.Lock()


def _new_job(job_id: str) -> dict:
    job = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "message": "等待开始…",
        "classroom_id": None,
        "error": None,
        "created_at": time.time(),
    }
    _jobs[job_id] = job
    return job


async def _set(job_id: str, **kwargs: Any) -> None:
    async with _lock:
        _jobs[job_id].update(kwargs)


def get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)


# ── 文本提取 ──────────────────────────────────────────────────────────────────

def _fetch_text(db: Client, user_id: str, course_id: str, artifact_ids: list[int]) -> str:
    arts = list_artifacts_by_ids(db, user_id, course_id, artifact_ids)
    logger.info("classroom _fetch_text: requested=%s found=%s", artifact_ids, [a["id"] for a in arts])
    arts = [a for a in arts if a.get("status") == "approved"]
    logger.info("classroom _fetch_text: approved=%s", [a["id"] for a in arts])
    parts: list[str] = []
    for art in arts:
        file_type = art.get("file_type", "pdf")
        storage_path = art.get("storage_path")
        logger.info("classroom extract: id=%s file_type=%s storage_path=%s", art["id"], file_type, storage_path)
        if file_type == "url":
            parts.append(f"URL: {art.get('storage_url', '')}")
        elif storage_path:
            try:
                raw = download_artifact_bytes(db, storage_path)
                text = extract_text(file_type, raw, art["file_name"])
                logger.info("classroom extract: id=%s text_len=%s", art["id"], len(text))
                parts.append(text)
            except Exception as e:
                logger.warning("classroom extract_text failed id=%s: %s", art["id"], e)
        else:
            logger.warning("classroom extract: id=%s has no storage_path", art["id"])
    result = "\n\n".join(parts)[:18000]
    logger.info("classroom _fetch_text total chars=%s", len(result))
    return result


# ── LLM 调用 ──────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
你是一个专业的教育课件设计师。根据用户提供的课程材料，生成一个 JSON 格式的互动课堂。

要求：
- 生成 4-6 个 slide 场景（讲解幻灯片），每个 slide 包含 heading 和 3-5 个 bullets 要点
- 生成 1-2 个 quiz 场景（多选题测验），每个 quiz 包含 3-5 道单选题
- 内容要准确、精炼，聚焦核心知识点
- 所有文本使用中文
- 严格按照下方 JSON 格式输出，不要包含任何其他文字

输出格式（严格 JSON，不要 markdown 代码块）：
{
  "title": "课程主题名称",
  "scenes": [
    {
      "id": "s1",
      "type": "slide",
      "title": "场景标题",
      "order": 1,
      "content": {
        "heading": "幻灯片大标题",
        "subheading": "副标题（可选，没有则省略此字段）",
        "bullets": ["要点1", "要点2", "要点3"]
      }
    },
    {
      "id": "s2",
      "type": "quiz",
      "title": "测验标题",
      "order": 2,
      "content": {
        "questions": [
          {
            "id": "q1",
            "type": "single",
            "question": "题目文本",
            "options": [
              {"label": "选项A文本", "value": "A"},
              {"label": "选项B文本", "value": "B"},
              {"label": "选项C文本", "value": "C"},
              {"label": "选项D文本", "value": "D"}
            ],
            "answer": ["A"],
            "analysis": "解析说明"
          }
        ]
      }
    }
  ]
}
"""


def _extract_json(text: str) -> dict:
    """从 LLM 输出中提取 JSON。"""
    # 去掉 markdown 代码块
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = text.replace("```", "").strip()
    # 找第一个 { … } 块
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON found in response")
    return json.loads(text[start:end + 1])


def _call_gemini(content: str, gemini_key: str) -> dict:
    from google import genai
    from google.genai import types as gtypes

    client = genai.Client(api_key=gemini_key)
    user_msg = f"以下是课程材料，请据此生成互动课堂：\n\n{content}"
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        config=gtypes.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            temperature=0.4,
            max_output_tokens=8192,
        ),
        contents=user_msg,
    )
    return _extract_json(response.text)


def _call_openai(content: str, openai_key: str) -> dict:
    import openai

    client = openai.OpenAI(api_key=openai_key)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"以下是课程材料，请据此生成互动课堂：\n\n{content}"},
        ],
        temperature=0.4,
        max_tokens=8192,
    )
    return _extract_json(resp.choices[0].message.content or "")


def _generate_with_llm(db: Client, content: str) -> dict:
    """优先用 Gemini，失败则 fallback 到 OpenAI。"""
    # 尝试 Gemini
    try:
        gemini_key = get_api_key("gemini", db) or settings.gemini_api_key
        if gemini_key:
            return _call_gemini(content, gemini_key)
    except Exception as e:
        logger.warning("Gemini classroom gen failed, falling back to OpenAI: %s", e)

    # Fallback: OpenAI
    openai_key = get_api_key("openai", db) or settings.openai_api_key
    if not openai_key:
        raise RuntimeError("没有可用的 AI 密钥（Gemini / OpenAI）")
    return _call_openai(content, openai_key)


# ── 主生成流程 ────────────────────────────────────────────────────────────────

async def run_classroom_generation(
    job_id: str,
    user_id: str,
    course_id: str,
    artifact_ids: list[int],
    db: Client,
) -> None:
    """后台 asyncio task：生成并存储互动课堂，更新 job 状态。"""
    try:
        await _set(job_id, status="running", progress=5, message="提取 PDF 内容…")

        # 1. 提取文本（放线程池，避免阻塞事件循环）
        text = await asyncio.to_thread(_fetch_text, db, user_id, course_id, artifact_ids)
        if not text.strip():
            raise ValueError("所选文件没有可提取的文本内容")

        await _set(job_id, progress=25, message="AI 生成课堂场景中…")

        # 2. 调用 LLM
        classroom_data = await asyncio.to_thread(_generate_with_llm, db, text)

        await _set(job_id, progress=80, message="保存到数据库…")

        # 3. 存入 Supabase
        classroom_id = str(uuid.uuid4())
        scenes = classroom_data.get("scenes", [])
        title = classroom_data.get("title", "互动课堂")

        def _save():
            db.table("classrooms").insert({
                "id": classroom_id,
                "user_id": user_id,
                "course_id": course_id,
                "title": title,
                "scenes": scenes,
                "artifact_ids": artifact_ids,
            }).execute()

        await asyncio.to_thread(_save)

        await _set(
            job_id,
            status="succeeded",
            progress=100,
            message="生成完成",
            classroom_id=classroom_id,
        )

    except Exception as e:
        logger.error("classroom generation failed job=%s: %s", job_id, e)
        await _set(job_id, status="failed", progress=0, message="生成失败", error=str(e))


def create_job(user_id: str, course_id: str, artifact_ids: list[int]) -> str:
    job_id = str(uuid.uuid4())[:10]
    _new_job(job_id)
    return job_id


def get_classroom(db: Client, classroom_id: str, user_id: str) -> dict | None:
    res = (
        db.table("classrooms")
        .select("*")
        .eq("id", classroom_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def list_classrooms(db: Client, user_id: str, course_id: str, limit: int = 10) -> list[dict]:
    res = (
        db.table("classrooms")
        .select("id, title, created_at, artifact_ids")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data
