'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, Layers3, Loader2, Shield } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Course } from '@/lib/types'
import ExamCountdown from '@/components/ExamCountdown'

export default function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const { role } = useAuth()

  useEffect(() => {
    api.courses
      .list()
      .then(setCourses)
      .finally(() => setLoading(false))
  }, [])

  const displayCourses = role === 'guest' ? courses.filter(c => c.code === 'COMP9517') : courses

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">
      <section className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <Layers3 className="h-3.5 w-3.5 text-[#c8a55a]" />
              Course workspace
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-[0.96] tracking-[-0.05em] text-white sm:text-5xl">
              从课程开始，
              <br />
              把复习内容收进工作台
            </h1>
            <p className="mt-5 max-w-[560px] text-base leading-8 text-white/52">
              选择课程后即可继续访问资料上传、闪卡、模拟题、错题集和 AI 问答。整个用户端页面语言已经与首页统一，不再是另一套视觉系统。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Courses</p>
              <p className="mt-4 text-3xl font-semibold text-white">{displayCourses.length}</p>
              <p className="mt-2 text-sm text-white/44">当前可访问课程</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Guest scope</p>
              <p className="mt-4 text-3xl font-semibold text-white">{role === 'guest' ? '1' : 'All'}</p>
              <p className="mt-2 text-sm text-white/44">{role === 'guest' ? '仅开放演示课程' : '完整课程访问'}</p>
            </div>
            <div className="rounded-[24px] border border-[#c8a55a]/16 bg-[#c8a55a]/8 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Mode</p>
              <p className="mt-4 text-3xl font-semibold text-white">{role === 'guest' ? 'Guest' : 'Full'}</p>
              <p className="mt-2 text-sm text-white/44">{role === 'guest' ? 'COMP9517 demo' : '上传与生成已开启'}</p>
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
            <p className="text-sm text-white/62">当前仅可访问 COMP9517 演示课程。注册后可上传完整资料并解锁全部学习模块。</p>
          </div>
          <Link href="/register" className="btn-gold inline-flex items-center gap-2 text-sm" style={{ textDecoration: 'none' }}>
            注册解锁全部
            <ArrowRight size={15} />
          </Link>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">课程列表</h2>
            <p className="mt-1 text-sm text-white/42">选择一个课程，进入统一的学习工作台。</p>
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
            <p className="mt-5 text-base font-medium text-white/68">暂无课程</p>
            <p className="mt-2 text-sm text-white/38">课程由管理员统一管理，请联系管理员添加。</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayCourses.map((course) => (
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
                  <ExamCountdown examDate={course.exam_date} size="sm" />
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-white/6 pt-4 text-sm">
                  <span className="text-white/38">进入学习工作台</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#e6cf98]">
                    打开
                    <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
