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
          content: `你是一位课程助教，擅长从课程资料中提炼学习大纲。
请用中文，以 Markdown 格式输出层级清晰的大纲：
- 用 # ## ### 表示层级
- 每个知识点简明扼要
- 按照学习逻辑排序
- 标注重要考点（用 ⭐ 标记）`,
        },
        {
          role: 'user',
          content: `请根据以下课程资料生成完整的学习大纲：\n\n${contextText}`,
        },
      ],
      max_tokens: 2500,
      temperature: 0.3,
    })

    return NextResponse.json({
      output_type: 'outline',
      content: completion.choices[0]?.message?.content || '',
      model_used: 'gpt-4o',
      artifact_count: content.artifact_count,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
