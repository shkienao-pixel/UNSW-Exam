'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  ImagePlus,
  Loader2,
  MessageCircleMore,
  Minus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { useFloatingAsk } from '@/lib/floating-ask-context'

const MIN_W = 380
const MIN_H = 480
const DEFAULT_W = 520
const DEFAULT_H = 680
const POS_KEY = 'floating_ask_pos'
const SIZE_KEY = 'floating_ask_size'

type ResizeDir = 'e' | 's' | 'se'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function loadSize() {
  if (typeof window === 'undefined') return { w: DEFAULT_W, h: DEFAULT_H }
  try {
    const raw = localStorage.getItem(SIZE_KEY)
    if (!raw) return { w: DEFAULT_W, h: DEFAULT_H }
    const size = JSON.parse(raw) as { w: number; h: number }
    return {
      w: clamp(size.w, MIN_W, window.innerWidth - 28),
      h: clamp(size.h, MIN_H, window.innerHeight - 28),
    }
  } catch {
    return { w: DEFAULT_W, h: DEFAULT_H }
  }
}

function loadPos() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const pos = JSON.parse(raw) as { x: number; y: number }
    return {
      x: clamp(pos.x, 0, window.innerWidth - 68),
      y: clamp(pos.y, 0, window.innerHeight - 68),
    }
  } catch {
    return null
  }
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(3,4,10,0.88)' }}
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="preview"
        className="rounded-2xl"
        style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain' }}
        onClick={event => event.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full p-2"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
      >
        <X size={18} />
      </button>
    </div>
  )
}

