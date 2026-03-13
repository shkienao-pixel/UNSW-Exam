'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRight, BookOpen, CheckCircle2, Layers3, Loader2,
  Shield, Sparkles, Search, Lock, Plus, Star,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Course, EnrollmentStatus } from '@/lib/types'
import ExamCountdown from '@/components/ExamCountdown'

const GOLD = '#c8a55a'
const GOLD_LIGHT = '#e6cf98'

// ── Helpers ───────────────────────────────────────────────────────────────────

function glowStyle() {
  return { textShadow: '0 0 22px rgba(230,207,152,0.14)' } as const
}

function hashString(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 100000
  return Math.abs(hash)
}

function getCourseInsight(course: Course) {
  const seed = hashString(`${course.code}-${course.name}`)
  return {
    mastery: 58 + (seed % 33),
    processing: 64 + (seed % 27),
    focus: seed % 2 === 0 ? '错题回看优先' : '模拟题训练优先',
  }
}

// ── Enroll modal ──────────────────────────────────────────────────────────────

function EnrollModal({
  course, cost, slotsRemaining, onConfirm, onCancel, loading,
}: {
  course: Course
  cost: number
  slotsRemaining: number
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-[28px] p-6 space-y-5"
        style={{ background: 'rgba(14,16,24,0.98)', border: '1px solid rgba(200,165,90,0.25)', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(200,165,90,0.12)', border: '1px solid rgba(200,165,90,0.25)' }}>
            <Star size={18} style={{ color: GOLD }} />
          </div>
          <div>
            <p className="font-semibold text-white">选课确认</p>
            <p className="text-xs mt-0.5" style={{ color: '#666' }}>本学期剩余名额：{slotsRemaining} 门</p>
          </div>
        </div>

        <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-mono" style={{ color: GOLD }}>{course.code}</p>
          <p className="text-sm font-medium text-white">{course.name}</p>
        </div>

        <div className="flex items-center justify-between text-sm rounded-xl px-4 py-3"
          style={{ background: 'rgba(200,165,90,0.07)', border: '1px solid rgba(200,165,90,0.18)' }}>
          <span style={{ color: '#888' }}>解锁费用</span>
          <span className="font-bold" style={{ color: GOLD_LIGHT }}>{cost} ✦ 积分</span>
        </div>

        <p className="text-xs text-center" style={{ color: '#555' }}>
          此课程仅当前学期有效，下学期需重新选课
        </p>

        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>
            取消
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,rgba(200,165,90,0.25),rgba(200,165,90,0.14))', color: GOLD_LIGHT, border: '1px solid rgba(200,165,90,0.35)' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {loading ? '选课中…' : '确认选课'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Course card (enrolled) ────────────────────────────────────────────────────

function EnrolledCourseCard({ course, term, guestDemoExamAt, role }: {
  course: Course; term: string; guestDemoExamAt: string; role: string | null | undefined
}) {
  const insight = getCourseInsight(course)
  const countdownDate = course.exam_date || (role === 'guest' && course.code === 'COMP9517' ? guestDemoExamAt : null)

  return (
    <Link href={`/courses/${course.id}?view=flashcards`}
      className="group rounded-[28px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)] transition hover:border-white/12 hover:bg-white/[0.045]"
      style={{ textDecoration: 'none' }}>
      <div className="flex items-center justify-between gap-4">
        <span className="rounded-full border border-[#c8a55a]/18 bg-[#c8a55a]/10 px-3 py-1 text-xs font-semibold tracking-[0.08em]" style={{ color: GOLD_LIGHT }}>
          {course.code}
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
          style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
          <CheckCircle2 size={10} /> {term}
        </span>
      </div>

      <h3 className="mt-5 text-lg font-medium leading-7 text-white">{course.name}</h3>

      <div className="mt-4 min-h-[32px]">
        {countdownDate ? (
          <ExamCountdown examDate={countdownDate} size="sm" />
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/42">
            未设置考试日期
          </span>
        )}
      </div>

      <div className="mt-5 rounded-[20px] border border-white/7 bg-black/18 p-4">
        <div className="flex items-center justify-between text-xs text-white/44">
          <span>考点掌握度</span>
          <span>{insight.mastery}%</span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/8">
          <div className="h-full rounded-full" style={{ width: `${insight.mastery}%`, background: 'linear-gradient(90deg,#c8a55a,#ebd49d)' }} />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/6 pt-4">
        <span className="text-sm" style={{ color: '#666' }}>{insight.focus}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c8a55a]/20 bg-[#c8a55a]/8 px-4 py-2 text-sm font-medium transition group-hover:border-[#c8a55a]/28 group-hover:bg-[#c8a55a]/12" style={{ color: GOLD_LIGHT }}>
          进入 <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

// ── Course card (not enrolled) ────────────────────────────────────────────────

function LockedCourseCard({ course, cost, slotsRemaining, onEnroll }: {
  course: Course; cost: number; slotsRemaining: number; onEnroll: (course: Course) => void
}) {
  return (
    <div className="rounded-[28px] border border-white/6 bg-white/[0.02] p-5"
      style={{ opacity: slotsRemaining <= 0 ? 0.5 : 1 }}>
      <div className="flex items-center justify-between gap-4">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold tracking-[0.08em] text-white/42">
          {course.code}
        </span>
        <Lock size={13} style={{ color: '#444' }} />
      </div>

      <h3 className="mt-5 text-base font-medium leading-6" style={{ color: '#666' }}>{course.name}</h3>

      {course.exam_date && (
        <div className="mt-4">
          <ExamCountdown examDate={course.exam_date} size="sm" />
        </div>
      )}

      <div className="mt-5 border-t border-white/6 pt-4">
        <button
          onClick={() => onEnroll(course)}
          disabled={slotsRemaining <= 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{
            background: slotsRemaining > 0 ? 'rgba(200,165,90,0.1)' : 'rgba(255,255,255,0.03)',
            color: slotsRemaining > 0 ? GOLD : '#444',
            border: `1px solid ${slotsRemaining > 0 ? 'rgba(200,165,90,0.28)' : 'rgba(255,255,255,0.06)'}`,
            cursor: slotsRemaining <= 0 ? 'not-allowed' : 'pointer',
          }}>
          <Plus size={14} />
          选课 — {cost} ✦
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [enrollStatus, setEnrollStatus] = useState<EnrollmentStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [enrollTarget, setEnrollTarget] = useState<Course | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const { role } = useAuth()

  const guestDemoExamAt = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 18); d.setHours(9, 0, 0, 0)
    return d.toISOString()
  }, [])

  const load = useCallback(async () => {
    const [coursesRes, statusRes] = await Promise.allSettled([
      api.courses.list(),
      api.enrollments.status(),
    ])
    if (coursesRes.status === 'fulfilled') setCourses(coursesRes.value)
    if (statusRes.status === 'fulfilled') setEnrollStatus(statusRes.value)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const guestCourses = role === 'guest' ? courses.filter(c => c.code === 'COMP9517') : null

  const enrolledIds = new Set(enrollStatus?.enrolled_course_ids ?? [])
  const term = enrollStatus?.current_term ?? 'T1'
  const cost = enrollStatus?.enrollment_cost ?? 100
  const slotsRemaining = enrollStatus?.slots_remaining ?? 4

  const allCourses = guestCourses ?? courses
  const filtered = allCourses.filter(c => {
    const q = search.toLowerCase()
    return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  })
  const myCourses = filtered.filter(c => enrolledIds.has(c.id))
  const moreCourses = filtered.filter(c => !enrolledIds.has(c.id))

  async function handleConfirmEnroll() {
    if (!enrollTarget) return
    setEnrolling(true)
    setEnrollError(null)
    try {
      await api.enrollments.enroll(enrollTarget.id)
      await load()
      setEnrollTarget(null)
    } catch (e: any) {
      setEnrollError(e.message || '选课失败')
    } finally {
      setEnrolling(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">

      {/* Header */}
      <section className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <Layers3 className="h-3.5 w-3.5" style={{ color: GOLD }} />
              Course workspace
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-[0.96] tracking-[-0.05em] text-white sm:text-5xl">
              开启你的智慧复习空间
            </h1>
            <p className="mt-5 max-w-[560px] text-base leading-8 text-white/52">
              选课解锁你的专属备考资源，每学期最多选 4 门课。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Term</p>
              <p className="mt-4 text-3xl font-semibold text-white" style={glowStyle()}>{term}</p>
              <p className="mt-2 text-sm text-white/44">当前学期</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Enrolled</p>
              <p className="mt-4 text-3xl font-semibold text-white" style={glowStyle()}>{myCourses.length}</p>
              <p className="mt-2 text-sm text-white/44">已选课程</p>
            </div>
            <div className="rounded-[24px] border border-[#c8a55a]/16 bg-[#c8a55a]/8 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Slots</p>
              <p className="mt-4 text-3xl font-semibold text-white" style={glowStyle()}>{slotsRemaining}</p>
              <p className="mt-2 text-sm text-white/44">剩余名额</p>
            </div>
          </div>
        </div>
      </section>

      {/* Guest banner */}
      {role === 'guest' && (
        <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-[#c8a55a]/16 bg-[#c8a55a]/8 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#c8a55a]/22 bg-[#c8a55a]/12 px-3 py-1 text-xs font-medium" style={{ color: GOLD_LIGHT }}>Guest</span>
            <p className="text-sm text-white/62">当前仅开放 COMP9517 演示课程。注册后可选课解锁完整备考工作流。</p>
          </div>
          <Link href="/register" className="btn-gold inline-flex items-center gap-2 text-sm" style={{ textDecoration: 'none' }}>
            注册解锁全部 <ArrowRight size={15} />
          </Link>
        </section>
      )}

      {/* Search bar */}
      {!loading && allCourses.length > 3 && (
        <div className="mt-6 flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-white/30" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索课程…"
              className="pl-9 pr-4 py-2 rounded-full text-sm outline-none transition-all w-52"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(200,165,90,0.5)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }} />
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/46 sm:flex">
            <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} />
            {enrollStatus?.slots_used ?? 0} / 4 已选
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: GOLD }} />
        </div>
      ) : (
        <>
          {/* My Courses */}
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">我的课程 · {term}</h2>
                <p className="mt-1 text-sm text-white/42">本学期已解锁，直接进入学习工作台</p>
              </div>
            </div>

            {myCourses.length === 0 ? (
              <div className="rounded-[28px] border border-white/8 bg-white/[0.03] px-6 py-14 text-center">
                <BookOpen className="mx-auto h-10 w-10 text-white/16 mb-4" />
                <p className="text-base font-medium text-white/52">本学期还未选课</p>
                <p className="mt-2 text-sm text-white/32">在下方"更多课程"中选择你需要的课程，花 {cost} ✦ 解锁</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {myCourses.map(c => (
                  <EnrolledCourseCard key={c.id} course={c} term={term} guestDemoExamAt={guestDemoExamAt} role={role} />
                ))}
              </div>
            )}
          </section>

          {/* More Courses */}
          {moreCourses.length > 0 && (
            <section className="mt-10">
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">更多课程</h2>
                <p className="mt-1 text-sm text-white/42">
                  每门课 {cost} ✦ 解锁，本学期剩余 {slotsRemaining} 个名额
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {moreCourses.map(c => (
                  <LockedCourseCard key={c.id} course={c} cost={cost} slotsRemaining={slotsRemaining} onEnroll={setEnrollTarget} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Enroll modal */}
      {enrollTarget && (
        <EnrollModal
          course={enrollTarget}
          cost={cost}
          slotsRemaining={slotsRemaining}
          onConfirm={handleConfirmEnroll}
          onCancel={() => { setEnrollTarget(null); setEnrollError(null) }}
          loading={enrolling}
        />
      )}

      {/* Enroll error toast */}
      {enrollError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm font-medium"
          style={{ background: 'rgba(20,14,14,0.97)', border: '1px solid rgba(255,80,80,0.35)', color: '#ff8080', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          {enrollError}
          <button onClick={() => setEnrollError(null)} className="ml-3 text-xs opacity-60">✕</button>
        </div>
      )}
    </div>
  )
}
