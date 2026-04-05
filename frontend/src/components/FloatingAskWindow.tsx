'use client'

import { useEffect, useRef, useState } from 'react'
import Lottie from 'lottie-react'
import loaderCatData from '../../public/loader-cat.json'
import {
  Check,
  Copy,
  ImagePlus,
  Layers3,
  Loader2,
  Minus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'
import { useFloatingAsk, type FloatingMessage } from '@/lib/floating-ask-context'

const MIN_W = 400
const MIN_H = 500
const DEFAULT_W = 560
const DEFAULT_H = 700
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

const FAB_POS_KEY = 'floating_fab_pos'
const FAB_SIZE = 130

const CAT_MESSAGES = [
  '有什么问题要问我吗？',
  '考试快到了，来复习一下？',
  '我帮你解释这道题吧~',
  '不懂的地方尽管问我！',
  '让我来帮你梳理一下思路',
  '需要出几道练习题吗？',
  '我可以帮你总结知识点哦',
  '困了？来道题提提神！',
  '别担心，我们一起搞定它',
  '有没有想不通的地方？',
  '说出来，我帮你分析~',
  '今天学了什么？考考你！',
]

function loadFabPos() {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  try {
    const raw = localStorage.getItem(FAB_POS_KEY)
    if (!raw) return { x: window.innerWidth - FAB_SIZE - 24, y: window.innerHeight - FAB_SIZE - 80 }
    const pos = JSON.parse(raw) as { x: number; y: number }
    return {
      x: clamp(pos.x, 0, window.innerWidth - FAB_SIZE),
      y: clamp(pos.y, 0, window.innerHeight - FAB_SIZE),
    }
  } catch {
    return { x: window.innerWidth - FAB_SIZE - 24, y: window.innerHeight - FAB_SIZE - 80 }
  }
}

// ── AI Ask FAB (cat Lottie) ───────────────────────────────────────────────────

function AiAskFab({ isLoading, unreadCount, showHint, onClick, onStop }: {
  isLoading: boolean
  unreadCount: number
  showHint: boolean
  onClick: () => void
  onStop: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState(CAT_MESSAGES[0])
  const lastMsgIdx = useRef(0)
  const dragOffset = useRef({ dx: 0, dy: 0 })
  const didDrag = useRef(false)
  const lottieRef = useRef<any>(null)

  // 初始化位置（客户端）
  useEffect(() => {
    setPos(loadFabPos())
  }, [])

  useEffect(() => {
    if (!lottieRef.current) return
    if (hovered || isLoading) {
      lottieRef.current.play()
    } else {
      lottieRef.current.stop()
    }
  }, [hovered, isLoading])

  // 拖拽逻辑
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    didDrag.current = false
    dragOffset.current = {
      dx: e.clientX - (pos?.x ?? 0),
      dy: e.clientY - (pos?.y ?? 0),
    }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      didDrag.current = true
      const x = clamp(e.clientX - dragOffset.current.dx, 0, window.innerWidth - FAB_SIZE)
      const y = clamp(e.clientY - dragOffset.current.dy, 0, window.innerHeight - FAB_SIZE)
      setPos({ x, y })
    }
    const onUp = () => {
      setDragging(false)
      setPos(prev => {
        if (prev) localStorage.setItem(FAB_POS_KEY, JSON.stringify(prev))
        return prev
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const handleClick = () => {
    if (didDrag.current) return
    onClick()
  }

  if (!pos) return null

  return (
    <div
      className="fixed z-50 select-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: FAB_SIZE,
        height: FAB_SIZE,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onMouseEnter={() => {
        // 每次 hover 换一条不重复的消息
        let idx
        do { idx = Math.floor(Math.random() * CAT_MESSAGES.length) }
        while (idx === lastMsgIdx.current && CAT_MESSAGES.length > 1)
        lastMsgIdx.current = idx
        setMessage(CAT_MESSAGES[idx])
        setHovered(true)
      }}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={onMouseDown}
    >
      {/* 游戏对话框气泡 */}
      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: `translateX(-50%) translateY(${hovered ? '-8px' : '4px'})`,
          marginBottom: 6,
          opacity: hovered && !dragging ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{
          background: 'rgba(255,255,255,0.97)',
          border: '2px solid #1a1a2e',
          borderRadius: 8,
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 600,
          color: '#1a1a2e',
          boxShadow: '3px 3px 0px #1a1a2e',
          letterSpacing: '0.02em',
          fontFamily: 'monospace',
        }}>
          {message}
        </div>
        <div style={{
          position: 'absolute', bottom: -9, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '9px solid #1a1a2e',
        }} />
        <div style={{
          position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid rgba(255,255,255,0.97)',
        }} />
      </div>

      {/* 猫咪 Lottie 按钮 */}
      <button
        onClick={handleClick}
        title="AI 问答"
        style={{
          background: 'none', border: 'none', padding: 0,
          cursor: dragging ? 'grabbing' : 'pointer',
          display: 'block', width: '100%', height: '100%',
          transform: hovered && !dragging ? 'scale(1.08)' : 'scale(1)',
          transition: 'transform 0.2s ease',
          filter: hovered && !dragging ? 'drop-shadow(0 0 12px rgba(255,200,80,0.55))' : 'none',
        }}
      >
        <Lottie
          lottieRef={lottieRef}
          animationData={loaderCatData}
          loop
          autoplay={false}
          style={{ width: '100%', height: '100%' }}
        />
        {!isLoading && unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 20, height: 20, borderRadius: '50%',
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid rgba(20,22,30,0.85)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {isLoading && (
          <button
            onClick={onStop}
            style={{
              position: 'absolute', bottom: 4, right: 4,
              width: 20, height: 20, borderRadius: '50%',
              background: '#ef4444', color: '#fff',
              border: '2px solid rgba(20,22,30,0.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Square size={8} />
          </button>
        )}
      </button>

      {showHint && !isLoading && (
        <span className="absolute inset-0 animate-ping rounded-full pointer-events-none"
          style={{ background: 'rgba(255,215,0,0.2)', animationDuration: '1.6s' }} />
      )}
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(3,4,10,0.92)' }}
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="preview" className="rounded-2xl"
        style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain' }}
        onClick={e => e.stopPropagation()} />
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
        <X size={18} />
      </button>
    </div>
  )
}

// ── Quick prompts ──────────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  { label: '只看答案', q: '直接给出正确答案和一句话核心原因，不用展开' },
  { label: '逐项分析', q: '请逐项分析每个选项为什么对或错' },
  { label: '考试版解析', q: '给出适合应试记忆的标准解析，要简洁清晰' },
  { label: '出类似题', q: '根据这个知识点再出一道类似练习题' },
]

// ── AI Response Card ───────────────────────────────────────────────────────────

function AiCard({
  message,
  fsBase,
  fsSm,
  fsXs,
  copiedId,
  onCopy,
  onRetry,
  onLightbox,
  onQuickAction,
}: {
  message: FloatingMessage
  fsBase: string
  fsSm: string
  fsXs: string
  copiedId: string | null
  onCopy: (id: string, text: string) => void
  onRetry: () => void
  onLightbox: (src: string) => void
  onQuickAction: (q: string) => void
}) {
  const isDone = !message.streaming && !message.pending && !message.failed && message.content
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="flex gap-2.5">
      {/* AI avatar */}
      <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: 'rgba(255,215,0,0.14)', border: '1px solid rgba(255,215,0,0.22)' }}>
        <Sparkles size={11} style={{ color: '#FFD700' }} />
      </div>

      <div className="min-w-0 flex-1">
        {/* Loading states */}
        {message.pending && (
          <div className="flex items-center gap-2 py-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <Loader2 size={13} className="animate-spin" />
            <span style={{ fontSize: fsBase }}>正在解析图片内容…</span>
          </div>
        )}
        {message.streaming && !message.content && (
          <div className="flex items-center gap-2 py-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <Loader2 size={13} className="animate-spin" />
            <span style={{ fontSize: fsBase }}>
              {message.streamStatus === 'slow' ? '正在组织更完整的答案…' : '正在解析…'}
            </span>
          </div>
        )}
        {message.failed && !message.content && (
          <p style={{ fontSize: fsBase, color: '#fca5a5' }}>请求失败，请稍后重试</p>
        )}

        {/* Answer card */}
        {message.content && (
          <div
            style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderLeft: '3px solid rgba(255,215,0,0.5)',
              borderRadius: '0 14px 14px 0',
              overflow: 'hidden',
            }}
          >
            {/* Card header */}
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,215,0,0.03)' }}
            >
              <div className="flex items-center gap-1.5">
                <Zap size={11} style={{ color: '#FFD700' }} />
                <span style={{ fontSize: '11px', color: 'rgba(255,215,0,0.8)', fontWeight: 600, letterSpacing: '0.04em' }}>
                  AI 解析
                </span>
                {message.streaming && (
                  <span className="inline-block h-3 w-0.5 animate-pulse rounded-sm align-middle"
                    style={{ background: '#FFD700', marginLeft: 2 }} />
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {isDone && (
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="rounded-lg px-1.5 py-0.5 transition-colors hover:bg-white/8"
                    style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}
                  >
                    {expanded ? '收起' : '展开'}
                  </button>
                )}
                {message.content && (
                  <button
                    onClick={() => onCopy(message.id, message.content)}
                    className="rounded-lg p-1 transition-colors hover:bg-white/8"
                    style={{ color: copiedId === message.id ? '#86efac' : 'rgba(255,255,255,0.3)' }}
                  >
                    {copiedId === message.id ? <Check size={11} /> : <Copy size={11} />}
                  </button>
                )}
              </div>
            </div>

            {/* Content body */}
            {expanded && (
              <div className="px-4 py-3" style={{ color: '#d4d4dc', fontSize: fsBase, lineHeight: '1.78' }}>
                <div className="exam-prose">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeHighlight, rehypeKatex]}
                    components={{
                      h1: ({ children }) => (
                        <div style={{ borderBottom: '1px solid rgba(255,215,0,0.2)', paddingBottom: '0.35em', marginTop: '1.1em', marginBottom: '0.6em' }}>
                          <span style={{ fontSize: fsSm, fontWeight: 700, color: '#FFD700', letterSpacing: '0.02em' }}>{children}</span>
                        </div>
                      ),
                      h2: ({ children }) => (
                        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.3em', marginTop: '1em', marginBottom: '0.5em' }}>
                          <span style={{ fontSize: fsSm, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{children}</span>
                        </div>
                      ),
                      h3: ({ children }) => (
                        <p style={{ fontSize: fsSm, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginTop: '0.9em', marginBottom: '0.3em' }}>{children}</p>
                      ),
                      p: ({ children }) => (
                        <p style={{ fontSize: fsBase, marginTop: '0.5em', marginBottom: '0.5em', color: '#d4d4dc' }}>{children}</p>
                      ),
                      strong: ({ children }) => (
                        <strong style={{ color: '#f0e68c', fontWeight: 700 }}>{children}</strong>
                      ),
                      li: ({ children }) => (
                        <li style={{ fontSize: fsBase, marginBottom: '0.25em', paddingLeft: '0.15em' }}>{children}</li>
                      ),
                      ul: ({ children }) => (
                        <ul style={{ paddingLeft: '1.2em', marginTop: '0.4em', marginBottom: '0.4em' }}>{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol style={{ paddingLeft: '1.4em', marginTop: '0.4em', marginBottom: '0.4em' }}>{children}</ol>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote style={{
                          borderLeft: '3px solid rgba(255,215,0,0.4)',
                          paddingLeft: '0.85em',
                          marginLeft: 0,
                          marginTop: '0.6em',
                          marginBottom: '0.6em',
                          color: 'rgba(255,255,255,0.6)',
                          fontStyle: 'italic',
                        }}>{children}</blockquote>
                      ),
                      code: ({ children, className }) => {
                        const isBlock = className?.includes('language-')
                        if (isBlock) return <code className={className}>{children}</code>
                        return (
                          <code style={{
                            background: 'rgba(255,255,255,0.08)',
                            borderRadius: '4px',
                            padding: '0.15em 0.4em',
                            fontSize: '0.88em',
                            color: '#93c5fd',
                            fontFamily: 'ui-monospace, monospace',
                          }}>{children}</code>
                        )
                      },
                      pre: ({ children }) => (
                        <pre style={{
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: '10px',
                          padding: '0.85em 1em',
                          overflowX: 'auto',
                          marginTop: '0.6em',
                          marginBottom: '0.6em',
                          fontSize: '0.87em',
                        }}>{children}</pre>
                      ),
                      img: ({ src, alt }) => {
                        const source = typeof src === 'string' ? src : ''
                        return (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={source} alt={alt ?? ''} onClick={() => source && onLightbox(source)}
                            style={{ maxWidth: '100%', borderRadius: '10px', cursor: source ? 'zoom-in' : undefined,
                              marginTop: '0.5em', marginBottom: '0.5em', border: '1px solid rgba(255,255,255,0.08)' }} />
                        )
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {message.streaming && (
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle"
                      style={{ background: '#FFD700', borderRadius: 1 }} />
                  )}
                </div>
              </div>
            )}

            {/* Action strip — only for completed answers */}
            {isDone && (
              <div
                className="flex flex-wrap items-center gap-1.5 px-3 py-2.5"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.12)' }}
              >
                {[
                  { label: '逐项分析', q: '请逐项分析每个选项的对错及原因' },
                  { label: '生成闪卡', q: '把这道题的核心知识点提炼成一张便于记忆的闪卡格式' },
                  { label: '出类似题', q: '根据这道题的知识点，再出一道类似的练习题' },
                  { label: '易错点总结', q: '总结这道题最容易出错的地方，以及如何避免' },
                ].map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => onQuickAction(chip.q)}
                    className="rounded-full px-2.5 py-1 transition-all hover:bg-white/10"
                    style={{
                      fontSize: '11px',
                      color: 'rgba(255,255,255,0.45)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
                {message.failed && (
                  <button onClick={onRetry}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors hover:bg-white/8"
                    style={{ fontSize: '11px', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.2)', background: 'transparent' }}>
                    <RefreshCw size={10} /> 重试
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

const SUGGESTION_CARDS = [
  { icon: '📌', title: '粘贴题目截图', desc: 'Ctrl+V 直接识别题目内容' },
  { icon: '🔍', title: '解析选择题', desc: '逐项分析每个选项对错' },
  { icon: '📝', title: '考试版解析', desc: '简洁答案 + 核心考点' },
  { icon: '🎯', title: '生成练习题', desc: '基于当前考点出类似题' },
]

function EmptyState({ courseId, onQuickAction }: { courseId: string | null; onQuickAction: (q: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-2 pb-6 text-center">
      <div>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.15)' }}>
          <Sparkles size={22} style={{ color: '#FFD700', opacity: 0.75 }} />
        </div>
        <p className="text-sm font-semibold text-white">AI 考试解析助教</p>
        <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>
          {courseId ? '结合课件 + 真题 · 给出结构化解析' : '先进入一门课程再开始提问'}
        </p>
      </div>

      {courseId && (
        <div className="grid w-full grid-cols-2 gap-2">
          {SUGGESTION_CARDS.map(card => (
            <button
              key={card.title}
              onClick={() => onQuickAction(card.desc)}
              className="rounded-2xl p-3 text-left transition-all hover:bg-white/6"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="mb-1.5 text-base leading-none">{card.icon}</div>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: '2px' }}>{card.title}</p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{card.desc}</p>
            </button>
          ))}
        </div>
      )}

      {courseId && (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Ctrl+V 粘贴截图 · 支持多轮追问
        </p>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FloatingAskWindow() {
  const {
    isOpen, isMinimized, messages, courseId, courseName, credits,
    unreadCount, isLoading, prefillText,
    minimizeWindow, openWindow, closeWindow, clearMessages, clearPrefill,
    sendMessage, stopGeneration,
  } = useFloatingAsk()

  const [pos, setPos] = useState({ x: -1, y: -1 })
  const [size, setSize] = useState<{ w: number; h: number }>({ w: DEFAULT_W, h: DEFAULT_H })
  const [isMobile, setIsMobile] = useState(false)
  const [sheetHeight, setSheetHeight] = useState('86dvh')

  const [showFabHint, setShowFabHint] = useState(false)

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
    ? { base: '13px', sm: '12px', xs: '11px', title: '14px' }
    : { base: '14px', sm: '13px', xs: '11.5px', title: '15px' }

  useEffect(() => {
    setSize(loadSize())
    const updateMobile = () => setIsMobile(window.innerWidth <= 768)
    updateMobile()
    window.addEventListener('resize', updateMobile)
    if (!localStorage.getItem('fab_hint_seen')) setShowFabHint(true)
    return () => window.removeEventListener('resize', updateMobile)
  }, [])

  useEffect(() => {
    if (pos.x !== -1 || typeof window === 'undefined') return
    const saved = loadPos()
    const fallback = { x: Math.max(20, window.innerWidth - 84), y: Math.max(20, window.innerHeight - 84) }
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
      setSheetHeight(`${Math.min(88, Math.max(46, Math.round(ratio * 86)))}dvh`)
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
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        setImageFile(file)
        reader.onload = ev => setImagePreview((ev.target?.result as string) || null)
        reader.readAsDataURL(file)
        return
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [isOpen, isMinimized])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (resizeDirRef.current) {
        const dx = e.clientX - resizeStartRef.current.mouseX
        const dy = e.clientY - resizeStartRef.current.mouseY
        setSize(prev => ({
          w: resizeDirRef.current === 's' ? prev.w : clamp(resizeStartRef.current.w + dx, MIN_W, window.innerWidth - currentPosRef.current.x - 10),
          h: resizeDirRef.current === 'e' ? prev.h : clamp(resizeStartRef.current.h + dy, MIN_H, window.innerHeight - currentPosRef.current.y - 10),
        }))
        return
      }
      if (!isDraggingRef.current) return
      const nextPos = {
        x: clamp(e.clientX - dragOffsetRef.current.x, 0, window.innerWidth - 68),
        y: clamp(e.clientY - dragOffsetRef.current.y, 0, window.innerHeight - 68),
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

  function handleFabMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    isDraggingRef.current = true
    dragOffsetRef.current = { x: e.clientX - currentPosRef.current.x, y: e.clientY - currentPosRef.current.y }
  }
  function handleFabMouseUp(e: React.MouseEvent) {
    if (Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y) < 6) openWindow()
  }
  function handleTitleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    isDraggingRef.current = true
    dragOffsetRef.current = { x: e.clientX - currentPosRef.current.x, y: e.clientY - currentPosRef.current.y }
  }
  function handleResizeMouseDown(e: React.MouseEvent, dir: ResizeDir) {
    e.preventDefault(); e.stopPropagation()
    resizeDirRef.current = dir
    resizeStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, w: size.w, h: size.h }
  }
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    setImageFile(file)
    reader.onload = ev => setImagePreview((ev.target?.result as string) || null)
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  function clearImage() { setImageFile(null); setImagePreview(null) }
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }
  function handleSend() {
    const q = input.trim()
    if ((!q && !imageFile) || isLoading || !courseId) return
    sendMessage(q || '请分析这张图片', imageFile)
    setInput('')
    clearImage()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }
  function handleQuickAction(q: string) {
    if (isLoading || !courseId) return
    sendMessage(q, null)
    setInput('')
  }
  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(null), 1600)
  }
  function handleRetry(message: FloatingMessage) {
    const index = messages.findIndex(m => m.id === message.id)
    const prevUser = index > 0 ? messages.slice(0, index).reverse().find(m => m.role === 'user') : null
    if (prevUser) sendMessage(prevUser.content, null)
  }

  if (lightboxSrc) return <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

  // ── FAB ───────────────────────────────────────────────────────────────────
  if (!isOpen || isMinimized) {
    return (
      <AiAskFab
        isLoading={isLoading}
        unreadCount={unreadCount}
        showHint={showFabHint}
        onClick={() => {
          if (showFabHint) { localStorage.setItem('fab_hint_seen', '1'); setShowFabHint(false) }
          openWindow()
        }}
        onStop={e => { e.stopPropagation(); stopGeneration() }}
      />
    )
  }

  // ── Inner content ──────────────────────────────────────────────────────────

  const innerContent = (
    <>
      {/* Header */}
      <div
        className={`relative flex items-center gap-2.5 px-4 py-3 ${isMobile ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} select-none`}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}
        onMouseDown={isMobile ? undefined : handleTitleMouseDown}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-12"
          style={{ background: 'radial-gradient(ellipse at top, rgba(255,215,0,0.1), transparent 70%)' }} />
        <div className="flex h-7 w-7 items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.18)' }}>
          <Layers3 size={13} style={{ color: '#FFD700' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white leading-tight" style={{ fontSize: fs.title }}>AI 解析助教</p>
          <p className="truncate" style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.38)', marginTop: '1px' }}>
            {courseName || '结合课件 · 带来源回答'}
          </p>
        </div>
        {credits !== null && (
          <span className="rounded-full px-2 py-0.5" style={{
            fontSize: fs.xs, color: credits < 40 ? '#fca5a5' : 'rgba(255,255,255,0.4)',
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${credits < 40 ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.07)'}`,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {credits} 分
          </span>
        )}
        {isLoading && (
          <button onClick={stopGeneration}
            className="flex items-center gap-1 rounded-full px-2 py-1"
            style={{ fontSize: '11px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.22)' }}>
            <Square size={9} /> 停止
          </button>
        )}
        {messages.length > 0 && !isLoading && (
          <button onClick={clearMessages} className="rounded-xl p-1.5 transition-colors hover:bg-white/8"
            style={{ color: 'rgba(255,255,255,0.32)' }}>
            <Trash2 size={13} />
          </button>
        )}
        <button onClick={minimizeWindow} className="rounded-xl p-1.5 transition-colors hover:bg-white/8"
          style={{ color: 'rgba(255,255,255,0.32)' }}>
          <Minus size={13} />
        </button>
        <button onClick={closeWindow} className="rounded-xl p-1.5 transition-colors hover:bg-white/8"
          style={{ color: 'rgba(255,255,255,0.32)' }}>
          <X size={13} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyState courseId={courseId} onQuickAction={handleQuickAction} />
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map(message => (
              <div key={message.id}>
                {message.role === 'user' ? (
                  /* User message */
                  <div className="flex flex-col items-end gap-2">
                    {message.imagePreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={message.imagePreview} alt="user upload"
                        className="cursor-zoom-in rounded-2xl object-cover"
                        style={{ maxHeight: 160, maxWidth: 220, border: '1px solid rgba(255,255,255,0.1)' }}
                        onClick={() => setLightboxSrc(message.imagePreview!)}
                      />
                    )}
                    {message.content && (
                      <div className="max-w-[88%] rounded-[18px] px-3.5 py-2.5"
                        style={{
                          fontSize: fs.base, lineHeight: '1.65', color: '#f0f0f0',
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.05))',
                          border: '1px solid rgba(255,255,255,0.1)',
                          whiteSpace: 'pre-wrap',
                        }}>
                        {message.content}
                      </div>
                    )}
                  </div>
                ) : (
                  /* AI message */
                  <AiCard
                    message={message}
                    fsBase={fs.base}
                    fsSm={fs.sm}
                    fsXs={fs.xs}
                    copiedId={copiedId}
                    onCopy={handleCopy}
                    onRetry={() => handleRetry(message)}
                    onLightbox={setLightboxSrc}
                    onQuickAction={handleQuickAction}
                  />
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.1)' }}>

        {/* Quick chips — show when input empty and has messages or courseId */}
        {!input && !imageFile && courseId && messages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {QUICK_CHIPS.map(chip => (
              <button
                key={chip.label}
                onClick={() => handleQuickAction(chip.q)}
                disabled={isLoading}
                className="rounded-full px-2.5 py-1 transition-all hover:bg-white/10 disabled:opacity-40"
                style={{
                  fontSize: '11px', color: 'rgba(255,255,255,0.5)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Image preview */}
        {imagePreview && (
          <div className="mb-2 flex items-center gap-2 rounded-2xl px-3 py-2"
            style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.15)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="upload"
              className="h-9 w-9 cursor-zoom-in rounded-xl object-cover"
              onClick={() => setLightboxSrc(imagePreview)} />
            <span className="min-w-0 flex-1 truncate" style={{ fontSize: fs.sm, color: 'rgba(255,255,255,0.5)' }}>
              {imageFile?.name ?? '截图'}
            </span>
            <button onClick={clearImage} className="rounded-lg p-1 hover:bg-white/8" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* Textarea */}
        <div className="relative overflow-hidden rounded-[20px]" style={{
          background: 'rgba(255,255,255,0.055)',
          border: `1px solid ${input || imageFile ? 'rgba(255,215,0,0.25)' : 'rgba(255,255,255,0.09)'}`,
          transition: 'border-color 0.15s',
        }}>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <textarea
            ref={textareaRef}
            rows={1}
            disabled={!courseId}
            className="w-full resize-none bg-transparent outline-none"
            style={{
              fontSize: fs.base, color: '#f0f0f0',
              padding: '13px 50px 13px 44px',
              lineHeight: '1.6', maxHeight: 160, overflowY: 'auto',
            }}
            placeholder={
              !courseId ? '先进入课程再提问' :
              isLoading ? '生成中，可最小化继续做题…' :
              '提问，或 Ctrl+V 粘贴截图'
            }
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
          />
          <button onClick={() => imageInputRef.current?.click()} disabled={isLoading || !courseId}
            className="absolute bottom-2.5 left-2.5 rounded-xl p-1.5 transition-colors hover:bg-white/8 disabled:opacity-30"
            style={{ color: imagePreview ? '#FFD700' : 'rgba(255,255,255,0.38)' }}>
            <ImagePlus size={14} />
          </button>
          {isLoading ? (
            <button onClick={stopGeneration}
              className="absolute bottom-2.5 right-2.5 rounded-xl p-1.5"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.22)' }}>
              <Square size={13} />
            </button>
          ) : (
            <button onClick={handleSend}
              disabled={(!input.trim() && !imageFile) || !courseId}
              className="absolute bottom-2.5 right-2.5 rounded-xl p-1.5 transition-all disabled:cursor-not-allowed"
              style={{
                background: (input.trim() || imageFile) && courseId ? 'rgba(255,215,0,0.9)' : 'rgba(255,255,255,0.06)',
                color: (input.trim() || imageFile) && courseId ? '#111' : 'rgba(255,255,255,0.28)',
              }}>
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </>
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {isMobile ? (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(2px)' }}
            onClick={minimizeWindow} />
          <div className="fixed z-50 flex flex-col overflow-hidden" style={{
            left: 0, right: 0, bottom: 0, height: sheetHeight,
            borderRadius: '22px 22px 0 0',
            background: 'linear-gradient(180deg, rgba(14,16,28,0.99), rgba(7,9,18,0.99))',
            border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none',
            boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}>
            <div className="flex flex-shrink-0 justify-center pt-2.5 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }} />
            </div>
            {innerContent}
          </div>
        </>
      ) : (
        <div className="fixed z-50 flex flex-col overflow-hidden" style={{
          left: pos.x < 0 ? 'auto' : pos.x,
          right: pos.x < 0 ? 20 : undefined,
          top: pos.y < 0 ? 'auto' : pos.y,
          bottom: pos.y < 0 ? 20 : undefined,
          width: size.w, height: size.h,
          minWidth: MIN_W, minHeight: MIN_H,
          borderRadius: 24,
          background: 'linear-gradient(180deg, rgba(14,16,28,0.97), rgba(7,9,18,0.98))',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>
          {innerContent}
          <div onMouseDown={e => handleResizeMouseDown(e, 'e')}
            style={{ position: 'absolute', right: 0, top: 0, width: 5, height: '100%', cursor: 'ew-resize', zIndex: 10 }} />
          <div onMouseDown={e => handleResizeMouseDown(e, 's')}
            style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 5, cursor: 'ns-resize', zIndex: 10 }} />
          <div onMouseDown={e => handleResizeMouseDown(e, 'se')} style={{
            position: 'absolute', right: 0, bottom: 0, width: 18, height: 18,
            cursor: 'nwse-resize', zIndex: 11,
            background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.1) 50%)',
            borderRadius: '0 0 24px 0',
          }} />
        </div>
      )}
    </>
  )
}
