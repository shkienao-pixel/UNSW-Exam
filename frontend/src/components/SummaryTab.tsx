'use client'

import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { parseContentJson, extractToc, extractTocFromHtml } from '@/lib/utils'
import type { ContentFormat } from '@/lib/utils'
import type { SummarySchemaV1 } from '@/lib/types'
import { FileText, Loader2, Zap } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import SummarySchemaRenderer from '@/components/SummarySchemaRenderer'
import KnowledgeSummaryRenderer from '@/components/KnowledgeSummaryRenderer'

// ── Markdown 渲染（带 TOC anchor） ────────────────────────────────────────────

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

// ── HTML 渲染（iframe 隔离，带 heading id 注入） ───────────────────────────────

function HtmlContent({ content, contentRef }: { content: string; contentRef: React.RefObject<HTMLDivElement | null> }) {
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
          const iframe = e.currentTarget
          const body = iframe.contentDocument?.body
          if (body) iframe.style.height = body.scrollHeight + 32 + 'px'
        }}
      />
    </div>
  )
}

// ── Summary Tab ───────────────────────────────────────────────────────────────

export default function SummaryTab({ courseId }: { courseId: string }) {
  const [status, setStatus]                   = useState<'loading' | 'not_published' | 'locked' | 'unlocked'>('loading')
  const [creditsRequired, setCreditsRequired] = useState(200)
  const [format, setFormat]                   = useState<ContentFormat>('markdown')
  const [content, setContent]                 = useState('')
  const [rawJson, setRawJson]                 = useState<unknown>(null)
  const [schema, setSchema]                   = useState<SummarySchemaV1 | null>(null)
  const [unlocking, setUnlocking]             = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const contentRef                            = useRef<HTMLDivElement>(null)
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
