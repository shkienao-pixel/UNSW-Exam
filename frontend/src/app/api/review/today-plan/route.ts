/**
 * POST /api/review/today-plan
 * body: {course_id, outline_nodes, budget_minutes?, allow_spacing?}
 *
 * Proxy to FastAPI /review/today_plan, forwarding the Supabase JWT.
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8005'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!t) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const res = await fetch(`${BACKEND}/review/today_plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
