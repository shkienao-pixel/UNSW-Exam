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
import { buildImagenPrompt } from '../generate/_shared'

// Imagen 4 via Generative Language API
const IMAGEN4_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:predict'

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

  try {
    const body = await req.json() as { question?: string; answer?: string }
    const { question = '', answer = '' } = body

    if (!question || !answer) {
      return NextResponse.json({ error: 'question and answer are required' }, { status: 400 })
    }

    const prompt = buildImagenPrompt(question, answer)
    const imageDataUrl = await callImagen4(prompt, geminiKey)

    return NextResponse.json({ image_data_url: imageDataUrl } satisfies ExplainImageResponse)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Image generation failed'
    console.error('[explain-with-image]', msg)
    return NextResponse.json({ image_data_url: null })
  }
}

// ── Imagen 4 REST call ────────────────────────────────────────────────────────

async function callImagen4(prompt: string, apiKey: string): Promise<string | null> {
  const res = await fetch(`${IMAGEN4_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances:  [{ prompt }],
      parameters: { sampleCount: 1 },
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Imagen 4 API ${res.status}: ${errBody.slice(0, 200)}`)
  }

  const data = await res.json() as {
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>
  }

  const pred = data.predictions?.[0]
  if (!pred?.bytesBase64Encoded) return null

  const mime = pred.mimeType ?? 'image/png'
  return `data:${mime};base64,${pred.bytesBase64Encoded}`
}
