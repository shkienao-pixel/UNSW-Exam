'use client'

import { useEffect, useRef, useState } from 'react'
import { NotebookPen, X, ImagePlus, Loader2, Check, Trash2 } from 'lucide-react'
import { useNoteFloat } from '@/lib/note-float-context'
import { api } from '@/lib/api'
import type { UserNote } from '@/lib/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_W = 440
const DEFAULT_H = 460
const MIN_W = 360
const MIN_H = 380
const POS_KEY = 'note_float_pos'
const SIZE_KEY = 'note_float_size'

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

// ── Lightbox ──────────────────────────────────────────────────────────────────

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
        src={src} alt="笔记全屏"
        style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: '0.75rem' }}
        onClick={e => e.stopPropagation()}
      />
      <button onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
        <X size={18} />
      </button>
    </div>
  )
}

// ── FAB (floating action button) ──────────────────────────────────────────────

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
    const nx = Math.max(0, Math.min(window.innerWidth - 52, dragRef.current.btnX + dx))
    const ny = Math.max(0, Math.min(window.innerHeight - 52, dragRef.current.btnY + dy))
    setFabPos({ x: nx, y: ny })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    if (!movedRef.current) {
      onClick()
    } else {
      onDragEnd(fabPos)
    }
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
      title="记笔记"
    >
      <NotebookPen size={22} />
    </button>
  )
}

// ── Main window ───────────────────────────────────────────────────────────────

export default function NoteFloatWindow() {
  const { isOpen, courseId, courseName, closeWindow } = useNoteFloat()

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

  // Upload state
  const [preview, setPreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  // Recent notes
  const [recentNotes, setRecentNotes] = useState<UserNote[]>([])
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pasteZoneRef = useRef<HTMLDivElement>(null)

  // Load recent notes when opened
  useEffect(() => {
    if (!isOpen) return
    api.notes.list(courseId ?? undefined).then(setRecentNotes).catch(() => {})
  }, [isOpen, courseId])

  // Paste support
  useEffect(() => {
    if (!isOpen) return
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) setImageFromFile(file)
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [isOpen])

  function setImageFromFile(file: File) {
    setImageFile(file)
    setSavedOk(false)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setImageFromFile(file)
    e.target.value = ''
  }

  async function handleSave() {
    if (!imageFile) return
    setSaving(true)
    try {
      const note = await api.notes.upload(imageFile, caption, courseId ?? undefined)
      setRecentNotes(prev => [note, ...prev.slice(0, 9)])
      setPreview(null)
      setImageFile(null)
      setCaption('')
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteNote(noteId: number) {
    await api.notes.delete(noteId)
    setRecentNotes(prev => prev.filter(n => n.id !== noteId))
  }

  function clearImage() {
    setPreview(null)
    setImageFile(null)
    setCaption('')
  }

  // Drag window (desktop)
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null)

  function onHeaderMouseDown(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, winX: pos.x, winY: pos.y }
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragUp)
  }

  function onDragMove(e: MouseEvent) {
    if (!dragRef.current) return
    const nx = Math.max(0, Math.min(window.innerWidth - size.w, dragRef.current.winX + e.clientX - dragRef.current.startX))
    const ny = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.winY + e.clientY - dragRef.current.startY))
    setPos({ x: nx, y: ny })
  }

  function onDragUp() {
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragUp)
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
    dragRef.current = null
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (lightboxSrc) {
    return <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
  }

  if (!isOpen) {
    return (
      <NoteFab
        pos={fabPos}
        onClick={() => {}}
        onDragEnd={p => {
          setFabPos(p)
          localStorage.setItem('note_fab_pos', JSON.stringify(p))
        }}
      />
    )
  }

  const windowStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
        borderRadius: '20px 20px 0 0',
        maxHeight: '85dvh',
      }
    : {
        position: 'fixed',
        left: pos.x, top: pos.y,
        width: size.w, height: size.h,
        zIndex: 60,
        borderRadius: 16,
        minWidth: MIN_W, minHeight: MIN_H,
      }

  const sharedStyle: React.CSSProperties = {
    background: 'rgba(7,8,15,0.97)',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  return (
    <>
      {isMobile && (
        <div className="fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={closeWindow}
        />
      )}

      <div style={{ ...windowStyle, ...sharedStyle }}>

        {/* ── Header ── */}
        <div
          className="flex items-center gap-2 px-4 shrink-0"
          style={{
            height: 48,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            cursor: isMobile ? 'default' : 'grab',
            userSelect: 'none',
          }}
          onMouseDown={isMobile ? undefined : onHeaderMouseDown}
        >
          {isMobile && (
            <div className="w-8 h-1 rounded-full mx-auto mb-1 absolute top-3 left-1/2 -translate-x-1/2"
              style={{ background: 'rgba(255,255,255,0.15)' }} />
          )}
          <NotebookPen size={15} style={{ color: '#A78BFA' }} />
          <span className="text-sm font-semibold text-white flex-1">📝 笔记</span>
          {courseName && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(167,139,250,0.1)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.2)' }}>
              {courseName}
            </span>
          )}
          <button onClick={closeWindow}
            className="p-1.5 rounded-lg transition-all hover:bg-white/8"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4">

          {/* Paste zone / preview */}
          {preview ? (
            <div className="relative rounded-xl overflow-hidden border"
              style={{ borderColor: 'rgba(167,139,250,0.3)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="预览" className="w-full object-contain" style={{ maxHeight: 220, background: '#111' }} />
              <button onClick={clearImage}
                className="absolute top-2 right-2 p-1 rounded-lg"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div
              ref={pasteZoneRef}
              className="flex flex-col items-center justify-center gap-3 rounded-xl cursor-pointer"
              style={{
                height: 140,
                border: '1.5px dashed rgba(167,139,250,0.3)',
                background: 'rgba(167,139,250,0.04)',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={28} style={{ color: 'rgba(167,139,250,0.5)' }} />
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  粘贴截图 或 点击上传
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#444' }}>
                  支持 Ctrl+V 直接粘贴 · JPG / PNG / WebP
                </p>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Caption input */}
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="添加备注（可选）"
            rows={2}
            className="w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#DDD',
              lineHeight: 1.6,
            }}
          />

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!imageFile || saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: savedOk ? 'rgba(34,197,94,0.15)' : 'rgba(167,139,250,0.15)',
              color: savedOk ? '#22C55E' : '#A78BFA',
              border: `1px solid ${savedOk ? 'rgba(34,197,94,0.3)' : 'rgba(167,139,250,0.3)'}`,
            }}
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> 保存中...</>
              : savedOk
                ? <><Check size={14} /> 已保存！</>
                : '保存到笔记本'}
          </button>

          {/* Recent notes */}
          {recentNotes.length > 0 && (
            <div>
              <p className="text-xs mb-2" style={{ color: '#444' }}>最近保存</p>
              <div className="grid grid-cols-3 gap-2">
                {recentNotes.slice(0, 6).map(note => (
                  <div key={note.id} className="relative group rounded-lg overflow-hidden"
                    style={{ aspectRatio: '1', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={note.image_url} alt={note.caption || '笔记'}
                      className="w-full h-full object-cover cursor-zoom-in"
                      onClick={() => setLightboxSrc(note.image_url)}
                    />
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.7)', color: '#ff6b6b' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
