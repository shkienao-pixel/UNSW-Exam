'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { StreamEvent } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/i18n'
import { useGeneration } from '@/lib/generation-context'
import type { Course, Artifact, ScopeSet, Output, DocType } from '@/lib/types'
import { DOC_TYPE_LABELS, DOC_TYPE_COLORS } from '@/lib/types'
import {
  FileText, Upload, Loader2, Zap, History, Settings2,
  CheckSquare, ChevronDown, ChevronRight, MessageSquare, BookOpen, Send, RotateCcw,
  ExternalLink, Trash2, Languages, HelpCircle, ImagePlus, X, Sparkles,
  Code, Lock, Target, Layers3, ListTree, Square,
} from 'lucide-react'
import { addMistake } from '@/lib/mistakes-store'
import MistakesView from '@/components/MistakesView'
import InsufficientCreditsModal from '@/components/InsufficientCreditsModal'
import ReactMarkdown from 'react-markdown'
import SummarySchemaRenderer from '@/components/SummarySchemaRenderer'
import type { SummarySchemaV1 } from '@/lib/types'
import ReviewOutlineTab from '@/components/ReviewOutlineTab'
import ResourceHubTab from '@/components/ResourceHubTab'
import KnowledgeTab from '@/components/KnowledgeTab'
import KnowledgeSummaryRenderer from '@/components/KnowledgeSummaryRenderer'

// ── View routing ──────────────────────────────────────────────────────────────

function CoursePageInner() {
  const { id: courseId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const view = searchParams.get('view') || 'flashcards'

  const [course, setCourse] = useState<Course | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [scopeSets, setScopeSets] = useState<ScopeSet[]>([])
  const [outputs, setOutputs] = useState<Output[]>([])
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useLang()
  const { role, user } = useAuth()
  const [creditBalance, setCreditBalance] = useState(0)

  const load = useCallback(async () => {
    try {
      const c = await api.courses.get(courseId)
      setCourse(c)
      // Load artifacts, scope-sets, credits independently — individual failures don't crash page
      const [arts, scopes, bal] = await Promise.allSettled([
        api.artifacts.list(courseId),
        api.scopeSets.list(courseId),
        api.credits.balance(),
      ])
      if (arts.status === 'fulfilled') setArtifacts(arts.value)
      if (scopes.status === 'fulfilled') setScopeSets(scopes.value)
      if (bal.status === 'fulfilled') setCreditBalance(bal.value.balance)
    } catch (e) {
      console.warn('[load] failed to load course data:', e)
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={32} />
    </div>
  )
  if (!course) return <div className="p-8 text-red-400">{t('course_404')}</div>

  // Ask 视图独占全屏（ChatGPT 风格），其他视图正常滚动
  if (view === 'ask') {
    return <AskTab courseId={courseId} scopeSets={scopeSets} artifacts={artifacts} />
  }

  // 知识摘要视图：管理员上传的结构化课程摘要
  if (view === 'course-summary') {
    return (
      <div className="mx-auto w-full max-w-[1180px] flex-1 overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">
        <SummaryTab courseId={courseId} />
      </div>
    )
  }

  // 摘要→知识图谱视图：flex 布局，高度撑满（内部分栏+滚动）
  if (view === 'summary') {
    return (
      <div className="p-6 overflow-hidden flex-1 flex flex-col min-h-0">
        <KnowledgeTab courseId={courseId} />
      </div>
    )
  }

  // 复习大纲视图：flex 布局，高度撑满（内部分栏+滚动）
  if (view === 'outline') {
    return (
      <div className="p-6 overflow-hidden flex-1 flex flex-col min-h-0">
        <OutlineTab courseId={courseId} />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] flex-1 overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">
      {view === 'flashcards' && <FlashcardsTab courseId={courseId} />}
      {view === 'mistakes'   && <MistakesTab courseId={courseId} />}
      {view === 'quiz'       && <QuizTab courseId={courseId} />}
      {view === 'generate'   && (
        <GenerateTab courseId={courseId} scopeSets={scopeSets} setScopeSets={setScopeSets}
          artifacts={artifacts} setOutputs={setOutputs} />
      )}
      {view === 'outputs'    && <OutputsTab courseId={courseId} outputs={outputs} setOutputs={setOutputs} />}
      {view === 'resources'  && (
        role === 'guest' ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-lg font-semibold text-white mb-2">课程资料库仅限注册用户</h3>
            <p className="text-sm mb-6" style={{ color: '#555' }}>注册账号后即可上传课件与真题，并参与积分解锁</p>
            <a href="/register"
              className="px-6 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
              立即注册 →
            </a>
          </div>
        ) : (
          <ResourceHubTab
            courseId={courseId}
            artifacts={artifacts}
            setArtifacts={setArtifacts}
            fileInputRef={fileInputRef}
            currentUserId={user?.id ?? ''}
            creditBalance={creditBalance}
            onCreditSpent={amount => setCreditBalance(prev => prev - amount)}
          />
        )
      )}
      {view === 'scope'      && (
        <ScopeTab courseId={courseId} artifacts={artifacts}
          scopeSets={scopeSets} setScopeSets={setScopeSets} />
      )}
    </div>
  )
}

export default function CoursePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={32} />
      </div>
    }>
      <CoursePageInner />
    </Suspense>
  )
}

// ── Bilingual helpers ─────────────────────────────────────────────────────────

type BiMode = 'full' | 'zh' | 'en'

function biText(text: string, mode: BiMode): string {
  if (mode === 'full') return text
  const parts = text.split(' / ')
  if (parts.length < 2) return text
  return mode === 'zh' ? parts[0].trim() : parts.slice(1).join(' / ').trim()
}

