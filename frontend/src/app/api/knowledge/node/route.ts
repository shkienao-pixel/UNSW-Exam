/**
 * GET /api/knowledge/node?courseId=...&nodeId=...
 * Proxy → FastAPI /knowledge/node?course_id=...&node_id=...
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8005'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const t = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!t) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const courseId = req.nextUrl.searchParams.get('courseId')
  const nodeId   = req.nextUrl.searchParams.get('nodeId')
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })
  if (!nodeId)   return NextResponse.json({ error: 'nodeId required' },   { status: 400 })

  const res = await fetch(`${BACKEND}/knowledge/node?course_id=${courseId}&node_id=${nodeId}`, {
    headers: { Authorization: `Bearer ${t}` },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
