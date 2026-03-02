/**
 * GET /api/knowledge/graph?courseId=...
 * Proxy → FastAPI /knowledge/graph?course_id=...
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8005'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const t = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!t) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const courseId = req.nextUrl.searchParams.get('courseId')
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

  const res = await fetch(`${BACKEND}/knowledge/graph?course_id=${courseId}`, {
    headers: { Authorization: `Bearer ${t}` },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
