'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  GalleryVerticalEnd,
  ImagePlus,
  Loader2,
  NotebookPen,
  ScanSearch,
  Trash2,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useNoteFloat } from '@/lib/note-float-context'
import type { UserNote } from '@/lib/types'
import { emitNotesChanged, subscribeNotesChanged } from '@/lib/ui-sync'

const DEFAULT_W = 460
const DEFAULT_H = 620
const MIN_W = 360
const MIN_H = 420
const POS_KEY = 'note_float_pos'
const SIZE_KEY = 'note_float_size'
const FAB_KEY = 'note_fab_pos'

type ResizeDir = 'e' | 's' | 'se'
type PanelView = 'capture' | 'library'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function loadPos() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const pos = JSON.parse(raw) as { x: number; y: number }
    return {
      x: clamp(pos.x, 0, window.innerWidth - 60),
      y: clamp(pos.y, 0, window.innerHeight - 60),
    }
  } catch {
    return null
  }
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

function loadFabPos() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(FAB_KEY)
    if (!raw) return null
    const pos = JSON.parse(raw) as { x: number; y: number }
    return {
      x: clamp(pos.x, 0, window.innerWidth - 64),
      y: clamp(pos.y, 0, window.innerHeight - 64),
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
        alt="note preview"
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

function NoteCard({
  note,
  onZoom,
  onDelete,
}: {
  note: UserNote
  onZoom: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasAiContent = Boolean(note.ai_content?.trim())

  return (
    <div
      className="group overflow-hidden rounded-2xl"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 14px 36px rgba(0,0,0,0.12)',
      }}
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={note.image_url}
          alt={note.caption || 'note'}
          className="h-[152px] w-full cursor-zoom-in object-cover"
          onClick={onZoom}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
          style={{ background: 'linear-gradient(180deg, transparent, rgba(4,6,12,0.82))' }}
        />
        <button
          onClick={onDelete}
          className="absolute right-2 top-2 rounded-xl p-2 opacity-0 transition-all group-hover:opacity-100"
          style={{ background: 'rgba(6,7,12,0.7)', color: '#fca5a5' }}
        >
          <Trash2 size={12} />
        </button>
        {hasAiContent && (
          <button
            onClick={() => setExpanded(value => !value)}
            className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
            style={{
              background: 'rgba(167,139,250,0.18)',
              border: '1px solid rgba(167,139,250,0.26)',
              color: '#ede9fe',
            }}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            AI 摘录
          </button>
        )}
        <div className="absolute bottom-2 left-2 right-16">
          {note.caption ? (
            <p className="truncate text-xs text-white">{note.caption}</p>
          ) : (
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              未添加备注
            </p>
          )}
          <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.42)' }}>
            {new Date(note.created_at).toLocaleString('zh-CN', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>

      {hasAiContent && expanded && (
        <div
          className="max-h-48 overflow-y-auto px-4 py-3 text-xs leading-6"
          style={{
            color: '#d4d4dc',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          {note.ai_content}
        </div>
      )}
    </div>
  )
}

function NoteFab({
  onClick,
  pos,
  onDragEnd,
}: {
  onClick: () => void
  pos: { x: number; y: number }
  onDragEnd: (pos: { x: number; y: number }) => void
}) {
  const dragRef = useRef<{ startX: number; startY: number; fabX: number; fabY: number } | null>(null)
  const movedRef = useRef(false)
  const [fabPos, setFabPos] = useState(pos)

  function onMouseMove(event: MouseEvent) {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.startX
    const dy = event.clientY - dragRef.current.startY
    if (Math.hypot(dx, dy) > 4) movedRef.current = true
    setFabPos({
      x: clamp(dragRef.current.fabX + dx, 0, window.innerWidth - 64),
      y: clamp(dragRef.current.fabY + dy, 0, window.innerHeight - 64),
    })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    if (!movedRef.current) onClick()
    else onDragEnd(fabPos)
    dragRef.current = null
  }

  function onMouseDown(event: React.MouseEvent) {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      fabX: fabPos.x,
      fabY: fabPos.y,
    }
    movedRef.current = false
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <button
      onMouseDown={onMouseDown}
      className="fixed z-50 flex items-center justify-center rounded-full select-none"
      style={{
        left: fabPos.x,
        top: fabPos.y,
        width: 58,
        height: 58,
        background: 'radial-gradient(circle at 32% 28%, rgba(201,178,255,0.2), rgba(17,19,30,0.96) 60%)',
        border: '1px solid rgba(167,139,250,0.42)',
        boxShadow: '0 20px 44px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
        color: '#c4b5fd',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        cursor: 'grab',
      }}
      title="笔记本"
    >
      <NotebookPen size={22} />
      <span
        className="pointer-events-none absolute inset-1 rounded-full"
        style={{ border: '1px solid rgba(255,255,255,0.05)' }}
      />
    </button>
  )
}

export default function NoteFloatWindow() {
  const { isOpen, courseId, courseName, openWindow, closeWindow } = useNoteFloat()

  const [size, setSize] = useState(loadSize)
  const [pos, setPos] = useState(() => {
    const saved = loadPos()
    if (saved) return saved
    if (typeof window === 'undefined') return { x: 80, y: 80 }
    return { x: window.innerWidth - DEFAULT_W - 28, y: window.innerHeight - DEFAULT_H - 36 }
  })
  const [fabPos, setFabPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 80, y: 80 }
    return loadFabPos() ?? { x: window.innerWidth - 84, y: window.innerHeight - 188 }
  })
  const [panelView, setPanelView] = useState<PanelView>('capture')

  const [preview, setPreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [recentNotes, setRecentNotes] = useState<UserNote[]>([])
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null)
  const resizeDirRef = useRef<ResizeDir | null>(null)
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, w: 0, h: 0 })

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const refreshNotes = useCallback(() => {
    return api.notes.list(courseId ?? undefined).then(setRecentNotes).catch(() => {})
  }, [courseId])

  useEffect(() => {
    if (!isOpen) return
    refreshNotes()
  }, [isOpen, refreshNotes])

  useEffect(() => {
    return subscribeNotesChanged(detail => {
      if (!isOpen) return
      if (!courseId || !detail.courseId || detail.courseId === courseId) {
        refreshNotes()
      }
    })
  }, [courseId, isOpen, refreshNotes])

  useEffect(() => {
    if (!isOpen) return
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) setImageFromFile(file)
          return
        }
      }
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const onMouseMove = (event: MouseEvent) => {
      if (resizeDirRef.current) {
        const dx = event.clientX - resizeStartRef.current.mouseX
        const dy = event.clientY - resizeStartRef.current.mouseY
        setSize(prev => {
          const nextWidth =
            resizeDirRef.current === 's'
              ? prev.w
              : clamp(resizeStartRef.current.w + dx, MIN_W, window.innerWidth - pos.x - 10)
          const nextHeight =
            resizeDirRef.current === 'e'
              ? prev.h
              : clamp(resizeStartRef.current.h + dy, MIN_H, window.innerHeight - pos.y - 10)
          return { w: nextWidth, h: nextHeight }
        })
        return
      }

      if (!dragRef.current) return
      setPos({
        x: clamp(dragRef.current.winX + event.clientX - dragRef.current.startX, 0, window.innerWidth - size.w),
        y: clamp(dragRef.current.winY + event.clientY - dragRef.current.startY, 0, window.innerHeight - 72),
      })
    }

    const onMouseUp = () => {
      if (resizeDirRef.current) {
        resizeDirRef.current = null
        localStorage.setItem(SIZE_KEY, JSON.stringify(size))
      }
      if (dragRef.current) {
        dragRef.current = null
        localStorage.setItem(POS_KEY, JSON.stringify(pos))
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [isOpen, pos, size])

  function setImageFromFile(file: File) {
    setImageFile(file)
    setSavedOk(false)
    setPanelView('capture')
    const reader = new FileReader()
    reader.onload = event => setPreview((event.target?.result as string) || null)
    reader.readAsDataURL(file)
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) setImageFromFile(file)
    event.target.value = ''
  }

  function clearImage() {
    setPreview(null)
    setImageFile(null)
  }

  async function handleSave() {
    if (!imageFile) return
    setSaving(true)
    try {
      const note = await api.notes.upload(imageFile, caption, courseId ?? undefined)
      setRecentNotes(prev => [note, ...prev.filter(item => item.id !== note.id)].slice(0, 12))
      setPreview(null)
      setImageFile(null)
      setCaption('')
      setSavedOk(true)
      setPanelView('library')
      emitNotesChanged({ courseId })
      window.setTimeout(() => setSavedOk(false), 1800)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteNote(noteId: number) {
    await api.notes.delete(noteId)
    setRecentNotes(prev => prev.filter(note => note.id !== noteId))
    emitNotesChanged({ courseId })
  }

  function startDrag(event: React.MouseEvent) {
    dragRef.current = { startX: event.clientX, startY: event.clientY, winX: pos.x, winY: pos.y }
  }

  function startResize(dir: ResizeDir, event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    resizeDirRef.current = dir
    resizeStartRef.current = { mouseX: event.clientX, mouseY: event.clientY, w: size.w, h: size.h }
  }

  if (lightboxSrc) {
    return <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
  }

  if (!isOpen) {
    return (
      <NoteFab
        onClick={() => openWindow()}
        pos={fabPos}
        onDragEnd={nextPos => {
          setFabPos(nextPos)
          localStorage.setItem(FAB_KEY, JSON.stringify(nextPos))
        }}
      />
    )
  }

  const windowStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        maxHeight: '88dvh',
        borderRadius: '24px 24px 0 0',
      }
    : {
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex: 60,
        borderRadius: 22,
        minWidth: MIN_W,
        minHeight: MIN_H,
      }

  return (
    <>
      {isMobile && (
        <div
          className="fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={closeWindow}
        />
      )}

      <div
        style={{
          ...windowStyle,
          background: 'linear-gradient(180deg, rgba(18,20,33,0.98), rgba(10,12,22,0.98))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: 'radial-gradient(circle at top, rgba(167,139,250,0.18), transparent 72%)' }}
        />

        <div
          className="relative flex items-center gap-3 px-4 py-4"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            cursor: isMobile ? 'default' : 'grab',
            userSelect: 'none',
          }}
          onMouseDown={isMobile ? undefined : startDrag}
        >
          {isMobile && (
            <div
              className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.16)' }}
            />
          )}
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{
              background: 'rgba(167,139,250,0.14)',
              border: '1px solid rgba(167,139,250,0.22)',
              color: '#c4b5fd',
            }}
          >
            <NotebookPen size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">笔记本</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.42)' }}>
              OCR 截图、课程摘录、随手归档
            </p>
          </div>
          {courseName && (
            <span
              className="max-w-[40%] truncate rounded-full px-2.5 py-1 text-[11px]"
              style={{
                background: 'rgba(167,139,250,0.12)',
                border: '1px solid rgba(167,139,250,0.2)',
                color: '#ede9fe',
              }}
            >
              {courseName}
            </span>
          )}
          <button
            onClick={closeWindow}
            className="rounded-xl p-2 transition-all hover:bg-white/8"
            style={{ color: 'rgba(255,255,255,0.42)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div
            className="inline-flex rounded-2xl p-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {([
              { key: 'capture', label: '上传笔记', icon: ScanSearch },
              { key: 'library', label: '笔记本', icon: GalleryVerticalEnd },
            ] as const).map(item => {
              const active = panelView === item.key
              const Icon = item.icon
              return (
                <button
                  key={item.key}
                  onClick={() => setPanelView(item.key)}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all"
                  style={{
                    background: active ? 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(124,58,237,0.12))' : 'transparent',
                    color: active ? '#ede9fe' : 'rgba(255,255,255,0.45)',
                    border: `1px solid ${active ? 'rgba(167,139,250,0.28)' : 'transparent'}`,
                  }}
                >
                  <Icon size={13} />
                  {item.label}
                </button>
              )
            })}
          </div>

          {panelView === 'capture' ? (
            <div className="mt-4 space-y-4">
              {preview ? (
                <div
                  className="relative overflow-hidden rounded-2xl"
                  style={{ border: '1px solid rgba(167,139,250,0.26)', background: 'rgba(255,255,255,0.02)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="preview"
                    className="w-full object-contain"
                    style={{ maxHeight: 280, background: '#11141b' }}
                  />
                  <button
                    onClick={clearImage}
                    className="absolute right-3 top-3 rounded-xl p-2"
                    style={{ background: 'rgba(0,0,0,0.56)', color: '#fff' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-[24px] p-6 text-center transition-all"
                  style={{
                    minHeight: 176,
                    border: '1.5px dashed rgba(167,139,250,0.28)',
                    background: 'linear-gradient(180deg, rgba(167,139,250,0.08), rgba(255,255,255,0.02))',
                  }}
                >
                  <div
                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                    style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.22)' }}
                  >
                    <ImagePlus size={24} style={{ color: '#c4b5fd' }} />
                  </div>
                  <p className="text-sm font-medium text-white">粘贴截图或点击上传</p>
                  <p className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>
                    支持 Ctrl+V、JPG、PNG、WebP
                  </p>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              <textarea
                value={caption}
                onChange={event => setCaption(event.target.value)}
                rows={3}
                placeholder="添加备注，方便后面检索"
                className="w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#e5e7eb',
                }}
              />

              <button
                onClick={handleSave}
                disabled={!imageFile || saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  background: savedOk
                    ? 'rgba(34,197,94,0.16)'
                    : 'linear-gradient(135deg, rgba(167,139,250,0.18), rgba(124,58,237,0.1))',
                  color: savedOk ? '#86efac' : '#ede9fe',
                  border: `1px solid ${savedOk ? 'rgba(34,197,94,0.28)' : 'rgba(167,139,250,0.24)'}`,
                }}
              >
                {saving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    AI 识别中...
                  </>
                ) : savedOk ? (
                  <>
                    <Check size={15} />
                    已保存到笔记本
                  </>
                ) : (
                  '保存到笔记本'
                )}
              </button>

              {recentNotes.length > 0 && (
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      最近保存
                    </p>
                    <button
                      onClick={() => setPanelView('library')}
                      className="text-[11px]"
                      style={{ color: '#c4b5fd' }}
                    >
                      查看全部
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {recentNotes.slice(0, 2).map(note => (
                      <button
                        key={note.id}
                        className="overflow-hidden rounded-2xl text-left"
                        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                        onClick={() => {
                          setPanelView('library')
                          setLightboxSrc(note.image_url)
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={note.image_url} alt={note.caption || 'note'} className="h-24 w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{courseId ? '当前课程笔记' : '全部笔记'}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {recentNotes.length} 条记录
                  </p>
                </div>
                <button
                  onClick={() => setPanelView('capture')}
                  className="rounded-full px-3 py-1.5 text-xs"
                  style={{
                    background: 'rgba(167,139,250,0.12)',
                    border: '1px solid rgba(167,139,250,0.2)',
                    color: '#ede9fe',
                  }}
                >
                  新增笔记
                </button>
              </div>

              {recentNotes.length === 0 ? (
                <div
                  className="rounded-[24px] px-5 py-12 text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <NotebookPen size={28} className="mx-auto mb-3" style={{ color: 'rgba(196,181,253,0.58)' }} />
                  <p className="text-sm text-white">还没有保存笔记</p>
                  <p className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>
                    贴一张截图，识别完成后会自动出现在这里
                  </p>
                </div>
              ) : (
                recentNotes.slice(0, 10).map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onZoom={() => setLightboxSrc(note.image_url)}
                    onDelete={() => handleDeleteNote(note.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {!isMobile && (
          <>
            <div
              onMouseDown={event => startResize('e', event)}
              style={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'ew-resize' }}
            />
            <div
              onMouseDown={event => startResize('s', event)}
              style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 6, cursor: 'ns-resize' }}
            />
            <div
              onMouseDown={event => startResize('se', event)}
              style={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: 18,
                height: 18,
                cursor: 'nwse-resize',
                borderRadius: '0 0 22px 0',
                background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.12) 50%)',
              }}
            />
          </>
        )}
      </div>
    </>
  )
}
