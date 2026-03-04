'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Loader2, CheckCircle, XCircle, Trash2, Plus, RefreshCw,
  Users, BookOpen, FileText, Ticket, ChevronLeft, Key, DatabaseZap, Upload, MessageSquare, Sparkles,
  Lock, Zap, Shield, ChevronRight, AlertTriangle, X, Calendar, Info,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'

// ── Doc type constants (mirrored from types.ts) ────────────────────────────────
type DocType = 'lecture' | 'tutorial' | 'revision' | 'past_exam' | 'assignment' | 'other'

const DOC_TYPE_LABELS: Record<DocType, string> = {
  lecture: '讲义', tutorial: '辅导/Lab', revision: '复习总结',
  past_exam: '往年考题', assignment: '作业/Project', other: '其他',
}
const DOC_TYPE_COLORS: Record<DocType, string> = {
  lecture: '#60a5fa', tutorial: '#a78bfa', revision: '#4ade80',
  past_exam: '#f97316', assignment: '#facc15', other: '#6b7280',
}
const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: 'lecture',    label: '📖 讲义 (Lecture)' },
  { value: 'tutorial',   label: '🔬 辅导/Lab (Tutorial)' },
  { value: 'revision',   label: '✅ 复习总结 (Revision)' },
  { value: 'past_exam',  label: '📝 往年考题 (Past Exam)' },
  { value: 'assignment', label: '📋 作业/Project (Assignment)' },
  { value: 'other',      label: '📎 其他 (Other)' },
]

async function adminReq<T>(secret: string, path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'X-Admin-Secret': secret,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Course { id: string; code: string; name: string; created_at: string }
interface Artifact {
  id: number; course_id: string; file_name: string; file_type: string
  status: string; created_at: string; reject_reason: string | null; uploaded_by: string | null
  storage_url?: string; doc_type?: DocType
}
interface User {
  id: string; email: string; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean
}
interface Invite { id: string; code: string; note: string | null; max_uses: number; used_count: number; created_at: string }
interface ApiKey { id: number; provider: 'openai' | 'gemini' | 'deepseek'; label: string; is_active: boolean; created_at: string; updated_at: string }
interface AdminUploadItem { id: number; file: File; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string }

type Tab = 'courses' | 'artifacts' | 'users' | 'invites' | 'api-keys' | 'feedback'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'courses',   label: '课程管理', icon: <BookOpen size={15} /> },
  { id: 'artifacts', label: '文件审核', icon: <FileText size={15} /> },
  { id: 'users',     label: '用户列表', icon: <Users size={15} /> },
  { id: 'invites',   label: '邀请码',   icon: <Ticket size={15} /> },
  { id: 'api-keys',  label: 'API 密钥', icon: <Key size={15} /> },
  { id: 'feedback',  label: '用户反馈', icon: <MessageSquare size={15} /> },
]

// ── Courses tab ───────────────────────────────────────────────────────────────

// ── 课程详情 Modal ─────────────────────────────────────────────────────────────

function CourseDetailModal({
  course, secret, onClose, onDeleted,
}: {
  course: Course; secret: string; onClose: () => void; onDeleted: () => void
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}>
        {/* Modal panel */}
        <div className="relative w-full max-w-lg mx-4 rounded-3xl flex flex-col max-h-[90vh]"
          onClick={e => e.stopPropagation()}
          style={{ background: '#0d0d1c', border: '1px solid rgba(255,215,0,0.15)', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>

          {/* 顶部关闭 */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Info size={16} style={{ color: '#FFD700' }} /> 课程详情
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#555' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
              <X size={16} />
            </button>
          </div>

          {/* 内容区（可滚动） */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* 基本信息 */}
            <div className="rounded-2xl p-4 space-y-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0"
                  style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
                  {course.code}
                </span>
                <span className="text-base font-semibold text-white">{course.name}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: '#555' }}>
                <Calendar size={12} />
                创建于 {new Date(course.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <div className="text-xs pt-1" style={{ color: '#444', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: '#555' }}>课程 ID：</span>
                <span className="font-mono text-xs" style={{ color: '#3a3a5a' }}>{course.id}</span>
              </div>
            </div>

            {/* ── Danger Zone ── */}
            <div className="rounded-2xl p-4"
              style={{ background: 'rgba(239,68,68,0.04)', border: '1px dashed rgba(239,68,68,0.35)' }}>
              <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5" style={{ color: '#EF4444' }}>
                <AlertTriangle size={14} /> 危险操作区
              </h4>
              <p className="text-xs mb-4 leading-relaxed" style={{ color: '#7a3030' }}>
                删除课程将<strong style={{ color: '#cc4444' }}>不可恢复地清空</strong>该课程下的所有课件文件、AI 闪卡、错题集与 RAG 向量索引。
              </p>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.2)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'
                }}>
                <Trash2 size={14} /> 删除该课程
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 二次确认弹窗 */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          course={course}
          secret={secret}
          onClose={() => setShowDeleteConfirm(false)}
          onDeleted={() => { setShowDeleteConfirm(false); onClose(); onDeleted() }}
        />
      )}
    </>
  )
}

// ── 删除确认 Modal ─────────────────────────────────────────────────────────────

