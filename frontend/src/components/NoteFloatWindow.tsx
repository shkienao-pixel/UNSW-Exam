'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, X, Check, Loader2, NotebookPen } from 'lucide-react'
import { useNoteFloat } from '@/lib/note-float-context'
import { api } from '@/lib/api'
import DynamicBlockNoteEditor from '@/components/notes/DynamicBlockNoteEditor'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_W = 580
const DEFAULT_H = 640
const MIN_W = 400
const MIN_H = 440
const POS_KEY  = 'note_float_pos'
const SIZE_KEY = 'note_float_size'
const SAVE_DEBOUNCE_MS = 1200

type ResizeDir = 'e' | 's' | 'se'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function loadPos(): { x: number; y: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { x: number; y: number }
    return {
      x: Math.max(0, Math.min(window.innerWidth - 60, p.x)),
      y: Math.max(0, Math.min(window.innerHeight - 60, p.y)),
    }
  } catch { return null }
}

function loadSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: DEFAULT_W, h: DEFAULT_H }
  try {
    const raw = localStorage.getItem(SIZE_KEY)
    if (!raw) return { w: DEFAULT_W, h: DEFAULT_H }
    const s = JSON.parse(raw) as { w: number; h: number }
    return {
      w: Math.max(MIN_W, Math.min(window.innerWidth - 40, s.w)),
      h: Math.max(MIN_H, Math.min(window.innerHeight - 40, s.h)),
    }
  } catch { return { w: DEFAULT_W, h: DEFAULT_H } }
}

// ── FAB ───────────────────────────────────────────────────────────────────────

function NoteFab({ onClick }: { onClick: () => void; pos?: { x: number; y: number }; onDragEnd?: (pos: { x: number; y: number }) => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      title="笔记本"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fixed z-50 select-none overflow-hidden"
      style={{
        right: 24, bottom: 24,
        width: 182, height: 58,
        borderRadius: 24,
        border: `1px solid ${hovered ? 'rgba(200,165,90,0.55)' : 'rgba(255,255,255,0.16)'}`,
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        cursor: 'pointer',
        boxShadow: hovered
          ? '0 0 0 1px rgba(200,165,90,0.3), 0 0 12px 3px rgba(200,165,90,0.2), 0 18px 40px rgba(0,0,0,0.18)'
          : '0 10px 30px rgba(0,0,0,0.12)',
        transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
        transform: hovered ? 'translateY(-2px) scale(1.013)' : 'none',
      }}
    >
      {/* tint layer */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(221,214,254,0.16) 0%, rgba(221,214,254,0.06) 40%, transparent 100%)', opacity: 0.9 }} />
      {/* orb */}
      <div style={{ position: 'absolute', left: -24, top: '50%', transform: 'translateY(-50%)', width: 96, height: 96, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.25) 0%, transparent 70%)', filter: 'blur(8px)' }} />
      {/* glass sheen */}
      <div style={{ position: 'absolute', inset: 1, borderRadius: 23, background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05) 34%, rgba(255,255,255,0.02))' }} />
      <div style={{ position: 'absolute', left: 8, right: 8, top: 2, height: 24, borderRadius: 999, background: 'rgba(255,255,255,0.18)', filter: 'blur(10px)', opacity: 0.9 }} />
      {/* content */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, height: '100%', padding: '0 14px' }}>
        <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.95)' }}>
          <div style={{ position: 'absolute', left: 4, right: 4, top: 2, height: 12, borderRadius: 999, background: 'rgba(255,255,255,0.2)', filter: 'blur(4px)' }} />
          <NotebookPen size={17} strokeWidth={1.7} style={{ position: 'relative' }} />
        </div>
        <div style={{ textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.01em', color: 'rgba(255,255,255,0.94)' }}>Notebook</div>
          <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1, color: 'rgba(255,255,255,0.52)' }}>Notes · review</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(221,214,254,0.8)', boxShadow: '0 0 12px rgba(221,214,254,0.38)' }} />
        </div>
      </div>
    </button>
  )
}

// ── Drag grip dots ─────────────────────────────────────────────────────────────

