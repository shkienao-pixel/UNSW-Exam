'use client'

import { useState, useEffect, useRef } from 'react'
import { useMistakes } from '@/lib/mistakes-store'
import type { StoredMistake, FlashcardMistake } from '@/lib/types'
import {
  BookOpen, CheckCircle, Trash2, Play, RotateCcw, Loader2,
  ArrowLeft, BookMarked, MoreHorizontal, Plus, Pencil, X, Check,
} from 'lucide-react'
import { api } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Notebook {
  id: string
  name: string
  description: string
  icon: string
  color: string
  isSystem: boolean
  systemSourceId?: 'past_exam' | 'mock' | 'flashcard'
  createdAt: string
  updatedAt: string
}

type StatusFilter = 'active' | 'mastered' | 'all'

// ── Constants ──────────────────────────────────────────────────────────────────

const ICON_OPTIONS = ['📄','🎯','🎴','📝','⭐','🔥','💡','📚','🧠','📌','🗂️','✍️','🎓','🔖','📊']
const COLOR_OPTIONS = [
  { hex: '#FFD700', label: '金色' },
  { hex: '#34D399', label: '绿色' },
  { hex: '#A78BFA', label: '紫色' },
  { hex: '#60A5FA', label: '蓝色' },
  { hex: '#F87171', label: '红色' },
  { hex: '#FB923C', label: '橙色' },
  { hex: '#A3E635', label: '黄绿' },
  { hex: '#C084FC', label: '粉紫' },
]

function hexToAccent(hex: string) {
  return {
    color: hex,
    accentBg: `${hex}0f`,
    accentBorder: `${hex}30`,
  }
}

function defaultNotebooks(): Notebook[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'sys_past_exam', name: '真题错题', description: '往年考题中答错的记录',
      icon: '📄', color: '#FFD700', isSystem: true, systemSourceId: 'past_exam',
      createdAt: now, updatedAt: now,
    },
    {
      id: 'sys_mock', name: '模拟题错题', description: '模拟考试中的错误记录',
      icon: '🎯', color: '#34D399', isSystem: true, systemSourceId: 'mock',
      createdAt: now, updatedAt: now,
    },
    {
      id: 'sys_flashcard', name: '闪卡笔记', description: '闪卡训练中标记"没记住"的内容',
      icon: '🎴', color: '#A78BFA', isSystem: true, systemSourceId: 'flashcard',
      createdAt: now, updatedAt: now,
    },
  ]
}

// ── useNotebooks hook ──────────────────────────────────────────────────────────

function useNotebooks(courseId?: string) {
  const storageKey = `em_notebooks_${courseId ?? 'global'}`
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        setNotebooks(JSON.parse(raw))
      } else {
        const defaults = defaultNotebooks()
        localStorage.setItem(storageKey, JSON.stringify(defaults))
        setNotebooks(defaults)
      }
    } catch {
      setNotebooks(defaultNotebooks())
    }
    setReady(true)
  }, [storageKey])

  function persist(updated: Notebook[]) {
    setNotebooks(updated)
    try { localStorage.setItem(storageKey, JSON.stringify(updated)) } catch { /* quota */ }
  }

  function createNotebook(data: Pick<Notebook, 'name' | 'description' | 'icon' | 'color'>) {
    const nb: Notebook = {
      ...data,
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      isSystem: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    persist([...notebooks, nb])
    return nb
  }

  function updateNotebook(id: string, data: Partial<Pick<Notebook, 'name' | 'description' | 'icon' | 'color'>>) {
    persist(notebooks.map(nb => nb.id === id ? { ...nb, ...data, updatedAt: new Date().toISOString() } : nb))
  }

  function deleteNotebook(id: string) {
    persist(notebooks.filter(nb => nb.id !== id))
  }

  return { notebooks, ready, createNotebook, updateNotebook, deleteNotebook }
}

// ── NotebookFormModal (create + edit) ─────────────────────────────────────────

function NotebookFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Notebook
  onSave: (data: Pick<Notebook, 'name' | 'description' | 'icon' | 'color'>) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [desc, setDesc] = useState(initial?.description ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '📝')
  const [color, setColor] = useState(initial?.color ?? '#FFD700')
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const isEdit = !!initial

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 60)
  }, [])

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { setError('笔记本名称不能为空'); return }
    if (trimmed.length > 30) { setError('名称最多 30 个字符'); return }
    onSave({ name: trimmed, description: desc.trim(), icon, color })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-5"
        style={{ background: 'rgba(10,11,22,0.98)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">
            {isEdit ? '编辑笔记本' : '新建笔记本'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/8" style={{ color: '#555' }}>
            <X size={15} />
          </button>
        </div>

        {/* Icon picker */}
        <div>
          <p className="text-xs mb-2" style={{ color: '#555' }}>选择图标</p>
          <div className="flex flex-wrap gap-1.5">
            {ICON_OPTIONS.map(em => (
              <button
                key={em}
                onClick={() => setIcon(em)}
                className="w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all"
                style={{
                  background: icon === em ? `${color}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${icon === em ? color + '55' : 'rgba(255,255,255,0.07)'}`,
                  transform: icon === em ? 'scale(1.1)' : 'none',
                }}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <p className="text-xs mb-2" style={{ color: '#555' }}>主题色</p>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c.hex}
                onClick={() => setColor(c.hex)}
                className="w-7 h-7 rounded-full transition-all"
                style={{
                  background: c.hex,
                  outline: color === c.hex ? `2px solid ${c.hex}` : 'none',
                  outlineOffset: 2,
                  transform: color === c.hex ? 'scale(1.15)' : 'none',
                }}
                title={c.label}
              />
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <p className="text-xs mb-1.5" style={{ color: '#555' }}>笔记本名称 <span style={{ color: '#FF6666' }}>*</span></p>
          <input
            ref={nameRef}
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            maxLength={30}
            placeholder="例如：期末重点、错题整理…"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${error ? 'rgba(255,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: '#f0f0f0',
            }}
          />
          <div className="flex items-center justify-between mt-1">
            {error
              ? <span className="text-xs" style={{ color: '#FF6666' }}>{error}</span>
              : <span />}
            <span className="text-xs" style={{ color: name.length > 25 ? '#FF6666' : '#333' }}>{name.length}/30</span>
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="text-xs mb-1.5" style={{ color: '#555' }}>描述 <span style={{ color: '#333' }}>（可选）</span></p>
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            maxLength={80}
            placeholder="这个笔记本用来放什么？"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#d0d0d0',
            }}
          />
        </div>

        {/* Preview */}
        <div className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: `${color}0f`, border: `1px solid ${color}30` }}>
          <span className="text-xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{name || '未命名笔记本'}</p>
            {desc && <p className="text-xs truncate mt-0.5" style={{ color: '#666' }}>{desc}</p>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#555', border: '1px solid rgba(255,255,255,0.08)' }}>
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: `${color}22`, color: color, border: `1px solid ${color}44` }}
          >
            <Check size={14} />
            {isEdit ? '保存修改' : '创建笔记本'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DeleteConfirmModal ─────────────────────────────────────────────────────────

function DeleteConfirmModal({
  notebook,
  onConfirm,
  onClose,
}: {
  notebook: Notebook
  onConfirm: () => void
  onClose: () => void
}) {
  const accent = hexToAccent(notebook.color)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-6 space-y-5"
        style={{ background: 'rgba(10,11,22,0.98)', border: '1px solid rgba(255,68,68,0.2)', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}
      >
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">{notebook.icon}</span>
            <p className="text-base font-bold text-white">{notebook.name}</p>
          </div>
          <p className="text-sm" style={{ color: '#888' }}>确认删除这个笔记本？</p>
          <p className="text-xs mt-1.5" style={{ color: '#555' }}>
            删除后不可恢复。笔记本内的内容（如有）也将一并删除。
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>
            取消
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: 'rgba(255,68,68,0.15)', color: '#FF6666', border: '1px solid rgba(255,68,68,0.3)' }}>
            <Trash2 size={13} /> 确认删除
          </button>
        </div>
      </div>
    </div>
  )
}

