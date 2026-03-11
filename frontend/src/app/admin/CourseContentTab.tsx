'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, EyeOff, FileText, ListTree } from 'lucide-react'
import { Course, adminReq, Spinner, ErrorBox } from './_shared'
import ReactMarkdown from 'react-markdown'

type ContentType = 'summary' | 'outline'
type ContentStatus = 'not_generated' | 'draft' | 'published' | 'hidden'
type ContentFormat = 'markdown' | 'html' | 'json'

interface CourseContent {
  id?: number
  status: ContentStatus
  content_json: Record<string, unknown>
  updated_at: string | null
}

const STATUS_LABELS: Record<ContentStatus, string> = {
  not_generated: '未生成',
  draft: '草稿',
  published: '已发布',
  hidden: '已下架',
}
const STATUS_COLORS: Record<ContentStatus, string> = {
  not_generated: '#555',
  draft: '#FFD700',
  published: '#4CAF50',
  hidden: '#FF6666',
}

const FORMAT_LABELS: Record<ContentFormat, string> = {
  markdown: 'Markdown',
  html: 'HTML',
  json: 'JSON',
}
const FORMAT_COLORS: Record<ContentFormat, string> = {
  markdown: '#63B3ED',
  html: '#F6AD55',
  json: '#A78BFA',
}

/** 从 content_json 中提取 { format, content } */
function extractContent(json: Record<string, unknown>): { format: ContentFormat; content: string } {
  if (json.format && json.content) {
    return { format: json.format as ContentFormat, content: json.content as string }
  }
  if (json.markdown) return { format: 'markdown', content: json.markdown as string }
  return { format: 'markdown', content: '' }
}

/** 自动检测粘贴内容的格式 */
function detectFormat(text: string): ContentFormat {
  const t = text.trim()
  if (!t) return 'markdown'
  try { JSON.parse(t); return 'json' } catch {}
  if (/<[a-zA-Z][^>]*>/i.test(t)) return 'html'
  return 'markdown'
}

/** JSON 格式内容预览 */
function JsonPreview({ content }: { content: string }) {
  let pretty = content
  try {
    pretty = JSON.stringify(JSON.parse(content), null, 2)
  } catch {}
  return (
    <pre className="w-full rounded-lg p-4 text-xs overflow-auto"
      style={{
        background: 'rgba(0,0,0,0.3)',
        color: '#A78BFA',
        border: '1px solid rgba(167,139,250,0.15)',
        minHeight: 300,
        maxHeight: 600,
      }}>
      {pretty}
    </pre>
  )
}