function GripDots() {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', opacity: 0.22 }}>
      {[0,1,2,3,4,5].map(i => (
        <div key={i} style={{
          width: 3, height: 3, borderRadius: '50%',
          background: '#fff',
        }} />
      ))}
    </div>
  )
}

// ── Save indicator ─────────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      {state === 'saving' && (
        <>
          <Loader2 size={10} className="animate-spin" style={{ color: 'rgba(255,255,255,0.28)' }} />
          <span style={{ color: 'rgba(255,255,255,0.28)' }}>保存中</span>
        </>
      )}
      {state === 'saved' && (
        <>
          <Check size={10} style={{ color: '#4ade80' }} />
          <span style={{ color: '#4ade80' }}>已保存</span>
        </>
      )}
      {state === 'error' && (
        <span style={{ color: '#f87171' }}>保存失败</span>
      )}
    </div>
  )
}

// ── Main window ───────────────────────────────────────────────────────────────

export default function NoteFloatWindow() {
  const { isOpen, courseId, courseName, openWindow, closeWindow } = useNoteFloat()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768)
  }, [])

  const [size,   setSize]   = useState<{ w: number; h: number }>({ w: DEFAULT_W, h: DEFAULT_H })
  const [pos,    setPos]    = useState<{ x: number; y: number }>({ x: 80, y: 80 })
  const [fabPos, setFabPos] = useState<{ x: number; y: number }>({ x: 80, y: 80 })

  useEffect(() => {
    setSize(loadSize())
    const savedPos = loadPos()
    setPos(savedPos ?? {
      x: window.innerWidth  - DEFAULT_W - 24,
      y: window.innerHeight - DEFAULT_H - 24,
    })
    try {
      const raw = localStorage.getItem('note_fab_pos')
      const savedFab = raw ? (JSON.parse(raw) as { x: number; y: number }) : null
      setFabPos(savedFab ?? { x: window.innerWidth - 60, y: window.innerHeight - 180 })
    } catch {
      setFabPos({ x: window.innerWidth - 60, y: window.innerHeight - 180 })
    }
  }, [])

  const [initialContent, setInitialContent] = useState<unknown[]>([])
  const [contentLoaded,  setContentLoaded]  = useState(false)
  const [saveState,      setSaveState]      = useState<SaveState>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dragRef     = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null)
  const isResizing  = useRef<ResizeDir | null>(null)
  const resizeStart = useRef({ mouseX: 0, mouseY: 0, w: 0, h: 0 })

  useEffect(() => {
    if (!isOpen || contentLoaded) return
    api.notes.getBlock(courseId ?? undefined)
      .then(data => { setInitialContent(data.content ?? []); setContentLoaded(true) })
      .catch(() => setContentLoaded(true))
  }, [isOpen, courseId, contentLoaded])

  useEffect(() => {
    if (!isOpen) setContentLoaded(false)
  }, [isOpen])

  const handleChange = useCallback((blocks: unknown[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('saving')
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.notes.saveBlock(blocks, courseId ?? undefined)
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2000)
      } catch { setSaveState('error') }
    }, SAVE_DEBOUNCE_MS)
  }, [courseId])

  useEffect(() => {
    if (!isOpen) return
    function onMouseMove(e: MouseEvent) {
      if (isResizing.current) {
        const dir = isResizing.current
        const dx  = e.clientX - resizeStart.current.mouseX
        const dy  = e.clientY - resizeStart.current.mouseY
        setSize(prev => ({
          w: dir === 's' ? prev.w : Math.max(MIN_W, Math.min(window.innerWidth  - pos.x - 4, resizeStart.current.w + dx)),
          h: dir === 'e' ? prev.h : Math.max(MIN_H, Math.min(window.innerHeight - pos.y - 4, resizeStart.current.h + dy)),
        }))
        return
      }
      if (!dragRef.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - size.w, dragRef.current.winX + e.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 60,     dragRef.current.winY + e.clientY - dragRef.current.startY)),
      })
    }
    function onMouseUp() {
      if (isResizing.current) {
        isResizing.current = null
        setSize(s => { localStorage.setItem(SIZE_KEY, JSON.stringify(s)); return s })
        return
      }
      if (dragRef.current) {
        dragRef.current = null
        setPos(p => { localStorage.setItem(POS_KEY, JSON.stringify(p)); return p })
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup',   onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup',   onMouseUp)
    }
  }, [isOpen, pos.x, pos.y, size.w])

  if (!isOpen) {
    return (
      <NoteFab
        pos={fabPos}
        onClick={() => openWindow()}
        onDragEnd={p => { setFabPos(p); localStorage.setItem('note_fab_pos', JSON.stringify(p)) }}
      />
    )
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  const windowStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
        borderRadius: '16px 16px 0 0', maxHeight: '88dvh',
      }
    : {
        position: 'fixed', left: pos.x, top: pos.y,
        width: size.w, height: size.h,
        zIndex: 60, borderRadius: 12,
        minWidth: MIN_W, minHeight: MIN_H,
      }

  const noteTitle = courseName || '笔记本'

  return (
    <>
      {isMobile && (
        <div
          className="fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={closeWindow}
        />
      )}

      <div style={{
        ...windowStyle,
        background: 'rgba(22,24,36,0.98)',
        border: '1px solid rgba(255,255,255,0.13)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.60), 0 1px 0 rgba(255,255,255,0.06) inset',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* ── Drag grip strip (desktop only) ─────────────────────────── */}
        {!isMobile && (
          <div
            style={{
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'grab',
              userSelect: 'none',
              flexShrink: 0,
            }}
            onMouseDown={e => {
              dragRef.current = { startX: e.clientX, startY: e.clientY, winX: pos.x, winY: pos.y }
            }}
          >
            <GripDots />
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 16,
            paddingRight: 12,
            paddingBottom: 10,
            paddingTop: isMobile ? 14 : 0,
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          {/* Icon */}
          <FileText size={14} strokeWidth={1.8} style={{ color: 'rgba(180,180,210,0.50)', flexShrink: 0 }} />

          {/* Note title */}
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'rgba(230,230,245,0.88)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {noteTitle}
          </span>

          {/* Course tag (if in a course context) */}
          {courseId && courseName && (
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'rgba(200,165,90,0.75)',
              background: 'rgba(200,165,90,0.08)',
              border: '1px solid rgba(200,165,90,0.14)',
              borderRadius: 5,
              padding: '1px 7px',
              letterSpacing: '0.01em',
              flexShrink: 0,
            }}>
              {courseId}
            </span>
          )}

          {/* Save indicator */}
          <div style={{ flexShrink: 0 }}>
            <SaveIndicator state={saveState} />
          </div>

          {/* Close */}
          <button
            onClick={closeWindow}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.30)',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.30)'
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* ── Divider ────────────────────────────────────────────────── */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.055)', flexShrink: 0 }} />

        {/* ── Editor area ────────────────────────────────────────────── */}
        <div
          className="note-editor-area"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {contentLoaded ? (
            <DynamicBlockNoteEditor
              initialContent={initialContent}
              onChange={handleChange}
            />
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'rgba(255,255,255,0.18)',
            }}>
              <Loader2 size={16} className="animate-spin" />
            </div>
          )}
        </div>

        {/* ── Resize handles (desktop only) ──────────────────────────── */}
        {!isMobile && (
          <>
            <div
              onMouseDown={e => {
                e.preventDefault(); e.stopPropagation()
                isResizing.current = 'e'
                resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: size.w, h: size.h }
              }}
              style={{ position: 'absolute', top: 0, right: 0, width: 5, height: '100%', cursor: 'ew-resize', zIndex: 10 }}
            />
            <div
              onMouseDown={e => {
                e.preventDefault(); e.stopPropagation()
                isResizing.current = 's'
                resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: size.w, h: size.h }
              }}
              style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 5, cursor: 's-resize', zIndex: 10 }}
            />
            <div
              onMouseDown={e => {
                e.preventDefault(); e.stopPropagation()
                isResizing.current = 'se'
                resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: size.w, h: size.h }
              }}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 14, height: 14, cursor: 'se-resize', zIndex: 11,
                borderRadius: '0 0 12px 0',
              }}
            />
          </>
        )}
      </div>
    </>
  )
}
