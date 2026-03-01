import { NextRequest, NextResponse } from 'next/server'
import { fetchCourseContent, buildContextText, openai } from '../_shared'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { course_id, scope_set_id, count = 15 } = body

    // Get user from Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const content = await fetchCourseContent(course_id, token, scope_set_id)
    if (content.artifact_count === 0) {
      return NextResponse.json({ error: '没有可用的已审核资料' }, { status: 400 })
    }

    const contextText = buildContextText(content)
    const deckId = `${course_id}_${scope_set_id || 'all'}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `你是一位出色的闪卡制作助手。根据课程资料生成闪卡，包含知识卡和选择题两种类型。
严格返回 JSON 数组，格式：
[
  {
    "card_type": "knowledge",
    "front": { "text": "概念或问题" },
    "back": { "text": "解释或答案" }
  },
  {
    "card_type": "mcq",
    "front": { "question": "题目" },
    "back": {
      "options": ["A. 选项", "B. 选项", "C. 选项", "D. 选项"],
      "answer": "A",
      "explanation": "解析"
    }
  }
]`,
        },
        {
          role: 'user',
          content: `根据以下资料生成 ${count} 张闪卡（混合知识卡和选择题）：\n\n${contextText}`,
        },
      ],
      max_tokens: 4000,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    })

    let cards: any[] = []
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content || '[]')
      cards = Array.isArray(parsed) ? parsed : (parsed.cards || parsed.flashcards || [])
    } catch { cards = [] }

    // Save to Supabase flashcards table
    const now = new Date().toISOString()
    const rows = cards.map((c: any) => ({
      id: randomUUID(),
      user_id: user.id,
      course_id,
      deck_id: deckId,
      card_type: c.card_type || 'knowledge',
      front: c.front || {},
      back: c.back || {},
      scope: { scope_set_id: scope_set_id || null },
      stats: { reviews: 0, correct: 0 },
      created_at: now,
      updated_at: now,
    }))

    if (rows.length > 0) {
      // Use service role via backend to insert (RLS would block anon for insert)
      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      await adminSupabase.from('flashcards').insert(rows)
    }

    return NextResponse.json({
      output_type: 'flashcards',
      deck_id: deckId,
      count: rows.length,
      model_used: 'gpt-4o',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
