'use client'

/**
 * ResourceHubTab — 课程资料库
 *
 * 架构说明（RAG Sync）：
 * 当上传者修改文件 doc_type 时，前端调用：
 *   PATCH /courses/{courseId}/artifacts/{id}/doc-type  { doc_type }
 * 后端双步更新：
 *   ① UPDATE artifacts.doc_type → Supabase（同步）
 *   ② sync_artifact_doc_type()  → ChromaDB chunk metadata（后台线程，无重新向量化）
 * ChromaDB 只修改 metadata 字段，AI 问答上下文不会错乱。
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { api } from '@/lib/api'
import { useLang } from '@/lib/i18n'
import type { Artifact, DocType } from '@/lib/types'
import { DOC_TYPE_LABELS, DOC_TYPE_COLORS } from '@/lib/types'
import {
  Upload, Search, Lock, ExternalLink, MoreVertical, Edit2,
  Loader2, X, CheckCircle2, ChevronDown, FileText,
  Code, Globe, FileJson, FileCheck,
} from 'lucide-react'

// ── 上传队列类型 ─────────────────────────────────────────────────────────────
type UploadStatus = 'pending' | 'uploading' | 'done' | 'error'
interface UploadItem { id: number; file: File; status: UploadStatus; error?: string }

// ── 文件类型图标 ───────────────────────────────────────────────────────────────

function FileTypeIcon({ fileType, size = 40 }: { fileType: string; size?: number }) {
  const s = size
  if (fileType === 'pdf') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="rgba(239,68,68,0.15)" />
      <rect x="1" y="1" width="38" height="38" rx="9" stroke="rgba(239,68,68,0.35)" strokeWidth="1" />
      <text x="20" y="25" textAnchor="middle" fill="#EF4444" fontSize="12" fontWeight="700" fontFamily="monospace">PDF</text>
    </svg>
  )
  if (fileType === 'word') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="rgba(59,130,246,0.15)" />
      <rect x="1" y="1" width="38" height="38" rx="9" stroke="rgba(59,130,246,0.35)" strokeWidth="1" />
      <text x="20" y="25" textAnchor="middle" fill="#3B82F6" fontSize="11" fontWeight="700" fontFamily="monospace">DOC</text>
    </svg>
  )
  if (fileType === 'python') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="rgba(139,92,246,0.15)" />
      <rect x="1" y="1" width="38" height="38" rx="9" stroke="rgba(139,92,246,0.35)" strokeWidth="1" />
      <text x="20" y="26" textAnchor="middle" fill="#8B5CF6" fontSize="18" fontWeight="700">.py</text>
    </svg>
  )
  if (fileType === 'notebook') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="rgba(245,158,11,0.15)" />
      <rect x="1" y="1" width="38" height="38" rx="9" stroke="rgba(245,158,11,0.35)" strokeWidth="1" />
      <text x="20" y="25" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="700" fontFamily="monospace">ipynb</text>
    </svg>
  )
  if (fileType === 'text') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="rgba(16,185,129,0.15)" />
      <rect x="1" y="1" width="38" height="38" rx="9" stroke="rgba(16,185,129,0.35)" strokeWidth="1" />
      <text x="20" y="25" textAnchor="middle" fill="#10B981" fontSize="11" fontWeight="700" fontFamily="monospace">TXT</text>
    </svg>
  )
  if (fileType === 'url') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="rgba(6,182,212,0.15)" />
      <rect x="1" y="1" width="38" height="38" rx="9" stroke="rgba(6,182,212,0.35)" strokeWidth="1" />
      <text x="20" y="25" textAnchor="middle" fill="#06B6D4" fontSize="11" fontWeight="700" fontFamily="monospace">URL</text>
    </svg>
  )
  // other
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="rgba(100,116,139,0.15)" />
      <rect x="1" y="1" width="38" height="38" rx="9" stroke="rgba(100,116,139,0.35)" strokeWidth="1" />
      <text x="20" y="25" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="700" fontFamily="monospace">FILE</text>
    </svg>
  )
}

// ── 分类 Tab 配置 ─────────────────────────────────────────────────────────────

const CATEGORY_TABS: { key: DocType | 'all'; label: string }[] = [
  { key: 'all',        label: '全部'     },
  { key: 'lecture',    label: '讲义'     },
  { key: 'tutorial',   label: '辅导/Lab' },
  { key: 'revision',   label: '复习总结' },
  { key: 'past_exam',  label: '往年考题' },
  { key: 'assignment', label: '作业'     },
  { key: 'other',      label: '其他'     },
]

// ── ... 菜单组件 ──────────────────────────────────────────────────────────────

function DotMenu({
  artifact,
  isOwner,
  onEditDocType,
}: {
  artifact: Artifact
  isOwner: boolean
  onEditDocType: (a: Artifact) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={e => { e.preventDefault(); setOpen(o => !o) }}
        className="p-1 rounded-lg transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100"
        style={{ color: '#555' }}
        title="更多操作"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl py-1 z-30 min-w-max"
          style={{ background: '#141428', border: '1px solid rgba(255,215,0,0.15)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
        >
          {isOwner ? (
            <button
              onClick={() => { setOpen(false); onEditDocType(artifact) }}
              className="flex items-center gap-2 w-full px-4 py-2 text-xs transition-colors"
              style={{ color: '#aaa' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
              onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}
            >
              <Edit2 size={12} /> 修改分类
            </button>
          ) : (
            <span className="block px-4 py-2 text-xs" style={{ color: '#444' }}>仅上传者可修改</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── 单张资料卡片 ──────────────────────────────────────────────────────────────

function ArtifactCard({
  artifact,
  currentUserId,
  onUnlock,
  onEditDocType,
}: {
  artifact: Artifact
  currentUserId: string
  onUnlock: (a: Artifact) => void
  onEditDocType: (a: Artifact) => void
}) {
  const isOwner = artifact.uploaded_by === currentUserId
  const isLocked = artifact.is_locked
  const isCode   = artifact.file_type === 'python' || artifact.file_type === 'notebook'
  const isUrl    = artifact.file_type === 'url'

  const docColor = DOC_TYPE_COLORS[artifact.doc_type] ?? '#888'

  return (
    <div
      className="group relative rounded-2xl p-5 transition-all duration-200 cursor-default"
      style={{
        background: isLocked ? 'rgba(255,255,255,0.018)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isLocked ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)'}`,
        opacity: isLocked ? 0.72 : 1,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.transform = 'translateY(-3px)'
        el.style.boxShadow = isLocked
          ? '0 8px 24px rgba(0,0,0,0.4)'
          : '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(255,215,0,0.07)'
        el.style.borderColor = isLocked ? 'rgba(255,255,255,0.1)' : 'rgba(255,215,0,0.22)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.transform = 'none'
        el.style.boxShadow = 'none'
        el.style.borderColor = isLocked ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)'
      }}
    >
      {/* 顶部：图标 + 文件名 + ... 菜单 */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0 mt-0.5">
          <FileTypeIcon fileType={artifact.file_type} size={44} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white leading-tight truncate pr-1" title={artifact.file_name}>
            {artifact.file_name}
          </h3>
          <p className="text-xs mt-1" style={{ color: '#555' }}>
            {new Date(artifact.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}
            {isCode && <span className="ml-2" style={{ color: '#8B5CF6' }}>· 代码文件</span>}
            {isUrl  && <span className="ml-2" style={{ color: '#06B6D4' }}>· 外链资源</span>}
          </p>
        </div>

        <DotMenu artifact={artifact} isOwner={isOwner} onEditDocType={onEditDocType} />
      </div>

      {/* 中部：分类标签 + 审核状态 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span
          className="text-xs px-2.5 py-0.5 rounded-full font-medium"
          style={{ background: `${docColor}18`, color: docColor, border: `1px solid ${docColor}33` }}
        >
          {DOC_TYPE_LABELS[artifact.doc_type]}
        </span>
        {artifact.status === 'pending' && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,165,0,0.12)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.25)' }}>
            待审核
          </span>
        )}
        {artifact.status === 'rejected' && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
            已拒绝
          </span>
        )}
        {isCode && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.25)' }}>
            仅下载
          </span>
        )}
      </div>

      {/* 底部：操作按钮 */}
      <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {artifact.status !== 'approved' ? (
          <span className="text-xs" style={{ color: '#444' }}>文件审核中，通过后可访问</span>
        ) : isLocked ? (
          <button
            onClick={() => onUnlock(artifact)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
            style={{ background: 'rgba(255,165,0,0.12)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.28)' }}
          >
            <Lock size={13} />
            <span>1 积分解锁</span>
          </button>
        ) : artifact.storage_url ? (
          <a
            href={artifact.storage_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-85"
            style={{ background: 'rgba(255,215,0,0.14)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.30)', textDecoration: 'none' }}
          >
            <ExternalLink size={13} />
            <span>打开阅读</span>
          </a>
        ) : (
          <span className="text-xs" style={{ color: '#444' }}>暂无下载链接</span>
        )}
      </div>
    </div>
  )
}

// ── 修改分类 Modal ────────────────────────────────────────────────────────────

function EditDocTypeModal({
  artifact,
  onClose,
  onSaved,
  courseId,
}: {
  artifact: Artifact
  onClose: () => void
  onSaved: (updated: Artifact) => void
  courseId: string
}) {
  const [selected, setSelected] = useState<DocType>(artifact.doc_type)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (selected === artifact.doc_type) { onClose(); return }
    setSaving(true)
    setError('')
    try {
      const updated = await api.artifacts.updateDocType(courseId, artifact.id, selected)
      onSaved(updated)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={() => !saving && onClose()}>
      <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl" onClick={e => e.stopPropagation()}
        style={{ background: '#0e0e1c', border: '1px solid rgba(255,215,0,0.2)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Edit2 size={16} style={{ color: '#FFD700' }} /> 修改文件分类
          </h3>
          <button onClick={onClose} style={{ color: '#555' }}><X size={16} /></button>
        </div>

        <p className="text-xs mb-4 truncate" style={{ color: '#666' }}>
          {artifact.file_name}
        </p>

        {/* 分类选项 */}
        <div className="space-y-2 mb-4">
          {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([key, label]) => {
            const color = DOC_TYPE_COLORS[key]
            const isSelected = selected === key
            return (
              <button key={key} onClick={() => setSelected(key)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all"
                style={{
                  background: isSelected ? `${color}18` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? color + '44' : 'rgba(255,255,255,0.06)'}`,
                  color: isSelected ? color : '#666',
                }}>
                {isSelected && <CheckCircle2 size={13} />}
                <span className="text-sm font-medium">{label}</span>
              </button>
            )
          })}
        </div>

        {/* RAG 提示 */}
        <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.1)', color: '#666' }}>
          💡 修改分类后，AI 向量索引的 Metadata 将自动同步，问答结果即时生效。
        </div>

        {error && (
          <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: '#ff8080', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>
            取消
          </button>
          <button onClick={save} disabled={saving || selected === artifact.doc_type}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'rgba(255,215,0,0.16)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.32)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? '保存中...' : '确认修改'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 解锁 Modal ────────────────────────────────────────────────────────────────

function UnlockModal({
  artifact,
  courseId,
  onClose,
  onUnlocked,
}: {
  artifact: Artifact
  courseId: string
  onClose: () => void
  onUnlocked: (id: number, url: string | null) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setLoading(true)
    setError('')
    try {
      const res = await api.artifacts.unlock(courseId, artifact.id)
      onUnlocked(artifact.id, res.storage_url)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '解锁失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={() => !loading && onClose()}>
      <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl" onClick={e => e.stopPropagation()}
        style={{ background: '#0e0e1c', border: '1px solid rgba(255,165,0,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Lock size={18} style={{ color: '#FFA500' }} />
          <h3 className="text-base font-bold text-white">解锁文件访问</h3>
        </div>
        <p className="text-sm mb-1" style={{ color: '#aaa' }}>文件：<span className="text-white font-medium">{artifact.file_name}</span></p>
        <p className="text-sm mb-4" style={{ color: '#777' }}>
          「{DOC_TYPE_LABELS[artifact.doc_type]}」类型文件需消耗{' '}
          <span style={{ color: '#FFD700', fontWeight: 600 }}>1 积分</span>{' '}
          永久解锁下载。
        </p>
        {error && (
          <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: '#ff8080', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }}>
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>
            取消
          </button>
          <button onClick={confirm} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'rgba(255,165,0,0.16)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.32)' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            {loading ? '解锁中...' : '确认解锁（-1 积分）'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 一键解锁全部 Modal ────────────────────────────────────────────────────────

function UnlockAllModal({
  courseId,
  lockedCount,
  creditBalance,
  onClose,
  onUnlocked,
}: {
  courseId: string
  lockedCount: number
  creditBalance: number
  onClose: () => void
  onUnlocked: (spent: number) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canAfford = creditBalance >= lockedCount

  async function confirm() {
    setLoading(true)
    setError('')
    try {
      const res = await api.artifacts.unlockAll(courseId)
      onUnlocked(res.credits_spent)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '解锁失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={() => !loading && onClose()}>
      <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl" onClick={e => e.stopPropagation()}
        style={{ background: '#0e0e1c', border: '1px solid rgba(255,165,0,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>

        <div className="flex items-center gap-2 mb-4">
          <Lock size={18} style={{ color: '#FFD700' }} />
          <h3 className="text-base font-bold text-white">一键解锁全部付费文件</h3>
        </div>

        <div className="space-y-2 mb-4 px-3 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#888' }}>需解锁文件数</span>
            <span className="font-semibold text-white">{lockedCount} 个</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#888' }}>消耗积分</span>
            <span className="font-semibold" style={{ color: '#FFD700' }}>{lockedCount} 积分</span>
          </div>
          <div className="flex justify-between text-sm pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ color: '#888' }}>当前余额</span>
            <span className="font-semibold" style={{ color: canAfford ? '#4ade80' : '#EF4444' }}>
              {creditBalance} 积分{!canAfford && ' （不足）'}
            </span>
          </div>
        </div>

        {!canAfford && (
          <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: '#ff8080', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.18)' }}>
            积分不足，请先充值
          </p>
        )}

        {error && (
          <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: '#ff8080', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>
            取消
          </button>
          <button onClick={confirm} disabled={loading || !canAfford}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'rgba(255,215,0,0.16)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.32)' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            {loading ? '解锁中...' : `确认（-${lockedCount} 积分）`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

interface Props {
  courseId: string
  artifacts: Artifact[]
  setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  fileInputRef: React.RefObject<HTMLInputElement | null>
  currentUserId: string
  creditBalance: number
}

export default function ResourceHubTab({
  courseId, artifacts, setArtifacts, fileInputRef, currentUserId, creditBalance,
}: Props) {
  const { t } = useLang()
  const [activeTab, setActiveTab]     = useState<DocType | 'all'>('all')
  const [search, setSearch]           = useState('')
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([])
  const uploadIdRef = useRef(0)
  const isUploading = uploadQueue.some(q => q.status === 'uploading')
  const allDone = uploadQueue.length > 0 && uploadQueue.every(q => q.status === 'done' || q.status === 'error')
  const [uploadOpen, setUploadOpen]   = useState(false)
  const [pendingDocType, setPendingDocType] = useState<DocType>('lecture')
  const [unlockTarget, setUnlockTarget]     = useState<Artifact | null>(null)
  const [editTarget, setEditTarget]         = useState<Artifact | null>(null)
  const [unlockAllOpen, setUnlockAllOpen]   = useState(false)

  // 计算当前用户还未解锁的文件数（用于"一键解锁"按钮显示）
  const lockedCount = useMemo(
    () => artifacts.filter(a => a.is_locked).length,
    [artifacts]
  )

  // ── 过滤 & 搜索 ────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = activeTab === 'all' ? artifacts : artifacts.filter(a => a.doc_type === activeTab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a => a.file_name.toLowerCase().includes(q))
    }
    return list
  }, [artifacts, activeTab, search])

  // ── 统计数量 ───────────────────────────────────────────────────
  const countByTab = useMemo(() => {
    const m: Record<string, number> = { all: artifacts.length }
    for (const a of artifacts) m[a.doc_type] = (m[a.doc_type] ?? 0) + 1
    return m
  }, [artifacts])

  // ── 批量上传（顺序逐个） ────────────────────────────────────────
  async function startUpload(files: File[]) {
    if (files.length === 0) return
    const newItems: UploadItem[] = files.map(f => ({
      id: ++uploadIdRef.current, file: f, status: 'pending' as UploadStatus,
    }))
    setUploadQueue(prev => [...prev, ...newItems])
    for (const item of newItems) {
      setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading' as UploadStatus } : q))
      try {
        const art = await api.artifacts.upload(courseId, item.file, pendingDocType)
        setArtifacts(prev => [art, ...prev])
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done' as UploadStatus } : q))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '上传失败'
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error' as UploadStatus, error: msg } : q))
      }
    }
  }

  // ── 解锁回调 ──────────────────────────────────────────────────
  function handleUnlocked(id: number, url: string | null) {
    setArtifacts(prev => prev.map(a =>
      a.id === id ? { ...a, is_locked: false, storage_url: url ?? a.storage_url } : a
    ))
  }

  // ── doc_type 修改回调 ─────────────────────────────────────────
  function handleDocTypeSaved(updated: Artifact) {
    setArtifacts(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
  }

  // ── 一键解锁全部回调 ───────────────────────────────────────────
  async function handleUnlockAll(_spent: number) {
    try {
      const fresh = await api.artifacts.list(courseId)
      setArtifacts(fresh)
    } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Modals */}
      {unlockTarget && (
        <UnlockModal
          artifact={unlockTarget}
          courseId={courseId}
          onClose={() => setUnlockTarget(null)}
          onUnlocked={handleUnlocked}
        />
      )}
      {editTarget && (
        <EditDocTypeModal
          artifact={editTarget}
          courseId={courseId}
          onClose={() => setEditTarget(null)}
          onSaved={handleDocTypeSaved}
        />
      )}
      {unlockAllOpen && (
        <UnlockAllModal
          courseId={courseId}
          lockedCount={lockedCount}
          creditBalance={creditBalance}
          onClose={() => setUnlockAllOpen(false)}
          onUnlocked={handleUnlockAll}
        />
      )}

      {/* ── 顶部搜索栏 + 积分 ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex-1 relative min-w-0" style={{ minWidth: 180 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#555' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索文件名..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#ddd',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#555' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* 积分余额 */}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 text-xs font-semibold"
          style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.18)', color: '#FFD700' }}>
          ⚡ {creditBalance} 积分
        </div>

        {/* 一键解锁全部 */}
        {lockedCount > 0 && (
          <button
            onClick={() => setUnlockAllOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0 transition-all"
            style={{
              background: 'rgba(255,165,0,0.1)',
              border: '1px solid rgba(255,165,0,0.28)',
              color: '#FFA500',
            }}>
            <Lock size={12} />
            一键解锁 ({lockedCount})
          </button>
        )}

        {/* 上传按钮 */}
        <button
          onClick={() => setUploadOpen(o => !o)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0"
          style={{
            background: uploadOpen ? 'rgba(255,215,0,0.2)' : 'rgba(255,215,0,0.1)',
            border: '1px solid rgba(255,215,0,0.3)',
            color: '#FFD700',
          }}
        >
          <Upload size={14} />
          上传文件
          <ChevronDown size={13} style={{ transform: uploadOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {/* ── 上传面板（折叠式） ── */}
      {uploadOpen && (
        <div className="mb-5 p-4 rounded-2xl" style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.12)' }}>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs font-medium flex-shrink-0" style={{ color: '#888' }}>分类为：</label>
            <select
              value={pendingDocType}
              onChange={e => setPendingDocType(e.target.value as DocType)}
              className="flex-1 text-sm rounded-lg px-3 py-1.5 outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,215,0,0.25)', color: DOC_TYPE_COLORS[pendingDocType] }}
            >
              {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([k, v]) => (
                <option key={k} value={k} style={{ background: '#0d0d1a', color: '#fff' }}>{v}</option>
              ))}
            </select>
          </div>
          <div
            className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 cursor-pointer transition-colors"
            style={{ borderColor: isUploading ? '#FFD700' : 'rgba(255,215,0,0.2)' }}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const files = Array.from(e.dataTransfer.files)
              if (files.length > 0) startUpload(files)
            }}
          >
            {isUploading
              ? <Loader2 className="animate-spin mb-2" style={{ color: '#FFD700' }} size={22} />
              : <Upload size={22} className="mb-2" style={{ color: '#444' }} />}
            <p className="text-sm font-medium" style={{ color: '#888' }}>
              {isUploading ? '上传中...' : '拖拽或点击选择文件（可多选）'}
            </p>
            <p className="text-xs mt-1" style={{ color: '#555' }}>
              支持 PDF · Word · Python · TXT · Jupyter · URL
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.py,.txt,.ipynb"
              multiple
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files ?? [])
                if (files.length > 0) startUpload(files)
                e.target.value = ''
              }}
            />
          </div>
          {/* 上传队列进度 */}
          {uploadQueue.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: '#888' }}>
                  上传队列（{uploadQueue.filter(q => q.status === 'done').length}/{uploadQueue.length} 完成）
                </span>
                {allDone && (
                  <button
                    onClick={() => setUploadQueue([])}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: '#555' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#555')}
                  >
                    清除
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {uploadQueue.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {item.status === 'pending'  && <div className="w-3.5 h-3.5 rounded-full border border-dashed flex-shrink-0" style={{ borderColor: '#444' }} />}
                    {item.status === 'uploading' && <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: '#FFD700' }} />}
                    {item.status === 'done'      && <CheckCircle2 size={13} className="flex-shrink-0" style={{ color: '#4ade80' }} />}
                    {item.status === 'error'     && <X size={13} className="flex-shrink-0" style={{ color: '#EF4444' }} />}
                    <span className="text-xs flex-1 truncate"
                      style={{ color: item.status === 'error' ? '#EF4444' : item.status === 'done' ? '#555' : '#aaa' }}>
                      {item.file.name}
                    </span>
                    {item.status === 'error' && item.error && (
                      <span className="text-xs flex-shrink-0 ml-2 max-w-[120px] truncate" style={{ color: '#ef9999' }} title={item.error}>
                        {item.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 横向 Category Tabs ── */}
      <div className="relative mb-6 flex-shrink-0">
        <div className="flex gap-0 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {CATEGORY_TABS.map(tab => {
            const isActive = activeTab === tab.key
            const count = countByTab[tab.key] ?? 0
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all flex-shrink-0"
                style={{ color: isActive ? '#FFD700' : '#555' }}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.06)',
                      color: isActive ? '#FFD700' : '#444',
                      fontSize: 10,
                    }}
                  >
                    {count}
                  </span>
                )}
                {/* 高亮指示条 */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 rounded-t-full"
                    style={{ height: 2, background: '#FFD700', boxShadow: '0 0 8px rgba(255,215,0,0.6)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 资料卡片 Grid ── */}
      <div className="flex-1 overflow-y-auto pb-8">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <FileText size={28} style={{ color: '#2a2a40' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: '#444455' }}>
              {search ? `未找到包含「${search}」的文件` : '暂无文件'}
            </p>
            {!search && (
              <p className="text-xs mt-1.5" style={{ color: '#333344' }}>
                点击右上角「上传文件」添加课程资料
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayed.map(a => (
              <ArtifactCard
                key={a.id}
                artifact={a}
                currentUserId={currentUserId}
                onUnlock={setUnlockTarget}
                onEditDocType={setEditTarget}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
