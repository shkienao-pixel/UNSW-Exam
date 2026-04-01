'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { NotebookPen, X, Check, Loader2 } from 'lucide-react'
import { useNoteFloat } from '@/lib/note-float-context'
import { api } from '@/lib/api'
import DynamicBlockNoteEditor from '@/components/notes/DynamicBlockNoteEditor'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_W = 560
const DEFAULT_H = 560
const MIN_W = 380
const MIN_H = 400
const POS_KEY = 'note_float_pos'
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
  const dragRef = useRef<{ startX: number; startY: number; btnX: number; btnY: number } | null>(null)
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
      x: Math.max(0, Math.min(window.innerWidth - 52, dragRef.current.btnX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 52, dragRef.current.btnY + dy)),
    })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    if (!movedRef.current) onClick()
    else onDragEnd(fabPos)
    dragRef.current = null
  }

  return (
    <button
      onMouseDown={onMouseDown}
      className="fixed z-50 flex items-center justify-center rounded-full select-none"
      style={{
        left: fabPos.x, top: fabPos.y,
        width: 52, height: 52,
        background: 'rgba(20,22,30,0.92)',
        border: '1px solid rgba(167,139,250,0.45)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        cursor: 'grab',
        color: '#A78BFA',
      }}
      title="笔记本"
    >
      <NotebookPen size={22} />
    </button>
  )
}

// ── Main window ───────────────────────────────────────────────────────────────

export default function NoteFloatWindow() {
  const { isOpen, courseId, openWindow, closeWindow } = useNoteFloat()
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const [size, setSize] = useState(loadSize)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const saved = loadPos()
    if (saved) return saved
    if (typeof window === 'undefined') return { x: 80, y: 80 }
    return { x: window.innerWidth - DEFAULT_W - 24, y: window.innerHeight - DEFAULT_H - 24 }
  })
  const [fabPos, setFabPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 80, y: 80 }
    return { x: window.innerWidth - 72, y: window.innerHeight - 180 }
  })

  // BlockNote content
  const [initialContent, setInitialContent] = useState<unknown[]>([])
  const [contentLoaded, setContentLoaded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Drag / resize refs
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null)
  const isResizing = useRef<ResizeDir | null>(null)
  const resizeStart = useRef({ mouseX: 0, mouseY: 0, w: 0, h: 0 })

  // Load content when window opens
  useEffect(() => {
    if (!isOpen || contentLoaded) return
    api.notes.getBlock(courseId ?? undefined)
      .then(data => {
        setInitialContent(data.content ?? [])
        setContentLoaded(true)
      })
      .catch(() => setContentLoaded(true))
  }, [isOpen, courseId, contentLoaded])

  // Reset on close so fresh load next open
  useEffect(() => {
    if (!isOpen) {
      setContentLoaded(false)
    }
  }, [isOpen])

  const handleChange = useCallback((blocks: unknown[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('saving')
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.notes.saveBlock(blocks, courseId ?? undefined)
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2000)
      } catch {
        setSaveState('error')
      }
    }, SAVE_DEBOUNCE_MS)
  }, [courseId])

  // Global drag/resize listeners
  useEffect(() => {
    if (!isOpen) return

    function onMouseMove(e: MouseEvent) {
      if (isResizing.current) {
        const dir = isResizing.current
        const dx = e.clientX - resizeStart.current.mouseX
        const dy = e.clientY - resizeStart.current.mouseY
        setSize(prev => ({
          w: dir === 's' ? prev.w : Math.max(MIN_W, Math.min(window.innerWidth - pos.x - 4, resizeStart.current.w + dx)),
          h: dir === 'e' ? prev.h : Math.max(MIN_H, Math.min(window.innerHeight - pos.y - 4, resizeStart.current.h + dy)),
        }))
        return
      }
      if (!dragRef.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - size.w, dragRef.current.winX + e.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.winY + e.clientY - dragRef.current.startY)),
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
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [isOpen, pos.x, pos.y, size.w])

  if (!isOpen) {
    return (
      <NoteFab
        pos={fabPos}
        onClick={() => openWindow()}
        onDragEnd={p => {
          setFabPos(p)
          localStorage.setItem('note_fab_pos', JSON.stringify(p))
        }}
      />
    )
  }

  const windowStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, borderRadius: '20px 20px 0 0', maxHeight: '85dvh' }
    : { position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 60, borderRadius: 16, minWidth: MIN_W, minHeight: MIN_H }

  return (
    <>
      {isMobile && (
        <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={closeWindow} />
      )}

      <div style={{
        ...windowStyle,
        background: 'rgba(7,8,15,0.97)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.65)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 shrink-0"
          style={{
            height: 48,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            cursor: isMobile ? 'default' : 'grab',
            userSelect: 'none',
          }}
          onMouseDown={isMobile ? undefined : e => {
            dragRef.current = { startX: e.clientX, startY: e.clientY, winX: pos.x, winY: pos.y }
          }}
        >
          <NotebookPen size={15} style={{ color: '#A78BFA' }} />
          <span className="text-sm font-semibold text-white flex-1">笔记本</span>

          {/* Save indicator */}
          <div className="flex items-center gap-1 text-xs" style={{ color: '#444' }}>
            {saveState === 'saving' && <><Loader2 size={11} className="animate-spin" /> 保存中</>}
            {saveState === 'saved' && <><Check size={11} style={{ color: '#22C55E' }} /><span style={{ color: '#22C55E' }}>已保存</span></>}
            {saveState === 'error' && <span style={{ color: '#EF4444' }}>保存失败</span>}
          </div>

          <button onClick={closeWindow}
            className="p-1.5 rounded-lg transition-all hover:bg-white/8 ml-1"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            onMouseDown={e => e.stopPropagation()}>
            <X size={15} />
          </button>
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-y-auto" style={{ background: 'rgba(255,255,255,0.01)' }}>
          {contentLoaded ? (
            <DynamicBlockNoteEditor
              initialContent={initialContent}
              onChange={handleChange}
            />
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: '#444' }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}
        </div>

        {/* Resize handles (desktop only) */}
        {!isMobile && (
          <>
            <div onMouseDown={e => { e.preventDefault(); e.stopPropagation(); isResizing.current = 'e'; resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: size.w, h: size.h } }}
              style={{ position: 'absolute', top: 0, right: 0, width: 6, height: '100%', cursor: 'ew-resize', zIndex: 10 }} />
            <div onMouseDown={e => { e.preventDefault(); e.stopPropagation(); isResizing.current = 's'; resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: size.w, h: size.h } }}
              style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 6, cursor: 's-resize', zIndex: 10 }} />
            <div onMouseDown={e => { e.preventDefault(); e.stopPropagation(); isResizing.current = 'se'; resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: size.w, h: size.h } }}
              style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, cursor: 'se-resize', zIndex: 11, borderRadius: '0 0 16px 0' }} />
          </>
        )}
      </div>
    </>
  )
}