// ── NotebookMenu (... dropdown) ────────────────────────────────────────────────

function NotebookMenu({
  notebook,
  onEdit,
  onDelete,
}: {
  notebook: Notebook
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className="rounded-lg p-1.5 transition-all"
        style={{ color: open ? '#aaa' : '#444', background: open ? 'rgba(255,255,255,0.08)' : 'transparent' }}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl py-1 min-w-[120px] z-20"
          style={{ background: '#0f1120', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 32px rgba(0,0,0,0.6)' }}
        >
          <button
            onClick={() => { setOpen(false); onEdit() }}
            className="flex items-center gap-2.5 w-full px-4 py-2 text-xs transition-colors hover:bg-white/6"
            style={{ color: '#bbb' }}
          >
            <Pencil size={12} /> 重命名
          </button>
          {!notebook.isSystem && (
            <button
              onClick={() => { setOpen(false); onDelete() }}
              className="flex items-center gap-2.5 w-full px-4 py-2 text-xs transition-colors hover:bg-red-500/10"
              style={{ color: '#FF6666' }}
            >
              <Trash2 size={12} /> 删除
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function MistakesView({ courseId }: { courseId?: string }) {
  const { all, active, mastered, master, remove, loading } = useMistakes(courseId)
  const { notebooks, ready, createNotebook, updateNotebook, deleteNotebook } = useNotebooks(courseId)
  const [fcMistakes, setFcMistakes] = useState<FlashcardMistake[]>([])

  const [view, setView] = useState<'list' | 'detail' | 'practice'>('list')
  const [openNotebookId, setOpenNotebookId] = useState<string | null>(null)
  const [practiceSource, setPracticeSource] = useState<'past_exam' | 'mock' | null>(null)

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [editingNb, setEditingNb] = useState<Notebook | null>(null)
  const [deletingNb, setDeletingNb] = useState<Notebook | null>(null)

  // Migration notice
  const [showMigrationNotice, setShowMigrationNotice] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('exam_mistakes_v1')) {
      localStorage.removeItem('exam_mistakes_v1')
      setShowMigrationNotice(true)
    }
  }, [])

  useEffect(() => {
    if (!courseId) return
    api.flashcardMistakes.list(courseId).then(setFcMistakes).catch(() => {})
  }, [courseId])

  const openNotebook = notebooks.find(nb => nb.id === openNotebookId)

  // Content counts per system notebook
  const systemCounts: Record<string, { total: number; active: number }> = {
    sys_past_exam: {
      total: all.filter(m => m.source_type === 'past_exam').length,
      active: active.filter(m => m.source_type === 'past_exam').length,
    },
    sys_mock: {
      total: all.filter(m => m.source_type === 'mock').length,
      active: active.filter(m => m.source_type === 'mock').length,
    },
    sys_flashcard: {
      total: fcMistakes.length,
      active: fcMistakes.filter(m => m.mistake_status === 'active').length,
    },
  }

  const practiceList = active.filter(m =>
    practiceSource === null || m.source_type === practiceSource
  )

  // ── Practice ──
  if (view === 'practice') {
    return (
      <PracticeMode
        mistakes={practiceList}
        onMaster={master}
        onExit={() => setView('detail')}
      />
    )
  }

  // ── Detail ──
  if (view === 'detail' && openNotebook) {
    const accent = hexToAccent(openNotebook.color)
    const cnt = openNotebook.isSystem ? (systemCounts[openNotebook.id] ?? { total: 0, active: 0 }) : { total: 0, active: 0 }
    return (
      <NotebookDetail
        notebook={openNotebook}
        accent={accent}
        all={all}
        active={active}
        mastered={mastered}
        fcMistakes={fcMistakes}
        counts={cnt}
        loading={loading}
        onMaster={master}
        onRemove={remove}
        onFcMaster={id => {
          api.flashcardMistakes.update(courseId!, id, 'mastered').catch(() => {})
          setFcMistakes(prev => prev.map(x => x.id === id ? { ...x, mistake_status: 'mastered' as const } : x))
        }}
        onFcRemove={id => {
          api.flashcardMistakes.delete(courseId!, id).catch(() => {})
          setFcMistakes(prev => prev.filter(x => x.id !== id))
        }}
        onBack={() => setView('list')}
        onEdit={() => setEditingNb(openNotebook)}
        onDelete={() => setDeletingNb(openNotebook)}
        onStartPractice={() => {
          setPracticeSource(openNotebook.systemSourceId === 'flashcard' ? null : (openNotebook.systemSourceId ?? null))
          setView('practice')
        }}
      />
    )
  }

  // ── List ──
  return (
    <>
      {/* Modals */}
      {showCreate && (
        <NotebookFormModal
          onSave={data => { createNotebook(data); setShowCreate(false) }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editingNb && (
        <NotebookFormModal
          initial={editingNb}
          onSave={data => { updateNotebook(editingNb.id, data); setEditingNb(null) }}
          onClose={() => setEditingNb(null)}
        />
      )}
      {deletingNb && (
        <DeleteConfirmModal
          notebook={deletingNb}
          onConfirm={() => {
            deleteNotebook(deletingNb.id)
            setDeletingNb(null)
            if (openNotebookId === deletingNb.id) setOpenNotebookId(null)
          }}
          onClose={() => setDeletingNb(null)}
        />
      )}

      <div className="space-y-5">
        {showMigrationNotice && (
          <div className="rounded-xl px-4 py-3 text-xs flex items-start justify-between gap-3"
            style={{ background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.2)', color: '#AAA' }}>
            <span>📦 错题本已升级为云端同步，历史本地记录已清理，下次答题后自动重新收录。</span>
            <button onClick={() => setShowMigrationNotice(false)} className="flex-shrink-0 opacity-40 hover:opacity-80">✕</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BookMarked size={17} style={{ color: '#FFD700' }} />
              我的笔记本
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#444' }}>
              {notebooks.length} 个笔记本
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-85"
            style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}
          >
            <Plus size={13} /> 新建笔记本
          </button>
        </div>

        {/* Notebook grid */}
        {!ready || loading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={22} />
          </div>
        ) : notebooks.length === 0 ? (
          /* Empty state */
          <div
            className="rounded-2xl text-center py-16 px-6 cursor-pointer transition-all hover:border-white/10"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}
            onClick={() => setShowCreate(true)}
          >
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.15)' }}>
              <Plus size={22} style={{ color: '#FFD700', opacity: 0.7 }} />
            </div>
            <p className="text-sm font-semibold text-white mb-1.5">还没有笔记本</p>
            <p className="text-xs" style={{ color: '#444' }}>
              创建笔记本来收纳错题、闪卡记录和学习总结
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium"
              style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.22)' }}>
              <Plus size={12} /> 创建第一个笔记本
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notebooks.map(nb => {
              const accent = hexToAccent(nb.color)
              const cnt = nb.isSystem ? (systemCounts[nb.id] ?? { total: 0, active: 0 }) : { total: 0, active: 0 }
              return (
                <div
                  key={nb.id}
                  className="group relative rounded-2xl p-5 cursor-pointer transition-all duration-200"
                  style={{ background: accent.accentBg, border: `1px solid ${accent.accentBorder}` }}
                  onClick={() => { setOpenNotebookId(nb.id); setView('detail') }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${accent.accentBorder}`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = ''
                    e.currentTarget.style.boxShadow = ''
                  }}
                >
                  {/* Active badge */}
                  {cnt.active > 0 && (
                    <span className="absolute right-10 top-4 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                      style={{ background: 'rgba(255,68,68,0.85)', color: '#fff' }}>
                      {cnt.active}
                    </span>
                  )}

                  {/* ... menu */}
                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <NotebookMenu
                      notebook={nb}
                      onEdit={() => setEditingNb(nb)}
                      onDelete={() => setDeletingNb(nb)}
                    />
                  </div>

                  <div className="mb-3 text-2xl leading-none">{nb.icon}</div>
                  <p className="text-sm font-semibold text-white mb-1 pr-6 leading-snug">{nb.name}</p>
                  {nb.description && (
                    <p className="text-xs leading-relaxed mb-4" style={{ color: '#555' }}>{nb.description}</p>
                  )}

                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs" style={{ color: nb.isSystem && cnt.total > 0 ? nb.color : '#333' }}>
                      {nb.isSystem
                        ? cnt.total > 0 ? `${cnt.total} 条内容` : '暂无内容'
                        : '自定义笔记本'}
                    </span>
                    <span className="text-xs opacity-0 group-hover:opacity-60 transition-opacity"
                      style={{ color: nb.color }}>
                      打开 →
                    </span>
                  </div>

                  {/* System tag */}
                  {nb.isSystem && (
                    <span className="absolute left-4 bottom-4 text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#333' }}>
                      系统
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ── Notebook Detail ────────────────────────────────────────────────────────────

function NotebookDetail({
  notebook, accent, all, active, mastered, fcMistakes, counts, loading,
  onMaster, onRemove, onFcMaster, onFcRemove, onBack, onEdit, onDelete, onStartPractice,
}: {
  notebook: Notebook
  accent: { color: string; accentBg: string; accentBorder: string }
  all: StoredMistake[]
  active: StoredMistake[]
  mastered: StoredMistake[]
  fcMistakes: FlashcardMistake[]
  counts: { total: number; active: number }
  loading: boolean
  onMaster: (id: number) => void
  onRemove: (id: number) => void
  onFcMaster: (id: number) => void
  onFcRemove: (id: number) => void
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onStartPractice: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const isFlashcard = notebook.systemSourceId === 'flashcard'
  const isSystem = notebook.isSystem

  const filteredMistakes = !isSystem || isFlashcard ? [] : all.filter(m => {
    const matchSource = m.source_type === notebook.systemSourceId
    const matchStatus = statusFilter === 'all' || m.mistake_status === statusFilter
    return matchSource && matchStatus
  })

  const filteredFc = isFlashcard
    ? fcMistakes.filter(m => statusFilter === 'all' || m.mistake_status === statusFilter)
    : []

  const activeCount = counts.active
  const masteredCount = isFlashcard
    ? fcMistakes.filter(m => m.mistake_status === 'mastered').length
    : mastered.filter(m => isSystem && m.source_type === notebook.systemSourceId).length

  const isEmpty = isFlashcard ? filteredFc.length === 0 : (isSystem ? filteredMistakes.length === 0 : true)

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
        style={{ color: '#555' }}>
        <ArrowLeft size={13} /> 所有笔记本
      </button>

      {/* Header card */}
      <div className="rounded-2xl px-5 py-4" style={{ background: accent.accentBg, border: `1px solid ${accent.accentBorder}` }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{notebook.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white truncate">{notebook.name}</h2>
                {notebook.isSystem && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#444' }}>系统</span>
                )}
              </div>
              {notebook.description && (
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>{notebook.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span style={{ color: accent.color }}>{counts.total} 条</span>
                {activeCount > 0 && <span style={{ color: '#FF6666' }}>{activeCount} 待复习</span>}
                {masteredCount > 0 && <span style={{ color: '#22C55E' }}>{masteredCount} 已掌握</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isSystem && activeCount > 0 && !isFlashcard && (
              <button onClick={onStartPractice}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                style={{ background: accent.accentBg, color: accent.color, border: `1px solid ${accent.accentBorder}` }}>
                <Play size={12} /> 练习
              </button>
            )}
            <NotebookMenu notebook={notebook} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </div>
      </div>

      {/* Filter */}
      {isSystem && (
        <div className="flex gap-1 p-0.5 rounded-xl w-fit"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['active', 'mastered', 'all'] as StatusFilter[]).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                background: statusFilter === f ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: statusFilter === f ? '#DDD' : '#444',
                border: `1px solid ${statusFilter === f ? 'rgba(255,255,255,0.14)' : 'transparent'}`,
              }}>
              {f === 'active' ? '待复习' : f === 'mastered' ? '已掌握' : '全部'}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={22} />
        </div>
      ) : !isSystem ? (
        /* Custom notebook empty state */
        <div className="rounded-2xl text-center py-14 px-6"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.07)' }}>
          <div className="mx-auto mb-4 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: `${notebook.color}12`, border: `1px solid ${notebook.color}25` }}>
            <span className="text-xl">{notebook.icon}</span>
          </div>
          <p className="text-sm text-white mb-1.5">这个笔记本还是空的</p>
          <p className="text-xs" style={{ color: '#444' }}>
            未来可以从答题页、闪卡训练中把内容加入此笔记本
          </p>
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl text-center py-14"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <BookOpen size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm text-white mb-1">
            {statusFilter === 'active' ? '🎉 没有待复习的内容！' : '暂无记录'}
          </p>
          {statusFilter === 'active' && (
            <p className="text-xs" style={{ color: '#444' }}>
              {isFlashcard ? '闪卡训练中点"✗ 没记住"会记录到这里' : '答错的题目会自动收录'}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {isFlashcard && filteredFc.map(m => (
            <EntryCard
              key={m.id}
              type="flashcard"
              status={m.mistake_status}
              title={m.card_front}
              subtitle={`答案：${m.card_back}`}
              badge={m.card_type === 'vocab' ? '词汇卡' : '选择题'}
              badgeColor="#A78BFA"
              onMaster={() => onFcMaster(m.id)}
              onRemove={() => onFcRemove(m.id)}
            />
          ))}
          {!isFlashcard && isSystem && filteredMistakes.map(m => (
            <MistakeCard key={m.question_id} mistake={m} onMaster={onMaster} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Entry Card ─────────────────────────────────────────────────────────────────

function EntryCard({
  type, status, title, subtitle, badge, badgeColor, onMaster, onRemove,
}: {
  type: 'flashcard' | 'mistake'
  status: 'active' | 'mastered'
  title: string
  subtitle: string
  badge: string
  badgeColor: string
  onMaster: () => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl p-4 space-y-3 group"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: status === 'mastered' ? '1px solid rgba(34,197,94,0.18)' : '1px solid rgba(255,255,255,0.06)',
      }}>
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: `${badgeColor}1a`, color: badgeColor, border: `1px solid ${badgeColor}40` }}>
          {badge}
        </span>
        {status === 'mastered' && (
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            ✓ 已掌握
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-white leading-relaxed">{title}</p>
      <p className="text-xs leading-relaxed" style={{ color: '#777' }}>{subtitle}</p>
      <div className="flex items-center gap-2 pt-0.5">
        {status === 'active' && (
          <button onClick={onMaster} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle size={11} /> 已掌握
          </button>
        )}
        <button onClick={onRemove}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Trash2 size={11} /> 删除
        </button>
      </div>
    </div>
  )
}

// ── Mistake Card ───────────────────────────────────────────────────────────────

function MistakeCard({ mistake: m, onMaster, onRemove }: {
  mistake: StoredMistake; onMaster: (id: number) => void; onRemove: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl p-4 space-y-3 group"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: m.mistake_status === 'mastered' ? '1px solid rgba(34,197,94,0.18)' : '1px solid rgba(255,255,255,0.06)',
      }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: m.source_type === 'mock' ? 'rgba(52,211,153,0.1)' : 'rgba(255,215,0,0.1)',
            color: m.source_type === 'mock' ? '#34D399' : '#FFD700',
            border: `1px solid ${m.source_type === 'mock' ? 'rgba(52,211,153,0.25)' : 'rgba(255,215,0,0.2)'}`,
          }}>
          {m.source_type === 'mock' ? '模拟题' : '真题'}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}>
          {m.question_type === 'mcq' ? '选择题' : '简答题'}
        </span>
        {m.mistake_status === 'mastered' && (
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            ✓ 已掌握
          </span>
        )}
        <span className="ml-auto text-xs" style={{ color: '#333' }}>
          {new Date(m.created_at).toLocaleDateString('zh-CN')}
        </span>
      </div>
      <p className="text-sm text-white leading-relaxed">{m.question_text}</p>
      {m.options && m.question_type === 'mcq' && (
        <div className="space-y-1.5">
          {m.options.map((opt, j) => {
            const label = String.fromCharCode(65 + j)
            const isCorrect = label === m.correct_answer
            const isWrong = m.user_answer === label && !isCorrect
            return (
              <div key={j} className="px-3 py-2 rounded-lg text-xs"
                style={{
                  background: isCorrect ? 'rgba(34,197,94,0.08)' : isWrong ? 'rgba(255,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isCorrect ? '#22C55E33' : isWrong ? '#FF444425' : 'rgba(255,255,255,0.05)'}`,
                  color: isCorrect ? '#22C55E' : isWrong ? '#FF6666' : '#555',
                }}>
                <span style={{ fontWeight: isCorrect ? 600 : 400 }}>{label}. {opt}</span>
                {isCorrect && <span className="ml-2 opacity-50">← 正确</span>}
                {isWrong && <span className="ml-2 opacity-50">← 你的答案</span>}
              </div>
            )
          })}
        </div>
      )}
      {m.question_type === 'short_answer' && m.correct_answer && (
        <div className="px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', color: '#22C55E' }}>
          参考答案：{m.correct_answer}
        </div>
      )}
      {(m.feedback || m.explanation) && (
        <div>
          <button onClick={() => setExpanded(v => !v)} className="text-xs hover:opacity-100 transition-opacity"
            style={{ color: '#444', opacity: 0.7 }}>
            {expanded ? '▲ 收起解析' : '▼ 查看解析'}
          </button>
          {expanded && (
            <p className="mt-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,215,0,0.04)', color: '#888' }}>
              💡 {m.feedback || m.explanation}
            </p>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 pt-0.5">
        {m.mistake_status === 'active' && (
          <button onClick={() => onMaster(m.question_id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle size={11} /> 已掌握
          </button>
        )}
        <button onClick={() => onRemove(m.question_id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Trash2 size={11} /> 删除
        </button>
      </div>
    </div>
  )
}

// ── Practice Mode ──────────────────────────────────────────────────────────────

function PracticeMode({ mistakes, onMaster, onExit }: {
  mistakes: StoredMistake[]; onMaster: (id: number) => void; onExit: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [chosenAnswer, setChosenAnswer] = useState<string | null>(null)
  const [session, setSession] = useState<Record<number, 'correct' | 'wrong'>>({})

  if (mistakes.length === 0) return (
    <div className="text-center py-20 space-y-4">
      <p className="text-white">🎉 没有待复习的错题！</p>
      <button onClick={onExit} className="px-5 py-2 rounded-xl text-sm font-semibold"
        style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.28)' }}>
        返回笔记本
      </button>
    </div>
  )

  const m = mistakes[idx]
  const isShortAnswer = m.question_type === 'short_answer'
  const totalDone = Object.keys(session).length
  const correctDone = Object.values(session).filter(v => v === 'correct').length
  const isLastCard = idx === mistakes.length - 1
  const isSessionDone = totalDone === mistakes.length

  function advance() { setRevealed(false); setChosenAnswer(null); if (!isLastCard) setIdx(i => i + 1) }

  function handleMCQAnswer(label: string) {
    if (chosenAnswer !== null) return
    setChosenAnswer(label); setRevealed(true)
    const isCorrect = label === m.correct_answer
    setSession(prev => ({ ...prev, [m.question_id]: isCorrect ? 'correct' : 'wrong' }))
    if (isCorrect) onMaster(m.question_id)
  }

  function handleShortAnswerResult(correct: boolean) {
    setSession(prev => ({ ...prev, [m.question_id]: correct ? 'correct' : 'wrong' }))
    if (correct) onMaster(m.question_id)
    advance()
  }

  if (isSessionDone) return (
    <div className="rounded-2xl p-10 text-center space-y-4"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,215,0,0.15)' }}>
      <p className="text-5xl font-bold" style={{ color: '#FFD700' }}>{correctDone}/{mistakes.length}</p>
      <p className="text-lg text-white font-semibold">练习完成！</p>
      <p className="text-sm" style={{ color: correctDone === mistakes.length ? '#22C55E' : '#888' }}>
        {correctDone === mistakes.length ? '🎉 全部掌握，太厉害了！'
          : `✅ 掌握 ${correctDone} 题 · 还需复习 ${mistakes.length - correctDone} 题`}
      </p>
      <div className="flex gap-3 justify-center pt-3">
        <button onClick={() => { setIdx(0); setRevealed(false); setChosenAnswer(null); setSession({}) }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#666', border: '1px solid rgba(255,255,255,0.1)' }}>
          <RotateCcw size={13} /> 重新练习
        </button>
        <button onClick={onExit} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.28)' }}>
          返回笔记本
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onExit} className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
          style={{ color: '#444' }}>
          <ArrowLeft size={12} /> 返回
        </button>
        <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${((idx + 1) / mistakes.length) * 100}%`, background: '#FFD700' }} />
        </div>
        <span className="text-xs" style={{ color: '#444' }}>{idx + 1}/{mistakes.length}</span>
        {correctDone > 0 && <span className="text-xs" style={{ color: '#22C55E' }}>✓ {correctDone}</span>}
      </div>

      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: m.source_type === 'mock' ? 'rgba(52,211,153,0.1)' : 'rgba(255,215,0,0.1)', color: m.source_type === 'mock' ? '#34D399' : '#FFD700' }}>
            {m.source_type === 'mock' ? '模拟题' : '真题'}
          </span>
          <span className="text-xs" style={{ color: '#555' }}>{isShortAnswer ? '简答题' : '选择题'}</span>
        </div>
        <p className="text-base font-semibold text-white leading-relaxed">{m.question_text}</p>
        {m.options && !isShortAnswer && (
          <div className="space-y-2">
            {m.options.map((opt, j) => {
              const label = String.fromCharCode(65 + j)
              const isChosen = chosenAnswer === label
              const isCorrect = label === m.correct_answer
              let bg = 'rgba(255,255,255,0.03)', border = 'rgba(255,255,255,0.07)', color = '#CCC'
              if (revealed) {
                if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = '#22C55E44'; color = '#22C55E' }
                else if (isChosen) { bg = 'rgba(255,68,68,0.08)'; border = '#FF444433'; color = '#FF6666' }
              }
              return (
                <button key={j} onClick={() => handleMCQAnswer(label)} disabled={chosenAnswer !== null}
                  className="w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all disabled:cursor-default"
                  style={{ background: bg, border: `1px solid ${border}`, color }}>
                  <span style={{ color: '#FFD700', marginRight: 6 }}>{label}.</span>{opt}
                </button>
              )
            })}
          </div>
        )}
        {isShortAnswer && !revealed && (
          <button onClick={() => setRevealed(true)} className="w-full py-3 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,215,0,0.08)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.22)' }}>
            查看参考答案
          </button>
        )}
        {isShortAnswer && revealed && m.correct_answer && (
          <div className="px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)', color: '#22C55E' }}>
            {m.correct_answer}
          </div>
        )}
        {revealed && (m.feedback || m.explanation) && (
          <p className="text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,215,0,0.04)', color: '#888' }}>
            💡 {m.feedback || m.explanation}
          </p>
        )}
      </div>

      {isShortAnswer && revealed && (
        <div className="flex gap-3 justify-center">
          <button onClick={() => handleShortAnswerResult(false)} className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,68,68,0.08)', color: '#FF6666', border: '1px solid rgba(255,68,68,0.2)' }}>
            ✗ 还没记住
          </button>
          <button onClick={() => handleShortAnswerResult(true)} className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            ✓ 已掌握
          </button>
        </div>
      )}
      {!isShortAnswer && revealed && (
        <div className="flex justify-end">
          <button onClick={advance} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
            {isLastCard ? '完成 ✓' : '下一题 →'}
          </button>
        </div>
      )}
    </div>
  )
}
