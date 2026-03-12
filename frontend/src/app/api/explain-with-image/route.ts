/**
 * POST /api/explain-with-image
 *
 * 一键生成讲解图：用户主动触发，调用 Google Imagen 4 生成辅助教学图，
 * 以 base64 data URL 返回给前端直接渲染。
 *
 * 请求体（JSON）：{ question: string, answer: string }
 * 响应体：        { image_data_url: string | null }
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildImagenPrompt, verifyCreditReady, commitCreditDeduction } from '../generate/_shared'

/**
 * Bug 5 fix:
 *  - 使用 model waterfall 策略：先尝试 imagen-3.0-generate-001（稳定可用），
 *    再尝试 imagen-4.0-ultra-generate-001（高质量但访问受限），
 *    避免单个模型不可用时整体失败。
 *  - 所有错误详细记录，便于排查。
 */

// Imagen 模型优先级：3.0 最稳定，4.0 ultra 高质量但需特殊权限
const IMAGEN_MODELS = [
  'imagen-3.0-generate-001',
  'imagen-4.0-ultra-generate-001',
]

const IMAGEN_ENDPOINT_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models'

export interface ExplainImageResponse {
  image_data_url: string | null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return NextResponse.json({ image_data_url: null, error: 'Gemini API key not configured' }, { status: 503 })
  }

  // Validate token + available balance first; deduct only after generation succeeds.
  const checkErr = await verifyCreditReady(token, 'gen_ask')
  if (checkErr) return checkErr

  try {
    const body = await req.json() as { question?: string; answer?: string }
    const { question = '', answer = '' } = body

    if (!question || !answer) {
      return NextResponse.json({ error: 'question and answer are required' }, { status: 400 })
    }

    const prompt = buildImagenPrompt(question, answer)
    const imageDataUrl = await callImagenWithFallback(prompt, geminiKey)

    if (!imageDataUrl) {
      return NextResponse.json({ image_data_url: null, error: 'Image generation failed, no credits deducted.' }, { status: 502 })
    }

    const deductErr = await commitCreditDeduction(token, 'gen_ask')
    if (deductErr) return deductErr

    return NextResponse.json({ image_data_url: imageDataUrl } satisfies ExplainImageResponse)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Image generation failed'
    console.error('[explain-with-image] all models failed:', msg)
    return NextResponse.json({ image_data_url: null, error: msg }, { status: 500 })
  }
}

// ── Imagen REST call with model waterfall ──────────────────────────────────────

async function callImagenWithFallback(prompt: string, apiKey: string): Promise<string | null> {
  for (const model of IMAGEN_MODELS) {
    try {
      const result = await callImagenModel(model, prompt, apiKey)
      if (result) return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[explain-with-image] model ${model} failed: ${msg.slice(0, 120)}`)
      // 继续尝试下一个模型
    }
  }
  return null
}

async function callImagenModel(model: string, prompt: string, apiKey: string): Promise<string | null> {
  const endpoint = `${IMAGEN_ENDPOINT_BASE}/${model}:predict?key=${apiKey}`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances:  [{ prompt }],
      parameters: { sampleCount: 1 },
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Imagen API (${model}) ${res.status}: ${errBody.slice(0, 200)}`)
  }

  const data = await res.json() as {
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>
  }

  const pred = data.predictions?.[0]
  if (!pred?.bytesBase64Encoded) return null

  const mime = pred.mimeType ?? 'image/png'
  return `data:${mime};base64,${pred.bytesBase64Encoded}`
}
