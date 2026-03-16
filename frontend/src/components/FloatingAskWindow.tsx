'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MessageCircleMore, X, Minus, Send, ImagePlus, Square,
  Loader2, Sparkles, ExternalLink, Trash2, BookOpen, Copy, Check, RefreshCw,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { useFloatingAsk } from '@/lib/floating-ask-context'

const WINDOW_W = 420
const WINDOW_H = 560

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
    isOpen, isMinimized, messages, courseId, scopeSets, artifacts,
    unreadCount, isLoading, prefillText,
    minimizeWindow, openWindow, closeWindow, clearMessages, clearPrefill,
    sendMessage, stopGeneration,
  } = useFloatingAsk()

  // ── Window position ─────────────────────────────────────────────────────────
  const POS_KEY = 'floating_ask_pos'

  function loadPos(): { x: number; y: number } | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(POS_KEY)
      if (!raw) return null
      const p = JSON.parse(raw) as { x: number; y: number }
      // Clamp to current viewport in case user resized window
      return {
        x: Math.max(0, Math.min(window.innerWidth  - WINDOW_W, p.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60,        p.y)),
      }
    } catch { return null }
  }

  const [pos, setPos] = useState({ x: -1, y: -1 })
  const isDragging  = useRef(false)
  const dragOffset  = useRef({ x: 0, y: 0 })
  const currentPos  = useRef({ x: 0, y: 0 })

  // Initialize position on mount: saved pos → default bottom-right
  useEffect(() => {
    if (pos.x === -1 && typeof window !== 'undefined') {
      const saved = loadPos()
      const x = saved?.x ?? Math.max(20, window.innerWidth  - WINDOW_W - 20)
      const y = saved?.y ?? Math.max(20, window.innerHeight - WINDOW_H - 20)
      setPos({ x, y })
      currentPos.current = { x, y }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Global mousemove / mouseup for dragging
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!isDragging.current) return
      const newX = Math.max(0, Math.min(window.innerWidth - WINDOW_W, e.clientX - dragOffset.current.x))
      const newY = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y))
      currentPos.current = { x: newX, y: newY }
      setPos({ x: newX, y: newY })
    }
    function onUp() {
      if (isDragging.current) {
        isDragging.current = false
        try { localStorage.setItem(POS_KEY, JSON.stringify(currentPos.current)) } catch { /* ignore */ }
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Input state ─────────────────────────────────────────────────────────────
  const [input, setInput]               = useState('')
  const [copiedId, setCopiedId]         = useState<string | null>(null)
  const [imageFile, setImageFile]       = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [scopeSetId, setScopeSetId]     = useState<number | undefined>()
  const [contextMode, setContextMode]   = useState<'all' | 'revision'>('all')
  const [lightboxSrc, setLightboxSrc]   = useState<string | null>(null)

  const bottomRef     = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const textareaRef   = useRef<HTMLTextAreaElement>(null)

  // Sync scopeSetId when scopeSets arrive
  useEffect(() => {
    if (scopeSets.length > 0 && !scopeSetId) setScopeSetId(scopeSets[0].id)
  }, [scopeSets, scopeSetId])

  // Consume prefillText from context
  useEffect(() => {
    if (prefillText) {
      setInput(prefillText)
      clearPrefill()
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [prefillText, clearPrefill])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages, isOpen, isMinimized])

  // Paste image from clipboard (Ctrl+V)
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

  // ── Handlers ────────────────────────────────────────────────────────────────

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
    sendMessage(q || '请分析这张图片', imageFile, scopeSetId, contextMode)
    setInput('')
    clearImage()
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }

  const revisionCount = artifacts.filter(a => a.status === 'approved' && a.doc_type === 'revision').length

  // Detect mobile (≤768px) — evaluated each render, SSR-safe
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  // ── Render: not open ────────────────────────────────────────────────────────
  if (!isOpen) return null

  // ── Render: minimized FAB ───────────────────────────────────────────────────
  if (isMinimized) {
    return (
      <button
        onClick={openWindow}
        title="AI 问答"
        className="fixed z-50 flex items-center justify-center rounded-full shadow-2xl transition-transform hover:scale-105"
        style={{
          bottom: 28,
          right: 52,
          width: 52,
          height: 52,
          background: 'rgba(255,215,0,0.14)',
          border: '1px solid rgba(255,215,0,0.32)',
          color: '#FFD700',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <MessageCircleMore size={22} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full font-bold"
            style={{
              width: 18, height: 18,
              background: '#ef4444', color: '#fff',
              fontSize: 10, lineHeight: '18px',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    )
  }

  // ── Shared: inner content (title + messages + input) ────────────────────────
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
          <span className="text-sm font-semibold flex-1" style={{ color: '#E5E5E5' }}>
            AI 问答
          </span>
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              title="清空对话"
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: '#444' }}
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={minimizeWindow}
            title="最小化"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: '#444' }}
          >
            <Minus size={13} />
          </button>
          <button
            onClick={closeWindow}
            title="关闭"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: '#444' }}
          >
            <X size={13} />
          </button>
        </div>

        {/* ── Message list ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 pb-8">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.15)' }}
              >
                <MessageCircleMore size={20} style={{ color: '#FFD700', opacity: 0.6 }} />
              </div>
              <p className="text-sm text-center" style={{ color: '#444' }}>
                {courseId ? '有什么不懂的？直接问 AI' : '请先进入课程页面'}
              </p>
              {courseId && (
                <p className="text-xs px-3 py-1 rounded-lg" style={{ color: '#333', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  支持 Ctrl+V 粘贴截图 · 截图后直接发
                </p>
              )}
            </div>
          )}

          {messages.map(m => (
            <div key={m.id}>
              {m.role === 'user' ? (
                /* ── User bubble ── */
                <div className="flex flex-col items-end gap-1.5">
                  {m.imagePreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imagePreview}
                      alt="截图"
                      className="max-w-[220px] max-h-[160px] rounded-xl object-cover cursor-zoom-in"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                      onClick={() => setLightboxSrc(m.imagePreview!)}
                    />
                  )}
                  {m.content && (
                    <div
                      className="px-3 py-2.5 rounded-2xl text-sm max-w-[85%] whitespace-pre-wrap"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: '#E5E5E5',
                        border: '1px solid rgba(255,255,255,0.1)',
                        lineHeight: '1.6',
                      }}
                    >
                      {m.content}
                    </div>
                  )}
                </div>
              ) : (
                /* ── Assistant bubble ── */
                <div className="flex gap-2.5">
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                    style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.2)' }}
                  >
                    <Sparkles size={11} style={{ color: '#FFD700' }} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    {m.pending ? (
                      <div className="flex items-center gap-2 py-1" style={{ color: '#555' }}>
                        <Loader2 size={13} className="animate-spin flex-shrink-0" />
                        <span className="text-sm">正在分析图片，可最小化去做题…</span>
                      </div>
                    ) : m.streaming && !m.content ? (
                      <div className="flex items-center gap-2 py-1" style={{ color: '#555' }}>
                        <Loader2 size={13} className="animate-spin flex-shrink-0" />
                        <span className="text-sm">
                          {m.streamStatus === 'filtering'  ? '搜索相关资料…'      :
                           m.streamStatus === 'generating' ? '生成回答…'          :
                           m.streamStatus === 'slow'       ? '深度思考中，稍等…'  :
                           '思考中…'}
                        </span>
                      </div>
                    ) : m.failed && !m.content ? (
                      <p className="text-sm" style={{ color: '#f87171' }}>请求失败，请重试</p>
                    ) : (
                      <div
                        className="prose prose-invert prose-sm max-w-none"
                        style={{ color: '#D1D5DB', lineHeight: '1.75' }}
                      >
                        <ReactMarkdown
                          rehypePlugins={[rehypeHighlight]}
                          components={{
                            img: ({ src, alt }) => {
                              const s = typeof src === 'string' ? src : ''
                              return (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={s} alt={alt ?? 'AI 图'}
                                  style={{
                                    maxWidth: '100%', borderRadius: '0.5rem',
                                    cursor: s ? 'zoom-in' : undefined,
                                    marginTop: '0.5rem',
                                  }}
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
                            className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse"
                            style={{ background: '#FFD700', borderRadius: '1px' }}
                          />
                        )}
                      </div>
                    )}

                    {/* Sources */}
                    {m.sources && m.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.sources.map(s =>
                          s.storage_url ? (
                            <a
                              key={s.artifact_id}
                              href={s.storage_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-opacity hover:opacity-100"
                              style={{
                                background: 'rgba(255,215,0,0.06)',
                                color: '#FFD700', opacity: 0.65,
                                border: '1px solid rgba(255,215,0,0.12)',
                              }}
                            >
                              <ExternalLink size={8} />{s.file_name}
                            </a>
                          ) : null
                        )}
                      </div>
                    )}

                    {/* Action row: copy + retry */}
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
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-colors hover:bg-white/10"
                            style={{ color: copiedId === m.id ? '#4ade80' : '#444' }}
                          >
                            {copiedId === m.id ? <Check size={11} /> : <Copy size={11} />}
                            {copiedId === m.id ? '已复制' : '复制'}
                          </button>
                        )}
                        {m.failed && (
                          <button
                            onClick={() => {
                              // Find the preceding user message and resend
                              const msgs = messages
                              const idx = msgs.findIndex(x => x.id === m.id)
                              const userMsg = idx > 0 ? msgs.slice(0, idx).reverse().find(x => x.role === 'user') : null
                              if (userMsg) sendMessage(userMsg.content, null, scopeSetId, contextMode)
                            }}
                            title="重试"
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-colors hover:bg-white/10"
                            style={{ color: '#f87171' }}
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

        {/* ── Input area ── */}
        <div
          className="flex-shrink-0 px-3 pb-3 space-y-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}
        >
          {/* Scope + context mode row */}
          {scopeSets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                className="text-xs py-0.5 px-2 rounded-lg outline-none cursor-pointer"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#777',
                }}
                value={scopeSetId ?? ''}
                onChange={e => setScopeSetId(Number(e.target.value) || undefined)}
              >
                {scopeSets.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (全部)' : ''}</option>
                ))}
              </select>

              {(['all', 'revision'] as const).map(mode => {
                const disabled = mode === 'revision' && revisionCount === 0
                const active = contextMode === mode
                return (
                  <button
                    key={mode}
                    disabled={disabled}
                    onClick={() => setContextMode(mode)}
                    className="text-xs px-2 py-0.5 rounded-full transition-all"
                    style={{
                      background: active
                        ? (mode === 'revision' ? 'rgba(99,102,241,0.18)' : 'rgba(255,215,0,0.12)')
                        : 'transparent',
                      border: `1px solid ${active
                        ? (mode === 'revision' ? 'rgba(99,102,241,0.35)' : 'rgba(255,215,0,0.28)')
                        : 'rgba(255,255,255,0.07)'}`,
                      color: active ? (mode === 'revision' ? '#a5b4fc' : '#FFD700') : '#555',
                      opacity: disabled ? 0.3 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {mode === 'all' ? '全库' : (
                      <span className="flex items-center gap-1">
                        <BookOpen size={9} />仅复习
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Image preview strip */}
          {imagePreview && (
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview} alt=""
                className="h-8 w-8 rounded-lg object-cover flex-shrink-0 cursor-zoom-in"
                onClick={() => setLightboxSrc(imagePreview)}
              />
              <span className="text-xs flex-1 truncate" style={{ color: '#666' }}>
                {imageFile?.name ?? '截图'}
              </span>
              <button
                onClick={clearImage}
                className="p-0.5 rounded hover:bg-white/10 flex-shrink-0"
                style={{ color: '#555' }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Textarea + action buttons */}
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
              className="w-full bg-transparent text-sm resize-none outline-none"
              style={{
                color: '#E5E5E5',
                padding: '10px 44px 10px 40px',
                lineHeight: '1.55',
                maxHeight: 140,
                overflowY: 'auto',
              }}
              placeholder={
                !courseId ? '请先进入课程页面'
                : isLoading ? '生成中，可最小化继续做题…'
                : '提问，或 Ctrl+V 粘贴截图'
              }
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
            />

            {/* Upload image button */}
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isLoading || !courseId}
              title="上传图片"
              className="absolute left-2 bottom-2 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: imagePreview ? '#FFD700' : '#555' }}
            >
              <ImagePlus size={14} />
            </button>

            {/* Send / Stop */}
            {isLoading ? (
              <button
                onClick={stopGeneration}
                title="停止生成"
                className="absolute right-2 bottom-2 p-1.5 rounded-lg transition-colors"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !imageFile) || !courseId}
                title="发送"
                className="absolute right-2 bottom-2 p-1.5 rounded-lg transition-all"
                style={{
                  background: (input.trim() || imageFile) && courseId ? 'rgba(255,215,0,0.9)' : 'rgba(255,255,255,0.06)',
                  color: (input.trim() || imageFile) && courseId ? '#000' : '#444',
                }}
              >
                <Send size={13} />
              </button>
            )}
          </div>
        </div>
    </>
  )

  // ── Render: full window ─────────────────────────────────────────────────────
  return (
    <>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {isMobile ? (
        /* ── Mobile: bottom sheet ── */
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={minimizeWindow}
          />
          <div
            className="fixed z-50 flex flex-col overflow-hidden"
            style={{
              left: 0, right: 0, bottom: 0,
              height: '85dvh',
              borderRadius: '20px 20px 0 0',
              background: 'rgba(7,8,15,0.99)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderBottom: 'none',
              boxShadow: '0 -16px 48px rgba(0,0,0,0.5)',
              // iOS safe area
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {/* Drag handle pill */}
            <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
            </div>
            {innerContent}
          </div>
        </>
      ) : (
        /* ── Desktop: draggable floating window ── */
        <div
          className="fixed z-50 flex flex-col rounded-2xl overflow-hidden"
          style={{
            left: pos.x < 0 ? 'auto' : pos.x,
            right: pos.x < 0 ? 20 : undefined,
            top: pos.y < 0 ? 'auto' : pos.y,
            bottom: pos.y < 0 ? 20 : undefined,
            width: WINDOW_W,
            height: WINDOW_H,
            background: 'rgba(7,8,15,0.97)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)',
            userSelect: 'none',
          }}
        >
          {innerContent}
        </div>
      )}
    </>
  )
}
