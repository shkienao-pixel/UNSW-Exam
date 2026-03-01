import { NextRequest, NextResponse } from 'next/server'
import { fetchCourseContent, buildContextText, openai } from '../_shared'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { course_id, scope_set_id } = body

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
          content: `你是一位优秀的学习助手，擅长从课程资料中提炼核心知识点并生成结构化摘要。
请用中文回答，使用 Markdown 格式：
- 使用 ## 分节标题
- 重要概念用 **加粗**
- 适当使用列表归纳要点
- 摘要要全面但简洁，突出考试重点`,
        },
        {
          role: 'user',
          content: `请为以下课程资料生成一份详细的知识摘要：\n\n${contextText}`,
        },
      ],
      max_tokens: 3000,
      temperature: 0.3,
    })

    const summary = completion.choices[0]?.message?.content || ''

    return NextResponse.json({
      output_type: 'summary',
      content: summary,
      model_used: 'gpt-4o',
      artifact_count: content.artifact_count,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
