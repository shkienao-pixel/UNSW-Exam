'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle, EyeOff, FileText, Sparkles, Loader2, Search, X, Save, Trash2, RefreshCw, CalendarDays } from 'lucide-react'
import { Course, adminReq, Spinner, ErrorBox, ActionBtn, Toast, cardStyle, inputStyle } from './_shared'
import ReactMarkdown from 'react-markdown'
import SummarySchemaRenderer from '@/components/SummarySchemaRenderer'
import KnowledgeSummaryRenderer from '@/components/KnowledgeSummaryRenderer'
import type { SummarySchemaV1 } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ContentType = 'summary' | 'outline'
type ContentStatus = 'not_generated' | 'draft' | 'published' | 'hidden'
type ContentFormat = 'markdown' | 'html' | 'json' | 'summary_v1'

interface CourseContent {
  id?: number
  status: ContentStatus
  content_json: Record<string, unknown>
  updated_at: string | null
}

interface Blueprint {
  id?: number
  course_id: string
  blueprint: {
    knowledge_points?: { id: string; title: string; topic?: string }[]
    papers?: { id: string; title: string }[]
  }
  updated_at: string | null
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'

// ─────────────────────────────────────────────────────────────────────────────
// Label maps
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ContentStatus, string> = {
  not_generated: '未生成', draft: '草稿', published: '已发布', hidden: '已下架',
}
const STATUS_COLORS: Record<ContentStatus, string> = {
  not_generated: '#555', draft: '#FFD700', published: '#4CAF50', hidden: '#FF6666',
}
const FORMAT_LABELS: Record<ContentFormat, string> = {
  markdown: 'Markdown', html: 'HTML', json: 'JSON', summary_v1: '结构化 v1 ✦',
}
const FORMAT_COLORS: Record<ContentFormat, string> = {
  markdown: '#63B3ED', html: '#F6AD55', json: '#A78BFA', summary_v1: '#FFD700',
}

const BLUEPRINT_PLACEHOLDER = JSON.stringify(
  {
    knowledge_points: [
      { id: 'kp_1', title: '卷积神经网络基础', topic: 'CNN' },
      { id: 'kp_2', title: '反向传播算法', topic: 'Backprop' },
    ],
    papers: [
      { id: 'paper_1', title: '2023 Final Exam' },
      { id: 'paper_2', title: '2022 Final Exam' },
    ],
  },
  null,
  2,
)

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractContent(json: Record<string, unknown>): { format: ContentFormat; content: string } {
  if (json.format === 'summary_v1') return { format: 'summary_v1', content: JSON.stringify(json, null, 2) }
  if (json.format && json.content) return { format: json.format as ContentFormat, content: json.content as string }
  if (json.markdown) return { format: 'markdown', content: json.markdown as string }
  return { format: 'markdown', content: '' }
}

function detectFormat(text: string): ContentFormat {
  const t = text.trim()
  if (!t) return 'markdown'
  try {
    const obj = JSON.parse(t)
    if (obj?.format === 'summary_v1') return 'summary_v1'
    return 'json'
  } catch {}
  if (/<[a-zA-Z][^>]*>/i.test(t)) return 'html'
  return 'markdown'
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview components
// ─────────────────────────────────────────────────────────────────────────────

function HtmlPreview({ content }: { content: string }) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <style>body{font-family:sans-serif;background:#111;color:#ccc;padding:16px;font-size:13px;line-height:1.6}
    h1,h2,h3{color:#FFD700}a{color:#63B3ED}hr{border-color:#333}</style>
    </head><body>${content}</body></html>`
  return (
    <iframe srcDoc={html} title="html-preview" className="w-full rounded-lg"
      style={{ border: '1px solid rgba(255,255,255,0.08)', minHeight: 400, maxHeight: 600, background: '#111' }}
      sandbox="allow-same-origin" />
  )
}

function ContentPreview({ format, content, schema }: {
  format: ContentFormat; content: string; schema: SummarySchemaV1 | null
}) {
  if (format === 'summary_v1' && schema) {
    return (
      <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,215,0,0.1)' }}>
        <SummarySchemaRenderer schema={schema} />
      </div>
    )
  }
  if (format === 'html') return <HtmlPreview content={content} />
  if (format === 'json') {
    let parsed: unknown = null
    try { parsed = JSON.parse(content) } catch {}
    return (
      <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(167,139,250,0.15)' }}>
        <KnowledgeSummaryRenderer rawJson={parsed} />
      </div>
    )
  }
  return (
    <div className="w-full rounded-lg p-4 overflow-y-auto prose prose-invert prose-sm max-w-none"
      style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', minHeight: 300, maxHeight: 600, color: '#CCC' }}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ContentCard — 知识摘要
// ─────────────────────────────────────────────────────────────────────────────

function ContentCard({ secret, course, contentType, icon, label, creditCost }: {
  secret: string; course: Course; contentType: ContentType
  icon: React.ReactNode; label: string; creditCost: number
}) {
  const [data, setData]                     = useState<CourseContent | null>(null)
  const [loading, setLoading]               = useState(true)
  const [editing, setEditing]               = useState(false)
  const [editContent, setEditContent]       = useState('')
  const [detectedFormat, setDetectedFormat] = useState<ContentFormat>('markdown')
  const [preview, setPreview]               = useState(false)
  const [refining, setRefining]             = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [toast, setToast]                   = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await adminReq<CourseContent>(secret, `/courses/${course.id}/course-content/${contentType}/admin`)
      setData(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally { setLoading(false) }
  }, [secret, course.id, contentType])

  useEffect(() => { load() }, [load])

  function openEditor() {
    const { content, format } = extractContent(data?.content_json ?? {})
    setEditContent(content)
    setDetectedFormat(format)
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
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Update failed') }
  }

  async function saveEdit() {
    let content_json: Record<string, unknown>
    if (detectedFormat === 'summary_v1') {
      try { content_json = JSON.parse(editContent) } catch { content_json = { format: 'summary_v1', content: editContent } }
    } else if (detectedFormat === 'markdown') {
      content_json = { format: 'markdown', content: editContent }
    } else {
      content_json = { format: detectedFormat, content: editContent }
    }
    try {
      await adminReq(secret, `/courses/${course.id}/course-content/${contentType}/admin`, {
        method: 'PUT',
        body: JSON.stringify({ content_json }),
      })
      setEditing(false)
      showToast('已保存')
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed') }
  }

  async function handleRefine() {
    if (!editContent.trim()) { setError('请先在编辑框中粘贴内容，再点击 AI 精炼'); return }
    setRefining(true); setError(null)
    try {
      const res = await fetch(`${API}/courses/${course.id}/course-content/${contentType}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
        body: JSON.stringify({ context: editContent }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`)
      }
      const row = await res.json() as { content_json: Record<string, unknown> }
      setEditContent(JSON.stringify(row.content_json, null, 2))
      setDetectedFormat('summary_v1')
      setPreview(true)
      showToast('AI 精炼完成，已切换为结构化预览')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'AI refinement failed')
    } finally { setRefining(false) }
  }

  const status = (data?.status ?? 'not_generated') as ContentStatus
  let parsedSchema: SummarySchemaV1 | null = null
  if (detectedFormat === 'summary_v1') {
    try { parsedSchema = JSON.parse(editContent) as SummarySchemaV1 } catch {}
  }

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
        {loading && <Loader2 size={13} className="animate-spin" style={{ color: '#555' }} />}
        {toast && <span className="text-xs" style={{ color: '#4CAF50' }}>{toast}</span>}
      </div>

      {error && <ErrorBox msg={error} />}

      {data?.updated_at && (
        <p className="text-xs mb-3" style={{ color: '#555' }}>
          最后更新：{new Date(data.updated_at).toLocaleString('zh-CN')}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={openEditor}
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
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setPreview(false)} className="px-3 py-1 rounded text-xs"
              style={{
                background: !preview ? 'rgba(255,215,0,0.15)' : 'transparent',
                color: !preview ? '#FFD700' : '#666',
                border: `1px solid ${!preview ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}>编辑</button>
            <button onClick={() => setPreview(true)} className="px-3 py-1 rounded text-xs"
              style={{
                background: preview ? 'rgba(255,215,0,0.15)' : 'transparent',
                color: preview ? '#FFD700' : '#666',
                border: `1px solid ${preview ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}>预览</button>
            {editContent && (
              <span className="text-xs px-2 py-0.5 rounded font-mono"
                style={{
                  background: `${FORMAT_COLORS[detectedFormat]}18`,
                  color: FORMAT_COLORS[detectedFormat],
                  border: `1px solid ${FORMAT_COLORS[detectedFormat]}40`,
                }}>
                {FORMAT_LABELS[detectedFormat]}
              </span>
            )}
            <button onClick={handleRefine} disabled={refining}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
              {refining ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {refining ? 'AI 处理中…' : '✦ AI 精炼成结构化格式'}
            </button>
          </div>

          {!preview ? (
            <textarea
              value={editContent}
              onChange={e => handleContentChange(e.target.value)}
              rows={24}
              placeholder={`粘贴任意格式内容，支持：\n• Markdown（推荐手动编辑）\n• HTML\n• JSON\n• 已有 summary_v1 结构化 JSON\n\n粘贴后点击「✦ AI 精炼成结构化格式」→ 自动转换为富文本 Schema`}
              className="w-full text-sm rounded-lg p-3 font-mono leading-relaxed"
              style={{ background: 'rgba(0,0,0,0.3)', color: '#CCC', border: '1px solid rgba(255,255,255,0.1)', resize: 'vertical' }}
            />
          ) : (
            <div style={{ minHeight: 300 }}>
              <ContentPreview format={detectedFormat} content={editContent} schema={parsedSchema} />
            </div>
          )}

          <button onClick={saveEdit}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
            保存草稿
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BlueprintCard — 考试蓝图
// ─────────────────────────────────────────────────────────────────────────────

function BlueprintCard({ secret, course }: { secret: string; course: Course }) {
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [jsonText, setJsonText]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [toast, setToast]         = useState('')

  const loadBlueprint = useCallback(async () => {
    setLoading(true); setError(null); setJsonError(null)
    try {
      const data = await adminReq<Blueprint>(secret, `/admin/planner/${course.id}`)
      setBlueprint(data)
      setJsonText(JSON.stringify(data.blueprint, null, 2))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('404') || msg === 'Blueprint not found') {
        setBlueprint(null); setJsonText('')
      } else {
        setError(msg || 'Load failed')
      }
    } finally { setLoading(false) }
  }, [secret, course.id])

  useEffect(() => { loadBlueprint() }, [loadBlueprint])

  function validateJson(text: string): { ok: boolean; parsed?: Record<string, unknown> } {
    if (!text.trim()) return { ok: false }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      if (!parsed.knowledge_points && !parsed.papers) {
        setJsonError('JSON 必须包含 knowledge_points 或 papers 字段')
        return { ok: false }
      }
      setJsonError(null)
      return { ok: true, parsed }
    } catch (e: unknown) {
      setJsonError(`JSON 解析错误：${e instanceof Error ? e.message : ''}`)
      return { ok: false }
    }
  }

  async function handleSave() {
    const { ok, parsed } = validateJson(jsonText)
    if (!ok || !parsed) return
    setSaving(true); setError(null)
    try {
      await adminReq(secret, `/admin/planner/${course.id}`, {
        method: 'PUT',
        body: JSON.stringify({ blueprint: parsed }),
      })
      await loadBlueprint()
      setToast('保存成功')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!blueprint) return
    if (!confirm('确定删除此课程的考试蓝图？用户进度数据将保留。')) return
    setDeleting(true)
    try {
      await adminReq(secret, `/admin/planner/${course.id}`, { method: 'DELETE' })
      setBlueprint(null); setJsonText('')
      setToast('蓝图已删除')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Delete failed') }
    finally { setDeleting(false) }
  }

  const kpCount    = blueprint?.blueprint?.knowledge_points?.length ?? 0
  const paperCount = blueprint?.blueprint?.papers?.length ?? 0

  return (
    <div style={{ ...cardStyle, padding: '20px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} style={{ color: '#7DD3C8' }} />
          <span className="font-semibold text-white">考试蓝图</span>
          {blueprint ? (
            <>
              <span className="text-xs px-2 py-0.5 rounded"
                style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
                已配置
              </span>
              <span className="text-xs" style={{ color: '#666' }}>
                {kpCount} 个知识点 · {paperCount} 套试卷
              </span>
              {blueprint.updated_at && (
                <span className="text-xs" style={{ color: '#555' }}>
                  更新于 {new Date(blueprint.updated_at).toLocaleDateString('zh-CN')}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>
              未配置
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {blueprint && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ color: '#ff8080', border: '1px solid rgba(255,80,80,0.2)', background: 'rgba(255,80,80,0.06)' }}>
              <Trash2 size={12} /> {deleting ? '删除中...' : '删除蓝图'}
            </button>
          )}
          <button onClick={loadBlueprint} disabled={loading}
            className="p-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && <div className="mb-3"><ErrorBox msg={error} /></div>}

      <div className="space-y-3">
        <p className="text-xs" style={{ color: '#666' }}>
          粘贴或编辑课程蓝图 JSON，必须包含 <code style={{ color: '#87B6FF' }}>knowledge_points</code> 和/或{' '}
          <code style={{ color: '#F4A261' }}>papers</code> 数组，每个元素需有 <code style={{ color: '#aaa' }}>id</code> 和{' '}
          <code style={{ color: '#aaa' }}>title</code> 字段。
        </p>
        <textarea
          value={jsonText}
          onChange={e => { setJsonText(e.target.value); setJsonError(null) }}
          placeholder={BLUEPRINT_PLACEHOLDER}
          rows={16}
          className="w-full rounded-xl px-4 py-3 text-xs font-mono resize-y"
          style={{
            ...inputStyle,
            lineHeight: 1.6,
            border: jsonError ? '1px solid rgba(255,80,80,0.4)' : inputStyle.border,
          }}
          spellCheck={false}
        />
        {jsonError && <p className="text-xs" style={{ color: '#ff8080' }}>{jsonError}</p>}
        <div className="flex justify-end">
          <ActionBtn onClick={handleSave} loading={saving} icon={<Save size={14} />}>
            {blueprint ? '更新蓝图' : '保存蓝图'}
          </ActionBtn>
        </div>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CourseContentTab — 课程内容 + 考试蓝图（合并入口）
// ─────────────────────────────────────────────────────────────────────────────

export function CourseContentTab({ secret }: { secret: string }) {
  const [courses, setCourses]   = useState<Course[]>([])
  const [selected, setSelected] = useState<Course | null>(null)
  const [loading, setLoading]   = useState(true)
  const [query, setQuery]       = useState('')
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef                 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    adminReq<Course[]>(secret, '/admin/courses')
      .then(list => { setCourses(list); if (list.length > 0) setSelected(list[0]) })
      .finally(() => setLoading(false))
  }, [secret])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = courses.filter(c => {
    const q = query.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
  })

  function selectCourse(c: Course) {
    setSelected(c); setQuery(''); setDropOpen(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-5">
      {/* Course picker */}
      <div ref={dropRef} className="relative" style={{ maxWidth: 360 }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#555' }} />
          <input
            type="text"
            value={dropOpen ? query : (selected ? `${selected.code} — ${selected.name}` : '')}
            onChange={e => { setQuery(e.target.value); setDropOpen(true) }}
            onFocus={() => { setQuery(''); setDropOpen(true) }}
            placeholder="搜索课程..."
            className="w-full pl-8 pr-8 py-2 rounded-xl text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: dropOpen ? '1px solid rgba(255,215,0,0.4)' : '1px solid rgba(255,255,255,0.1)',
              color: '#CCC',
            }}
          />
          {(query || selected) && (
            <button onClick={() => { setQuery(''); setSelected(null); setDropOpen(true) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#444' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {dropOpen && (
          <div className="absolute z-20 mt-1 w-full rounded-xl overflow-hidden shadow-2xl"
            style={{ background: 'rgba(14,16,24,0.98)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: 280, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs" style={{ color: '#555' }}>无匹配课程</div>
            ) : (
              filtered.map(c => (
                <button key={c.id} onClick={() => selectCourse(c)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                  style={{
                    background: selected?.id === c.id ? 'rgba(255,215,0,0.08)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                  onMouseEnter={e => { if (selected?.id !== c.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (selected?.id !== c.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
                    {c.code}
                  </span>
                  <span className="text-sm truncate" style={{ color: selected?.id === c.id ? '#FFD700' : '#CCC' }}>
                    {c.name}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="space-y-4">
          <ContentCard
            secret={secret} course={selected} contentType="summary"
            icon={<FileText size={16} style={{ color: '#FFD700' }} />}
            label="知识摘要" creditCost={200}
          />
          <BlueprintCard secret={secret} course={selected} />
        </div>
      )}
    </div>
  )
}
