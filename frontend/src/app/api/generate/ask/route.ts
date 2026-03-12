/**
 * POST /api/generate/ask
 *
 * 多模态 Ask 路由：统一入口，根据是否携带图片分两条路径：
 *
 *   有图片 → Gemini 1.5 Pro VQA（跳过 RAG）
 *   无图片 → 转发至 FastAPI 后端 4 阶段 RAG 流水线
 *            (pgvector 检索 → GPT 过滤 → Gemini 终答 → 可选 Imagen3 配图)
 *
 * 请求格式（两种均支持）：
 *   multipart/form-data：query_text, course_id, scope_set_id?, image_file?
 *   application/json：   question, course_id, scope_set_id?
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getGeminiClient,
  MULTIMODAL_VQA_SYSTEM,
  BACKEND,
  verifyCreditReady,
  commitCreditDeduction,
} from '../_shared'

export interface AskResponse {
  question: string
  answer: string
  sources: Array<{ artifact_id: number; file_name: string; storage_url: string }>
  image_url: string | null
  model_used: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const ct = req.headers.get('content-type') ?? ''

    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData()
      const queryText   = (fd.get('query_text')   as string | null) ?? ''
      const courseId    = (fd.get('course_id')     as string | null) ?? ''
      const scopeSetId  = fd.get('scope_set_id')
      const contextMode = (fd.get('context_mode')  as string | null) ?? 'all'
      const imageFile   = fd.get('image_file') as File | null

      if (!queryText) return NextResponse.json({ error: 'query_text is required' }, { status: 400 })
      if (!courseId)  return NextResponse.json({ error: 'course_id is required' },  { status: 400 })

      if (imageFile && imageFile.size > 0) {
        // 1) validate token + balance, 2) generate, 3) deduct only after success
        const checkErr = await verifyCreditReady(token, 'gen_ask')
        if (checkErr) return checkErr

        const payload = await handleVQA(queryText, imageFile)

        const deductErr = await commitCreditDeduction(token, 'gen_ask')
        if (deductErr) return deductErr

        return NextResponse.json(payload)
      }

      return forwardToFastAPI(
        courseId, queryText,
        scopeSetId ? Number(scopeSetId) : undefined,
        token,
        contextMode,
      )
    }

    // JSON body — text-only path
    const body = await req.json()
    const { question, course_id, scope_set_id, context_mode } = body as {
      question: string; course_id: string; scope_set_id?: number; context_mode?: string
    }
    if (!question)  return NextResponse.json({ error: 'question is required' },   { status: 400 })
    if (!course_id) return NextResponse.json({ error: 'course_id is required' },  { status: 400 })

    return forwardToFastAPI(course_id, question, scope_set_id, token, context_mode ?? 'all')

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ask failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── Path A: Gemini 1.5 Pro 多模态 VQA ────────────────────────────────────────

async function handleVQA(query: string, imageFile: File): Promise<AskResponse> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    throw new Error('Gemini API key not configured')
  }

  const mimeType = imageFile.type || 'image/jpeg'
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
  if (!allowedTypes.includes(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`)
  }

  const imageBytes  = await imageFile.arrayBuffer()
  const base64Image = Buffer.from(imageBytes).toString('base64')

  const genai = getGeminiClient()
  const model = genai.getGenerativeModel({ model: 'gemini-2.5-pro' })

  const result = await model.generateContent([
    { inlineData: { data: base64Image, mimeType: mimeType as Parameters<typeof model.generateContent>[0] extends Array<infer Item> ? Item extends { inlineData: { mimeType: infer M } } ? M : never : never } },
    `${MULTIMODAL_VQA_SYSTEM}\n\nStudent question: ${query}`,
  ])

  const answer = result.response.text()
  if (!answer?.trim()) {
    throw new Error('Empty response from vision model')
  }

  return {
    question:   query,
    answer,
    sources:    [],
    image_url:  null,
    model_used: 'gemini-2.5-pro',
  } satisfies AskResponse
}

// ── Path B: 转发至 FastAPI RAG 流水线 ────────────────────────────────────────

async function forwardToFastAPI(
  courseId: string,
  question: string,
  scopeSetId: number | undefined,
  token: string,
  contextMode: string = 'all',
): Promise<NextResponse> {
  const res = await fetch(`${BACKEND}/courses/${courseId}/generate/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, scope_set_id: scopeSetId, context_mode: contextMode }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as Record<string, string>).detail || `Backend ask failed: ${res.status}`
    return NextResponse.json({ error: msg }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
