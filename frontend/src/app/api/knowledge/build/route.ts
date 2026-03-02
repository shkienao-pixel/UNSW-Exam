/**
 * POST /api/knowledge/build
 * body: { course_id, allow_ai_fill, scope_set_id?, artifact_ids? }
 * Proxy → FastAPI /knowledge/build, forwarding Supabase JWT.
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8005'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!t) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const res = await fetch(`${BACKEND}/knowledge/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