/** HTML 格式内容预览（iframe 隔离） */
function HtmlPreview({ content }: { content: string }) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <style>body{font-family:sans-serif;background:#111;color:#ccc;padding:16px;font-size:13px;line-height:1.6}
    h1,h2,h3{color:#FFD700}a{color:#63B3ED}hr{border-color:#333}</style>
    </head><body>${content}</body></html>`
  return (
    <iframe
      srcDoc={html}
      title="html-preview"
      className="w-full rounded-lg"
      style={{ border: '1px solid rgba(255,255,255,0.08)', minHeight: 400, maxHeight: 600, background: '#111' }}
      sandbox="allow-same-origin"
    />
  )
}

function ContentCard({
  secret, course, contentType, icon, label, creditCost,
}: {
  secret: string
  course: Course
  contentType: ContentType
  icon: React.ReactNode
  label: string
  creditCost: number
}) {
  const [data, setData] = useState<CourseContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [detectedFormat, setDetectedFormat] = useState<ContentFormat>('markdown')
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminReq(secret, `/courses/${course.id}/course-content/${contentType}/admin`)
      setData(res as CourseContent)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [secret, course.id, contentType])

  useEffect(() => { load() }, [load])

  function openEditor() {
    const { content } = extractContent(data?.content_json ?? {})
    const fmt = content ? detectFormat(content) : 'markdown'
    setEditContent(content)
    setDetectedFormat(fmt)
    setPreview(false)
    setEditing(prev => !prev)
  }

  function handleContentChange(text: string) {
    setEditContent(text)
    setDetectedFormat(detectFormat(text))
  }

  async function changeStatus(status: string) {
    try {
      await adminReq(secret, `/courses/${course.id}/course-content/${contentType}/admin`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      showToast(status === 'published' ? '已发布' : '已更新')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function saveEdit() {
    // 统一存储格式：{ format, content }；markdown 额外保留 markdown 键以兼容旧逻辑
    const fmt = detectFormat(editContent)
    const content_json: Record<string, unknown> = { format: fmt, content: editContent }
    if (fmt === 'markdown') content_json.markdown = editContent
    try {
      await adminReq(secret, `/courses/${course.id}/course-content/${contentType}/admin`, {
        method: 'PUT',
        body: JSON.stringify({ content_json }),
      })
      setEditing(false)
      showToast('已保存')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const status = (data?.status ?? 'not_generated') as ContentStatus

  return (
    <div className="glass rounded-xl p-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-white">{label}</span>
          <span className="text-xs px-2 py-0.5 rounded"
            style={{ background: `${STATUS_COLORS[status]}18`, color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}40` }}>
            {STATUS_LABELS[status]}
          </span>
          <span className="text-xs" style={{ color: '#555' }}>{creditCost} ✦ 解锁</span>
        </div>
        {loading && <Spinner />}
        {toast && <span className="text-xs" style={{ color: '#4CAF50' }}>{toast}</span>}
      </div>

      {error && <ErrorBox msg={error} />}

      {data?.updated_at && (
        <p className="text-xs mb-3" style={{ color: '#555' }}>
          最后更新：{new Date(data.updated_at).toLocaleString('zh-CN')}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {/* 粘贴/编辑 — 始终可用 */}
        <button
          onClick={openEditor}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: 'rgba(99,179,237,0.12)', color: '#63B3ED', border: '1px solid rgba(99,179,237,0.25)' }}>
          ✎ {editing ? '取消' : '粘贴 / 编辑内容'}
        </button>

        {status !== 'not_generated' && (
          <>
            {status !== 'published' && (
              <button onClick={() => changeStatus('published')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(76,175,80,0.12)', color: '#4CAF50', border: '1px solid rgba(76,175,80,0.25)' }}>
                <CheckCircle size={12} /> 发布
              </button>
            )}
            {status === 'published' && (
              <button onClick={() => changeStatus('hidden')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(255,100,100,0.12)', color: '#FF6666', border: '1px solid rgba(255,100,100,0.25)' }}>
                <EyeOff size={12} /> 下架
              </button>
            )}
            {status === 'hidden' && (
              <button onClick={() => changeStatus('published')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(76,175,80,0.12)', color: '#4CAF50', border: '1px solid rgba(76,175,80,0.25)' }}>
                <CheckCircle size={12} /> 重新发布
              </button>
            )}
          </>
        )}
      </div>

      {editing && (
        <div className="space-y-2">
          {/* 工具栏：编辑/预览 + 格式徽章 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreview(false)}
              className="px-3 py-1 rounded text-xs"
              style={{
                background: !preview ? 'rgba(255,215,0,0.15)' : 'transparent',
                color: !preview ? '#FFD700' : '#666',
                border: `1px solid ${!preview ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              编辑
            </button>
            <button
              onClick={() => setPreview(true)}
              className="px-3 py-1 rounded text-xs"
              style={{
                background: preview ? 'rgba(255,215,0,0.15)' : 'transparent',
                color: preview ? '#FFD700' : '#666',
                border: `1px solid ${preview ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              预览
            </button>
            {/* 自动识别格式标签 */}
            {editContent && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded font-mono"
                style={{
                  background: `${FORMAT_COLORS[detectedFormat]}18`,
                  color: FORMAT_COLORS[detectedFormat],
                  border: `1px solid ${FORMAT_COLORS[detectedFormat]}40`,
                }}>
                自动识别：{FORMAT_LABELS[detectedFormat]}
              </span>
            )}
          </div>

          {!preview ? (
            <textarea
              value={editContent}
              onChange={e => handleContentChange(e.target.value)}
              rows={24}
              placeholder={`支持粘贴 Markdown、HTML 或 JSON，自动识别格式后在前端正确渲染。\n\n示例：\n- Markdown: # 标题\\n\\n段落内容\n- HTML: <h1>标题</h1><p>段落</p>\n- JSON: {"sections":[{"title":"...","content":"..."}]}`}
              className="w-full text-sm rounded-lg p-3 font-mono leading-relaxed"
              style={{
                background: 'rgba(0,0,0,0.3)',
                color: '#CCC',
                border: '1px solid rgba(255,255,255,0.1)',
                resize: 'vertical',
              }}
            />
          ) : (
            <div style={{ minHeight: 300 }}>
              {detectedFormat === 'html' && <HtmlPreview content={editContent} />}
              {detectedFormat === 'json' && <JsonPreview content={editContent} />}
              {detectedFormat === 'markdown' && (
                <div
                  className="w-full rounded-lg p-4 overflow-y-auto prose prose-invert prose-sm max-w-none"
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    minHeight: 300,
                    maxHeight: 600,
                    color: '#CCC',
                  }}>
                  <ReactMarkdown>{editContent}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          <button onClick={saveEdit}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
            保存
          </button>
        </div>
      )}
    </div>
  )
}

export function CourseContentTab({ secret }: { secret: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [selected, setSelected] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminReq(secret, '/admin/courses')
      .then((data: unknown) => {
        const list = data as Course[]
        setCourses(list)
        if (list.length > 0) setSelected(list[0])
      })
      .finally(() => setLoading(false))
  }, [secret])

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <select
          value={selected?.id ?? ''}
          onChange={e => setSelected(courses.find(c => c.id === e.target.value) ?? null)}
          className="rounded-lg px-3 py-2 text-sm border"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#CCC', borderColor: 'rgba(255,255,255,0.1)' }}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {selected && (
        <div className="grid gap-4">
          <ContentCard
            secret={secret} course={selected}
            contentType="summary"
            icon={<FileText size={16} style={{ color: '#FFD700' }} />}
            label="知识摘要"
            creditCost={200}
          />
          <ContentCard
            secret={secret} course={selected}
            contentType="outline"
            icon={<ListTree size={16} style={{ color: '#A78BFA' }} />}
            label="复习大纲"
            creditCost={300}
          />
        </div>
      )}
    </div>
  )
}
