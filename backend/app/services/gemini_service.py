"""Multi-model collaborative RAG pipeline — Phase 2 refactor.

Three-stage chain for the /ask endpoint:
  Stage 1 — GPT-4o Filter   : strips irrelevant RAG chunks, compresses to dense context
  Stage 2 — Gemini Text     : generates grounded answer; explicit hallucination guard
  Stage 3 — Imagen Trigger  : optional visual aid with model waterfall (3.0 → 4.0 ultra)

Each stage degrades gracefully:
  - Stage 1 fails → raw chunks used as-is
  - Stage 2 fails → GPT-4o fallback (caller handles this)
  - Stage 3 fails → answer returned without image (no error surfaced to user)

Pydantic models define every stage's I/O contract.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  PYDANTIC I/O MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class FilterInput(BaseModel):
    query: str = Field(..., description="用户问题")
    chunks: list[dict] = Field(..., description="pgvector 检索出的原始 chunks")
    openai_key: str = Field(..., description="OpenAI API 密钥")


class FilterOutput(BaseModel):
    filtered_context: str = Field(..., description="高密度参考上下文，或空字符串（全部无关）")
    is_relevant: bool = Field(..., description="False 表示所有 chunk 均与问题无关")


class GeneratorInput(BaseModel):
    query: str = Field(..., description="用户问题")
    filtered_context: str = Field(..., description="Stage 1 清洗后的参考文本")
    gemini_key: str = Field(..., description="Google Gemini API 密钥")


class GeneratorOutput(BaseModel):
    answer: str = Field(..., description="Markdown 格式回答")
    used_fallback: bool = Field(False, description="True 表示参考资料不足，使用了内建知识库兜底")


class VisualizerInput(BaseModel):
    query: str
    answer: str
    gemini_key: str
    supabase: Optional[object] = Field(None, exclude=True)
    bucket: str = "artifacts"

    model_config = {"arbitrary_types_allowed": True}


class VisualizerOutput(BaseModel):
    image_url: Optional[str] = Field(None, description="Supabase 签名 URL，生成失败时为 None")


# ═══════════════════════════════════════════════════════════════════════════════
#  SYSTEM PROMPTS  (Phase 2 规范)
# ═══════════════════════════════════════════════════════════════════════════════

# Stage 1 — GPT-4o 粗检与清洗
GPT_FILTER_SYSTEM = """\
你是一个严谨的学术资料提取专家。你的唯一任务是判断提供的文本块中，哪些包含了回答用户问题所需的\
核心事实。提取有用的事实，去除排版字符和无关废话，整合成一段高密度的参考上下文。\
如果所有文本块都与问题完全无关，请你直接且仅输出这几个大写字母：'NO_RELEVANT_INFO'。\
绝对不要自己尝试回答。\
"""

# Stage 2 — Gemini 终答与兜底
GEMINI_ANSWER_SYSTEM = """\
你是一个专为大学生提供备考辅导的顶尖 AI 助教。请严格遵循以下规则回答：

1. 如果提供的参考资料中包含有效信息，请直接给出专业、详细的解答。
2. 使用清晰的 Markdown 格式（编号步骤、要点列表、## 标题）组织回答。
3. 使用与学生问题相同的语言回答（中文问题→中文回答，英文问题→英文回答）。
4. 不要添加"参考来源"或"References"章节，来源由系统单独注入。

【关键指令】如果参考资料的内容是 'NO_RELEVANT_INFO'，或者信息不足以完整回答问题：
   a) 在回答的第一行严格输出以下声明：
      抱歉，您上传的文档大纲范围内未包含足够信息。
   b) 另起一行，以"不过，根据我自身的知识库："为开头，利用你的内建知识储备提供准确解答。