export default function FloatingAskWindow() {
  const {
    isOpen,
    isMinimized,
    messages,
    courseId,
    courseName,
    credits,
    unreadCount,
    isLoading,
    prefillText,
    minimizeWindow,
    openWindow,
    closeWindow,
    clearMessages,
    clearPrefill,
    sendMessage,
    stopGeneration,
  } = useFloatingAsk()

  const [pos, setPos] = useState({ x: -1, y: -1 })
  const [size, setSize] = useState<{ w: number; h: number }>(() =>
    typeof window !== 'undefined' ? loadSize() : { w: DEFAULT_W, h: DEFAULT_H },
  )
  const [isMobile, setIsMobile] = useState(false)
  const [sheetHeight, setSheetHeight] = useState('86dvh')

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartRef = useRef({ x: 0, y: 0 })
  const currentPosRef = useRef({ x: 0, y: 0 })
  const resizeDirRef = useRef<ResizeDir | null>(null)
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, w: 0, h: 0 })

  const fs = isMobile
    ? { base: '13px', sm: '12px', xs: '11px', title: '15px' }
    : { base: '15px', sm: '13px', xs: '12px', title: '16px' }

  useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth <= 768)
    updateMobile()
    window.addEventListener('resize', updateMobile)
    return () => window.removeEventListener('resize', updateMobile)
  }, [])

  useEffect(() => {
    if (pos.x !== -1 || typeof window === 'undefined') return
    const saved = loadPos()
    const fallback = {
      x: Math.max(20, window.innerWidth - 84),
      y: Math.max(20, window.innerHeight - 84),
    }
    const next = saved ?? fallback
    setPos(next)
    currentPosRef.current = next
  }, [pos.x])

  useEffect(() => {
    if (!isMobile) return
    const viewport = window.visualViewport
    if (!viewport) return

    const updateHeight = () => {
      const ratio = viewport.height / window.innerHeight
      const pct = Math.min(88, Math.max(46, Math.round(ratio * 86)))
      setSheetHeight(`${pct}dvh`)
    }

    updateHeight()
    viewport.addEventListener('resize', updateHeight)
    return () => viewport.removeEventListener('resize', updateHeight)
  }, [isMobile])

  useEffect(() => {
    if (prefillText) {
      setInput(prefillText)
      clearPrefill()
      window.setTimeout(() => textareaRef.current?.focus(), 60)
    }
  }, [prefillText, clearPrefill])

  useEffect(() => {
    if (isOpen && !isMinimized) {
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    }
  }, [isOpen, isMinimized, messages])

  useEffect(() => {
    if (!isOpen || isMinimized) return
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        setImageFile(file)
        reader.onload = loadEvent => setImagePreview((loadEvent.target?.result as string) || null)
        reader.readAsDataURL(file)
        return
      }
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [isOpen, isMinimized])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (resizeDirRef.current) {
        const dx = event.clientX - resizeStartRef.current.mouseX
        const dy = event.clientY - resizeStartRef.current.mouseY
        setSize(prev => {
          const nextWidth =
            resizeDirRef.current === 's'
              ? prev.w
              : clamp(resizeStartRef.current.w + dx, MIN_W, window.innerWidth - currentPosRef.current.x - 10)
          const nextHeight =
            resizeDirRef.current === 'e'
              ? prev.h
              : clamp(resizeStartRef.current.h + dy, MIN_H, window.innerHeight - currentPosRef.current.y - 10)
          return { w: nextWidth, h: nextHeight }
        })
        return
      }

      if (!isDraggingRef.current) return
      const nextPos = {
        x: clamp(event.clientX - dragOffsetRef.current.x, 0, window.innerWidth - 68),
        y: clamp(event.clientY - dragOffsetRef.current.y, 0, window.innerHeight - 68),
      }
      currentPosRef.current = nextPos
      setPos(nextPos)
    }

    const onMouseUp = () => {
      if (resizeDirRef.current) {
        resizeDirRef.current = null
        localStorage.setItem(SIZE_KEY, JSON.stringify(size))
      }
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        localStorage.setItem(POS_KEY, JSON.stringify(currentPosRef.current))
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [size])

  function handleFabMouseDown(event: React.MouseEvent) {
    event.preventDefault()
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    isDraggingRef.current = true
    dragOffsetRef.current = {
      x: event.clientX - currentPosRef.current.x,
      y: event.clientY - currentPosRef.current.y,
    }
  }

  function handleFabMouseUp(event: React.MouseEvent) {
    const dx = event.clientX - dragStartRef.current.x
    const dy = event.clientY - dragStartRef.current.y
    if (Math.hypot(dx, dy) < 6) openWindow()
  }

  function handleTitleMouseDown(event: React.MouseEvent) {
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    isDraggingRef.current = true
    dragOffsetRef.current = {
      x: event.clientX - currentPosRef.current.x,
      y: event.clientY - currentPosRef.current.y,
    }
  }

  function handleResizeMouseDown(event: React.MouseEvent, dir: ResizeDir) {
    event.preventDefault()
    event.stopPropagation()
    resizeDirRef.current = dir
    resizeStartRef.current = { mouseX: event.clientX, mouseY: event.clientY, w: size.w, h: size.h }
  }

  function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    setImageFile(file)
    reader.onload = loadEvent => setImagePreview((loadEvent.target?.result as string) || null)
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value)
    event.target.style.height = 'auto'
    event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`
  }

  function handleSend() {
    const question = input.trim()
    if ((!question && !imageFile) || isLoading || !courseId) return
    sendMessage(question || '请分析这张图片', imageFile)
    setInput('')
    clearImage()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  if (lightboxSrc) {
    return <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
  }

  if (!isOpen || isMinimized) {
    if (pos.x === -1) return null
    return (
      <div
        onMouseDown={handleFabMouseDown}
        onMouseUp={handleFabMouseUp}
        title="AI 问答"
        className="fixed z-50 flex items-center justify-center rounded-full select-none"
        style={{
          left: pos.x,
          top: pos.y,
          width: 58,
          height: 58,
          background: isLoading
            ? 'radial-gradient(circle at 30% 28%, rgba(255,215,0,0.28), rgba(25,23,18,0.94) 60%)'
            : 'radial-gradient(circle at 32% 28%, rgba(255,215,0,0.18), rgba(17,19,30,0.96) 60%)',
          border: `1px solid ${isLoading ? 'rgba(255,215,0,0.58)' : 'rgba(255,215,0,0.32)'}`,
          color: '#FFD700',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          cursor: 'grab',
          boxShadow: isLoading
            ? '0 0 24px rgba(255,215,0,0.2), 0 20px 40px rgba(0,0,0,0.42)'
            : '0 20px 44px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {isLoading ? <Loader2 size={22} className="animate-spin" /> : <MessageCircleMore size={22} />}
        {isLoading && (
          <button
            onMouseDown={event => event.stopPropagation()}
            onMouseUp={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              stopGeneration()
            }}
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: '#ef4444', color: '#fff', border: '2px solid rgba(20,22,30,0.9)' }}
          >
            <Square size={9} />
          </button>
        )}
        {!isLoading && unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full font-bold"
            style={{ background: '#ef4444', color: '#fff', fontSize: 10 }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        <span
          className="pointer-events-none absolute inset-1 rounded-full"
          style={{ border: '1px solid rgba(255,255,255,0.05)' }}
        />
      </div>
    )
  }

  const innerContent = (
    <>
      <div
        className={`relative flex items-center gap-3 px-4 py-3.5 ${isMobile ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        onMouseDown={isMobile ? undefined : handleTitleMouseDown}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-16"
          style={{ background: 'radial-gradient(circle at top, rgba(255,215,0,0.16), transparent 72%)' }}
        />
        <div
          className="flex h-8 w-8 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.2)' }}
        >
          <Sparkles size={14} style={{ color: '#FFD700' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white" style={{ fontSize: fs.title }}>
            AI 问答
          </p>
          <p className="truncate text-[11px]" style={{ color: 'rgba(255,255,255,0.42)' }}>
            {courseName ? `${courseName} · 可继续追问和贴图` : '基于课程资料的上下文问答'}
          </p>
        </div>
        {credits !== null && (
          <span
            className="rounded-full px-2.5 py-1"
            style={{
              fontSize: fs.xs,
              color: credits < 40 ? '#fca5a5' : '#d4d4d8',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${credits < 40 ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.08)'}`,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {credits} 分
          </span>
        )}
        {isLoading && (
          <button
            onClick={stopGeneration}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.28)' }}
          >
            <Square size={10} />
            停止
          </button>
        )}
        {messages.length > 0 && !isLoading && (
          <button
            onClick={clearMessages}
            className="rounded-xl p-1.5 transition-colors hover:bg-white/8"
            style={{ color: 'rgba(255,255,255,0.36)' }}
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          onClick={minimizeWindow}
          className="rounded-xl p-1.5 transition-colors hover:bg-white/8"
          style={{ color: 'rgba(255,255,255,0.36)' }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={closeWindow}
          className="rounded-xl p-1.5 transition-colors hover:bg-white/8"
          style={{ color: 'rgba(255,255,255,0.36)' }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 pb-8 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-3xl"
              style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.15)' }}
            >
              <MessageCircleMore size={24} style={{ color: '#FFD700', opacity: 0.72 }} />
            </div>
            <div>
              <p className="text-sm text-white">{courseId ? '直接提问，AI 会结合课件和真题回答' : '先进入一门课程再提问'}</p>
              <p className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>
                支持多轮追问、截图粘贴、带来源回答
              </p>
            </div>
            {courseId && (
              <div
                className="rounded-full px-3 py-1.5 text-xs"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.46)' }}
              >
                Ctrl+V 粘贴截图，或拖着右下角图标去做题
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map(message => (
              <div key={message.id}>
                {message.role === 'user' ? (
                  <div className="flex flex-col items-end gap-2">
                    {message.imagePreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={message.imagePreview}
                        alt="user upload"
                        className="max-h-[180px] max-w-[240px] cursor-zoom-in rounded-2xl object-cover"
                        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                        onClick={() => setLightboxSrc(message.imagePreview!)}
                      />
                    )}
                    {message.content && (
                      <div
                        className="max-w-[88%] whitespace-pre-wrap rounded-[22px] px-4 py-3"
                        style={{
                          fontSize: fs.base,
                          lineHeight: '1.65',
                          color: '#f5f5f5',
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.05))',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        {message.content}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div
                      className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                      style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.2)' }}
                    >
                      <Sparkles size={12} style={{ color: '#FFD700' }} />
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      {message.pending ? (
                        <div className="flex items-center gap-2 py-1" style={{ color: 'rgba(255,255,255,0.52)' }}>
                          <Loader2 size={14} className="animate-spin" />
                          <span style={{ fontSize: fs.base }}>正在解析图片内容…</span>
                        </div>
                      ) : message.streaming && !message.content ? (
                        <div className="flex items-center gap-2 py-1" style={{ color: 'rgba(255,255,255,0.52)' }}>
                          <Loader2 size={14} className="animate-spin" />
                          <span style={{ fontSize: fs.base }}>
                            {message.streamStatus === 'generating' ? '正在生成回答…' : '正在组织更完整的答案…'}
                          </span>
                        </div>
                      ) : message.failed && !message.content ? (
                        <p style={{ fontSize: fs.base, color: '#fca5a5' }}>请求失败，请稍后再试</p>
                      ) : (
                        <div
                          className="rounded-[24px] px-4 py-3.5"
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <div
                            className="prose prose-invert max-w-none"
                            style={{ color: '#d4d4dc', fontSize: fs.base, lineHeight: '1.8' }}
                          >
                            <ReactMarkdown
                              rehypePlugins={[rehypeHighlight]}
                              components={{
                                p: ({ children }) => (
                                  <p style={{ fontSize: fs.base, marginTop: '0.6em', marginBottom: '0.6em' }}>{children}</p>
                                ),
                                li: ({ children }) => <li style={{ fontSize: fs.base }}>{children}</li>,
                                img: ({ src, alt }) => {
                                  const source = typeof src === 'string' ? src : ''
                                  return (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={source}
                                      alt={alt ?? 'assistant image'}
                                      style={{ maxWidth: '100%', borderRadius: '0.75rem', cursor: source ? 'zoom-in' : undefined }}
                                      onClick={() => source && setLightboxSrc(source)}
                                    />
                                  )
                                },
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                            {message.streaming && (
                              <span
                                className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle"
                                style={{ background: '#FFD700', borderRadius: 1 }}
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {!message.streaming && !message.pending && (
                        <div className="flex items-center gap-1 pt-0.5">
                          {message.content && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(message.content).catch(() => {})
                                setCopiedId(message.id)
                                window.setTimeout(() => setCopiedId(null), 1600)
                              }}
                              className="flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors hover:bg-white/8"
                              style={{ fontSize: fs.xs, color: copiedId === message.id ? '#86efac' : 'rgba(255,255,255,0.4)' }}
                            >
                              {copiedId === message.id ? <Check size={11} /> : <Copy size={11} />}
                              {copiedId === message.id ? '已复制' : '复制'}
                            </button>
                          )}
                          {message.failed && (
                            <button
                              onClick={() => {
                                const index = messages.findIndex(item => item.id === message.id)
                                const prevUser = index > 0 ? messages.slice(0, index).reverse().find(item => item.role === 'user') : null
                                if (prevUser) sendMessage(prevUser.content, null)
                              }}
                              className="flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors hover:bg-white/8"
                              style={{ fontSize: fs.xs, color: '#fca5a5' }}
                            >
                              <RefreshCw size={11} />
                              重试
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
        )}
      </div>

      <div
        className="flex-shrink-0 px-3 pb-3 pt-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.08)' }}
      >
        {imagePreview && (
          <div
            className="mb-2 flex items-center gap-2 rounded-2xl px-3 py-2"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="upload"
              className="h-10 w-10 cursor-zoom-in rounded-xl object-cover"
              onClick={() => setLightboxSrc(imagePreview)}
            />
            <span className="min-w-0 flex-1 truncate" style={{ fontSize: fs.sm, color: 'rgba(255,255,255,0.46)' }}>
              {imageFile?.name ?? '截图'}
            </span>
            <button
              onClick={clearImage}
              className="rounded-lg p-1 transition-colors hover:bg-white/8"
              style={{ color: 'rgba(255,255,255,0.42)' }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        <div
          className="relative overflow-hidden rounded-[24px]"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
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
            className="w-full resize-none bg-transparent outline-none"
            style={{
              fontSize: fs.base,
              color: '#f5f5f5',
              padding: '14px 52px 14px 48px',
              lineHeight: '1.6',
              maxHeight: 180,
              overflowY: 'auto',
            }}
            placeholder={
              !courseId
                ? '先进入课程再提问'
                : isLoading
                  ? '生成中，可最小化继续做题…'
                  : '提问，或 Ctrl+V 粘贴截图'
            }
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
          />

          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={isLoading || !courseId}
            className="absolute bottom-3 left-3 rounded-xl p-1.5 transition-colors hover:bg-white/8"
            style={{ color: imagePreview ? '#FFD700' : 'rgba(255,255,255,0.4)' }}
          >
            <ImagePlus size={15} />
          </button>

          {isLoading ? (
            <button
              onClick={stopGeneration}
              className="absolute bottom-3 right-3 rounded-xl p-1.5"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !imageFile) || !courseId}
              className="absolute bottom-3 right-3 rounded-xl p-1.5 transition-all disabled:cursor-not-allowed"
              style={{
                background: (input.trim() || imageFile) && courseId ? 'rgba(255,215,0,0.92)' : 'rgba(255,255,255,0.06)',
                color: (input.trim() || imageFile) && courseId ? '#111' : 'rgba(255,255,255,0.32)',
              }}
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {isMobile ? (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={minimizeWindow}
          />
          <div
            className="fixed z-50 flex flex-col overflow-hidden"
            style={{
              left: 0,
              right: 0,
              bottom: 0,
              height: sheetHeight,
              borderRadius: '24px 24px 0 0',
              background: 'linear-gradient(180deg, rgba(18,20,33,0.99), rgba(9,11,20,0.99))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderBottom: 'none',
              boxShadow: '0 -20px 60px rgba(0,0,0,0.46)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <div className="flex flex-shrink-0 justify-center pt-2.5 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
            </div>
            {innerContent}
          </div>
        </>
      ) : (
        <div
          className="fixed z-50 flex flex-col overflow-hidden rounded-[28px]"
          style={{
            left: pos.x < 0 ? 'auto' : pos.x,
            right: pos.x < 0 ? 20 : undefined,
            top: pos.y < 0 ? 'auto' : pos.y,
            bottom: pos.y < 0 ? 20 : undefined,
            width: size.w,
            height: size.h,
            minWidth: MIN_W,
            minHeight: MIN_H,
            background: 'linear-gradient(180deg, rgba(18,20,33,0.97), rgba(9,11,20,0.98))',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)',
            userSelect: 'none',
          }}
        >
          {innerContent}
          <div
            onMouseDown={event => handleResizeMouseDown(event, 'e')}
            style={{ position: 'absolute', right: 0, top: 0, width: 5, height: '100%', cursor: 'ew-resize', zIndex: 10 }}
          />
          <div
            onMouseDown={event => handleResizeMouseDown(event, 's')}
            style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 5, cursor: 'ns-resize', zIndex: 10 }}
          />
          <div
            onMouseDown={event => handleResizeMouseDown(event, 'se')}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 18,
              height: 18,
              cursor: 'nwse-resize',
              zIndex: 11,
              background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.12) 50%)',
              borderRadius: '0 0 28px 0',
            }}
          />
        </div>
      )}
    </>
  )
}
