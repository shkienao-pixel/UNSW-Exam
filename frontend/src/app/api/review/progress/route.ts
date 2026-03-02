/**
 * GET  /api/review/progress?courseId=...
 * POST /api/review/progress  body: {course_id, updates: [...]}
 *
 * Proxy to FastAPI /review/progress, forwarding the Supabase JWT.
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8005'

function token(req: NextRequest): string | null {
  return req.headers.get('authorization')?.replace('Bearer ', '') ?? null
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const t = token(req)
  if (!t) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const courseId = req.nextUrl.searchParams.get('courseId')
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

  const res = await fetch(`${BACKEND}/review/progress?course_id=${courseId}`, {
    headers: { Authorization: `Bearer ${t}` },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t = token(req)
  if (!t) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const res = await fetch(`${BACKEND}/review/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
