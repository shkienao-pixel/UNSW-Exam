'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, X, Check, Loader2, BookOpen } from 'lucide-react'
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

function NoteFab({ onClick, pos, onDragEnd }: {
  onClick: () => void
  pos: { x: number; y: number }
  onDragEnd: (pos: { x: number; y: number }) => void
}) {
  const dragRef  = useRef<{ startX: number; startY: number; btnX: number; btnY: number } | null>(null)
  const movedRef = useRef(false)
  const [fabPos, setFabPos] = useState(pos)

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, btnX: fabPos.x, btnY: fabPos.y }
    movedRef.current = false
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.sqrt(dx * dx + dy * dy) > 4) movedRef.current = true
    setFabPos({
      x: Math.max(0, Math.min(window.innerWidth  - 44, dragRef.current.btnX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 44, dragRef.current.btnY + dy)),
    })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup',  onMouseUp)
    if (!movedRef.current) onClick()
    else onDragEnd(fabPos)
    dragRef.current = null
  }

  return (
    <button
      onMouseDown={onMouseDown}
      title="笔记本"
      className="fixed z-50 flex items-center justify-center select-none"
      style={{
        left: fabPos.x,
        top:  fabPos.y,
        width:  44,
        height: 44,
        borderRadius: 10,
        background: 'rgba(12,14,22,0.88)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.40)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: 'grab',
        color: 'rgba(200,200,220,0.70)',
      }}
    >
      <BookOpen size={18} strokeWidth={1.6} />
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
        background: 'rgba(10,11,18,0.96)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset',
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
