'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, Trash2, Plus, ChevronRight,
  AlertTriangle, X, Calendar, Info, CalendarDays,
} from 'lucide-react'
import { useLang } from '@/lib/i18n'
import {
  Course, tx, localeByLang, adminReq, API,
  Spinner, Empty, ErrorBox, ActionBtn, rowStyle,
} from './_shared'

// ── 课程详情 Modal ────────────────────────────────────────────────────────────

function CourseDetailModal({
  course, secret, onClose, onDeleted, onUpdated,
}: {
  course: Course; secret: string; onClose: () => void; onDeleted: () => void; onUpdated: (c: Course) => void
}) {
  const { lang } = useLang()
  const tt = (zh: string, en: string) => tx(lang, zh, en)
  const locale = localeByLang(lang)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // 考试日期编辑
  const toLocalInput = (iso?: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const [examInput, setExamInput] = useState(toLocalInput(course.exam_date))
  const [savingExam, setSavingExam] = useState(false)
  const [examError, setExamError] = useState('')

  async function saveExamDateWithFallback(payload: { exam_date: string | null }): Promise<Course> {
    const routeCandidates: Array<{ path: string; method: 'POST' | 'PATCH' }> = [
      { path: `/admin/courses/${course.id}/exam-date`, method: 'POST' },
      { path: `/admin/courses/${course.id}/exam-date`, method: 'PATCH' },
      // Compatibility fallback: some proxies only forward /admin/courses/{id}
      { path: `/admin/courses/${course.id}`, method: 'PATCH' },
    ]
    const baseCandidates = Array.from(
      new Set([API, 'http://localhost:8002', 'http://localhost:8005', 'http://localhost:8000'].filter(Boolean)),
    )

    let lastError: Error | null = null

    for (const base of baseCandidates) {
      for (const route of routeCandidates) {
        try {
          const res = await fetch(base + route.path, {
            method: route.method,
            headers: {
              'X-Admin-Secret': secret,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (res.ok) {
            return (await res.json()) as Course
          }

          // These usually indicate path/method mismatch in proxy/backend; continue trying fallbacks.
          if ([404, 405, 501].includes(res.status)) {
            continue
          }

          const err = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(err.detail || `HTTP ${res.status}`)
        } catch (e: unknown) {
          lastError = e instanceof Error ? e : new Error(String(e))
          continue
        }
      }
    }

    throw lastError ?? new Error('Exam date update failed')
  }

  async function handleSaveExamDate() {
    setSavingExam(true); setExamError('')
    try {
      const body = examInput
        ? { exam_date: new Date(examInput).toISOString() }
        : { exam_date: null }
      const updated = await saveExamDateWithFallback(body)
      onUpdated(updated)
    } catch (e: unknown) {
      const msg = String(e)
      if (msg.includes('Failed to fetch')) {
        setExamError(
          tt(
            '网络请求失败：请检查 NEXT_PUBLIC_API_URL、后端/反向代理是否放行该接口（/admin/courses/{id}/exam-date）。',
            'Network request failed: check NEXT_PUBLIC_API_URL and whether backend/proxy allows /admin/courses/{id}/exam-date.',
          ),
        )
      } else if (msg.includes('500') || msg.includes('Internal Server Error')) {
        setExamError(
          tt(
            '后端可达，但 exam-date 接口返回 500。通常是后端仍在跑旧版本，请重启或重新部署 backend。',
            'Backend is reachable, but exam-date returned 500. Usually backend is still on an old build; restart/redeploy backend.',
          ),
        )
      } else {
        setExamError(msg)
      }
    }
    finally { setSavingExam(false) }
  }

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
              <Info size={16} style={{ color: '#FFD700' }} /> {tt('课程详情', 'Course Details')}
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
                {tt('创建于', 'Created on')}{' '}
                {new Date(course.created_at).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <div className="text-xs pt-1" style={{ color: '#444', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: '#555' }}>{tt('课程 ID：', 'Course ID:')}</span>
                <span className="font-mono text-xs" style={{ color: '#3a3a5a' }}>{course.id}</span>
              </div>
            </div>

            {/* ── 考试日期 ── */}
            <div className="rounded-2xl p-4 space-y-3"
              style={{ background: 'rgba(255,212,0,0.03)', border: '1px solid rgba(255,212,0,0.12)' }}>
              <h4 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#b08000' }}>
                <CalendarDays size={14} /> {tt('考试日期', 'Exam Date')}
              </h4>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={examInput}
                  onChange={e => setExamInput(e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,212,0,0.2)', color: '#ccc', colorScheme: 'dark' }}
                />
                <button
                  onClick={handleSaveExamDate}
                  disabled={savingExam}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
                  style={{ background: 'rgba(255,212,0,0.15)', color: '#FFD400', border: '1px solid rgba(255,212,0,0.25)' }}>
                  {savingExam ? tt('保存中...', 'Saving...') : tt('保存', 'Save')}
                </button>
                {examInput && (
                  <button onClick={() => setExamInput('')}
                    className="px-3 py-2 rounded-lg text-xs"
                    style={{ color: '#555', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {tt('清除', 'Clear')}
                  </button>
                )}
              </div>
              {examError && <p className="text-xs" style={{ color: '#e05050' }}>{examError}</p>}
            </div>

            {/* ── Danger Zone ── */}
            <div className="rounded-2xl p-4"
              style={{ background: 'rgba(239,68,68,0.04)', border: '1px dashed rgba(239,68,68,0.35)' }}>
              <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5" style={{ color: '#EF4444' }}>
                <AlertTriangle size={14} /> {tt('危险操作区', 'Danger Zone')}
              </h4>
              <p className="text-xs mb-4 leading-relaxed" style={{ color: '#7a3030' }}>
                {tt('删除课程将', 'Deleting this course will')}{' '}
                <strong style={{ color: '#cc4444' }}>
                  {tt('不可恢复地清空', 'permanently remove')}
                </strong>
                {tt('该课程下的所有课件文件、AI 闪卡、错题集和 RAG 向量索引。', ' all files, flashcards, mistake sets, and RAG vectors under this course.')}
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
                <Trash2 size={14} /> {tt('删除该课程', 'Delete Course')}
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

// ── 删除确认 Modal ────────────────────────────────────────────────────────────

function DeleteConfirmModal({
  course, secret, onClose, onDeleted,
}: {
  course: Course; secret: string; onClose: () => void; onDeleted: () => void
}) {
  const { lang } = useLang()
  const tt = (zh: string, en: string) => tx(lang, zh, en)
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
            <h3 className="text-base font-bold" style={{ color: '#EF4444' }}>{tt('此操作不可逆转！', 'This action is irreversible!')}</h3>
            <p className="text-xs" style={{ color: '#774444' }}>{tt('无法撤销，请仔细阅读以下警告', 'Cannot be undone. Please read carefully.')}</p>
          </div>
        </div>

        {/* 警告文本 */}
        <div className="rounded-xl p-3 mb-5 text-xs leading-relaxed"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', color: '#aa5555' }}>
          {tt('删除课程', 'Delete course')}{' '}
          <span style={{ color: '#FFD700', fontWeight: 600 }}>「{course.code} · {course.name}」</span>{' '}
          {tt('将同时清空其下所有的：', 'and remove all related data:')}
          <ul className="mt-1.5 ml-3 space-y-0.5 list-disc" style={{ color: '#884444' }}>
            <li>{tt('全部课件文件（Supabase Storage + 数据库记录）', 'All files (Supabase Storage + DB records)')}</li>
            <li>{tt('AI 生成的闪卡与模拟题', 'AI-generated flashcards and quizzes')}</li>
            <li>{tt('所有用户的错题记录', 'All user mistake records')}</li>
            <li>{tt('RAG 向量索引（ChromaDB chunks）', 'RAG vector index (ChromaDB chunks)')}</li>
          </ul>
        </div>

        {/* 输入校验 */}
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#aa5555' }}>
            {tt('请输入课程代码', 'Enter course code')}{' '}
            <span style={{ color: '#EF4444', fontWeight: 700 }}>「{course.code}」</span>{' '}
            {tt('以确认删除：', 'to confirm deletion:')}
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
            {tt('取消', 'Cancel')}
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
            {deleting ? tt('删除中...', 'Deleting...') : tt('确认删除', 'Confirm Delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 课程管理 Tab ──────────────────────────────────────────────────────────────

export function CoursesTab({ secret }: { secret: string }) {
  const { lang } = useLang()
  const tt = (zh: string, en: string) => tx(lang, zh, en)
  const locale = localeByLang(lang)
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [examInput, setExamInput] = useState('')
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
      const payload: { code: string; name: string; exam_date?: string } = {
        code: code.trim(),
        name: name.trim(),
      }
      if (examInput) payload.exam_date = new Date(examInput).toISOString()
      await adminReq(secret, '/admin/courses', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setCode(''); setName(''); setExamInput('')
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
          onUpdated={(updated) => {
            setSelectedCourse(updated)
            setCourses(prev => prev.map(c => c.id === updated.id ? updated : c))
          }}
        />
      )}
      {error && <ErrorBox msg={error} />}
      <div className="card-gold p-5 rounded-2xl">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#FFD700' }}>
          <Plus size={14} /> {tt('新建课程', 'Create Course')}
        </h3>
        <div className="flex gap-3 flex-wrap">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={tt('课程代码 (如 COMP9517)', 'Course code (e.g. COMP9517)')}
            className="input-glass px-3 py-2 rounded-lg text-sm outline-none flex-1 min-w-32" />
          <input value={name} onChange={e => setName(e.target.value)} placeholder={tt('课程名称', 'Course name')}
            className="input-glass px-3 py-2 rounded-lg text-sm outline-none flex-1 min-w-40" />
          <input
            type="datetime-local"
            value={examInput}
            onChange={e => setExamInput(e.target.value)}
            title={tt('考试时间（可选）', 'Exam datetime (optional)')}
            className="input-glass px-3 py-2 rounded-lg text-sm outline-none min-w-52"
          />
          <ActionBtn onClick={create} loading={creating} disabled={!code.trim() || !name.trim()} icon={<Plus size={14} />}>
            {tt('创建', 'Create')}
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
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{c.name}</p>
                <p className="text-xs mt-0.5 truncate" style={{ color: '#666' }}>
                  {tt('考试：', 'Exam: ')}
                  {c.exam_date
                    ? new Date(c.exam_date).toLocaleString(locale)
                    : tt('未设置', 'Not set')}
                </p>
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: '#555' }}>
                {tt('创建于', 'Created')}{' '}{new Date(c.created_at).toLocaleDateString(locale)}
              </span>
              <ChevronRight size={14} style={{ color: '#444', flexShrink: 0 }} />
            </button>
          ))}
          {courses.length === 0 && <Empty text={tt('暂无课程', 'No courses yet')} />}
        </div>
      )}
    </div>
  )
}
