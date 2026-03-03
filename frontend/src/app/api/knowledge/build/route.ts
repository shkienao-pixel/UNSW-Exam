/**
 * POST /api/knowledge/build
 * body: { course_id, allow_ai_fill, scope_set_id?, artifact_ids? }
 * Proxy → FastAPI /knowledge/build, forwarding Supabase JWT.
 *
 * Fix: added maxDuration (Vercel Pro 300 s), AbortSignal timeout (240 s),
 * and full try-catch so errors always return JSON — never hang silently.
 */

import { NextRequest, NextResponse } from 'next/server'

// Allow up to 300 s on Vercel Pro (knowledge build can take 2–4 min)
export const maxDuration = 300

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8005'

// 240 s hard limit — leaves 60 s buffer inside the 300 s maxDuration
const FETCH_TIMEOUT_MS = 240_000

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!t) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: '请求体格式错误' }, { status: 400 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(`${BACKEND}/knowledge/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    // Parse response — always return JSON to the browser
    const data = await res.json().catch(() => ({
      detail: `后端响应格式错误 (HTTP ${res.status})`,
    }))

    return NextResponse.json(data, { status: res.status })
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const detail = isAbort
      ? '知识图谱生成超时（超过 4 分钟），请减少资料数量后重试'
      : `后端连接失败：${err instanceof Error ? err.message : String(err)}`
    return NextResponse.json({ detail }, { status: 504 })
  } finally {
    clearTimeout(timer)
  }
}
