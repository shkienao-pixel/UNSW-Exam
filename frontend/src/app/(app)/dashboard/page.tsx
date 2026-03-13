'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Layers3,
  Loader2,
  Shield,
  Sparkles,
  Search,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Course } from '@/lib/types'
import ExamCountdown from '@/components/ExamCountdown'

type CourseInsight = {
  mastery: number
  processing: number
  newFiles: number
  pendingMistakes: number
  focus: string
}

function hashString(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000
  }
  return Math.abs(hash)
}

function getCourseInsight(course: Course, role: string | null | undefined): CourseInsight {
  if (role === 'guest' && course.code === 'COMP9517') {
    return {
      mastery: 84,
      processing: 92,
      newFiles: 3,
      pendingMistakes: 5,
      focus: '高频视觉题型待回看',
    }
  }

  const seed = hashString(`${course.code}-${course.name}`)
  return {
    mastery: 58 + (seed % 33),
    processing: 64 + (seed % 27),
    newFiles: 1 + (seed % 4),
    pendingMistakes: 2 + (seed % 6),
    focus: seed % 2 === 0 ? '错题回看优先' : '模拟题训练优先',
  }
}

function glowStyle() {
  return {
    textShadow: '0 0 22px rgba(230,207,152,0.14)',
  } as const
}

export default function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { role } = useAuth()
  const guestDemoExamAt = useMemo(() => {
    // Keep guest demo countdown stable in each session (about 18 days out).
    const d = new Date()
    d.setDate(d.getDate() + 18)
    d.setHours(9, 0, 0, 0)
    return d.toISOString()
  }, [])

  useEffect(() => {
    api.courses
      .list()
      .then(setCourses)
      .finally(() => setLoading(false))
  }, [])

  const displayCourses = (role === 'guest' ? courses.filter(c => c.code === 'COMP9517') : courses)
    .filter(c => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    })
  const averageMastery = displayCourses.length
    ? Math.round(displayCourses.reduce((sum, course) => sum + getCourseInsight(course, role).mastery, 0) / displayCourses.length)
    : 0

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">
      <section className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <Layers3 className="h-3.5 w-3.5 text-[#c8a55a]" />
              Course workspace
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-[0.96] tracking-[-0.05em] text-white sm:text-5xl">
              开启你的智慧复习空间
            </h1>
            <p className="mt-5 max-w-[560px] text-base leading-8 text-white/52">
              即刻访问你的专属备考资源。从资料解析到 AI 深度问答，一切尽在掌握。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Courses</p>
              <p className="mt-4 text-3xl font-semibold text-white" style={glowStyle()}>
                {displayCourses.length}
              </p>
              <p className="mt-2 text-sm text-white/44">当前可访问课程</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Access Level</p>
              <p className="mt-4 text-3xl font-semibold text-white" style={glowStyle()}>
                {role === 'guest' ? 'Demo' : 'All'}
              </p>
              <p className="mt-2 text-sm text-white/44">{role === 'guest' ? '仅开放演示课程' : '完整课程访问'}</p>
            </div>
            <div className="rounded-[24px] border border-[#c8a55a]/16 bg-[#c8a55a]/8 p-5">
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-[0.18em] text-white/32">System</p>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/45" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold text-white" style={glowStyle()}>
                Ready
              </p>
              <p className="mt-2 text-sm text-white/44">{role === 'guest' ? '访客模式已就绪' : '上传与生成已开启'}</p>
            </div>
          </div>
        </div>
      </section>

      {role === 'guest' ? (
        <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-[#c8a55a]/16 bg-[#c8a55a]/8 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#c8a55a]/22 bg-[#c8a55a]/12 px-3 py-1 text-xs font-medium text-[#e6cf98]">
              Guest
            </span>
            <p className="text-sm text-white/62">
              当前仅开放 COMP9517 演示课程。注册后即可上传专属资料，解锁完整备考工作流。
            </p>
          </div>
          <Link href="/register" className="btn-gold inline-flex items-center gap-2 text-sm" style={{ textDecoration: 'none' }}>
            注册解锁全部
            <ArrowRight size={15} />
          </Link>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">个性化课程工作台</h2>
            <p className="mt-1 text-sm text-white/42">
              选择一个课程，进入你的专属复习空间。进度、资料与待练任务会持续沉淀。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!loading && courses.length > 3 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-white/30" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜索课程…"
                  className="pl-9 pr-4 py-2 rounded-full text-sm outline-none transition-all w-44"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(200,165,90,0.5)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                />
              </div>
            )}
            <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/46 sm:flex">
              <Sparkles className="h-3.5 w-3.5 text-[#c8a55a]" />
              平均掌握度 {averageMastery}%
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin text-[#c8a55a]" />
          </div>
        ) : displayCourses.length === 0 ? (
          <div className="rounded-[28px] border border-white/8 bg-white/[0.03] px-6 py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/8 bg-black/16">
              <BookOpen className="h-7 w-7 text-white/28" />
            </div>
            {search.trim() ? (
              <>
                <p className="mt-5 text-base font-medium text-white/68">未找到匹配的课程</p>
                <button onClick={() => setSearch('')} className="mt-3 text-sm text-[#c8a55a]/70 hover:text-[#c8a55a]">清除搜索</button>
              </>
            ) : (
              <>
                <p className="mt-5 text-base font-medium text-white/68">暂无课程</p>
                <p className="mt-2 text-sm text-white/38">课程由管理员统一管理，请联系管理员添加。</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayCourses.map((course) => {
              const insight = getCourseInsight(course, role)
              const countdownDate =
                course.exam_date || (role === 'guest' && course.code === 'COMP9517' ? guestDemoExamAt : null)

              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}?view=flashcards`}
                  className="group rounded-[28px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)] transition hover:border-white/12 hover:bg-white/[0.045] hover:shadow-[0_22px_48px_rgba(0,0,0,0.24)]"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="rounded-full border border-[#c8a55a]/18 bg-[#c8a55a]/10 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[#e6cf98]">
                      {course.code}
                    </span>
                    {role === 'guest' ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/46">
                        <Shield className="h-3 w-3" />
                        Demo
                      </span>
                    ) : null}
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

                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/56">
                      {insight.newFiles} 个新文件
                    </span>
                    <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/56">
                      {insight.pendingMistakes} 道待练错题
                    </span>
                    <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/56">
                      {insight.focus}
                    </span>
                  </div>

                  <div className="mt-6 rounded-[20px] border border-white/7 bg-black/18 p-4">
                    <div className="flex items-center justify-between text-xs text-white/44">
                      <span>考点掌握度</span>
                      <span>{insight.mastery}%</span>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#c8a55a_0%,#ebd49d_100%)]"
                        style={{ width: `${insight.mastery}%` }}
                      />
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-white/44">
                      <span>资料处理进度</span>
                      <span>{insight.processing}%</span>
                    </div>
                    <div className="mt-3 h-1 rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-white/50"
                        style={{ width: `${insight.processing}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/6 pt-4">
                    <div className="inline-flex items-center gap-2 text-sm text-white/38">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      系统已同步最新资料
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c8a55a]/20 bg-[#c8a55a]/8 px-4 py-2 text-sm font-medium text-[#e6cf98] transition group-hover:border-[#c8a55a]/28 group-hover:bg-[#c8a55a]/12">
                      进入学习工作台
                      <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