\
"""

# ═══════════════════════════════════════════════════════════════════════════════
#  VISUAL AID HEURISTIC
# ═══════════════════════════════════════════════════════════════════════════════

_VISUAL_KEYWORDS = [
    # Chinese
    "流程", "架构", "结构", "步骤", "拓扑", "算法", "比较", "对比",
    "示意图", "数据结构", "网络", "模型", "图示", "原理图", "管道",
    "层次", "关系", "框架", "系统", "组件", "神经网络", "卷积",
    # English
    "process", "flow", "workflow", "pipeline", "architecture", "structure",
    "diagram", "compare", "comparison", "difference", "steps", "procedure",
    "topology", "algorithm", "data structure", "tree", "graph", "network",
    "model", "hierarchy", "layer", "framework", "system", "component",
    "relationship", "neural network", "convolutional",
]

_VISUAL_THRESHOLD = 2

# Imagen 模型优先级：3.0 最稳定，4.0 ultra 高质量但需特殊权限
_IMAGEN_MODELS = [
    "imagen-3.0-generate-001",
    "imagen-4.0-ultra-generate-001",
]


# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 1 — GPT-4o: filter & compress RAG chunks
# ═══════════════════════════════════════════════════════════════════════════════

def gpt_filter_chunks(
    query: str,
    chunks: list[dict],
    openai_key: str,
) -> str:
    """Stage 1: GPT-4o 粗检并压缩 RAG chunks，返回高密度参考上下文。

    Args:
        query:      用户问题。
        chunks:     来自 search_chunks() 的原始 chunk 列表。
        openai_key: OpenAI API 密钥。

    Returns:
        清洗后的参考文本（传给 Stage 2），或空字符串（全部不相关/失败）。
    """
    if not chunks:
        return ""

    chunk_text = "\n\n---\n\n".join(
        f"[来源：{c.get('file_name', 'unknown')} — 片段 {c.get('chunk_index', 0) + 1}]\n"
        f"{c['content']}"
        for c in chunks
    )

    user_msg = (
        f"用户问题：\n{query}\n\n"
        f"===\n需要评估的文档片段：\n\n{chunk_text}"
    )

    try:
        from openai import OpenAI
        client = OpenAI(api_key=openai_key)
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": GPT_FILTER_SYSTEM},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.0,
            max_tokens=4096,
        )
        result = (resp.choices[0].message.content or "").strip()
        if result == "NO_RELEVANT_INFO":
            logger.debug("GPT judge: all chunks irrelevant for query=%r", query[:80])
            return ""
        return result
    except Exception as exc:
        logger.warning("GPT filter failed — using raw chunks as fallback: %s", exc)
        return chunk_text  # graceful: pass all chunks through


# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 2 — Gemini Text: generate the final answer
# ═══════════════════════════════════════════════════════════════════════════════

def gemini_generate_answer(
    query: str,
    filtered_context: str,
    gemini_key: str,
) -> str:
    """Stage 2: Gemini 生成最终回答，内置防幻觉 + 兜底协议。

    Args:
        query:            用户问题。
        filtered_context: Stage 1 清洗后的参考文本。
        gemini_key:       Google Gemini API 密钥。

    Returns:
        Markdown 格式回答，失败时返回空字符串（调用方降级到 GPT）。
    """
    if filtered_context.strip():
        user_content = (
            f"参考资料（来自课程材料）：\n\n{filtered_context}"
            f"\n\n---\n\n学生问题：{query}"
        )
    else:
        # 无相关文档 → 触发 GEMINI_ANSWER_SYSTEM 中的兜底协议
        user_content = (
            f"学生问题：{query}\n\n"
            "(参考资料：NO_RELEVANT_INFO — 请执行系统指令中的兜底协议)"
        )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        resp = client.models.generate_content(
            model="gemini-3.1-pro-preview",
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=GEMINI_ANSWER_SYSTEM,
                temperature=0.4,
                max_output_tokens=8192,
            ),
        )
        return (resp.text or "").strip()
    except Exception as exc:
        logger.warning("Gemini text generation failed: %s", exc)
        return ""


def gemini_generate_answer_stream(
    query: str,
    filtered_context: str,
    gemini_key: str,
):
    """Stage 2 (流式版本): Gemini 流式生成回答，逐块 yield 文本。

    失败时静默结束（调用方降级到 GPT 整块输出）。
    """
    if filtered_context.strip():
        user_content = (
            f"参考资料（来自课程材料）：\n\n{filtered_context}"
            f"\n\n---\n\n学生问题：{query}"
        )
    else:
        user_content = (
            f"学生问题：{query}\n\n"
            "(参考资料：NO_RELEVANT_INFO — 请执行系统指令中的兜底协议)"
        )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        response = client.models.generate_content_stream(
            model="gemini-3.1-pro-preview",
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=GEMINI_ANSWER_SYSTEM,
                temperature=0.4,
                max_output_tokens=8192,
            ),
        )
        for chunk in response:
            text = getattr(chunk, "text", None) or ""
            if text:
                yield text
    except Exception as exc:
        logger.warning("Gemini stream generation failed: %s", exc)
        return


# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 3a — Should we generate a visual aid?
# ═══════════════════════════════════════════════════════════════════════════════

def should_generate_image(query: str, answer: str) -> bool:
    """启发式判断：问题/回答是否有强视觉需求（架构图、流程图、神经网络结构等）。

    Returns True 当命中 ≥2 个视觉关键词。
    """
    combined = (query + " " + answer).lower()
    hits = sum(1 for kw in _VISUAL_KEYWORDS if kw in combined)
    return hits >= _VISUAL_THRESHOLD


# ═══════════════════════════════════════════════════════════════════════════════
#  STAGE 3b — Imagen: generate and store a visual aid
# ═══════════════════════════════════════════════════════════════════════════════

def gemini_generate_image(
    query: str,
    answer: str,
    gemini_key: str,
    supabase=None,
    bucket: str = "artifacts",
) -> Optional[str]:
    """Stage 3: Imagen 生成辅助图解并上传到 Supabase Storage。

    Bug 5 fix: 使用 model waterfall — 先 3.0（稳定），再 4.0 ultra（高质量）。

    Args:
        query:      原始用户问题。
        answer:     Stage 2 生成的回答。
        gemini_key: Google Gemini API 密钥（需 Imagen 权限）。
        supabase:   Supabase client，用于上传图片。
        bucket:     Storage bucket 名称。

    Returns:
        签名 URL，或 None（生成/上传失败时优雅降级）。
    """
    image_prompt = _build_image_prompt(query, answer)
    image_bytes = _call_imagen_with_fallback(image_prompt, gemini_key)
    if not image_bytes:
        return None
    return _upload_to_supabase(image_bytes, supabase, bucket)


def _build_image_prompt(query: str, answer: str) -> str:
    """构建 Imagen 提示词，突出学术教学风格。"""
    hint = answer.split("\n")[0][:120] if answer else ""
    return (
        f"Create a clear, educational diagram that visually explains: {query[:180]}. "
        f"Context: {hint}. "
        "Style: clean minimal infographic, white background, labeled components, "
        "use simple shapes and arrows. Suitable for university-level academic study."
    )


def _call_imagen_with_fallback(prompt: str, gemini_key: str) -> Optional[bytes]:
    """尝试 Imagen model waterfall，返回 PNG 字节或 None。"""
    for model in _IMAGEN_MODELS:
        result = _call_imagen(model, prompt, gemini_key)
        if result is not None:
            return result
        logger.debug("Imagen model %s failed, trying next…", model)
    return None


def _call_imagen(model: str, prompt: str, gemini_key: str) -> Optional[bytes]:
    """调用单个 Imagen 模型，返回 PNG 字节或 None。"""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        response = client.models.generate_images(
            model=model,
            prompt=prompt,
            config=types.GenerateImagesConfig(number_of_images=1),
        )
        if response.generated_images:
            return response.generated_images[0].image.image_bytes
        return None
    except Exception as exc:
        logger.warning("Imagen model %s failed: %s", model, exc)
        return None


def _upload_to_supabase(
    image_bytes: bytes,
    supabase,
    bucket: str,
) -> Optional[str]:
    """上传 PNG 到 Supabase Storage，返回 10 年有效签名 URL。"""
    if supabase is None:
        return None
    try:
        file_path = f"generated/{uuid.uuid4().hex}.png"
        supabase.storage.from_(bucket).upload(
            path=file_path,
            file=image_bytes,
            file_options={"content-type": "image/png"},
        )
        url_resp = supabase.storage.from_(bucket).create_signed_url(
            path=file_path,
            expires_in=315_360_000,  # 10 years
        )
        # supabase-py SDK key varies by version: signedURL (v1) / signedUrl (v2) / signed_url
        return (
            url_resp.get("signedURL")
            or url_resp.get("signedUrl")
            or url_resp.get("signed_url")
            or ""
        ) or None
    except Exception as exc:
        logger.warning("Failed to upload generated image to Supabase Storage: %s", exc)
        return None