function BilingualToggle({ mode, onChange }: { mode: BiMode; onChange: (m: BiMode) => void }) {
  const options: { key: BiMode; label: string }[] = [
    { key: 'full', label: '中/EN' },
    { key: 'zh',   label: '中'    },
    { key: 'en',   label: 'EN'   },
  ]
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className="px-2 py-1 rounded-md text-xs transition-all"
          style={{
            background: mode === o.key ? 'rgba(255,215,0,0.12)' : 'transparent',
            color: mode === o.key ? '#FFD700' : '#555',
            border: `1px solid ${mode === o.key ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'}`,
          }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Per-question translation toggle ──────────────────────────────────────────

interface QuizQuestion {
  question: string
  options: string[]
  answer: string
  explanation?: string
  source_artifact_id?: number
  source_url?: string
}

interface QuizSource {
  artifact_id: number
  file_name: string
  storage_url: string
}

interface TranslatablePanelProps {
  texts: string[]   // [question, opt0, opt1, opt2, opt3, explanation?]
  courseId: string
}

function TranslatablePanel({ texts, courseId }: TranslatablePanelProps) {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [translated, setTranslated] = useState<string[] | null>(null)
  const [error, setError] = useState(false)
  const { lang } = useLang()

  // Bug 6 fix: 题目来自英文课程材料，中文界面应翻译 EN→ZH，而非 ZH→EN
  // 按当前 UI 语言决定目标语言：中文 UI → 译成中文；英文 UI → 译成中文（供参考）
  const targetLang: 'en' | 'zh' = lang === 'zh' ? 'zh' : 'zh'

  async function toggle() {
    if (visible) { setVisible(false); return }
    setVisible(true)
    if (translated) return
    setLoading(true); setError(false)
    try {
      const res = await api.generate.translate(courseId, texts, targetLang)
      setTranslated(res.translations)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={toggle}
        className="flex items-center gap-1.5 text-xs mt-2 transition-opacity hover:opacity-100"
        style={{ color: '#555', opacity: 0.8 }}>
        <Languages size={12} />
        {visible
          ? (lang === 'zh' ? '隐藏中文翻译' : 'Hide translation')
          : (lang === 'zh' ? '显示中文翻译' : 'Show Chinese translation')
        }
      </button>

      {visible && (
        <div className="mt-2 px-3 py-2.5 rounded-xl text-xs space-y-2"
          style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
          {loading && (
            <span className="flex items-center gap-1.5" style={{ color: '#666' }}>
              <Loader2 size={11} className="animate-spin" />
              {lang === 'zh' ? '翻译中...' : 'Translating...'}
            </span>
          )}
          {error && <span style={{ color: '#FF6666' }}>{lang === 'zh' ? '翻译失败' : 'Translation failed'}</span>}
          {translated && !loading && translated.map((t, i) => (
            <p key={i} style={{ color: '#7EB8F5', lineHeight: '1.5' }}>{t}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Full-content translation panel (for summary / outline) ───────────────────

function ContentTranslationPanel({ content, courseId }: { content: string; courseId: string }) {
  const [show, setShow] = useState(false)
  const [translated, setTranslated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const { lang } = useLang()

  async function toggle() {
    if (show) { setShow(false); return }
    setShow(true)
    if (translated) return
    setLoading(true); setError(false)
    try {
      const paragraphs = content.split('\n\n').filter(p => p.trim())
      const res = await api.generate.translate(courseId, paragraphs, 'en')
      setTranslated(res.translations.join('\n\n'))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass p-6 rounded-xl prose prose-invert max-w-none text-sm"
        style={{ color: '#CCC', lineHeight: '1.75' }}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>

      <button onClick={toggle}
        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100"
        style={{ color: '#555', opacity: 0.8 }}>
        <Languages size={13} />
        {show
          ? (lang === 'zh' ? '收起英文翻译' : 'Hide translation')
          : (lang === 'zh' ? '展开英文翻译' : 'Show English translation')
        }
        {loading && <Loader2 size={11} className="animate-spin ml-1" />}
      </button>

      {show && (
        <div className="glass p-6 rounded-xl prose prose-invert max-w-none text-sm"
          style={{ color: '#8BB8D4', lineHeight: '1.75', border: '1px solid rgba(96,165,250,0.12)' }}>
          {loading
            ? <div className="flex items-center gap-2" style={{ color: '#666' }}><Loader2 size={14} className="animate-spin" /> 翻译中...</div>
            : error
            ? <p style={{ color: '#FF6666' }}>翻译失败，请重试</p>
            : translated
            ? <ReactMarkdown>{translated}</ReactMarkdown>
            : null}
        </div>
      )}
    </div>
  )
}

// ── Generic typed-output view ─────────────────────────────────────────────────

interface TypedOutputsViewProps {
  courseId: string
  outputType: string
  icon: React.ReactNode
  title: string
  subtitle: string
  emptyTitle: string
  emptyLinkLabel: string
  headerExtra?: React.ReactNode
  renderContent: (output: Output) => React.ReactNode
}

function TypedOutputsView({
  courseId, outputType, icon, title, subtitle,
  emptyTitle, emptyLinkLabel, headerExtra, renderContent,
}: TypedOutputsViewProps) {
  const [outputs, setOutputs] = useState<Output[]>([])
  const [selected, setSelected] = useState<Output | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.outputs.list(courseId, outputType)
      .then(data => { setOutputs(data); if (data.length > 0) setSelected(data[0]) })
      .finally(() => setLoading(false))
  }, [courseId, outputType])

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} />
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">{icon} {title}</h2>
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-1">
          {headerExtra}
          {outputs.length > 1 && (
            <select className="input-glass text-xs py-1"
              value={selected?.id ?? ''}
              onChange={e => setSelected(outputs.find(o => o.id === Number(e.target.value)) ?? null)}>
              {outputs.map(o => (
                <option key={o.id} value={o.id}>
                  {new Date(o.created_at).toLocaleDateString('zh-CN')}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {outputs.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
          <BookOpen size={52} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-white mb-4">{emptyTitle}</p>
          <a href={`/courses/${courseId}?view=generate`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
            <Zap size={14} /> {emptyLinkLabel}
          </a>
        </div>
      ) : selected ? renderContent(selected) : null}
    </div>
  )
}

// ── Summary Tab ───────────────────────────────────────────────────────────────

/** 从 Markdown 文本提取 TOC */
function extractToc(markdown: string): { id: string; title: string; level: number }[] {
  const toc: { id: string; title: string; level: number }[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (m) {
      const level = m[1].length
      const title = m[2].trim()
      const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
      toc.push({ id, title, level })
    }
  }
  return toc
}

/** 从 HTML 文本提取 TOC */
function extractTocFromHtml(html: string): { id: string; title: string; level: number }[] {
  const toc: { id: string; title: string; level: number }[] = []
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h[1-3]>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const level = parseInt(m[1], 10)
    const title = m[2].replace(/<[^>]+>/g, '').trim()
    const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
    toc.push({ id, title, level })
  }
  return toc
}

type ContentFormat = 'markdown' | 'html' | 'json' | 'summary_v1'

/** 解析 content_json，返回统一的 { format, content, schema, rawJson } */
function parseContentJson(json: Record<string, unknown>): {
  format: ContentFormat
  content: string
  schema: SummarySchemaV1 | null
  rawJson: unknown
} {
  // 结构化 Schema V1
  if (json.format === 'summary_v1') {
    return { format: 'summary_v1', content: '', schema: json as unknown as SummarySchemaV1, rawJson: null }
  }
  // 通用 format+content 结构（管理员通过后台上传的 JSON 会包在这里）
  if (json.format && json.content) {
    const fmt = json.format as ContentFormat
    // JSON 格式：content 是字符串化的 JSON，解出来交给 KnowledgeSummaryRenderer
    if (fmt === 'json') {
      let parsed: unknown = null
      try { parsed = JSON.parse(json.content as string) } catch {}
      // 如果内层 JSON 本身就带 weeks / sections 等结构，直接用内层
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { format: 'json', content: json.content as string, schema: null, rawJson: parsed }
      }
    }
    return { format: fmt, content: json.content as string, schema: null, rawJson: null }
  }
  // 旧版 { markdown }
  if (json.markdown) return { format: 'markdown', content: json.markdown as string, schema: null, rawJson: null }
  // 顶层直接是 JSON 结构（没有 format 包装）→ 交给 KnowledgeSummaryRenderer
  if (json.weeks || json.sections || json.chapters || json.modules || json.topics) {
    return { format: 'json', content: '', schema: null, rawJson: json }
  }
  return { format: 'markdown', content: '', schema: null, rawJson: null }
}

/** Markdown 渲染（带 TOC anchor） */
function MarkdownContent({ content, contentRef }: { content: string; contentRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={contentRef} className="flex-1 min-w-0">
      <ReactMarkdown
        components={{
          h1: ({ children }) => {
            const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
            return <h1 data-heading-id={id} className="text-2xl font-bold text-white mb-6 mt-0">{children}</h1>
          },
          h2: ({ children }) => {
            const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
            return (
              <h2 data-heading-id={id}
                className="text-lg font-semibold mt-8 mb-3 pb-2"
                style={{ color: '#FFD700', borderBottom: '1px solid rgba(255,215,0,0.15)' }}>
                {children}
              </h2>
            )
          },
          h3: ({ children }) => {
            const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
            return <h3 data-heading-id={id} className="text-base font-semibold mt-5 mb-2 text-white">{children}</h3>
          },
          hr: () => <hr className="my-8" style={{ borderColor: 'rgba(255,255,255,0.08)' }} />,
          p: ({ children }) => <p className="mb-3 leading-relaxed text-sm" style={{ color: '#CCC' }}>{children}</p>,
          li: ({ children }) => <li className="mb-1 text-sm" style={{ color: '#CCC' }}>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        }}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

/** HTML 渲染（iframe 隔离，带 heading id 注入） */
function HtmlContent({ content, contentRef }: { content: string; contentRef: React.RefObject<HTMLDivElement | null> }) {
  // 给 h1-h3 注入 data-heading-id，以便 TOC 跳转
  const injected = content.replace(/<h([1-3])([^>]*)>([\s\S]*?)<\/h[1-3]>/gi, (_, lvl, attrs, inner) => {
    const title = inner.replace(/<[^>]+>/g, '').trim()
    const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
    return `<h${lvl}${attrs} data-heading-id="${id}">${inner}</h${lvl}>`
  })
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <style>
      *{box-sizing:border-box}
      body{font-family:system-ui,sans-serif;background:transparent;color:#ccc;padding:0;margin:0;font-size:13px;line-height:1.7}
      h1{color:#fff;font-size:1.5rem;font-weight:700;margin:0 0 1.5rem}
      h2{color:#FFD700;font-size:1.1rem;font-weight:600;margin:2rem 0 0.75rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(255,215,0,0.15)}
      h3{color:#fff;font-size:1rem;font-weight:600;margin:1.25rem 0 0.5rem}
      p{margin:0 0 0.75rem;color:#ccc}
      ul,ol{margin:0 0 0.75rem;padding-left:1.5rem;color:#ccc}
      li{margin-bottom:0.25rem}
      strong{color:#fff;font-weight:600}
      hr{border:none;border-top:1px solid rgba(255,255,255,0.08);margin:2rem 0}
      a{color:#63B3ED}
      code{background:rgba(255,255,255,0.08);padding:0.1em 0.4em;border-radius:4px;font-size:0.9em;color:#A78BFA}
      pre{background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:1rem;overflow:auto}
      pre code{background:none;padding:0}
      table{width:100%;border-collapse:collapse;margin:0 0 0.75rem}
      th,td{border:1px solid rgba(255,255,255,0.1);padding:0.4rem 0.75rem;text-align:left}
      th{background:rgba(255,215,0,0.08);color:#FFD700}
    </style>
    </head><body>${injected}</body></html>`
  return (
    <div ref={contentRef} className="flex-1 min-w-0">
      <iframe
        srcDoc={html}
        title="content"
        className="w-full rounded-xl"
        style={{ border: 'none', minHeight: 600, background: 'transparent' }}
        sandbox="allow-same-origin"
        onLoad={e => {
          // 自适应高度
          const iframe = e.currentTarget
          const body = iframe.contentDocument?.body
          if (body) iframe.style.height = body.scrollHeight + 32 + 'px'
        }}
      />
    </div>
  )
}

function SummaryTab({ courseId }: { courseId: string }) {
  const [status, setStatus]                   = useState<'loading' | 'not_published' | 'locked' | 'unlocked'>('loading')
  const [creditsRequired, setCreditsRequired] = useState(200)
  const [format, setFormat]                   = useState<ContentFormat>('markdown')
  const [content, setContent]                 = useState('')
  const [rawJson, setRawJson]                 = useState<unknown>(null)
  const [schema, setSchema]                   = useState<SummarySchemaV1 | null>(null)
  const [unlocking, setUnlocking]             = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const contentRef                            = useRef<HTMLDivElement>(null)
  // For schema_v1: track open section for TOC highlight
  const [activeSectionIdx, setActiveSectionIdx] = useState<number | null>(null)

  useEffect(() => {
    api.courseContent.status(courseId, 'summary').then(res => {
      setStatus(res.status)
      setCreditsRequired(res.credits_required)
      if (res.status === 'unlocked') loadContent()
    }).catch(() => setStatus('not_published'))
  }, [courseId])

  async function loadContent() {
    try {
      const res = await api.courseContent.get(courseId, 'summary')
      const parsed = parseContentJson(res.content_json)
      setFormat(parsed.format)
      setContent(parsed.content)
      setSchema(parsed.schema)
      setRawJson(parsed.rawJson)
    } catch { setError('加载失败，请刷新重试') }
  }

  async function handleUnlock() {
    setUnlocking(true); setError(null)
    try {
      await api.courseContent.unlock(courseId, 'summary')
      setStatus('unlocked')
      await loadContent()
    } catch (e: unknown) {
      const err = e as { code?: string; balance?: number; required?: number }
      if (err.code === 'INSUFFICIENT_CREDITS') {
        setError(`积分不足（当前 ${err.balance}✦，需要 ${err.required}✦）`)
      } else {
        setError(e instanceof Error ? e.message : '解锁失败')
      }
    } finally { setUnlocking(false) }
  }

  function scrollTo(id: string) {
    if (format === 'html') {
      const iframe = contentRef.current?.querySelector('iframe') as HTMLIFrameElement | null
      iframe?.contentDocument?.querySelector(`[data-heading-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    contentRef.current?.querySelector(`[data-heading-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function scrollToSection(index: number) {
    setActiveSectionIdx(index)
    const el = document.querySelector(`[data-section-index="${index}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (status === 'loading') return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin" size={24} style={{ color: '#FFD700' }} />
    </div>
  )

  if (status === 'not_published') return (
    <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
      <FileText size={52} className="mx-auto mb-4 opacity-20" />
      <p className="text-base font-medium text-white mb-2">摘要准备中</p>
      <p className="text-sm" style={{ color: '#555' }}>管理员正在整理课程内容，敬请期待</p>
    </div>
  )

  if (status === 'locked') return (
    <div className="text-center py-20 glass rounded-2xl space-y-4">
      <FileText size={52} className="mx-auto opacity-30" style={{ color: '#FFD700' }} />
      <p className="text-xl font-bold text-white">知识摘要</p>
      <p className="text-sm" style={{ color: '#777' }}>系统整理的课程核心知识，可作为刷题参考</p>
      {error && <p className="text-sm" style={{ color: '#FF6666' }}>{error}</p>}
      <button onClick={handleUnlock} disabled={unlocking}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
        style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.35)' }}>
        {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
        {unlocking ? '解锁中...' : `解锁摘要 ${creditsRequired} ✦`}
      </button>
      <p className="text-xs" style={{ color: '#444' }}>一次解锁，永久可用</p>
    </div>
  )

  // ── Schema V1: two-column with section TOC ──
  if (format === 'summary_v1' && schema) {
    const WEIGHT_DOT: Record<string, string> = { high: '#FF6B6B', medium: '#FFD700', low: '#444' }
    return (
      <div className="flex gap-0 min-h-[70vh]">
        {/* Left TOC */}
        <div className="w-52 flex-shrink-0 pr-4">
          <div className="sticky top-4 space-y-0.5 max-h-[calc(100vh-140px)] overflow-y-auto">
            <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: '#555' }}>章节</p>
            {schema.sections.map((sec, i) => (
              <button key={i} onClick={() => scrollToSection(i)}
                className="w-full text-left text-xs py-1.5 px-2 rounded-lg transition-all hover:bg-white/5 leading-snug flex items-center gap-2"
                style={{ color: activeSectionIdx === i ? '#FFD700' : '#888', background: activeSectionIdx === i ? 'rgba(255,215,0,0.06)' : 'transparent' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: WEIGHT_DOT[sec.exam_weight] ?? '#444' }} />
                <span className="truncate">{sec.heading}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="w-px flex-shrink-0 mr-6" style={{ background: 'rgba(255,255,255,0.06)' }} />
        {/* Right content */}
        <div className="flex-1 min-w-0">
          {error && <p className="text-sm mb-4" style={{ color: '#FF6666' }}>{error}</p>}
          <SummarySchemaRenderer schema={schema} onTocClick={scrollToSection} />
        </div>
      </div>
    )
  }

  // ── Flat formats: markdown / html / json ──
  const toc = format === 'markdown' ? extractToc(content) : format === 'html' ? extractTocFromHtml(content) : []

  return (
    <div className="flex gap-0 min-h-[70vh]">
      {toc.length > 0 && (
        <>
          <div className="w-52 flex-shrink-0 pr-4">
            <div className="sticky top-4 space-y-0.5 max-h-[calc(100vh-140px)] overflow-y-auto">
              <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: '#555' }}>目录</p>
              {toc.map((item, i) => (
                <button key={i} onClick={() => scrollTo(item.id)}
                  className="w-full text-left text-xs py-1.5 rounded-lg transition-all hover:bg-white/5 leading-snug"
                  style={{
                    color: item.level === 1 ? '#FFD700' : item.level === 2 ? '#CCC' : '#888',
                    paddingLeft: item.level <= 2 ? '8px' : '20px',
                    fontWeight: item.level <= 2 ? 600 : 400,
                  }}>
                  {item.title}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px flex-shrink-0 mr-6" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </>
      )}

      {error && <p className="text-sm mb-4" style={{ color: '#FF6666' }}>{error}</p>}
      {format === 'markdown' && <MarkdownContent content={content} contentRef={contentRef} />}
      {format === 'html'     && <HtmlContent     content={content} contentRef={contentRef} />}
      {format === 'json'     && <KnowledgeSummaryRenderer rawJson={rawJson} />}
    </div>
  )
}

// ── Outline Tab (复习大纲) ────────────────────────────────────────────────────

function OutlineTab({ courseId }: { courseId: string }) {
  return <ReviewOutlineTab courseId={courseId} />
}

// ── Quiz Tab ──────────────────────────────────────────────────────────────────

function QuizTab({ courseId }: { courseId: string }) {
  const { t } = useLang()
  return (
    <TypedOutputsView
      courseId={courseId} outputType="quiz"
      icon={<Target size={20} style={{ color: '#FFD700' }} />} title={t('quiz_title')} subtitle={t('quiz_sub')}
      emptyTitle={t('empty_quiz')} emptyLinkLabel={t('empty_quiz_btn')}
      renderContent={output => {
        let questions: QuizQuestion[] = []
        let sources: QuizSource[] = []
        try {
          const parsed = JSON.parse(output.content || '[]')
          if (Array.isArray(parsed)) {
            questions = parsed
          } else {
            questions = parsed.questions || []
            sources = parsed.sources || []
          }
        } catch {}
        return <QuizDisplay questions={questions} sources={sources} courseId={courseId} />
      }}
    />
  )
}

// ── Mistakes Tab ──────────────────────────────────────────────────────────────

function MistakesTab({ courseId }: { courseId: string }) {
  return <MistakesView courseId={courseId} />
}

// ── Flashcards Tab ────────────────────────────────────────────────────────────

type Flashcard =
  | { type: 'vocab'; front: string; back: string }
  | { type: 'mcq'; question: string; options: string[]; answer: string; explanation?: string }
function FlashcardsTab({ courseId }: { courseId: string }) {
  const { t, lang } = useLang()
  const router = useRouter()
  const [outputs, setOutputs] = useState<Output[]>([])
  const [selectedOutputId, setSelectedOutputId] = useState<number | null>(null)
  const [cards, setCards] = useState<Flashcard[]>([])
  const [cardIndex, setCardIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [biMode, setBiMode] = useState<BiMode>('full')
  const [loading, setLoading] = useState(true)
  const [finished, setFinished] = useState(false)

  // Wrapped in useCallback so useEffect dep is stable (fixes exhaustive-deps warning)
  const loadCards = useCallback((output: Output) => {
    setSelectedOutputId(output.id)
    setCardIndex(0); setFlipped(false); setChosen(null); setRevealed(false); setFinished(false)
    try {
      const parsed = JSON.parse(output.content || '[]')
      setCards(Array.isArray(parsed) ? parsed : [])
    } catch { setCards([]) }
  }, [])

  useEffect(() => {
    api.outputs.list(courseId, 'flashcards')
      .then(data => { setOutputs(data); if (data.length > 0) loadCards(data[0]) })
      .finally(() => setLoading(false))
  }, [courseId, loadCards])

  const card = cards[cardIndex]

  function next() {
    if (cardIndex >= cards.length - 1) { setFinished(true); return }
    setCardIndex(i => i + 1); setFlipped(false); setChosen(null); setRevealed(false)
  }
  function prev() { setCardIndex(i => Math.max(i - 1, 0)); setFlipped(false); setChosen(null); setRevealed(false) }
  function restart() { setCardIndex(0); setFlipped(false); setChosen(null); setRevealed(false); setFinished(false) }

  function askAI(question: string) {
    router.push(`/courses/${courseId}?view=ask&q=${encodeURIComponent(question)}`)
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={28} /></div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Layers3 size={22} style={{ color: '#FFD700' }} /> {t('flashcards_title')}</h2>
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('flashcards_sub')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-1">
          {outputs.length > 0 && (
            <select className="input-glass text-xs py-1" value={selectedOutputId ?? ''}
              onChange={e => { const o = outputs.find(x => x.id === Number(e.target.value)); if (o) loadCards(o) }}>
              {outputs.map(o => (
                <option key={o.id} value={o.id}>
                  {new Date(o.created_at).toLocaleDateString('zh-CN')}
                  {selectedOutputId === o.id && cards.length > 0 ? ` (${cards.length})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {outputs.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
          <BookOpen size={52} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-white mb-4">{t('empty_fc')}</p>
          <a href={`/courses/${courseId}?view=generate`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
            <Zap size={14} /> {t('empty_fc_btn')}
          </a>
        </div>
      ) : (
        <>
          {/* Reset bar */}
          <div className="flex">
            <button onClick={restart}
              className="ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs"
              style={{ color: 'rgba(255,255,255,0.44)', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              <RotateCcw size={11} /> {t('fc_reset')}
            </button>
          </div>

          {cards.length === 0 ? (
            <div className="text-center py-16 glass rounded-2xl" style={{ color: '#555' }}>
              没有卡片
            </div>
          ) : finished ? (
            /* ── Completion screen ── */
            <div className="glass p-8 rounded-2xl text-center space-y-4"
              style={{ border: '1px solid rgba(255,215,0,0.2)' }}>
              <p className="text-4xl">🎉</p>
              <p className="text-xl font-bold text-white">
                {lang === 'zh' ? '全部完成！' : 'All Done!'}
              </p>
              <p className="text-sm" style={{ color: '#888' }}>
                {lang === 'zh' ? `共 ${cards.length} 张卡片` : `${cards.length} cards`}
              </p>
              <div className="flex gap-3 justify-center pt-2 flex-wrap">
                <button onClick={restart}
                  className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#ddd', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <RotateCcw size={14} /> {lang === 'zh' ? '再做一次' : 'Redo'}
                </button>
                <a href={`/courses/${courseId}?view=generate`}
                  className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
                  style={{ background: 'rgba(200,165,90,0.12)', color: '#e6cf98', border: '1px solid rgba(200,165,90,0.2)' }}>
                  <Zap size={14} /> {lang === 'zh' ? '再来一套' : 'Generate New'}
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Progress */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs" style={{ color: '#555' }}>
                  <span>{cardIndex + 1} / {cards.length}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${((cardIndex + 1) / cards.length) * 100}%`, background: '#c8a55a' }} />
                </div>
              </div>

              {card && (
                <>
                  {/* Vocab card */}
                  {card.type === 'vocab' && (
                    <div className="space-y-3">
                      <div
                        className="mx-auto flex min-h-[320px] w-full max-w-[680px] cursor-pointer flex-col items-center justify-center rounded-[32px] border border-white/8 bg-white/[0.03] p-10 text-center shadow-[0_20px_60px_rgba(0,0,0,0.24)] sm:p-14"
                        style={{ userSelect: 'none' }}
                        onClick={() => setFlipped(f => !f)}>
                        <p className="text-xs mb-4" style={{ color: '#555' }}>
                          {flipped ? t('fc_back') : t('fc_front')} · {t('fc_click_tip')}
                        </p>
                        <p className="text-xl font-semibold" style={{ color: flipped ? '#CCC' : '#FFD700' }}>
                          {biText(flipped ? card.back : card.front, biMode)}
                        </p>
                      </div>
                      {/* Ask AI link */}
                      <button onClick={() => askAI(card.front)}
                        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100 mx-auto"
                        style={{ color: '#555', opacity: 0.7 }}>
                        <HelpCircle size={12} />不懂了？问 AI
                      </button>
                    </div>
                  )}

                  {/* MCQ card */}
                  {card.type === 'mcq' && (
                    <div className="rounded-[30px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)] space-y-4 sm:p-6">
                      <p className="font-semibold text-white">{biText(card.question, biMode)}</p>
                      <div className="space-y-2">
                        {card.options.map((opt, j) => {
                          const label = String.fromCharCode(65 + j)
                          const isChosen = chosen === label; const isCorrect = label === card.answer
                          let bg = 'rgba(255,255,255,0.04)'; let border = 'rgba(255,255,255,0.08)'
                          if (revealed) {
                            if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = '#22C55E' }
                            else if (isChosen) { bg = 'rgba(255,68,68,0.1)'; border = '#FF4444' }
                          }
                          return (
                            <button key={j} onClick={() => { setChosen(label); setRevealed(true) }}
                              className="w-full text-left px-4 py-3 rounded-[18px] text-sm transition-all"
                              style={{ background: bg, border: `1px solid ${border}`, color: '#DDD' }}>
                              <span style={{ color: '#FFD700' }}>{label}.</span> {biText(opt, biMode)}
                            </button>
                          )
                        })}
                      </div>
                      {/* Auto-show explanation on reveal */}
                      {revealed && (
                        <p className="text-xs px-3 py-2 rounded-2xl"
                          style={{ background: 'rgba(200,165,90,0.08)', color: '#d6d6dc', border: '1px solid rgba(200,165,90,0.14)' }}>
                          💡 {biText(
                            card.explanation || (chosen === card.answer ? '回答正确！' : `正确答案是 ${card.answer}`),
                            biMode,
                          )}
                        </p>
                      )}
                      {revealed && (
                        <button onClick={() => askAI(card.question)}
                          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100"
                          style={{ color: '#555', opacity: 0.7 }}>
                          <HelpCircle size={12} />不懂了？问 AI
                        </button>
                      )}
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button onClick={prev} disabled={cardIndex === 0}
                      className="px-4 py-2 rounded-full text-sm disabled:opacity-30"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#b3b3bc', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {t('fc_prev')}
                    </button>
                    {card.type === 'vocab' && flipped && (
                      <>
                        <button
                          onClick={() => {
                            addMistake({ courseId, source: 'flashcard', question: card.front, correctAnswer: card.back })
                            next()
                          }}
                          className="px-4 py-2 rounded-full text-sm"
                          style={{ background: 'rgba(255,68,68,0.1)', color: '#ff8d8d', border: '1px solid rgba(255,68,68,0.18)' }}>
                          {t('fc_forgot')}
                        </button>
                        <button onClick={next} className="px-4 py-2 rounded-full text-sm"
                          style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.08)' }}>
                          {t('fc_got_it')}
                        </button>
                      </>
                    )}
                    {card.type === 'vocab' && !flipped && (
                      <button onClick={() => setFlipped(true)} className="px-4 py-2 rounded-full text-sm"
                        style={{ background: 'rgba(200,165,90,0.12)', color: '#e6cf98', border: '1px solid rgba(200,165,90,0.2)' }}>
                        {t('fc_flip')}
                      </button>
                    )}
                    {card.type === 'mcq' && !revealed && (
                      <button onClick={next} disabled={cardIndex === cards.length - 1}
                        className="px-4 py-2 rounded-full text-sm disabled:opacity-30"
                        style={{ background: 'rgba(200,165,90,0.12)', color: '#e6cf98', border: '1px solid rgba(200,165,90,0.2)' }}>
                        {t('fc_skip')}
                      </button>
                    )}
                    {card.type === 'mcq' && revealed && (
                      <button
                        onClick={() => {
                          if (chosen !== null && chosen !== card.answer) {
                            addMistake({
                              courseId, source: 'flashcard',
                              question: card.question, options: card.options,
                              correctAnswer: card.answer, userAnswer: chosen,
                              explanation: card.explanation,
                            })
                          }
                          next()
                        }}
                        className="px-4 py-2 rounded-full text-sm"
                        style={{ background: 'rgba(200,165,90,0.12)', color: '#e6cf98', border: '1px solid rgba(200,165,90,0.2)' }}>
                        {cardIndex === cards.length - 1 ? t('fc_done') : t('fc_next')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── AI 问答 Tab ───────────────────────────────────────────────────────────────

type AskSource = { artifact_id: number; file_name: string; storage_url: string }
type Message = {
  role: 'user' | 'assistant'
  content: string
  sources?: AskSource[]
  imagePreview?: string        // 用户上传的图片（data URL）
  explainImage?: string        // Gemini 生成的讲解图（data URL）
  explainFailed?: boolean      // 生成失败标记
  loadingExplain?: boolean
  contextMode?: 'all' | 'revision'  // 生成该回答时的检索范围
  streaming?: boolean          // 流式输出进行中
  streamStatus?: 'filtering' | 'generating' | 'slow'  // 当前阶段
}

// ── 图片灯箱 ─────────────────────────────────────────────────────────────────
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src} alt="讲解图（全屏）"
        className="max-w-full max-h-full rounded-xl shadow-2xl"
        style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
        onClick={e => e.stopPropagation()} />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
        <X size={20} />
      </button>
    </div>
  )
}

function AskTab({ courseId, scopeSets, artifacts }: {
  courseId: string; scopeSets: ScopeSet[]; artifacts: Artifact[]
}) {
  const { t } = useLang()
  const searchParams = useSearchParams()
  const prefilledQ = searchParams.get('q') || ''

  const [messages, setMessages]         = useState<Message[]>([])
  const [input, setInput]               = useState(prefilledQ)
  const [loading, setLoading]           = useState(false)
  const [scopeSetId, setScopeSetId]     = useState<number | undefined>(scopeSets[0]?.id)
  const [imageFile, setImageFile]       = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc]   = useState<string | null>(null)
  const [contextMode, setContextMode]   = useState<'all' | 'revision'>('all')
  const bottomRef     = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const autoSentRef   = useRef(false)
  const abortRef      = useRef<AbortController | null>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const approvedCount = artifacts.filter(a => a.status === 'approved').length
  const revisionCount = artifacts.filter(a => a.status === 'approved' && a.doc_type === 'revision').length

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
  }

  async function send(overrideInput?: string) {
    const q = (overrideInput ?? input).trim()
    if (!q || loading) return

    const capturedImageFile = imageFile

    setInput('')
    clearImage()
    setMessages(prev => [...prev, {
      role: 'user',
      content: q,
      imagePreview: imagePreview ?? undefined,
    }])
    setLoading(true)

    // ── 有图片 → VQA 非流式路径 ─────────────────────────────────────────────
    if (capturedImageFile) {
      try {
        const res = await api.generate.ask(courseId, q, scopeSetId, capturedImageFile, contextMode)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.answer,
          sources: res.sources,
          contextMode,
        }])
      } catch (err: unknown) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: err instanceof Error ? err.message : '请求失败',
        }])
      } finally { setLoading(false) }
      return
    }

    // ── 无图片 → 流式路径 ────────────────────────────────────────────────────
    const abort = new AbortController()
    abortRef.current = abort

    // 插入流式占位消息
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      streaming: true,
      streamStatus: 'filtering',
      contextMode,
    }])

    // 1.5s 后仍无 token → 显示"深度思考"提示
    const slowTimer = setTimeout(() => {
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 && m.streaming ? { ...m, streamStatus: 'slow' } : m
      ))
    }, 1500)

    let gotFirstToken = false

    try {
      for await (const event of api.generate.askStream(courseId, q, scopeSetId, contextMode, abort.signal)) {
        if (abort.signal.aborted) break

        if (event.type === 'status') {
          setMessages(prev => prev.map((m, i) =>
            i === prev.length - 1 && m.streaming ? { ...m, streamStatus: event.phase } : m
          ))
        } else if (event.type === 'token') {
          if (!gotFirstToken) {
            gotFirstToken = true
            clearTimeout(slowTimer)
          }
          setMessages(prev => prev.map((m, i) =>
            i === prev.length - 1 && m.streaming
              ? { ...m, content: m.content + event.text, streamStatus: 'generating' }
              : m
          ))
        } else if (event.type === 'done') {
          clearTimeout(slowTimer)
          setMessages(prev => prev.map((m, i) =>
            i === prev.length - 1 && m.streaming ? {
              ...m,
              streaming:    false,
              streamStatus: undefined,
              content:      event.answer,
              sources:      event.sources,
            } : m
          ))
        } else if (event.type === 'error') {
          clearTimeout(slowTimer)
          setMessages(prev => prev.map((m, i) =>
            i === prev.length - 1 && m.streaming ? {
              ...m,
              streaming:    false,
              streamStatus: undefined,
              content:      event.message,
            } : m
          ))
        }
      }
    } catch (err: unknown) {
      clearTimeout(slowTimer)
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 && m.streaming ? {
          ...m,
          streaming:    false,
          streamStatus: undefined,
          content:      isAbort ? (m.content || '（已停止生成）') : (err instanceof Error ? err.message : '请求失败'),
        } : m
      ))
    } finally {
      clearTimeout(slowTimer)
      abortRef.current = null
      setLoading(false)
    }
  }

  async function generateExplainImage(msgIndex: number) {
    const aiMsg  = messages[msgIndex]
    const userMsg = messages.slice(0, msgIndex).reverse().find(m => m.role === 'user')
    if (!aiMsg || !userMsg) return

    setMessages(prev => prev.map((m, i) =>
      i === msgIndex ? { ...m, loadingExplain: true } : m
    ))

    try {
      const res = await api.generate.explainWithImage(userMsg.content, aiMsg.content)
      setMessages(prev => prev.map((m, i) =>
        i === msgIndex ? {
          ...m,
          loadingExplain: false,
          explainImage:   res.image_data_url ?? undefined,
          explainFailed:  !res.image_data_url,
        } : m
      ))
    } catch {
      setMessages(prev => prev.map((m, i) =>
        i === msgIndex ? { ...m, loadingExplain: false, explainFailed: true } : m
      ))
    }
  }

  // Auto-send pre-filled question once
  useEffect(() => {
    if (prefilledQ && !autoSentRef.current && approvedCount > 0) {
      autoSentRef.current = true
      send(prefilledQ)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledQ, approvedCount])

  return (
    <>
    {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    <div className="flex flex-col h-full">
      {/* 顶部标题栏 */}
      <div className="flex-shrink-0 px-8 pt-6 pb-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <MessageSquare size={20} style={{ color: '#FFD700' }} /> {t('ask_title')}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: '#555' }}>{t('ask_sub')}</p>
      </div>

      {/* scope 选择器 + 警告 */}
      {(scopeSets.length > 0 || approvedCount === 0) && (
        <div className="flex-shrink-0 px-8 py-2 flex flex-wrap items-center gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {scopeSets.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: '#666' }}>{t('ask_scope_label')}</label>
              <select className="input-glass text-xs py-1" value={scopeSetId ?? ''}
                onChange={e => setScopeSetId(Number(e.target.value) || undefined)}>
                {scopeSets.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (全部)' : ''}</option>)}
              </select>
            </div>
          )}
          {approvedCount === 0 && (
            <p className="text-xs px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(255,165,0,0.1)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.2)' }}>
              {t('ask_no_files')}
            </p>
          )}
        </div>
      )}

      {/* 消息列表（唯一滚动区域） */}
      <div className="flex-1 overflow-y-auto min-h-0 px-8 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#444' }}>
            <MessageSquare size={36} className="opacity-30" />
            <p className="text-sm">{t('ask_empty_msg')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[82%] space-y-1.5">
              {/* 用户上传的图片预览 */}
              {m.role === 'user' && m.imagePreview && (
                <div className="flex justify-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.imagePreview} alt="上传的图片"
                    className="max-w-[240px] max-h-[180px] rounded-xl object-cover"
                    style={{ border: '1px solid rgba(255,215,0,0.3)' }} />
                </div>
              )}

              <div className="px-4 py-3 rounded-2xl text-sm"
                style={{
                  background: m.role === 'user' ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
                  color: m.role === 'user' ? '#FFD700' : '#CCC',
                  border: `1px solid ${m.role === 'user' ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
                }}>
                {m.role === 'assistant'
                  ? (
                    m.streaming && !m.content ? (
                      // 流式占位：显示阶段状态
                      <div className="flex items-center gap-2" style={{ color: '#666' }}>
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-xs">
                          {m.streamStatus === 'filtering'   ? '正在搜索相关资料…'     :
                           m.streamStatus === 'generating'  ? '正在生成回答…'         :
                           m.streamStatus === 'slow'        ? '正在深度思考，稍等片刻…' :
                           t('ask_thinking')}
                        </span>
                      </div>
                    ) : (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                          components={{
                            img: ({ src, alt }) => {
                              const imgSrc = typeof src === 'string' ? src : ''
                              return (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={imgSrc}
                                  alt={alt ?? 'AI 生成图'}
                                  style={{
                                    maxWidth: '100%',
                                    height: 'auto',
                                    borderRadius: '0.75rem',
                                    display: 'block',
                                    marginTop: '0.75rem',
                                    cursor: imgSrc ? 'zoom-in' : undefined,
                                  }}
                                  onClick={() => imgSrc && setLightboxSrc(imgSrc)}
                                />
                              )
                            },
                          }}
                        >{m.content}</ReactMarkdown>
                        {m.streaming && (
                          <span
                            className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse"
                            style={{ background: '#FFD700', borderRadius: '1px' }}
                          />
                        )}
                      </div>
                    )
                  )
                  : m.content}
              </div>

              {/* 检索范围徽章（仅复习资料模式显示） */}
              {m.role === 'assistant' && m.contextMode === 'revision' && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
                  style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc' }}>
                  <BookOpen size={10} />
                  <span>仅复习资料检索</span>
                </div>
              )}

              {/* 来源引用 */}
              {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                <div className="px-3 py-2 rounded-xl text-xs space-y-1"
                  style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.1)' }}>
                  <p style={{ color: '#666' }}>{t('ask_sources')}</p>
                  {m.sources.map(s => (
                    s.storage_url
                      ? <a key={s.artifact_id} href={s.storage_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 transition-opacity hover:opacity-100"
                          style={{ color: '#FFD700', opacity: 0.75 }}>
                          <ExternalLink size={10} />{s.file_name}
                        </a>
                      : <span key={s.artifact_id} style={{ color: '#555' }}>· {s.file_name}</span>
                  ))}
                </div>
              )}

              {/* 生成图解按钮 + 图解结果 */}
              {m.role === 'assistant' && (
                <div>
                  {m.explainImage ? (
                    <div className="mt-2 rounded-xl overflow-hidden"
                      style={{ border: '1px solid rgba(255,215,0,0.2)' }}>
                      <p className="px-3 py-1.5 text-xs flex items-center gap-1"
                        style={{ color: '#888', background: 'rgba(255,215,0,0.04)' }}>
                        <Sparkles size={10} style={{ color: '#FFD700' }} />
                        AI 生成讲解图
                        <span className="ml-auto opacity-50 text-[10px]">点击放大</span>
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.explainImage} alt="AI 讲解图"
                        className="w-full cursor-zoom-in"
                        style={{ background: '#fff' }}
                        onClick={() => setLightboxSrc(m.explainImage!)} />
                    </div>
                  ) : m.explainFailed ? (
                    <p className="text-xs px-1" style={{ color: '#555' }}>图解生成失败，请重试</p>
                  ) : (
                    <button
                      onClick={() => generateExplainImage(i)}
                      disabled={!!m.loadingExplain}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-opacity hover:opacity-100"
                      style={{
                        opacity: m.loadingExplain ? 0.6 : 0.5,
                        color: '#FFD700',
                        border: '1px solid rgba(255,215,0,0.2)',
                        background: 'rgba(255,215,0,0.04)',
                      }}>
                      {m.loadingExplain
                        ? <><Loader2 size={10} className="animate-spin" />生成中…</>
                        : <><Sparkles size={10} />生成讲解图</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && !messages.at(-1)?.streaming && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl text-sm" style={{ background: 'rgba(255,255,255,0.05)', color: '#666' }}>
              <Loader2 size={14} className="animate-spin inline mr-2" />{t('ask_thinking')}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 底部输入区（固定在底部，永远可见） */}
      {/* Bug 2 fix: paddingBottom 叠加 safe-area-inset-bottom，防止 iOS Home Indicator 遮挡 */}
      <div className="flex-shrink-0 px-8 pt-3 border-t"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
          borderColor: 'rgba(255,255,255,0.05)',
        }}>

      {/* Context Mode 切换 */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs mr-1" style={{ color: '#555' }}>检索范围：</span>
        {(
          [
            { mode: 'all'      as const, label: '全库提问', title: '在所有已上传资料中检索' },
            { mode: 'revision' as const, label: '仅复习资料', title: '仅在「复习总结」类型文件中检索' },
          ] as const
        ).map(({ mode, label, title }) => {
          const active = contextMode === mode
          const disabled = mode === 'revision' && revisionCount === 0
          return (
            <button
              key={mode}
              title={disabled ? '该课程暂无「复习总结」类型文件' : title}
              disabled={disabled}
              onClick={() => setContextMode(mode)}
              className="text-xs px-2.5 py-1 rounded-full transition-all"
              style={{
                background: active
                  ? (mode === 'revision' ? 'rgba(99,102,241,0.25)' : 'rgba(255,215,0,0.18)')
                  : 'rgba(255,255,255,0.04)',
                border: active
                  ? (mode === 'revision' ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,215,0,0.4)')
                  : '1px solid rgba(255,255,255,0.08)',
                color: active
                  ? (mode === 'revision' ? '#a5b4fc' : '#FFD700')
                  : '#555',
                opacity: disabled ? 0.35 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: active ? 600 : 400,
              }}>
              {label}
            </button>
          )
        })}
        {contextMode === 'revision' && revisionCount === 0 && (
          <span className="text-xs" style={{ color: '#F87171' }}>
            暂无复习资料，请先上传
          </span>
        )}
        {contextMode === 'revision' && revisionCount > 0 && (
          <span className="text-xs" style={{ color: '#6366F1', opacity: 0.7 }}>
            · {revisionCount} 份复习资料
          </span>
        )}
      </div>

      {/* 图片预览 */}
      {imagePreview && (
        <div className="flex items-center gap-2 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="待发送图片"
            className="h-14 w-14 rounded-lg object-cover"
            style={{ border: '1px solid rgba(255,215,0,0.3)' }} />
          <span className="text-xs flex-1 truncate" style={{ color: '#888' }}>{imageFile?.name}</span>
          <button onClick={clearImage} className="p-1 rounded-full hover:bg-white/10 transition-colors"
            style={{ color: '#666' }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        {/* 隐藏文件选择 */}
        <input ref={imageInputRef} type="file" accept="image/*"
          className="hidden" onChange={handleImageSelect} />

        {/* 上传图片按钮 */}
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={loading || approvedCount === 0}
          title="上传图片（Gemini 多模态分析）"
          className="px-3 rounded-xl transition-opacity hover:opacity-100"
          style={{
            opacity: 0.55,
            background: imagePreview ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${imagePreview ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: imagePreview ? '#FFD700' : '#666',
          }}>
          <ImagePlus size={16} />
        </button>

        <input className="input-glass flex-1 text-sm" placeholder={loading ? '生成中，可随时点击停止…' : t('ask_placeholder')}
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={loading || approvedCount === 0} />

        {loading ? (
          <button
            className="px-4 rounded-xl transition-colors"
            style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.35)',
              color: '#F87171',
            }}
            onClick={() => abortRef.current?.abort()}
            title="停止生成">
            <Square size={14} />
          </button>
        ) : (
          <button className="btn-gold px-4" onClick={() => send()}
            disabled={loading || !input.trim() || approvedCount === 0}>
            <Send size={14} />
          </button>
        )}
      </div>

      </div>{/* end 底部输入区 */}
    </div>
    </>
  )
}

// ── AI 生成 Tab ───────────────────────────────────────────────────────────────

type GenType = 'quiz' | 'flashcards'

function GenerateTab({ courseId, scopeSets, setScopeSets, artifacts, setOutputs }: {
  courseId: string
  scopeSets: ScopeSet[]
  setScopeSets: React.Dispatch<React.SetStateAction<ScopeSet[]>>
  artifacts: Artifact[]
  setOutputs: React.Dispatch<React.SetStateAction<Output[]>>
}) {
  const { t } = useLang()
  const { trackGeneration } = useGeneration()
  const isMounted = useRef(true)
  useEffect(() => () => { isMounted.current = false }, [])

  const [genType, setGenType] = useState<GenType>('quiz')
  const [scopeSetId, setScopeSetId] = useState<number | undefined>(scopeSets[0]?.id)
  const [numQuestions, setNumQuestions] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [genSuccess, setGenSuccess] = useState<GenType | null>(null)
  const [error, setError] = useState('')
  const [creditsModal, setCreditsModal] = useState<{ balance: number; required: number } | null>(null)

  const [showCreateScope, setShowCreateScope] = useState(false)
  const [newScopeName, setNewScopeName] = useState('')
  const [newScopeFiles, setNewScopeFiles] = useState<Set<number>>(new Set())
  const [creatingScope, setCreatingScope] = useState(false)

  const approvedArtifacts = artifacts.filter(a => a.status === 'approved')
  const approvedCount = approvedArtifacts.length

  const genTypes = [
    { key: 'quiz' as GenType, icon: <Target size={18} style={{ color: '#FFD700' }} />, labelKey: 'gen_quiz' as const, descKey: 'gen_desc_quiz' as const },
    { key: 'flashcards' as GenType, icon: <Layers3 size={18} style={{ color: '#FFD700' }} />, labelKey: 'gen_flashcards' as const, descKey: 'gen_desc_flashcards' as const },
  ]

  function toggleNewScopeFile(id: number) {
    setNewScopeFiles(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function createScope() {
    if (!newScopeName.trim()) return
    setCreatingScope(true)
    try {
      const created = await api.scopeSets.create(courseId, newScopeName.trim())
      const fileIds = [...newScopeFiles]
      const finalScope = fileIds.length > 0
        ? await api.scopeSets.updateItems(courseId, created.id, fileIds)
        : created
      setScopeSets(prev => [...prev, finalScope])
      setScopeSetId(finalScope.id)
      setShowCreateScope(false); setNewScopeName(''); setNewScopeFiles(new Set())
    } catch { alert(t('save_err')) } finally { setCreatingScope(false) }
  }

  async function generate() {
    setError(''); setGenSuccess(null); setGenerating(true)
    const body = {
      ...(scopeSetId ? { scope_set_id: scopeSetId } : {}),
      ...(genType === 'quiz' ? { num_questions: numQuestions } : {}),
    }
    const promise = api.generate[genType](courseId, body)

    // Register with global progress tracker (persists across navigation)
    trackGeneration({
      label: t(`gen_${genType}`),
      viewLink: `/courses/${courseId}?view=${genType}`,
      promise,
      onSuccess: out => {
        if (isMounted.current) {
          setOutputs(prev => [out, ...prev])
          setGenSuccess(genType)
          setGenerating(false)
        }
      },
      onError: err => {
        if (isMounted.current) {
          if ((err as any)?.code === 'INSUFFICIENT_CREDITS') {
            setCreditsModal({ balance: (err as any).balance ?? 0, required: (err as any).required ?? 1 })
          } else {
            setError(err?.message || t('gen_err'))
          }
          setGenerating(false)
        }
      },
    })
  }

  const viewLabels: Record<GenType, string> = {
    quiz: t('gen_quiz'),
    flashcards: t('gen_flashcards'),
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap size={22} style={{ color: '#FFD700' }} /> {t('generate_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('generate_sub')}</p>
      </div>

      {/* Type cards */}
      <div className="grid grid-cols-2 gap-3">
        {genTypes.map(g => (
          <button key={g.key} onClick={() => { setGenType(g.key); setGenSuccess(null) }}
            className="glass p-4 text-left transition-all rounded-xl"
            style={{ outline: genType === g.key ? '1px solid #FFD700' : 'none' }}>
            <div className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03]">{g.icon}</div>
            <div className="font-medium text-sm text-white">{t(g.labelKey)}</div>
            <div className="text-xs mt-0.5" style={{ color: '#666' }}>{t(g.descKey)}</div>
          </button>
        ))}
      </div>

      {/* Scope selector */}
      <div className="space-y-2">
        <label className="block text-sm" style={{ color: '#AAA' }}>{t('gen_scope')}</label>
        <div className="flex items-center gap-2">
          {scopeSets.length > 0 ? (
            <select className="input-glass text-sm flex-1" value={scopeSetId ?? ''}
              onChange={e => setScopeSetId(Number(e.target.value) || undefined)}>
              {scopeSets.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (全部)' : ''}</option>)}
            </select>
          ) : <span className="text-sm flex-1" style={{ color: '#555' }}>—</span>}
          <button onClick={() => setShowCreateScope(v => !v)}
            className="px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: showCreateScope ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.04)',
              color: showCreateScope ? '#FFD700' : '#666',
              border: `1px solid ${showCreateScope ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
            }}>
            {t('gen_new_scope')}
          </button>
        </div>

        {showCreateScope && (
          <div className="glass p-4 rounded-xl space-y-3" style={{ border: '1px solid rgba(255,215,0,0.12)' }}>
            <input placeholder={t('gen_scope_ph')} value={newScopeName}
              onChange={e => setNewScopeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createScope() }}
              className="input-glass text-sm w-full" />
            {approvedArtifacts.length > 0 && (
              <div>
                <p className="text-xs mb-2" style={{ color: '#555' }}>{t('gen_scope_files')}</p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {approvedArtifacts.map(a => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-yellow-400"
                        checked={newScopeFiles.has(a.id)} onChange={() => toggleNewScopeFile(a.id)} />
                      <span className="text-xs truncate" style={{ color: newScopeFiles.has(a.id) ? '#CCC' : '#666' }}>
                        {a.file_name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1"
                onClick={createScope} disabled={creatingScope || !newScopeName.trim()}>
                {creatingScope && <Loader2 size={12} className="animate-spin" />}{t('gen_create')}
              </button>
              <button onClick={() => { setShowCreateScope(false); setNewScopeName(''); setNewScopeFiles(new Set()) }}
                className="text-xs px-3 py-1.5 rounded-lg" style={{ color: '#666', background: 'rgba(255,255,255,0.04)' }}>
                {t('gen_cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {genType === 'quiz' && (
        <div>
          <label className="block text-sm mb-2" style={{ color: '#AAA' }}>{t('gen_num_q')}</label>
          <input type="number" min={3} max={20} value={numQuestions}
            onChange={e => setNumQuestions(Number(e.target.value))}
            className="input-glass text-sm w-24" />
        </div>
      )}

      {approvedCount === 0 && (
        <div className="text-sm px-3 py-2 rounded-lg"
          style={{ background: 'rgba(255,165,0,0.1)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.2)' }}>
          {t('gen_no_files')}
        </div>
      )}

      <button className="btn-gold flex items-center gap-2 text-sm" onClick={generate}
        disabled={generating || approvedCount === 0}>
        {generating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
        {generating ? t('gen_loading') : t('gen_btn')}
        {!generating && (
          <span className="ml-auto text-xs opacity-60">
            -1 ✦
          </span>
        )}
      </button>

      {creditsModal && (
        <InsufficientCreditsModal
          balance={creditsModal.balance}
          required={creditsModal.required}
          onClose={() => setCreditsModal(null)}
        />
      )}

      {error && (
        <div className="text-sm px-3 py-2 rounded-lg"
          style={{ background: 'rgba(255,68,68,0.1)', color: '#FF6666', border: '1px solid rgba(255,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {genSuccess && (
        <div className="flex items-center gap-3 text-sm px-4 py-3 rounded-xl"
          style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
          {t('gen_done_prefix')}
          <a href={`/courses/${courseId}?view=${genSuccess}`}
            className="font-semibold underline hover:opacity-80">
            {viewLabels[genSuccess]}
          </a>
          {t('gen_done_suffix')}
        </div>
      )}
    </div>
  )
}

// ── 历史输出 Tab ──────────────────────────────────────────────────────────────

const OUTPUT_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  summary:    { label: '知识摘要', icon: <FileText size={16} style={{ color: '#60A5FA' }} />, color: '#60A5FA', bg: 'rgba(96,165,250,0.08)'  },
  quiz:       { label: '模拟题目', icon: <Target size={16} style={{ color: '#34D399' }} />, color: '#34D399', bg: 'rgba(52,211,153,0.08)'  },
  outline:    { label: '课程大纲', icon: <ListTree size={16} style={{ color: '#A78BFA' }} />, color: '#A78BFA', bg: 'rgba(167,139,250,0.08)' },
  flashcards: { label: '闪卡套组', icon: <Layers3 size={16} style={{ color: '#F59E0B' }} />, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)'  },
}

function OutputsTab({ courseId, outputs, setOutputs }: {
  courseId: string; outputs: Output[]
  setOutputs: React.Dispatch<React.SetStateAction<Output[]>>
}) {
  const { t } = useLang()
  const [loadingList, setLoadingList] = useState(true)
  const [selected, setSelected] = useState<Output | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    api.outputs.list(courseId)
      .then(data => { setOutputs(data); if (data.length > 0) setSelected(data[0]) })
      .finally(() => setLoadingList(false))
  }, [courseId, setOutputs])

  async function handleDelete(id: number) {
    if (!confirm('确定删除该记录？')) return
    await api.outputs.delete(courseId, id)
    setOutputs(prev => { const next = prev.filter(o => o.id !== id); if (selected?.id === id) setSelected(next[0] ?? null); return next })
  }

  function selectType(type: string) {
    setTypeFilter(type)
    const latest = outputs.find(o => type === 'all' || o.output_type === type)
    if (latest) setSelected(latest)
  }

  const filtered = typeFilter === 'all' ? outputs : outputs.filter(o => o.output_type === typeFilter)

  if (loadingList) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} /></div>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <History size={22} style={{ color: '#FFD700' }} /> {t('history_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('history_sub')}</p>
      </div>

      {outputs.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl" style={{ color: '#444' }}>
          <History size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">{t('history_empty')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(OUTPUT_TYPE_CONFIG).map(([type, cfg]) => {
              const typeOutputs = outputs.filter(o => o.output_type === type)
              const latest = typeOutputs[0]; const isActive = typeFilter === type
              return (
                <button key={type} onClick={() => selectType(type)}
                  className="text-left p-4 rounded-xl transition-all"
                  style={{ background: isActive ? cfg.bg : 'rgba(255,255,255,0.03)', border: `1px solid ${isActive ? cfg.color : 'rgba(255,255,255,0.06)'}` }}>
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03]">
                    {cfg.icon}
                  </div>
                  <div className="text-sm font-semibold text-white mb-0.5">{cfg.label}</div>
                  {typeOutputs.length > 0
                    ? <div className="text-xs" style={{ color: cfg.color }}>{typeOutputs.length} 份</div>
                    : <div className="text-xs" style={{ color: '#444' }}>暂无</div>}
                  {latest && <div className="text-xs mt-0.5" style={{ color: '#555' }}>{new Date(latest.created_at).toLocaleDateString('zh-CN')}</div>}
                </button>
              )
            })}
          </div>

          <div className="flex gap-4">
            <div className="w-52 flex-shrink-0 space-y-1.5">
              <button onClick={() => selectType('all')}
                className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-all mb-2"
                style={{ background: typeFilter === 'all' ? 'rgba(255,215,0,0.1)' : 'transparent', color: typeFilter === 'all' ? '#FFD700' : '#555', border: `1px solid ${typeFilter === 'all' ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                {t('history_all')} ({outputs.length})
              </button>
              {filtered.map(o => {
                const cfg = OUTPUT_TYPE_CONFIG[o.output_type]
                return (
                  <div key={o.id} className="p-3 rounded-xl cursor-pointer transition-all"
                    style={{ background: selected?.id === o.id ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected?.id === o.id ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'}` }}
                    onClick={() => setSelected(o)}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: cfg?.color ?? '#FFD700' }}>
                        {cfg?.icon} {cfg?.label ?? o.output_type}
                      </span>
                      <button onClick={e => { e.stopPropagation(); handleDelete(o.id) }} style={{ color: '#FF4444', opacity: 0.6 }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: '#555' }}>
                      {new Date(o.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="flex-1 glass p-5 rounded-xl overflow-auto" style={{ minHeight: '400px' }}>
              {selected
                ? <div>
                    <div className="flex items-center gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-lg">{OUTPUT_TYPE_CONFIG[selected.output_type]?.icon}</span>
                      <span className="text-sm font-semibold text-white">{OUTPUT_TYPE_CONFIG[selected.output_type]?.label ?? selected.output_type}</span>
                      <span className="text-xs ml-auto" style={{ color: '#555' }}>{new Date(selected.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <OutputDisplay output={selected} courseId={courseId} />
                  </div>
                : <div className="flex items-center justify-center h-full text-sm" style={{ color: '#444' }}>← 选择左侧记录查看内容</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── 文件上传 Tab ──────────────────────────────────────────────────────────────

const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: 'lecture',    label: 'Lecture Notes' },
  { value: 'tutorial',   label: 'Tutorial / Lab' },
  { value: 'revision',   label: 'Revision Summary' },
  { value: 'past_exam',  label: 'Past Exam' },
  { value: 'assignment', label: 'Assignment / Project' },
  { value: 'other',      label: 'Other' },
]

function FilesTab({ courseId, artifacts, setArtifacts, fileInputRef }: {
  courseId: string; artifacts: Artifact[]
  setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useLang()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pendingDocType, setPendingDocType] = useState<DocType>('lecture')
  const [filterDocType, setFilterDocType] = useState<DocType | 'all'>('all')
  const [unlockTarget, setUnlockTarget] = useState<Artifact | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const art = await api.artifacts.upload(courseId, file, pendingDocType)
      setArtifacts(prev => [art, ...prev])
    }
    catch (err: unknown) { alert(err instanceof Error ? err.message : t('upload_err')) }
    finally { setUploading(false) }
  }

  async function handleUnlock() {
    if (!unlockTarget) return
    setUnlocking(true)
    setUnlockError('')
    try {
      const res = await api.artifacts.unlock(courseId, unlockTarget.id)
      // 解锁成功：更新本地 artifact 列表 is_locked=false + storage_url
      setArtifacts(prev => prev.map(a =>
        a.id === unlockTarget.id
          ? { ...a, is_locked: false, storage_url: res.storage_url ?? a.storage_url }
          : a
      ))
      setUnlockTarget(null)
    } catch (err: unknown) {
      setUnlockError(err instanceof Error ? err.message : '解锁失败，请稍后重试')
    } finally {
      setUnlocking(false)
    }
  }

  const displayed = filterDocType === 'all'
    ? artifacts
    : artifacts.filter(a => a.doc_type === filterDocType)

  return (
    <div className="space-y-5">

      {/* 解锁确认 Modal */}
      {unlockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => !unlocking && setUnlockTarget(null)}>
          <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl" onClick={e => e.stopPropagation()}
            style={{ background: '#0e0e1c', border: '1px solid rgba(255,165,0,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Lock size={18} style={{ color: '#FFA500' }} />
              <h3 className="text-base font-bold text-white">解锁文件访问</h3>
            </div>
            <p className="text-sm mb-1" style={{ color: '#aaa' }}>
              文件：<span className="text-white font-medium">{unlockTarget.file_name}</span>
            </p>
            <p className="text-sm mb-4" style={{ color: '#888' }}>
              此「{DOC_TYPE_LABELS[unlockTarget.doc_type]}」需消耗 <span style={{ color: '#FFD700', fontWeight: 600 }}>50 积分</span> 深度解析。
            </p>
            {unlockError && (
              <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: '#ff8080', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }}>
                {unlockError}
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setUnlockTarget(null)} disabled={unlocking}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#777', border: '1px solid rgba(255,255,255,0.1)' }}>
                取消
              </button>
              <button onClick={handleUnlock} disabled={unlocking}
                className="flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: 'rgba(255,165,0,0.18)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.35)' }}>
                {unlocking ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                {unlocking ? '解析中...' : '确认深度解析（-50 积分）'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileText size={22} style={{ color: '#FFD700' }} /> {t('files_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('files_sub')}</p>
      </div>

      {/* 文件类型选择 + 上传区 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium flex-shrink-0" style={{ color: '#888' }}>上传为：</label>
          <select
            value={pendingDocType}
            onChange={e => setPendingDocType(e.target.value as DocType)}
            className="flex-1 text-sm rounded-lg px-3 py-1.5 outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,215,0,0.25)',
              color: DOC_TYPE_COLORS[pendingDocType],
            }}>
            {DOC_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value} style={{ background: '#0d0d1a', color: '#fff' }}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="glass rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 cursor-pointer transition-all"
          style={{ borderColor: dragOver ? '#FFD700' : 'rgba(255,215,0,0.2)' }}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
          onClick={() => fileInputRef.current?.click()}>
          {uploading
            ? <Loader2 className="animate-spin mb-2" style={{ color: '#FFD700' }} size={24} />
            : <Upload size={24} className="mb-2" style={{ color: dragOver ? '#FFD700' : '#444' }} />}
          <p className="text-sm font-medium" style={{ color: dragOver ? '#FFD700' : '#888' }}>
            {uploading ? t('files_uploading') : t('files_drag')}
          </p>
          <p className="text-xs mt-1" style={{ color: '#555' }}>{t('files_hint')}</p>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.py,.txt,.ipynb" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: '#555' }}>筛选：</span>
        {(['all', ...Object.keys(DOC_TYPE_LABELS)] as const).map(dt => (
          <button key={dt} onClick={() => setFilterDocType(dt as DocType | 'all')}
            className="px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filterDocType === dt
                ? dt === 'all' ? 'rgba(255,215,0,0.15)' : `${DOC_TYPE_COLORS[dt as DocType]}22`
                : 'rgba(255,255,255,0.04)',
              color: filterDocType === dt
                ? dt === 'all' ? '#FFD700' : DOC_TYPE_COLORS[dt as DocType]
                : '#555',
              border: `1px solid ${filterDocType === dt
                ? dt === 'all' ? 'rgba(255,215,0,0.3)' : `${DOC_TYPE_COLORS[dt as DocType]}44`
                : 'rgba(255,255,255,0.07)'}`,
            }}>
            {dt === 'all' ? '全部' : DOC_TYPE_LABELS[dt as DocType]}
          </button>
        ))}
      </div>

      {/* 文件列表 */}
      <div className="space-y-2">
        {displayed.map(a => {
          const isCode = a.file_type === 'python' || a.file_type === 'notebook'
          const fileIcon = isCode
            ? <Code size={16} style={{ color: '#8B5CF6', flexShrink: 0 }} />
            : <FileText size={16} style={{ color: '#FFD700', flexShrink: 0 }} />
          return (
            <div key={a.id} className="glass flex items-center gap-3 px-4 py-3">
              {fileIcon}
              <span className="flex-1 text-sm text-white truncate">{a.file_name}</span>
              {/* 代码文件标识 */}
              {isCode && (
                <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{
                  background: 'rgba(139,92,246,0.12)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.25)',
                }}>
                  {a.file_type === 'notebook' ? 'Jupyter' : 'Python'}
                </span>
              )}
              {/* doc_type 标签 */}
              <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{
                background: `${DOC_TYPE_COLORS[a.doc_type]}1a`,
                color: DOC_TYPE_COLORS[a.doc_type],
                border: `1px solid ${DOC_TYPE_COLORS[a.doc_type]}44`,
              }}>
                {DOC_TYPE_LABELS[a.doc_type]}
              </span>
              {/* 审核状态 */}
              <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{
                background: a.status === 'approved' ? 'rgba(0,200,100,0.1)' : a.status === 'rejected' ? 'rgba(255,68,68,0.1)' : 'rgba(255,165,0,0.1)',
                color: a.status === 'approved' ? '#00C864' : a.status === 'rejected' ? '#FF4444' : '#FFA500',
              }}>
                {a.status === 'approved' ? t('files_approved') : a.status === 'rejected' ? t('files_rejected') : t('files_pending')}
              </span>
              <span className="text-xs flex-shrink-0" style={{ color: '#555' }}>{new Date(a.created_at).toLocaleDateString('zh-CN')}</span>
              {a.is_locked ? (
                <button
                  onClick={() => { setUnlockTarget(a); setUnlockError('') }}
                  title="花 50 积分深度解析"
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all hover:opacity-80 flex-shrink-0"
                  style={{ background: 'rgba(255,165,0,0.1)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.25)' }}>
                  <Lock size={11} /> 深度解析
                </button>
              ) : a.storage_url ? (
                <a href={a.storage_url} target="_blank" rel="noopener noreferrer" title={t('view_file')}
                  style={{ color: '#FFD700', opacity: 0.7 }} className="hover:opacity-100 transition-opacity flex-shrink-0">
                  <ExternalLink size={14} />
                </a>
              ) : null}
            </div>
          )
        })}
        {displayed.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: '#444' }}>
            {filterDocType === 'all' ? t('files_empty') : `暂无「${DOC_TYPE_LABELS[filterDocType as DocType]}」类型文件`}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Scope Tab ─────────────────────────────────────────────────────────────────

function ScopeTab({ courseId, artifacts, scopeSets, setScopeSets }: {
  courseId: string; artifacts: Artifact[]
  scopeSets: ScopeSet[]; setScopeSets: React.Dispatch<React.SetStateAction<ScopeSet[]>>
}) {
  const { t } = useLang()
  const [selected, setSelected] = useState<number | null>(scopeSets[0]?.id ?? null)
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const ss = scopeSets.find(s => s.id === selected)
    if (ss) setCheckedIds(new Set(ss.artifact_ids))
  }, [selected, scopeSets])

  async function save() {
    if (selected == null) return
    setSaving(true)
    try { const u = await api.scopeSets.updateItems(courseId, selected, [...checkedIds]); setScopeSets(prev => prev.map(s => s.id === selected ? u : s)) }
    catch { alert(t('save_err')) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings2 size={22} style={{ color: '#FFD700' }} /> {t('scope_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('scope_sub')}</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm" style={{ color: '#AAA' }}>{t('scope_current')}</label>
        <select className="input-glass text-sm" style={{ minWidth: '200px' }} value={selected ?? ''} onChange={e => setSelected(Number(e.target.value))}>
          {scopeSets.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_default ? ` ${t('scope_default')}` : ''}</option>)}
        </select>
        <ChevronDown size={14} style={{ color: '#666', marginLeft: -32, pointerEvents: 'none' }} />
      </div>
      <div className="glass p-4 rounded-xl space-y-2">
        <p className="text-sm font-medium text-white mb-3">{t('scope_sel_files')}</p>
        {artifacts.length === 0
          ? <p className="text-sm py-4 text-center" style={{ color: '#444' }}>{t('scope_no_files')}</p>
          : artifacts.map(a => (
            <label key={a.id} className="flex items-center gap-3 cursor-pointer py-1.5">
              <input type="checkbox" checked={checkedIds.has(a.id)} onChange={() => setCheckedIds(prev => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })} className="w-4 h-4 accent-yellow-400 cursor-pointer" />
              <FileText size={14} style={{ color: checkedIds.has(a.id) ? '#FFD700' : '#555' }} />
              <span className="text-sm" style={{ color: checkedIds.has(a.id) ? '#DDD' : '#666' }}>{a.file_name}</span>
            </label>
          ))}
      </div>
      <button className="btn-gold flex items-center gap-2" onClick={save} disabled={saving || selected == null}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
        {saving ? t('scope_saving') : t('scope_save')}
      </button>
      <p className="text-xs" style={{ color: '#555' }}>{t('scope_selected')} {checkedIds.size} / {artifacts.length}</p>
    </div>
  )
}

// ── Output display helpers ────────────────────────────────────────────────────

function OutputDisplay({ output, courseId }: { output: Output; courseId?: string }) {
  if (!output.content) return <p className="text-sm" style={{ color: '#666' }}>无内容</p>

  if (output.output_type === 'quiz') {
    let questions: QuizQuestion[] = []; let sources: QuizSource[] = []
    try {
      const parsed = JSON.parse(output.content)
      if (Array.isArray(parsed)) { questions = parsed }
      else { questions = parsed.questions || []; sources = parsed.sources || [] }
    } catch {}
    return <QuizDisplay questions={questions} sources={sources} courseId={courseId} />
  }

  if (output.output_type === 'flashcards') {
    return (
      <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(255,215,0,0.06)', color: '#AAA' }}>
        📌 闪卡已保存，前往左侧「闪卡」进行学习
      </div>
    )
  }

  return (
    <div className="prose prose-invert max-w-none text-sm" style={{ color: '#CCC', lineHeight: '1.7' }}>
      <ReactMarkdown>{output.content}</ReactMarkdown>
    </div>
  )
}

// ── Quiz Display (with translation, sources, ask AI) ─────────────────────────

function QuizDisplay({
  questions, sources = [], courseId,
}: {
  questions: QuizQuestion[]
  sources?: QuizSource[]
  courseId?: string
}) {
  const router = useRouter()
  const { lang } = useLang()
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})

  if (questions.length === 0) return <p className="text-sm" style={{ color: '#666' }}>无题目数据</p>

  const answeredCount = Object.keys(answers).length
  const correctCount = Object.entries(answers).filter(
    ([idx, label]) => label === questions[Number(idx)]?.answer
  ).length
  const allDone = answeredCount === questions.length

  function askAI(question: string) {
    if (!courseId) return
    router.push(`/courses/${courseId}?view=ask&q=${encodeURIComponent(question)}`)
  }

  function handleAnswer(i: number, label: string, q: QuizQuestion) {
    if (revealed[i]) return // already answered
    setAnswers(p => ({ ...p, [i]: label }))
    setRevealed(p => ({ ...p, [i]: true }))
    if (label !== q.answer && courseId) {
      addMistake({
        courseId,
        source: 'quiz',
        question: q.question,
        options: q.options,
        correctAnswer: q.answer,
        userAnswer: label,
        explanation: q.explanation,
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Score bar — visible once at least one question answered */}
      {answeredCount > 0 && (
        <div className="sticky top-4 z-10 flex items-center gap-3 rounded-[22px] border border-white/8 bg-[rgba(11,13,18,0.82)] px-4 py-3 backdrop-blur-xl">
          <span className="text-xs font-semibold" style={{ color: '#e6cf98' }}>
            {correctCount} / {questions.length} {lang === 'zh' ? '正确' : 'correct'}
          </span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(answeredCount / questions.length) * 100}%`, background: '#c8a55a', opacity: 0.85 }} />
          </div>
          <span className="text-xs" style={{ color: '#555' }}>{answeredCount}/{questions.length}</span>
        </div>
      )}

      {questions.map((q, i) => {
        const chosen = answers[i]; const show = revealed[i]
        // Find source for this question
        const sourceObj = q.source_artifact_id
          ? sources.find(s => s.artifact_id === q.source_artifact_id) || null
          : null

        return (
          <div key={i} className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] space-y-4 sm:p-6">
            {/* Question */}
            <p className="font-medium text-white text-sm">
              <span style={{ color: '#FFD700' }}>Q{i + 1}. </span>
              {q.question}
            </p>

            {/* Options */}
            <div className="space-y-2">
              {q.options.map((opt, j) => {
                const label = String.fromCharCode(65 + j)
                const isChosen = chosen === label; const isCorrect = label === q.answer
                let bg = 'rgba(255,255,255,0.04)'; let border = 'rgba(255,255,255,0.08)'
                if (show) {
                  if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = '#22C55E' }
                  else if (isChosen) { bg = 'rgba(255,68,68,0.1)'; border = '#FF4444' }
                }
                return (
                  <button key={j}
                    onClick={() => handleAnswer(i, label, q)}
                    disabled={!!show}
                    className="w-full text-left px-4 py-3 rounded-[18px] text-sm transition-all disabled:cursor-default"
                    style={{ background: bg, border: `1px solid ${border}`, color: '#DDD' }}>
                    <span style={{ color: '#FFD700' }}>{label}.</span> {opt}
                  </button>
                )
              })}
            </div>

            {/* Explanation + sources (auto-show on answer) */}
            {show && (
              <div className="space-y-2">
                <p className="text-xs px-3 py-2 rounded-2xl"
                  style={{ background: 'rgba(200,165,90,0.08)', color: '#d6d6dc', border: '1px solid rgba(200,165,90,0.14)' }}>
                  💡 {q.explanation || (chosen === q.answer ? '回答正确！' : `正确答案是 ${q.answer}`)}
                </p>

                {/* Source PDF attribution */}
                {sourceObj && sourceObj.storage_url && (
                  <a href={sourceObj.storage_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100 px-1"
                    style={{ color: '#60A5FA', opacity: 0.8 }}>
                    <FileText size={12} />
                    {lang === 'zh' ? '来源：' : 'Source: '}{sourceObj.file_name}
                    <ExternalLink size={10} />
                  </a>
                )}
                {/* Fallback: show overall sources */}
                {!sourceObj && sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-1">
                    {sources.slice(0, 3).map(s => s.storage_url ? (
                      <a key={s.artifact_id} href={s.storage_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs transition-opacity hover:opacity-100"
                        style={{ color: '#60A5FA', opacity: 0.7 }}>
                        <FileText size={11} />{s.file_name}<ExternalLink size={9} />
                      </a>
                    ) : null)}
                  </div>
                )}
              </div>
            )}

            {/* Bottom row: translation + ask AI */}
            <div className="flex items-center justify-between pt-1">
              {courseId && (
                <TranslatablePanel
                  courseId={courseId}
                  texts={[q.question, ...q.options, q.explanation || ''].filter(Boolean)}
                />
              )}
              {courseId && (
                <button onClick={() => askAI(q.question)}
                  className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100 flex-shrink-0"
                  style={{ color: '#555', opacity: 0.7 }}>
                  <HelpCircle size={12} />
                  {lang === 'zh' ? '不懂？问 AI' : 'Ask AI'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Final summary card */}
      {allDone && (
        <div className="rounded-[30px] border border-white/8 bg-white/[0.03] p-6 text-center space-y-3">
          <p className="text-3xl font-bold" style={{ color: '#e6cf98' }}>
            {correctCount} / {questions.length}
          </p>
          <p className="text-sm" style={{ color: '#AAA' }}>
            {lang === 'zh'
              ? `答对 ${correctCount} 题，答错 ${questions.length - correctCount} 题`
              : `${correctCount} correct, ${questions.length - correctCount} incorrect`}
          </p>
          {questions.length - correctCount > 0 && (
            <p className="text-xs" style={{ color: '#666' }}>
              {lang === 'zh' ? '错题已自动收录到「错题集」' : 'Wrong answers saved to Mistakes'}
            </p>
          )}
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => { setAnswers({}); setRevealed({}) }}
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#ddd', border: '1px solid rgba(255,255,255,0.08)' }}>
              <RotateCcw size={14} /> {lang === 'zh' ? '再做一次' : 'Redo'}
            </button>
            {courseId && (
              <a href={`/courses/${courseId}?view=generate`}
                className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
                style={{ background: 'rgba(200,165,90,0.12)', color: '#e6cf98', border: '1px solid rgba(200,165,90,0.2)' }}>
                <Zap size={14} /> {lang === 'zh' ? '再来一套' : 'Generate New'}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
