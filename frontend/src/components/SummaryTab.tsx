'use client'

import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { parseContentJson, extractToc, extractTocFromHtml } from '@/lib/utils'
import type { ContentFormat } from '@/lib/utils'
import type { SummarySchemaV1 } from '@/lib/types'
import { FileText, Loader2, Zap } from 'lucide-react'
import { CubesLoader } from '@/components/Cubes'
import { GlowButton } from '@/components/GlowButton'
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

  if (status === 'loading') return <CubesLoader className="py-20" />

  if (status === 'not_published') return (
    <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
      <FileText size={52} className="mx-auto mb-4 opacity-20" />
      <p className="text-base font-medium text-white mb-2">摘要准备中</p>
      <p className="text-sm" style={{ color: '#555' }}>管理员正在整理课程内容，敬请期待</p>
    </div>
  )

  if (status === 'locked') return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* 模糊预览骨架 — 让用户感知内容存在，不是硬锁 */}
      <div
        className="px-8 py-6 space-y-3 select-none pointer-events-none"
        style={{ background: 'rgba(255,255,255,0.015)', filter: 'blur(1.5px)', opacity: 0.28 }}
        aria-hidden
      >
        <div className="h-5 w-2/5 rounded-full" style={{ background: 'rgba(255,215,0,0.3)' }} />
        <div className="h-3 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
        <div className="h-3 w-5/6 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="h-3 w-4/5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <div className="mt-5 h-4 w-1/3 rounded-full" style={{ background: 'rgba(255,215,0,0.2)' }} />
        <div className="h-3 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="h-3 w-3/4 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="h-3 w-5/6 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
        <div className="mt-5 h-4 w-2/5 rounded-full" style={{ background: 'rgba(255,215,0,0.18)' }} />
        <div className="h-3 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <div className="h-3 w-4/6 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>

      {/* 解锁升级条 */}
      <div
        className="px-6 py-5"
        style={{ borderTop: '1px solid rgba(255,215,0,0.1)', background: 'rgba(255,215,0,0.025)' }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white mb-1">AI 整理的课程知识摘要</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: '#555' }}>
              <span>章节核心知识点</span>
              <span>高频考点标注</span>
              <span>易错点分析</span>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            <GlowButton
              onClick={handleUnlock}
              disabled={unlocking}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-85 disabled:opacity-60"
              style={{ background: 'rgba(255,215,0,0.13)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.28)' }}
            >
              {unlocking ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {unlocking ? '解锁中…' : `解锁摘要  ·  ${creditsRequired} ✦`}
            </GlowButton>
            <span className="text-[11px]" style={{ color: '#3a3a3a' }}>一次解锁，本课永久有效</span>
          </div>
        </div>
        {error && <p className="mt-2 text-xs" style={{ color: '#FF6666' }}>{error}</p>}
      </div>
    </div>
  )

  // ── Schema V1: two-column with section TOC ──
  if (format === 'summary_v1' && schema) {
    const WEIGHT_DOT: Record<string, string> = { high: '#FF6B6B', medium: '#FFD700', low: '#444' }
    return (
      <div className="flex gap-0 min-h-[70vh]">
        <div className="w-[280px] xl:w-[300px] flex-shrink-0 pr-5">
          <div
            className="sticky top-4 max-h-[calc(100vh-132px)] overflow-y-auto rounded-[24px] px-3 py-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <p className="text-[11px] font-semibold mb-3 uppercase tracking-[0.24em] px-2" style={{ color: '#666' }}>章节</p>
            {schema.sections.map((sec, i) => (
              <button key={i} onClick={() => scrollToSection(i)}
                className="w-full text-left text-[13px] py-2.5 px-3.5 rounded-xl transition-all hover:bg-white/5 leading-snug flex items-center gap-3"
                style={{
                  color: activeSectionIdx === i ? '#FFD700' : '#8b8b92',
                  background: activeSectionIdx === i ? 'rgba(255,215,0,0.08)' : 'transparent',
                }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: WEIGHT_DOT[sec.exam_weight] ?? '#444' }} />
                <span className="truncate font-medium">{sec.heading}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="w-px flex-shrink-0 mr-7" style={{ background: 'rgba(255,255,255,0.06)' }} />
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
          <div className="w-[280px] xl:w-[300px] flex-shrink-0 pr-5">
            <div
              className="sticky top-4 space-y-0.5 max-h-[calc(100vh-132px)] overflow-y-auto rounded-[24px] px-3 py-4"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <p className="text-[11px] font-semibold mb-3 uppercase tracking-[0.24em] px-2" style={{ color: '#666' }}>目录</p>
              {toc.map((item, i) => (
                <button key={i} onClick={() => scrollTo(item.id)}
                  className="w-full text-left text-[13px] py-2.5 rounded-xl transition-all hover:bg-white/5 leading-snug"
                  style={{
                    color: item.level === 1 ? '#FFD700' : item.level === 2 ? '#CCC' : '#888',
                    paddingLeft: item.level <= 2 ? '14px' : '28px',
                    fontWeight: item.level <= 2 ? 600 : 400,
                  }}>
                  {item.title}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px flex-shrink-0 mr-7" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </>
      )}

      {error && <p className="text-sm mb-4" style={{ color: '#FF6666' }}>{error}</p>}
      {format === 'markdown' && <MarkdownContent content={content} contentRef={contentRef} />}
      {format === 'html'     && <HtmlContent     content={content} contentRef={contentRef} />}
      {format === 'json'     && <KnowledgeSummaryRenderer rawJson={rawJson} />}
    </div>
  )
}
