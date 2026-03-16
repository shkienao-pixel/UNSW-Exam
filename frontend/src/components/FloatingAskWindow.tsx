'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MessageCircleMore, X, Minus, Send, ImagePlus, Square,
  Loader2, Sparkles, Copy, Check, RefreshCw, Trash2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { useFloatingAsk } from '@/lib/floating-ask-context'

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_W     = 360
const MIN_H     = 440
const DEFAULT_W = 480
const DEFAULT_H = 620
const POS_KEY   = 'floating_ask_pos'
const SIZE_KEY  = 'floating_ask_size'

type ResizeDir = 'e' | 's' | 'se'

// ── localStorage helpers (module-level) ───────────────────────────────────────

function loadSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: DEFAULT_W, h: DEFAULT_H }
  try {
    const raw = localStorage.getItem(SIZE_KEY)
    if (!raw) return { w: DEFAULT_W, h: DEFAULT_H }
    const s = JSON.parse(raw) as { w: number; h: number }
    return {
      w: Math.max(MIN_W, Math.min(window.innerWidth  - 40, s.w)),
      h: Math.max(MIN_H, Math.min(window.innerHeight - 40, s.h)),
    }
  } catch { return { w: DEFAULT_W, h: DEFAULT_H } }
}

function loadPos(): { x: number; y: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { x: number; y: number }
    return {
      x: Math.max(0, Math.min(window.innerWidth  - 60, p.x)),
      y: Math.max(0, Math.min(window.innerHeight - 60, p.y)),
    }
  } catch { return null }
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src} alt="全屏"
        style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: '0.75rem' }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
      >
        <X size={18} />
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FloatingAskWindow() {
  const {
    isOpen, isMinimized, messages, courseId, credits,
    unreadCount, isLoading, prefillText,
    minimizeWindow, openWindow, closeWindow, clearMessages, clearPrefill,
    sendMessage, stopGeneration,
  } = useFloatingAsk()

  // ── Position & size ──────────────────────────────────────────────────────────
  const [pos,  setPos]  = useState({ x: -1, y: -1 })
  const [size, setSize] = useState<{ w: number; h: number }>(() =>
    typeof window !== 'undefined' ? loadSize() : { w: DEFAULT_W, h: DEFAULT_H }
  )

  const isDragging   = useRef(false)
  const dragOffset   = useRef({ x: 0, y: 0 })
  const currentPos   = useRef({ x: 0, y: 0 })
  const dragStartPos = useRef({ x: 0, y: 0 })
  const isResizing   = useRef<ResizeDir | null>(null)
  const resizeStart  = useRef({ mouseX: 0, mouseY: 0, w: 0, h: 0 })

  // ── Responsive: mobile detection (updates on resize) ─────────────────────────
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Mobile: track keyboard height via visualViewport ─────────────────────────
  const [sheetHeight, setSheetHeight] = useState('85dvh')
  useEffect(() => {
    if (!isMobile) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      // available height = visualViewport height (shrinks when keyboard opens)
      const available = vv.height
      const total = window.innerHeight
      const ratio = available / total
      // cap between 40dvh and 85dvh so it doesn't collapse too small
      const pct = Math.min(85, Math.max(40, Math.round(ratio * 85)))
      setSheetHeight(`${pct}dvh`)
    }
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [isMobile])

  // ── Init position on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (pos.x === -1 && typeof window !== 'undefined') {
      const saved = loadPos()
      const FAB = 52
      const x = saved?.x ?? Math.max(20, window.innerWidth  - FAB - 28)
      const y = saved?.y ?? Math.max(20, window.innerHeight - FAB - 28)
      setPos({ x, y })
      currentPos.current = { x, y }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Global mousemove / mouseup ───────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (isResizing.current) {
        const dir = isResizing.current
        const { mouseX, mouseY, w, h } = resizeStart.current
        const dx = e.clientX - mouseX
        const dy = e.clientY - mouseY
        const newW = dir === 's' ? w : Math.max(MIN_W, Math.min(window.innerWidth  - currentPos.current.x - 8, w + dx))
        const newH = dir === 'e' ? h : Math.max(MIN_H, Math.min(window.innerHeight - currentPos.current.y - 8, h + dy))
        setSize({ w: newW, h: newH })
        return
      }
      if (!isDragging.current) return
      const newX = Math.max(0, Math.min(window.innerWidth  - 60, e.clientX - dragOffset.current.x))
      const newY = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y))
      currentPos.current = { x: newX, y: newY }
      setPos({ x: newX, y: newY })
    }
    function onUp() {
      if (isResizing.current) {
        isResizing.current = null
        setSize(s => {
          try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
          return s
        })
        return
      }
      if (isDragging.current) {
        isDragging.current = false
        try { localStorage.setItem(POS_KEY, JSON.stringify(currentPos.current)) } catch { /* ignore */ }
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [])

  // ── Input state ──────────────────────────────────────────────────────────────
  const [input,        setInput]        = useState('')
  const [copiedId,     setCopiedId]     = useState<string | null>(null)
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [lightboxSrc,  setLightboxSrc]  = useState<string | null>(null)

  const bottomRef     = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const textareaRef   = useRef<HTMLTextAreaElement>(null)

  // ── Consume prefillText ──────────────────────────────────────────────────────
  useEffect(() => {
    if (prefillText) {
      setInput(prefillText)
      clearPrefill()
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [prefillText, clearPrefill])

  // ── Scroll to bottom on new messages ────────────────────────────────────────
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages, isOpen, isMinimized])

  // ── Paste image from clipboard ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || isMinimized) return
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          setImageFile(file)
          const reader = new FileReader()
          reader.onload = ev => setImagePreview(ev.target?.result as string)
          reader.readAsDataURL(file)
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [isOpen, isMinimized])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleFabMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    isDragging.current = true
    dragOffset.current = {
      x: e.clientX - currentPos.current.x,
      y: e.clientY - currentPos.current.y,
    }
  }

  function handleFabMouseUp(e: React.MouseEvent) {
    const dx = e.clientX - dragStartPos.current.x
    const dy = e.clientY - dragStartPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) < 6) openWindow()
  }

  function handleResizeMouseDown(e: React.MouseEvent, dir: ResizeDir) {
    e.preventDefault()
    e.stopPropagation()
    isResizing.current = dir
    resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: size.w, h: size.h }
  }

  function handleTitleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    isDragging.current = true
    dragOffset.current = {
      x: e.clientX - currentPos.current.x,
      y: e.clientY - currentPos.current.y,
    }
  }

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

  function handleSend() {
    const q = input.trim()
    if ((!q && !imageFile) || isLoading || !courseId) return
    sendMessage(q || '请分析这张图片', imageFile)
    setInput('')
    clearImage()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  // ── Typography scale: larger on desktop ──────────────────────────────────────
  const fs = isMobile
    ? { base: '13px', sm: '12px', xs: '11px', title: '14px' }
    : { base: '15px', sm: '13px', xs: '12px', title: '15px' }

  // ── FAB (closed or minimized) ────────────────────────────────────────────────
  if (!isOpen || isMinimized) {
    if (pos.x === -1) return null
    return (
      <div
        onMouseDown={handleFabMouseDown}
        onMouseUp={handleFabMouseUp}
        title="AI 问答（可拖动，点击打开）"
        className="fixed z-50 flex items-center justify-center rounded-full shadow-2xl select-none"
        style={{
          left: pos.x, top: pos.y,
          width: 52, height: 52,
          background: isLoading ? 'rgba(255,215,0,0.18)' : 'rgba(20,22,30,0.92)',
          border: `1px solid ${isLoading ? 'rgba(255,215,0,0.6)' : 'rgba(255,215,0,0.35)'}`,
          color: '#FFD700',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          cursor: 'grab',
          boxShadow: isLoading ? '0 0 18px rgba(255,215,0,0.25)' : '0 8px 32px rgba(0,0,0,0.45)',
        }}
      >
        {isLoading
          ? <Loader2 size={22} className="animate-spin" />
          : <MessageCircleMore size={22} />
        }
        {isLoading && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); stopGeneration() }}
            title="停止生成"
            className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full"
            style={{ width: 20, height: 20, background: '#ef4444', color: '#fff', border: '2px solid rgba(20,22,30,0.9)' }}
          >
            <Square size={9} />
          </button>
        )}
        {!isLoading && unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full font-bold"
            style={{ width: 18, height: 18, background: '#ef4444', color: '#fff', fontSize: 10, lineHeight: '18px' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>
    )
  }

  // ── Inner content (shared between mobile/desktop) ────────────────────────────
  const innerContent = (
    <>
      {/* Title bar */}
      <div
        className={`flex items-center gap-2 px-4 py-3 flex-shrink-0 ${isMobile ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        onMouseDown={isMobile ? undefined : handleTitleMouseDown}
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.2)' }}
        >
          <Sparkles size={12} style={{ color: '#FFD700' }} />
        </div>
        <span className="font-semibold flex-1" style={{ color: '#E5E5E5', fontSize: fs.title }}>
          AI 问答
        </span>
        {credits !== null && (
          <span
            title="当前积分余额"
            style={{
              fontSize: fs.xs,
              color: credits < 40 ? '#f87171' : '#666',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${credits < 40 ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '0.4rem',
              padding: '1px 6px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {credits} 分
          </span>
        )}
        {isLoading && (
          <button
            onClick={stopGeneration}
            title="停止生成"
            className="flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition-colors"
            style={{ fontSize: fs.xs, background: 'rgba(239,68,68,0.15)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <Square size={10} /> 停止
          </button>
        )}
        {messages.length > 0 && !isLoading && (
          <button
            onClick={clearMessages}
            title="清空对话"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: '#444' }}
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          onClick={minimizeWindow}
          title="最小化"
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          style={{ color: '#444' }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={closeWindow}
          title="收起（生成不中断）"
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          style={{ color: '#444' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 pb-8">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.15)' }}
            >
              <MessageCircleMore size={22} style={{ color: '#FFD700', opacity: 0.6 }} />
            </div>
            <p style={{ color: '#444', fontSize: fs.base, textAlign: 'center' }}>
              {courseId ? '有什么不懂的？直接问 AI' : '请先进入课程页面'}
            </p>
            {courseId && (
              <p className="px-3 py-1.5 rounded-lg" style={{ color: '#333', fontSize: fs.sm, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                支持 Ctrl+V 粘贴截图 · 截图后直接发
              </p>
            )}
          </div>
        )}

        {messages.map(m => (
          <div key={m.id}>
            {m.role === 'user' ? (
              /* User bubble */
              <div className="flex flex-col items-end gap-1.5">
                {m.imagePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.imagePreview}
                    alt="截图"
                    className="max-w-[240px] max-h-[180px] rounded-xl object-cover cursor-zoom-in"
                    style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                    onClick={() => setLightboxSrc(m.imagePreview!)}
                  />
                )}
                {m.content && (
                  <div
                    className="px-3.5 py-2.5 rounded-2xl max-w-[88%] whitespace-pre-wrap"
                    style={{
                      fontSize: fs.base,
                      background: 'rgba(255,255,255,0.08)',
                      color: '#E5E5E5',
                      border: '1px solid rgba(255,255,255,0.1)',
                      lineHeight: '1.65',
                    }}
                  >
                    {m.content}
                  </div>
                )}
              </div>
            ) : (
              /* Assistant bubble */
              <div className="flex gap-3">
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                  style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.2)' }}
                >
                  <Sparkles size={12} style={{ color: '#FFD700' }} />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {m.pending ? (
                    <div className="flex items-center gap-2 py-1" style={{ color: '#555' }}>
                      <Loader2 size={14} className="animate-spin flex-shrink-0" />
                      <span style={{ fontSize: fs.base }}>正在分析图片，可最小化去做题…</span>
                    </div>
                  ) : m.streaming && !m.content ? (
                    <div className="flex items-center gap-2 py-1" style={{ color: '#555' }}>
                      <Loader2 size={14} className="animate-spin flex-shrink-0" />
                      <span style={{ fontSize: fs.base }}>
                        {m.streamStatus === 'generating' ? '生成回答…' : '思考中…'}
                      </span>
                    </div>
                  ) : m.failed && !m.content ? (
                    <p style={{ fontSize: fs.base, color: '#f87171' }}>请求失败，请重试</p>
                  ) : (
                    <div
                      className="prose prose-invert max-w-none"
                      style={{
                        color: '#D1D5DB',
                        lineHeight: '1.8',
                        fontSize: fs.base,
                      }}
                    >
                      <ReactMarkdown
                        rehypePlugins={[rehypeHighlight]}
                        components={{
                          // Override prose default sizes to match our fs scale
                          p: ({ children }) => (
                            <p style={{ fontSize: fs.base, marginTop: '0.6em', marginBottom: '0.6em' }}>{children}</p>
                          ),
                          li: ({ children }) => (
                            <li style={{ fontSize: fs.base }}>{children}</li>
                          ),
                          img: ({ src, alt }) => {
                            const s = typeof src === 'string' ? src : ''
                            return (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={s} alt={alt ?? 'AI 图'}
                                style={{ maxWidth: '100%', borderRadius: '0.5rem', cursor: s ? 'zoom-in' : undefined, marginTop: '0.5rem' }}
                                onClick={() => s && setLightboxSrc(s)}
                              />
                            )
                          },
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                      {m.streaming && (
                        <span
                          className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse"
                          style={{ background: '#FFD700', borderRadius: '1px' }}
                        />
                      )}
                    </div>
                  )}

                  {/* Action row */}
                  {!m.streaming && !m.pending && (
                    <div className="flex items-center gap-1 pt-0.5">
                      {m.content && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(m.content).catch(() => {})
                            setCopiedId(m.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          }}
                          title="复制"
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors hover:bg-white/10"
                          style={{ fontSize: fs.xs, color: copiedId === m.id ? '#4ade80' : '#444' }}
                        >
                          {copiedId === m.id ? <Check size={11} /> : <Copy size={11} />}
                          {copiedId === m.id ? '已复制' : '复制'}
                        </button>
                      )}
                      {m.failed && (
                        <button
                          onClick={() => {
                            const idx = messages.findIndex(x => x.id === m.id)
                            const userMsg = idx > 0 ? messages.slice(0, idx).reverse().find(x => x.role === 'user') : null
                            if (userMsg) sendMessage(userMsg.content, null)
                          }}
                          title="重试"
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors hover:bg-white/10"
                          style={{ fontSize: fs.xs, color: '#f87171' }}
                        >
                          <RefreshCw size={11} />重试
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        className="flex-shrink-0 px-3 pb-3 space-y-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}
      >
        {/* Image preview strip */}
        {imagePreview && (
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview} alt=""
              className="h-9 w-9 rounded-lg object-cover flex-shrink-0 cursor-zoom-in"
              onClick={() => setLightboxSrc(imagePreview)}
            />
            <span className="flex-1 truncate" style={{ fontSize: fs.sm, color: '#666' }}>
              {imageFile?.name ?? '截图'}
            </span>
            <button
              onClick={clearImage}
              className="p-0.5 rounded hover:bg-white/10 flex-shrink-0"
              style={{ color: '#555' }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Textarea + buttons */}
        <div
          className="relative rounded-xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />

          <textarea
            ref={textareaRef}
            rows={1}
            disabled={!courseId}
            className="w-full bg-transparent resize-none outline-none"
            style={{
              fontSize: fs.base,
              color: '#E5E5E5',
              padding: '11px 48px 11px 44px',
              lineHeight: '1.6',
              maxHeight: 160,
              overflowY: 'auto',
            }}
            placeholder={
              !courseId   ? '请先进入课程页面'
              : isLoading ? '生成中，可最小化继续做题…'
              : '提问，或 Ctrl+V 粘贴截图'
            }
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
          />

          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={isLoading || !courseId}
            title="上传图片"
            className="absolute left-2.5 bottom-2.5 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: imagePreview ? '#FFD700' : '#555' }}
          >
            <ImagePlus size={15} />
          </button>

          {isLoading ? (
            <button
              onClick={stopGeneration}
              title="停止生成"
              className="absolute right-2.5 bottom-2.5 p-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !imageFile) || !courseId}
              title="发送"
              className="absolute right-2.5 bottom-2.5 p-1.5 rounded-lg transition-all"
              style={{
                background: (input.trim() || imageFile) && courseId ? 'rgba(255,215,0,0.9)' : 'rgba(255,255,255,0.06)',
                color: (input.trim() || imageFile) && courseId ? '#000' : '#444',
              }}
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </>
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {isMobile ? (
        /* Mobile: bottom sheet */
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={minimizeWindow}
          />
          <div
            className="fixed z-50 flex flex-col overflow-hidden"
            style={{
              left: 0, right: 0, bottom: 0,
              height: sheetHeight,
              borderRadius: '20px 20px 0 0',
              background: 'rgba(7,8,15,0.99)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderBottom: 'none',
              boxShadow: '0 -16px 48px rgba(0,0,0,0.5)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
            </div>
            {innerContent}
          </div>
        </>
      ) : (
        /* Desktop: draggable + resizable floating window */
        <div
          className="fixed z-50 flex flex-col rounded-2xl"
          style={{
            left:   pos.x < 0 ? 'auto' : pos.x,
            right:  pos.x < 0 ? 20 : undefined,
            top:    pos.y < 0 ? 'auto' : pos.y,
            bottom: pos.y < 0 ? 20 : undefined,
            width:  size.w,
            height: size.h,
            minWidth:  MIN_W,
            minHeight: MIN_H,
            background: 'rgba(7,8,15,0.97)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)',
            userSelect: 'none',
            overflow: 'hidden',
          }}
        >
          {innerContent}

          {/* Resize handles */}
          <div
            onMouseDown={e => handleResizeMouseDown(e, 'e')}
            style={{ position: 'absolute', top: 0, right: 0, width: 5, height: '100%', cursor: 'ew-resize', zIndex: 10 }}
          />
          <div
            onMouseDown={e => handleResizeMouseDown(e, 's')}
            style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 5, cursor: 'ns-resize', zIndex: 10 }}
          />
          <div
            onMouseDown={e => handleResizeMouseDown(e, 'se')}
            style={{
              position: 'absolute', bottom: 0, right: 0, width: 16, height: 16,
              cursor: 'nwse-resize', zIndex: 11,
              background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.12) 50%)',
              borderRadius: '0 0 16px 0',
            }}
          />
        </div>
      )}
    </>
  )
}