function DeleteConfirmModal({
  course, secret, onClose, onDeleted,
}: {
  course: Course; secret: string; onClose: () => void; onDeleted: () => void
}) {
  const [codeInput, setCodeInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const confirmed = codeInput.trim().toUpperCase() === course.code.toUpperCase()

  async function handleDelete() {
    if (!confirmed) return
    setDeleting(true); setError('')
    try {
      await adminReq(secret, `/admin/courses/${course.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (e: unknown) { setError(String(e)) }
    finally { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)' }}
      onClick={() => !deleting && onClose()}>
      <div className="w-full max-w-md mx-4 rounded-2xl p-6"
        onClick={e => e.stopPropagation()}
        style={{ background: '#100a0a', border: '1px solid rgba(239,68,68,0.4)', boxShadow: '0 24px 80px rgba(200,0,0,0.25)' }}>

        {/* 警告图标 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)' }}>
            <AlertTriangle size={20} style={{ color: '#EF4444' }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: '#EF4444' }}>此操作不可逆转！</h3>
            <p className="text-xs" style={{ color: '#774444' }}>无法撤销，请仔细阅读以下警告</p>
          </div>
        </div>

        {/* 警告文案 */}
        <div className="rounded-xl p-3 mb-5 text-xs leading-relaxed"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', color: '#aa5555' }}>
          删除课程 <span style={{ color: '#FFD700', fontWeight: 600 }}>「{course.code} · {course.name}」</span> 将同时清空其下所有的：
          <ul className="mt-1.5 ml-3 space-y-0.5 list-disc" style={{ color: '#884444' }}>
            <li>全部课件文件（Supabase Storage + 数据库记录）</li>
            <li>AI 生成的闪卡与模拟题</li>
            <li>所有用户的错题记录</li>
            <li>RAG 向量索引（ChromaDB chunks）</li>
          </ul>
        </div>

        {/* 输入校验 */}
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#aa5555' }}>
            请输入课程代码 <span style={{ color: '#EF4444', fontWeight: 700 }}>「{course.code}」</span> 以确认删除：
          </label>
          <input
            autoFocus
            value={codeInput}
            onChange={e => setCodeInput(e.target.value)}
            placeholder={course.code}
            className="w-full px-3 py-2 rounded-xl text-sm font-mono outline-none transition-all"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: `1px solid ${confirmed ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.2)'}`,
              color: confirmed ? '#EF4444' : '#cc6666',
            }}
            onKeyDown={e => { if (e.key === 'Enter' && confirmed) handleDelete() }}
          />
        </div>

        {error && (
          <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: '#ff8080', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }}>
            {error}
          </p>
        )}

        {/* 按钮组 */}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
            style={{
              background: confirmed ? 'rgba(239,68,68,0.22)' : 'rgba(239,68,68,0.06)',
              color: confirmed ? '#EF4444' : '#5a3333',
              border: `1px solid ${confirmed ? 'rgba(239,68,68,0.45)' : 'rgba(239,68,68,0.15)'}`,
              cursor: confirmed ? 'pointer' : 'not-allowed',
            }}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 课程管理 Tab ────────────────────────────────────────────────────────────────

function CoursesTab({ secret }: { secret: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setCourses(await adminReq<Course[]>(secret, '/admin/courses')) }
    catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [secret])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!code.trim() || !name.trim()) return
    setCreating(true)
    try {
      await adminReq(secret, '/admin/courses', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim(), name: name.trim() }),
      })
      setCode(''); setName('')
      await load()
    } catch (e: unknown) { setError(String(e)) }
    finally { setCreating(false) }
  }

  return (
    <div className="space-y-6 fade-in-up">
      {selectedCourse && (
        <CourseDetailModal
          course={selectedCourse}
          secret={secret}
          onClose={() => setSelectedCourse(null)}
          onDeleted={() => { setSelectedCourse(null); load() }}
        />
      )}
      {error && <ErrorBox msg={error} />}
      <div className="card-gold p-5 rounded-2xl">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#FFD700' }}>
          <Plus size={14} /> 新建课程
        </h3>
        <div className="flex gap-3 flex-wrap">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="课程代码 (如 COMP9517)"
            className="input-glass px-3 py-2 rounded-lg text-sm outline-none flex-1 min-w-32" />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="课程名称"
            className="input-glass px-3 py-2 rounded-lg text-sm outline-none flex-1 min-w-40" />
          <ActionBtn onClick={create} loading={creating} disabled={!code.trim() || !name.trim()} icon={<Plus size={14} />}>
            创建
          </ActionBtn>
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {courses.map(c => (
            <button
              key={c.id}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200 text-left"
              style={rowStyle}
              onClick={() => setSelectedCourse(c)}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,215,0,0.05)'
                e.currentTarget.style.borderColor = 'rgba(255,215,0,0.25)'
                e.currentTarget.style.transform = 'translateX(2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.025)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.transform = 'none'
              }}>
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0"
                style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
                {c.code}
              </span>
              <span className="text-sm text-white flex-1">{c.name}</span>
              <span className="text-xs flex-shrink-0" style={{ color: '#555' }}>
                {new Date(c.created_at).toLocaleDateString('zh-CN')}
              </span>
              <ChevronRight size={14} style={{ color: '#444', flexShrink: 0 }} />
            </button>
          ))}
          {courses.length === 0 && <Empty text="暂无课程" />}
        </div>
      )}
    </div>
  )
}

// ── Artifacts tab (按课程隔离) ─────────────────────────────────────────────────

