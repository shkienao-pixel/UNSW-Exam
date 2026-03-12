/**
 * Shared helpers for AI generation API routes.
 * All routes: validate JWT → fetch course content from FastAPI → call OpenAI/Gemini → return result.
 */

import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ── Lazy clients ──────────────────────────────────────────────────────────────

let _openai: OpenAI | null = null
export const openai = new Proxy({} as OpenAI, {
  get(_, prop) {
    if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return (_openai as unknown as Record<string | symbol, unknown>)[prop]
  },
})

let _genai: GoogleGenerativeAI | null = null
export function getGeminiClient(): GoogleGenerativeAI {
  if (!_genai) _genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
  return _genai
}

export const BACKEND = process.env.BACKEND_URL || 'http://localhost:8005'

/**
 * 验证 Bearer token 并扣除积分。
 * - 同时解决 #3（Next API 不验证 token 真伪）和 #4（带图问答绕过积分）。
 * - 返回 null 表示成功；返回 NextResponse 表示需要直接返回给客户端（401/402/500）。
 */
async function _callCreditsApi(
  token: string,
  endpoint: '/credits/check' | '/credits/deduct',
  creditType: string,
): Promise<import('next/server').NextResponse | null> {
  const { NextResponse } = await import('next/server')
  try {
    const res = await fetch(`${BACKEND}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type_: creditType }),
    })
    if (res.ok) return null
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    const detail = (err as { detail?: string }).detail ?? `HTTP ${res.status}`
    return NextResponse.json({ error: detail }, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable, please retry.' }, { status: 503 })
  }
}

export async function verifyCreditReady(
  token: string,
  creditType: string,
): Promise<import('next/server').NextResponse | null> {
  return _callCreditsApi(token, '/credits/check', creditType)
}

export async function commitCreditDeduction(
  token: string,
  creditType: string,
): Promise<import('next/server').NextResponse | null> {
  return _callCreditsApi(token, '/credits/deduct', creditType)
}

// Backward-compatible wrapper (old behavior).
export async function verifyAndDeduct(
  token: string,
  creditType: string,
): Promise<import('next/server').NextResponse | null> {
  const verifyErr = await verifyCreditReady(token, creditType)
  if (verifyErr) return verifyErr
  return commitCreditDeduction(token, creditType)
}

// ── System Prompts ────────────────────────────────────────────────────────────

/**
 * Prompt A — Gemini 1.5 Pro 多模态 VQA（用户上传图片时）
 * 跳过 RAG 流水线，直接让 Gemini 视觉分析图片并结合学术知识回答。
 */
export const MULTIMODAL_VQA_SYSTEM = `\
You are an expert academic tutor. The student has uploaded an image (e.g., a diagram, \
equation, screenshot, or exam question) along with a text question.

Your job:
1. Carefully analyze every detail visible in the image.
2. Answer the student's question by combining what you observe in the image with \
   your academic knowledge.
3. Respond in the SAME LANGUAGE as the student's question \
   (Chinese question → Chinese answer; English question → English answer).
4. Use clear markdown formatting — numbered steps, bullet points, or ## headings \
   where appropriate.
5. If the image contains an exam question or problem, solve it step-by-step and \
   explain each step clearly.
6. Do NOT speculate about information not visible in the image.`

/**
 * Prompt B — GPT-4o-mini 过滤裁判（Stage 2：剔除无关 RAG Chunks）
 * 仅保留真正回答问题所需的文本片段，绝不新增或改写内容。
 */
export const GPT_FILTER_SYSTEM = `\
You are a relevance-filtering judge. Your sole task is to decide which document \
chunks genuinely help answer the user's query, then return only those chunks.

Rules:
• KEEP chunks that directly address the query or provide essential background.
• REMOVE chunks that are off-topic, generic filler, headers, footers, or \
  unrelated administrative content.
• Do NOT add, invent, or rewrite any information — only output verbatim kept chunks.
• Separate retained chunks with a single blank line.
• If ALL chunks are irrelevant, return exactly: NO_RELEVANT_CONTENT`

/**
 * Prompt C — Gemini 2.5 Flash 终答生成（Stage 3）
 * 严格基于过滤后的参考文本作答；无足够信息时先声明后兜底。
 */
export const GEMINI_ANSWER_SYSTEM = `\
You are an expert academic tutor helping university students prepare for exams.

Answer the student's question based STRICTLY on the reference text from course materials.

Rules:
1. Ground every claim in the provided reference text. Do not hallucinate facts.
2. Use numbered steps, bullet points, or ## headings for readability.
3. Respond in the SAME LANGUAGE as the student's question.
4. Do NOT include a Sources or References section.
5. If the reference text lacks sufficient information:
     a) Write exactly: "文档中未包含足够的详细信息来回答此问题"
     b) Then on a NEW line: "不过，根据我自身的知识库："
     c) Then provide your best answer from training knowledge.`

/**
 * Prompt D — Imagen 3 生图 prompt 构建器
 * 根据问题 + AI 回答生成适合大学教学的配图 prompt。
 */
export function buildImagenPrompt(question: string, answer: string): string {
  const hint = answer.split('\n')[0].slice(0, 120)
  return (
    `Create a clear, educational diagram that visually explains: ${question.slice(0, 180)}. ` +
    `Context: ${hint}. ` +
    'Style: clean minimal infographic, white background, labeled components, ' +
    'simple shapes and arrows. Suitable for university-level academic study.'
  )
}

// ── Complexity heuristic ──────────────────────────────────────────────────────

const VISUAL_KEYWORDS = [
  '流程', '架构', '结构', '步骤', '拓扑', '算法', '比较', '对比',
  '示意图', '数据结构', '网络', '模型', '图示', '原理图', '管道',
  '层次', '关系', '框架', '系统', '组件',
  'process', 'flow', 'workflow', 'pipeline', 'architecture', 'structure',
  'diagram', 'compare', 'comparison', 'difference', 'steps', 'procedure',
  'topology', 'algorithm', 'data structure', 'tree', 'graph', 'network',
  'model', 'hierarchy', 'layer', 'framework', 'system', 'component',
  'relationship',
]

export function isComplexTopic(question: string, answer: string): boolean {
  const combined = (question + ' ' + answer).toLowerCase()
  return VISUAL_KEYWORDS.filter(kw => combined.includes(kw)).length >= 2
}

// ── Course content fetch (summary / quiz / outline / flashcards) ──────────────

export interface ContentArtifact {
  id: number
  name: string
  type: string
  text: string
}

export interface CourseContent {
  course_id: string
  artifacts: ContentArtifact[]
  total_chars: number
  artifact_count: number
}

export async function fetchCourseContent(
  courseId: string,
  accessToken: string,
  scopeSetId?: number,
): Promise<CourseContent> {
  const url = new URL(`${BACKEND}/courses/${courseId}/content`)
  if (scopeSetId) url.searchParams.set('scope_set_id', String(scopeSetId))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Content fetch failed: ${res.status}`)
  }
  return res.json()
}

export function buildContextText(content: CourseContent): string {
  return content.artifacts
    .map(a => `=== ${a.name} (${a.type}) ===\n${a.text}`)
    .join('\n\n')
}
