import { NextRequest, NextResponse } from 'next/server'
import { fetchCourseContent, buildContextText, openai } from '../_shared'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { course_id, scope_set_id, count = 10 } = body

    const content = await fetchCourseContent(course_id, token, scope_set_id)
    if (content.artifact_count === 0) {
      return NextResponse.json({ error: '没有可用的已审核资料' }, { status: 400 })
    }

    const contextText = buildContextText(content)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `你是一位专业出题老师，根据课程资料生成高质量的多选题。
请严格返回 JSON 数组，不要有任何其他文字，格式如下：
[
  {
    "question": "题目内容",
    "options": ["A. 选项一", "B. 选项二", "C. 选项三", "D. 选项四"],
    "answer": "A",
    "explanation": "解析说明"
  }
]`,
        },
        {
          role: 'user',
          content: `根据以下课程资料，生成 ${count} 道多选题（每题4个选项，只有1个正确答案）：\n\n${contextText}`,
        },
      ],
      max_tokens: 4000,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    })

    let raw = completion.choices[0]?.message?.content || '[]'
    // Handle both array and {questions: [...]} format
    let questions
    try {
      const parsed = JSON.parse(raw)
      questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.quiz || [])
    } catch {
      questions = []
    }

    return NextResponse.json({
      output_type: 'quiz',
      content: JSON.stringify(questions),
      model_used: 'gpt-4o',
      artifact_count: content.artifact_count,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