function ArtifactsTab({ secret }: { secret: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [reindexResult, setReindexResult] = useState<string>('')
  const [uploadDocType, setUploadDocType] = useState<DocType>('lecture')
  const [uploadQueue, setUploadQueue] = useState<AdminUploadItem[]>([])
  const uploadIdRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isUploading = uploadQueue.some(q => q.status === 'uploading')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [updatingDocType, setUpdatingDocType] = useState<number | null>(null)
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | 'all'>('all')

  // 切换 status 时重置分类子过滤
  useEffect(() => { setDocTypeFilter('all') }, [statusFilter])

  // 加载课程列表
  useEffect(() => {
    adminReq<Course[]>(secret, '/admin/courses')
      .then(setCourses)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoadingCourses(false))
  }, [secret])

  // 加载选定课程的文件
  const loadFiles = useCallback(async (courseId: string, status: string) => {
    setLoadingFiles(true); setError('')
    try {
      setArtifacts(await adminReq<Artifact[]>(secret, `/admin/artifacts?status=${status}&course_id=${courseId}`))
    } catch (e: unknown) { setError(String(e)) }
    finally { setLoadingFiles(false) }
  }, [secret])

  useEffect(() => {
    if (selectedCourse) loadFiles(selectedCourse.id, statusFilter)
  }, [selectedCourse, statusFilter, loadFiles])

  async function approve(id: number) {
    try {
      await adminReq(secret, `/admin/artifacts/${id}/approve`, { method: 'PATCH' })
      if (selectedCourse) await loadFiles(selectedCourse.id, statusFilter)
    } catch (e: unknown) { setError(String(e)) }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function updateDocType(artifactId: number, newDocType: DocType) {
    setUpdatingDocType(artifactId)
    try {
      await adminReq(secret, `/admin/artifacts/${artifactId}/doc-type`, {
        method: 'PATCH',
        body: JSON.stringify({ doc_type: newDocType }),
      })
      setArtifacts(prev => prev.map(a => a.id === artifactId ? { ...a, doc_type: newDocType } : a))
      showToast('✅ 标签已更新')
    } catch (e: unknown) {
      // 区分网络错误和服务端错误，给出友好提示
      const msg = String(e)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        showToast('⚠️ 分类更新失败，请检查网络或服务端状态')
      } else {
        showToast(`⚠️ 分类更新失败：${msg.replace(/^Error:\s*/, '').slice(0, 60)}`)
      }
    } finally {
      setUpdatingDocType(null)
    }
  }

  async function startUpload(files: File[]) {
    if (!selectedCourse || files.length === 0) return
    const newItems: AdminUploadItem[] = files.map(f => ({
      id: ++uploadIdRef.current, file: f, status: 'pending' as const,
    }))
    setUploadQueue(prev => [...prev, ...newItems])
    setError('')
    for (const item of newItems) {
      setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading' as const } : q))
      try {
        const fd = new FormData()
        fd.append('file', item.file)
        fd.append('doc_type', uploadDocType)
        // Use fetch directly — adminReq forces Content-Type: application/json which breaks FormData
        const res = await fetch(`${API}/admin/courses/${selectedCourse.id}/artifacts`, {
          method: 'POST',
          headers: { 'X-Admin-Secret': secret },
          body: fd,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(err.detail || `HTTP ${res.status}`)
        }
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done' as const } : q))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error' as const, error: msg } : q))
      }
    }
    await loadFiles(selectedCourse.id, statusFilter)
  }

  async function reindex() {
    if (!selectedCourse) return
    if (!confirm(`重新索引「${selectedCourse.code}」的所有已批准文件？\n\n这将重新清洗、分块、向量化所有文件，可能需要数分钟。`)) return
    setReindexing(true); setReindexResult(''); setError('')
    try {
      const res = await adminReq<{ ok: boolean; processed: number; chunks: number; errors: number }>(
        secret, `/admin/courses/${selectedCourse.id}/reindex`, { method: 'POST' }
      )
      setReindexResult(`完成：处理 ${res.processed} 个文件，生成 ${res.chunks} 个 chunk，失败 ${res.errors} 个`)
    } catch (e: unknown) { setError(String(e)) }
    finally { setReindexing(false) }
  }

  async function reject(id: number) {
    const reason = prompt('拒绝原因（可留空）') ?? ''
    try {
      await adminReq(secret, `/admin/artifacts/${id}/reject`, {
        method: 'PATCH', body: JSON.stringify({ reason }),
      })
      if (selectedCourse) await loadFiles(selectedCourse.id, statusFilter)
    } catch (e: unknown) { setError(String(e)) }
  }

  async function deleteArtifact(id: number, fileName: string) {
    if (!selectedCourse) return
    if (!confirm(`确认删除「${fileName}」？\n此操作不可恢复，相关向量索引也将一并清除。`)) return
    try {
      await adminReq(secret, `/admin/artifacts/${id}?course_id=${selectedCourse.id}`, { method: 'DELETE' })
      setArtifacts(prev => prev.filter(a => a.id !== id))
      showToast('🗑️ 文件已删除')
    } catch (e: unknown) { setError(String(e)) }
  }

  const statusColors: Record<string, string> = {
    pending: '#f97316', approved: '#4ade80', rejected: '#ff7070',
  }

  if (loadingCourses) return <Spinner />

  // 课程选择视图
  if (!selectedCourse) {
    return (
      <div className="space-y-4 fade-in-up">
        {error && <ErrorBox msg={error} />}
        <p className="text-sm" style={{ color: '#666' }}>选择课程后查看该课程的待审文件</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {courses.map(c => (
            <button key={c.id} onClick={() => setSelectedCourse(c)}
              className="flex items-center gap-3 px-4 py-4 rounded-2xl text-left transition-all duration-200"
              style={{ ...rowStyle, cursor: 'pointer' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.25)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
              }}>
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0"
                style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>{c.code}</span>
              <span className="text-sm text-white">{c.name}</span>
            </button>
          ))}
          {courses.length === 0 && <Empty text="暂无课程" />}
        </div>
      </div>
    )
  }

  // 文件审核视图
  return (
    <div className="space-y-4 fade-in-up">
      {/* Toast 轻提示 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-lg"
          style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', backdropFilter: 'blur(8px)' }}>
          {toast}
        </div>
      )}

      {error && <ErrorBox msg={error} />}
      {reindexResult && (
        <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
          <CheckCircle size={14} /> {reindexResult}
        </div>
      )}

      {/* 面包屑 + 筛选 */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => { setSelectedCourse(null); setArtifacts([]) }}
          className="flex items-center gap-1.5 text-sm transition-colors duration-150"
          style={{ color: '#555' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
          <ChevronLeft size={14} /> 所有课程
        </button>
        <span style={{ color: '#333' }}>/</span>
        <span className="text-sm font-semibold" style={{ color: '#FFD700' }}>
          {selectedCourse.code} · {selectedCourse.name}
        </span>
        <div className="ml-auto flex gap-2 items-center">
          {(['pending', 'approved', 'rejected'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150"
              style={{
                background: statusFilter === s ? `${statusColors[s]}20` : 'rgba(255,255,255,0.04)',
                color: statusFilter === s ? statusColors[s] : '#555',
                border: `1px solid ${statusFilter === s ? `${statusColors[s]}50` : 'rgba(255,255,255,0.07)'}`,
              }}>
              {s === 'pending' ? '待审核' : s === 'approved' ? '已批准' : '已拒绝'}
            </button>
          ))}
          <button onClick={() => loadFiles(selectedCourse.id, statusFilter)}
            className="p-1.5 rounded-lg transition-colors duration-150"
            style={{ color: '#555' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
            onMouseLeave={e => (e.currentTarget.style.color = '#555')}
            title="刷新列表">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={reindex}
            disabled={reindexing}
            title="重新索引该课程（清洗+分块+向量化所有已批准文件）"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
            style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}
            onMouseEnter={e => { if (!reindexing) (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.18)' }}
            onMouseLeave={e => { if (!reindexing) (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.1)' }}>
            {reindexing ? <Loader2 size={12} className="animate-spin" /> : <DatabaseZap size={12} />}
            {reindexing ? '索引中…' : '重新索引'}
          </button>
        </div>
      </div>

      {/* 管理员直接上传区（免审核，立即 approved） */}
      <div className="p-4 rounded-2xl space-y-3" style={cardStyle}>
        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#FFD700' }}>
          <Upload size={12} /> 管理员直传（跳过审核，立即索引）
        </p>
        <div className="flex gap-3 items-center flex-wrap">
          <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value as DocType)}
            className="text-sm rounded-lg px-3 py-1.5 outline-none flex-1 min-w-40 transition-all duration-150"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,215,0,0.2)', color: DOC_TYPE_COLORS[uploadDocType] }}>
            {DOC_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value} style={{ background: '#0d0d1a', color: '#fff' }}>{o.label}</option>
            ))}
          </select>
          <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.08))', color: '#FFD700', border: '1px solid rgba(255,215,0,0.35)' }}
            onMouseEnter={e => { if (!isUploading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.22), rgba(255,215,0,0.12))' }}
            onMouseLeave={e => { if (!isUploading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.08))' }}>
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {isUploading ? '上传中…' : '选择文件上传（可多选）'}
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.py,.txt,.ipynb" multiple className="hidden"
            onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length > 0) startUpload(files); e.target.value = '' }} />
        </div>
        {/* 上传队列进度 */}
        {uploadQueue.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#666' }}>
                上传进度：{uploadQueue.filter(q => q.status === 'done').length}/{uploadQueue.length} 完成
              </span>
              {uploadQueue.every(q => q.status === 'done' || q.status === 'error') && (
                <button onClick={() => setUploadQueue([])} className="text-xs px-2 py-0.5 rounded"
                  style={{ color: '#555' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
                  清除记录
                </button>
              )}
            </div>
            {uploadQueue.map(item => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {item.status === 'pending'   && <div className="w-3 h-3 rounded-full border border-dashed flex-shrink-0" style={{ borderColor: '#444' }} />}
                {item.status === 'uploading' && <Loader2 size={12} className="animate-spin flex-shrink-0" style={{ color: '#FFD700' }} />}
                {item.status === 'done'      && <CheckCircle size={12} className="flex-shrink-0" style={{ color: '#4ade80' }} />}
                {item.status === 'error'     && <XCircle size={12} className="flex-shrink-0" style={{ color: '#EF4444' }} />}
                <span className="flex-1 truncate"
                  style={{ color: item.status === 'error' ? '#EF4444' : item.status === 'done' ? '#555' : '#aaa' }}>
                  {item.file.name}
                </span>
                {item.status === 'error' && item.error && (
                  <span className="flex-shrink-0 ml-2 max-w-[150px] truncate" style={{ color: '#ef9999' }} title={item.error}>
                    {item.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 已批准时显示 doc_type 横向子过滤 */}
      {statusFilter === 'approved' && (
        <div className="flex gap-2 flex-wrap">
          {([{ value: 'all', label: '全部' }, ...DOC_TYPE_OPTIONS] as { value: DocType | 'all'; label: string }[]).map(o => {
            const isActive = docTypeFilter === o.value
            const color = o.value === 'all' ? '#FFD700' : DOC_TYPE_COLORS[o.value as DocType]
            return (
              <button key={o.value} onClick={() => setDocTypeFilter(o.value)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150"
                style={{
                  background: isActive ? `${color}20` : 'rgba(255,255,255,0.04)',
                  color: isActive ? color : '#555',
                  border: `1px solid ${isActive ? `${color}50` : 'rgba(255,255,255,0.08)'}`,
                }}>
                {o.label}
              </button>
            )
          })}
        </div>
      )}

      {loadingFiles ? <Spinner /> : (() => {
        const displayedArtifacts = statusFilter === 'approved' && docTypeFilter !== 'all'
          ? artifacts.filter(a => a.doc_type === docTypeFilter)
          : artifacts
        return (
        <div className="space-y-2">
          {displayedArtifacts.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200"
              style={rowStyle}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.18)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
              }}>
              <span className="text-lg">{a.file_type === 'pdf' ? '📄' : '🔗'}</span>
              <div className="flex-1 min-w-0">
                {/* 文件名：有 storage_url 时变为可点击预览链接 */}
                {a.storage_url ? (
                  <a
                    href={a.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm truncate block transition-opacity hover:opacity-100"
                    style={{ color: '#60a5fa', opacity: 0.9, textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    title="在新标签页预览文件">
                    {a.file_name}
                  </a>
                ) : (
                  <p className="text-sm text-white truncate">{a.file_name}</p>
                )}
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                  {new Date(a.created_at).toLocaleString('zh-CN')}
                  {a.reject_reason && <span style={{ color: '#ff8080' }}> · {a.reject_reason}</span>}
                </p>
              </div>
              {/* doc_type 内联下拉（已批准时可修改；其他状态仅显示） */}
              {a.status === 'rejected' ? (
                <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                  <span className="badge-danger">已失效</span>
                  {a.reject_reason && (
                    <span className="text-xs max-w-32 truncate" style={{ color: '#ff8080' }}
                      title={a.reject_reason}>
                      {a.reject_reason}
                    </span>
                  )}
                </div>
              ) : a.status === 'approved' ? (
                <div className="relative flex-shrink-0">
                  {updatingDocType === a.id && (
                    <Loader2 size={10} className="animate-spin absolute -top-1 -right-1 z-10" style={{ color: '#FFD700' }} />
                  )}
                  <select
                    disabled={updatingDocType === a.id}
                    value={a.doc_type ?? 'lecture'}
                    onChange={e => updateDocType(a.id, e.target.value as DocType)}
                    className="text-xs rounded-lg px-2 py-0.5 border outline-none cursor-pointer transition-opacity"
                    style={{
                      background: `${DOC_TYPE_COLORS[a.doc_type ?? 'lecture']}18`,
                      color: DOC_TYPE_COLORS[a.doc_type ?? 'lecture'],
                      border: `1px solid ${DOC_TYPE_COLORS[a.doc_type ?? 'lecture']}40`,
                      opacity: updatingDocType === a.id ? 0.5 : 1,
                    }}>
                    {DOC_TYPE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}
                        style={{ background: '#1a1a1a', color: '#ccc' }}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : a.doc_type ? (
                <span className="text-xs px-2 py-0.5 rounded-lg flex-shrink-0" style={{
                  background: `${DOC_TYPE_COLORS[a.doc_type]}18`,
                  color: DOC_TYPE_COLORS[a.doc_type],
                  border: `1px solid ${DOC_TYPE_COLORS[a.doc_type]}40`,
                }}>
                  {DOC_TYPE_LABELS[a.doc_type]}
                </span>
              ) : null}
              {/* 状态 badge — pill 样式 */}
              <span className="text-xs px-2.5 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{
                  background: `${statusColors[a.status]}18`,
                  color: statusColors[a.status],
                  border: `1px solid ${statusColors[a.status]}40`,
                }}>
                {a.status === 'pending' ? '待审' : a.status === 'approved' ? '已批准' : '已拒绝'}
              </span>
              {statusFilter === 'pending' && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => approve(a.id)}
                    className="p-1.5 rounded-lg transition-colors duration-150"
                    title="批准"
                    style={{ color: '#4ade80' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(74,222,128,0.12)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <CheckCircle size={16} />
                  </button>
                  <button onClick={() => reject(a.id)}
                    className="p-1.5 rounded-lg transition-colors duration-150"
                    title="拒绝"
                    style={{ color: '#ff7070' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,112,112,0.12)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <XCircle size={16} />
                  </button>
                </div>
              )}
              <DeleteBtn onClick={() => deleteArtifact(a.id, a.file_name)} />
            </div>
          ))}
          {displayedArtifacts.length === 0 && (
            <Empty text={
              statusFilter === 'approved' && docTypeFilter !== 'all'
                ? `${selectedCourse.code} 暂无「${DOC_TYPE_LABELS[docTypeFilter as DocType]}」类文件`
                : `${selectedCourse.code} 暂无${statusFilter === 'pending' ? '待审核' : statusFilter === 'approved' ? '已批准' : '已拒绝'}文件`
            } />
          )}
        </div>
        )
      })()}
    </div>
  )
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ secret }: { secret: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminReq<User[]>(secret, '/admin/users')
      .then(setUsers)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [secret])

  return (
    <div className="space-y-4 fade-in-up">
      {error && <ErrorBox msg={error} />}
      {loading ? <Spinner /> : (
        <>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200"
                style={rowStyle}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.18)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
                }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,215,0,0.2)' }}>
                  {u.email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{u.email}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                    注册 {new Date(u.created_at).toLocaleDateString('zh-CN')}
                    {u.last_sign_in_at && ` · 最近登录 ${new Date(u.last_sign_in_at).toLocaleDateString('zh-CN')}`}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex-shrink-0 ${u.email_confirmed ? 'badge-success' : 'badge-warning'}`}>
                  {u.email_confirmed ? '已验证' : '未验证'}
                </span>
              </div>
            ))}
            {users.length === 0 && <Empty text="暂无用户" />}
          </div>
          <p className="text-xs" style={{ color: '#444' }}>共 {users.length} 个用户</p>
        </>
      )}
    </div>
  )
}

// ── Invites tab ───────────────────────────────────────────────────────────────

function InvitesTab({ secret }: { secret: string }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState('')
  const [maxUses, setMaxUses] = useState('1')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError('')
    try { setInvites(await adminReq<Invite[]>(secret, '/admin/invites')) }
    catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [secret])

  useEffect(() => { load() }, [load])

  async function create() {
    setCreating(true)
    try {
      await adminReq(secret, '/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ note: note.trim() || undefined, max_uses: Number(maxUses) || 1 }),
      })
      setNote(''); setMaxUses('1'); await load()
    } catch (e: unknown) { setError(String(e)) }
    finally { setCreating(false) }
  }

  async function del(id: string) {
    if (!confirm('确认删除该邀请码？')) return
    try { await adminReq(secret, `/admin/invites/${id}`, { method: 'DELETE' }); await load() }
    catch (e: unknown) { setError(String(e)) }
  }

  function copy(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code); setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6 fade-in-up">
      {error && <ErrorBox msg={error} />}
      <div className="card-gold p-5 rounded-2xl">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#FFD700' }}>
          <Ticket size={14} /> 生成邀请码
        </h3>
        <div className="flex gap-3 flex-wrap items-center">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="备注（如：学生姓名）"
            className="input-glass px-3 py-2 rounded-lg text-sm outline-none flex-1 min-w-40" />
          <div className="flex items-center gap-2">
            <span className="text-xs whitespace-nowrap" style={{ color: '#666' }}>最多使用次数</span>
            <input value={maxUses} onChange={e => setMaxUses(e.target.value)} type="number" min={1} max={100}
              className="input-glass px-3 py-2 rounded-lg text-sm outline-none w-16 text-center" />
          </div>
          <ActionBtn onClick={create} loading={creating} icon={<Plus size={14} />}>生成</ActionBtn>
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {invites.map(inv => (
            <div key={inv.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200"
              style={rowStyle}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.18)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
              }}>
              <button onClick={() => copy(inv.code)}
                className="text-sm font-mono font-bold px-3 py-1 rounded-lg transition-all duration-150 flex-shrink-0"
                style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)', minWidth: 90 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,215,0,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,215,0,0.12)')}
                title="点击复制">
                {copied === inv.code ? '✓ 已复制' : inv.code}
              </button>
              <span className="text-sm flex-1 truncate" style={{ color: '#888' }}>{inv.note || '—'}</span>
              <span className={`text-xs flex-shrink-0 px-2.5 py-0.5 rounded-full font-medium ${inv.used_count >= inv.max_uses ? 'badge-danger' : 'badge-success'}`}>
                {inv.used_count}/{inv.max_uses} 次
              </span>
              <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>
                {new Date(inv.created_at).toLocaleDateString('zh-CN')}
              </span>
              <DeleteBtn onClick={() => del(inv.id)} />
            </div>
          ))}
          {invites.length === 0 && <Empty text="暂无邀请码" />}
        </div>
      )}
    </div>
  )
}

// ── API Keys tab ──────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, { name: string; color: string; hint: string }> = {
  openai:   { name: 'OpenAI (GPT)',  color: '#10b981', hint: 'sk-proj-...' },
  gemini:   { name: 'Google Gemini', color: '#4285F4', hint: 'AIza...' },
  deepseek: { name: 'DeepSeek',      color: '#a78bfa', hint: 'sk-...' },
}

function ApiKeysTab({ secret }: { secret: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [provider, setProvider] = useState<'openai' | 'gemini' | 'deepseek'>('openai')
  const [apiKey, setApiKey] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setKeys(await adminReq<ApiKey[]>(secret, '/admin/api-keys')) }
    catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [secret])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!apiKey.trim()) return
    setAdding(true)
    try {
      await adminReq(secret, '/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ provider, api_key: apiKey.trim(), label: label.trim() || undefined }),
      })
      setApiKey(''); setLabel(''); await load()
    } catch (e: unknown) { setError(String(e)) }
    finally { setAdding(false) }
  }

  async function activate(id: number) {
    try {
      await adminReq(secret, `/admin/api-keys/${id}/activate`, { method: 'PATCH' })
      await load()
    } catch (e: unknown) { setError(String(e)) }
  }

  async function del(id: number) {
    if (!confirm('确认删除该 API 密钥？')) return
    try {
      await adminReq(secret, `/admin/api-keys/${id}`, { method: 'DELETE' })
      await load()
    } catch (e: unknown) { setError(String(e)) }
  }

  // Group keys by provider
  const grouped = (['openai', 'gemini', 'deepseek'] as const).map(p => ({
    provider: p,
    info: PROVIDER_LABELS[p],
    keys: keys.filter(k => k.provider === p),
  }))

  return (
    <div className="space-y-6 fade-in-up">
      {error && <ErrorBox msg={error} />}

      {/* 添加新密钥 */}
      <div className="card-gold p-5 rounded-2xl space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#FFD700' }}>
          <Key size={14} /> 添加 / 更换 API 密钥
        </h3>
        <div className="flex gap-2 flex-wrap">
          {(['openai', 'gemini', 'deepseek'] as const).map(p => (
            <button key={p} onClick={() => setProvider(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={{
                background: provider === p ? `${PROVIDER_LABELS[p].color}20` : 'rgba(255,255,255,0.04)',
                color: provider === p ? PROVIDER_LABELS[p].color : '#666',
                border: `1px solid ${provider === p ? `${PROVIDER_LABELS[p].color}50` : 'rgba(255,255,255,0.07)'}`,
              }}>
              {PROVIDER_LABELS[p].name}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <input
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            type="password"
            placeholder={`API Key（${PROVIDER_LABELS[provider].hint}）`}
            className="input-glass px-3 py-2 rounded-lg text-sm font-mono outline-none"
          />
          <div className="flex gap-3">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="备注标签（可选，如：Production Key）"
              className="input-glass px-3 py-2 rounded-lg text-sm outline-none flex-1"
            />
            <ActionBtn onClick={add} loading={adding} disabled={!apiKey.trim()} icon={<Plus size={14} />}>
              添加并激活
            </ActionBtn>
          </div>
        </div>
        <p className="text-xs" style={{ color: '#555' }}>
          添加后会自动设为该服务商的当前激活密钥，旧密钥保留（可手动切换）。密钥在界面中仅显示脱敏信息。
        </p>
      </div>

      {/* 已存储密钥列表（按服务商分组） */}
      {loading ? <Spinner /> : (
        <div className="space-y-5">
          {grouped.map(({ provider: p, info, keys: pKeys }) => (
            <div key={p}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={{ background: `${info.color}20`, color: info.color, border: `1px solid ${info.color}40` }}>
                  {info.name}
                </span>
                <span className="text-xs" style={{ color: '#444' }}>{pKeys.length} 个密钥</span>
              </div>
              {pKeys.length === 0 ? (
                <div className="px-4 py-3 rounded-xl text-xs" style={{ ...rowStyle, color: '#555' }}>
                  未配置 · 将从环境变量读取
                </div>
              ) : (
                <div className="space-y-2">
                  {pKeys.map(k => (
                    <div key={k.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200"
                      style={rowStyle}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.18)'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
                      }}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: k.is_active ? '#4ade80' : '#333', boxShadow: k.is_active ? '0 0 6px rgba(74,222,128,0.5)' : 'none' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{k.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                          {k.is_active ? '✓ 当前激活' : '未激活'} · 更新 {new Date(k.updated_at).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                      {!k.is_active && (
                        <button onClick={() => activate(k.id)}
                          className="text-xs px-3 py-1 rounded-lg flex-shrink-0 transition-all duration-150"
                          style={{ background: `${info.color}18`, color: info.color, border: `1px solid ${info.color}40` }}
                          onMouseEnter={e => (e.currentTarget.style.background = `${info.color}30`)}
                          onMouseLeave={e => (e.currentTarget.style.background = `${info.color}18`)}>
                          激活
                        </button>
                      )}
                      {k.is_active && (
                        <span className="badge-success text-xs px-2.5 py-0.5 rounded-full flex-shrink-0">
                          激活中
                        </span>
                      )}
                      <DeleteBtn onClick={() => del(k.id)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Feedback Tab ──────────────────────────────────────────────────────────────

type FeedbackStatus = 'pending' | 'in_progress' | 'resolved' | 'adopted'
interface FeedbackItem { id: string; user_id: string | null; content: string; page_url: string; status: FeedbackStatus; created_at: string }

const STATUS_LABEL: Record<FeedbackStatus, string> = { pending: '待处理', in_progress: '处理中', resolved: '已解决', adopted: '已采纳' }
const STATUS_COLOR: Record<FeedbackStatus, string> = { pending: '#f97316', in_progress: '#60a5fa', resolved: '#4ade80', adopted: '#FFD700' }
const STATUS_NEXT:  Record<FeedbackStatus, FeedbackStatus | null> = { pending: 'in_progress', in_progress: 'resolved', resolved: null, adopted: null }

interface AiSummaryResult { summary: string; feedback_count: number; analyzed_at: string }

function FeedbackTab({ secret }: { secret: string }) {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [filter, setFilter] = useState<FeedbackStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiSummaryResult | null>(null)
  const [aiError, setAiError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const qs = filter !== 'all' ? `?status=${filter}` : ''
      setItems(await adminReq<FeedbackItem[]>(secret, `/admin/feedback${qs}`))
    } catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [secret, filter])

  useEffect(() => { load() }, [load])

  async function runAiSummary() {
    setAiLoading(true); setAiError(''); setAiResult(null)
    try {
      const res = await adminReq<AiSummaryResult>(secret, '/admin/feedback/ai-summary')
      setAiResult(res)
    } catch (e: unknown) {
      setAiError(String(e))
    } finally {
      setAiLoading(false)
    }
  }

  async function advance(item: FeedbackItem) {
    const next = STATUS_NEXT[item.status]
    if (!next) return
    try {
      await adminReq(secret, `/admin/feedback/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: next }),
      })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i))
    } catch (e: unknown) { setError(String(e)) }
  }

  async function adopt(item: FeedbackItem) {
    try {
      await adminReq(secret, `/admin/feedback/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'adopted' }),
      })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'adopted' } : i))
    } catch (e: unknown) { setError(String(e)) }
  }

  const displayed = filter === 'all' ? items : items.filter(i => i.status === filter)

  return (
    <div className="space-y-4 fade-in-up">
      {error && <ErrorBox msg={error} />}

      {/* AI 洞察按钮 */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={runAiSummary}
          disabled={aiLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.18))',
            border: '1px solid rgba(139,92,246,0.4)',
            color: '#c4b5fd',
          }}
          onMouseEnter={e => { if (!aiLoading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(139,92,246,0.28), rgba(59,130,246,0.28))' }}
          onMouseLeave={e => { if (!aiLoading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.18))' }}
        >
          {aiLoading
            ? <><Loader2 size={14} className="animate-spin" />正在分析…</>
            : <><Sparkles size={14} />✨ AI 生成今日洞察 (DeepSeek 分析)</>
          }
        </button>
        {aiResult && (
          <span className="text-xs" style={{ color: '#555' }}>
            分析了 {aiResult.feedback_count} 条反馈 · {new Date(aiResult.analyzed_at).toLocaleString('zh-CN')}
          </span>
        )}
      </div>

      {/* AI 错误提示 */}
      {aiError && <ErrorBox msg={`AI 分析失败：${aiError}`} />}

      {/* AI 结果卡片 */}
      {aiResult && (
        <div className="p-5 rounded-2xl space-y-1" style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.08))',
          border: '1px solid rgba(139,92,246,0.25)',
        }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#c4b5fd' }}>
              <Sparkles size={14} /> DeepSeek 今日分析报告
            </h3>
            <button onClick={() => setAiResult(null)}
              className="text-xs px-2 py-0.5 rounded-lg transition-colors duration-150"
              style={{ color: '#555', background: 'rgba(255,255,255,0.05)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
              收起
            </button>
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed"
            style={{ color: '#ccc' }}>
            <ReactMarkdown>{aiResult.summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 筛选 + 刷新 */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'pending', 'in_progress', 'resolved', 'adopted'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150"
            style={{
              background: filter === s
                ? s === 'all' ? 'rgba(255,215,0,0.15)' : `${STATUS_COLOR[s as FeedbackStatus]}20`
                : 'rgba(255,255,255,0.04)',
              color: filter === s
                ? s === 'all' ? '#FFD700' : STATUS_COLOR[s as FeedbackStatus]
                : '#555',
              border: `1px solid ${filter === s
                ? s === 'all' ? 'rgba(255,215,0,0.3)' : `${STATUS_COLOR[s as FeedbackStatus]}50`
                : 'rgba(255,255,255,0.07)'}`,
            }}>
            {s === 'all' ? `全部 (${items.length})` : `${STATUS_LABEL[s as FeedbackStatus]} (${items.filter(i => i.status === s).length})`}
          </button>
        ))}
        <button onClick={load}
          className="ml-auto p-1.5 rounded-lg transition-colors duration-150"
          style={{ color: '#555' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555')}
          title="刷新">
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="space-y-3">
          {displayed.map(item => (
            <div key={item.id} className="p-4 rounded-2xl space-y-2 transition-all duration-200" style={cardStyle}>
              {/* Meta row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{
                  background: `${STATUS_COLOR[item.status]}18`,
                  color: STATUS_COLOR[item.status],
                  border: `1px solid ${STATUS_COLOR[item.status]}40`,
                }}>
                  {STATUS_LABEL[item.status]}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-lg truncate max-w-xs"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#666', border: '1px solid rgba(255,255,255,0.06)' }}>
                  📍 {item.page_url}
                </span>
                <span className="text-xs ml-auto" style={{ color: '#444' }}>
                  {new Date(item.created_at).toLocaleString('zh-CN')}
                </span>
              </div>

              {/* Content */}
              <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{item.content}</p>

              {/* Action */}
              {(STATUS_NEXT[item.status] || item.status === 'in_progress') && (
                <div className="flex justify-end gap-2">
                  {STATUS_NEXT[item.status] && (
                    <button onClick={() => advance(item)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = '#aaa' }}>
                      <CheckCircle size={12} />
                      标记为「{STATUS_LABEL[STATUS_NEXT[item.status]!]}」
                    </button>
                  )}
                  {item.status === 'in_progress' && (
                    <button onClick={() => adopt(item)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150"
                      style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.18)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.1)' }}>
                      ✦ 采纳反馈 (+1 积分)
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {displayed.length === 0 && <Empty text={`暂无${filter === 'all' ? '' : STATUS_LABEL[filter as FeedbackStatus] + '的'}反馈`} />}
        </div>
      )}
    </div>
  )
}

// ── Shared styles & micro-components ─────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e0e0e0',
}

const rowStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.07)',
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
}

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-center py-8 text-sm" style={{ color: '#444' }}>{text}</p>
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="p-3 rounded-xl text-sm flex items-center gap-2" style={{ background: 'rgba(255,80,80,0.08)', color: '#ff8080', border: '1px solid rgba(255,80,80,0.2)' }}>
      <XCircle size={14} /> {msg}
    </div>
  )
}

function ActionBtn({ onClick, loading = false, disabled = false, icon, children }: {
  onClick: () => void; loading?: boolean; disabled?: boolean; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
      style={{
        background: loading || disabled ? 'rgba(255,215,0,0.08)' : 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.1))',
        color: '#FFD700',
        border: '1px solid rgba(255,215,0,0.35)',
        opacity: loading || disabled ? 0.5 : 1,
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => { if (!loading && !disabled) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.28), rgba(255,215,0,0.16))' }}
      onMouseLeave={e => { if (!loading && !disabled) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.1))' }}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      className="p-1.5 rounded-lg flex-shrink-0 transition-all duration-150"
      style={{
        color: hov ? '#ff6b6b' : '#444',
        background: hov ? 'rgba(255,107,107,0.1)' : 'transparent',
      }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <Trash2 size={14} />
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('courses')
  const [secretInput, setSecretInput] = useState('')
  const [secret, setSecret] = useState('')

  if (!secret) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8"
        style={{ background: '#08080f' }}>
        <div className="w-full max-w-sm p-8 rounded-2xl space-y-6 fade-in-up"
          style={{
            background: 'rgba(255,215,0,0.05)',
            border: '1px solid rgba(255,215,0,0.18)',
            boxShadow: '0 0 40px rgba(255,215,0,0.06)',
          }}>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.25)' }}>
                <Shield size={20} style={{ color: '#FFD700' }} />
              </div>
              <div className="text-xl font-bold" style={{ color: '#FFD700' }}>管理后台</div>
            </div>
            <p className="text-sm" style={{ color: '#555' }}>请输入管理员密钥进入</p>
            <p className="text-xs mt-1 font-mono" style={{ color: '#333' }}>API: {API}</p>
          </div>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#555' }} />
            <input
              type="password"
              value={secretInput}
              onChange={e => setSecretInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setSecret(secretInput.trim())}
              placeholder="Admin Secret"
              className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none transition-all duration-150"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e0e0e0',
              }}
              onFocus={e => {
                e.currentTarget.style.border = '1px solid rgba(255,215,0,0.5)'
                e.currentTarget.style.boxShadow = '0 0 12px rgba(255,215,0,0.08)'
              }}
              onBlur={e => {
                e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
          <button onClick={() => setSecret(secretInput.trim())}
            className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150"
            style={{
              background: 'linear-gradient(135deg, rgba(255,215,0,0.22), rgba(255,215,0,0.12))',
              color: '#FFD700',
              border: '1px solid rgba(255,215,0,0.35)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,215,0,0.32), rgba(255,215,0,0.18))')}
            onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,215,0,0.22), rgba(255,215,0,0.12))')}>
            <Zap size={15} />
            进入管理后台
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.22)' }}>
            <Shield size={16} style={{ color: '#FFD700' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#FFD700' }}>管理后台</h1>
            <p className="text-xs mt-0.5" style={{ color: '#555' }}>课程 · 文件审核 · 用户 · 邀请码 · API密钥</p>
          </div>
        </div>
        <button onClick={() => setSecret('')}
          className="text-xs px-3 py-1.5 rounded-lg transition-all duration-150"
          style={{ color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ff7070'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,112,112,0.3)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}>
          退出
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 flex-wrap p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 relative"
            style={{
              background: tab === t.id ? 'rgba(255,215,0,0.1)' : 'transparent',
              color: tab === t.id ? '#FFD700' : '#444',
              border: tab === t.id ? '1px solid rgba(255,215,0,0.25)' : '1px solid transparent',
              textShadow: tab === t.id ? '0 0 12px rgba(255,215,0,0.4)' : 'none',
            }}
            onMouseEnter={e => { if (tab !== t.id) { (e.currentTarget as HTMLElement).style.color = '#888' } }}
            onMouseLeave={e => { if (tab !== t.id) { (e.currentTarget as HTMLElement).style.color = '#444' } }}>
            {t.icon} {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                style={{ background: '#FFD700', boxShadow: '0 0 6px rgba(255,215,0,0.6)' }} />
            )}
          </button>
        ))}
      </div>

      {tab === 'courses'   && <CoursesTab   secret={secret} />}
      {tab === 'artifacts' && <ArtifactsTab secret={secret} />}
      {tab === 'users'     && <UsersTab     secret={secret} />}
      {tab === 'invites'   && <InvitesTab   secret={secret} />}
      {tab === 'api-keys'  && <ApiKeysTab   secret={secret} />}
      {tab === 'feedback'  && <FeedbackTab  secret={secret} />}
    </div>
  )
}
