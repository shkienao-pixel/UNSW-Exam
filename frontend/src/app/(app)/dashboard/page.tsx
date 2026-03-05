'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Course } from '@/lib/types'
import { BookOpen, Loader2, ArrowRight, Layers } from 'lucide-react'
import ExamCountdown from '@/components/ExamCountdown'

export default function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const { role } = useAuth()

  useEffect(() => {
    api.courses.list()
      .then(setCourses)
      .finally(() => setLoading(false))
  }, [])

  const displayCourses = role === 'guest'
    ? courses.filter(c => c.code === 'COMP9517')
    : courses

  return (
    <div className="p-6 md:p-8 overflow-y-auto flex-1 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div className="mb-8 fade-in-up">
        <div className="flex items-center gap-2 mb-1">
          <Layers size={16} style={{ color: '#FFD700' }} />
          <h1 className="text-xl font-bold text-white">课程列表</h1>
        </div>
        <p className="text-sm" style={{ color: '#444455' }}>
          选择课程，上传资料并生成 AI 复习内容
        </p>
      </div>

      {/* Guest banner */}
      {role === 'guest' && (
        <div className="mb-6 px-4 py-3 rounded-xl flex items-center justify-between flex-wrap gap-3 fade-in-up"
          style={{
            background: 'rgba(255,215,0,0.06)',
            border: '1px solid rgba(255,215,0,0.18)',
          }}>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded font-semibold"
              style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700' }}>游客</span>
            <p className="text-sm" style={{ color: '#888' }}>
              仅可访问 COMP9517 演示课程
            </p>
          </div>
          <Link href="/register"
            className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
            style={{ background: 'rgba(255,215,0,0.14)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.28)' }}>
            注册解锁全部 <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={28} />
        </div>
      ) : displayCourses.length === 0 ? (
        <div className="text-center py-24 fade-in-up">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <BookOpen size={28} style={{ color: '#2a2a40' }} />
          </div>
          <p className="text-base font-medium" style={{ color: '#444455' }}>暂无课程</p>
          <p className="text-sm mt-1.5" style={{ color: '#333344' }}>课程由管理员统一管理，请联系管理员添加</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 fade-in-up">
          {displayCourses.map((c, i) => (
            <Link key={c.id} href={`/courses/${c.id}?view=flashcards`}
              style={{ textDecoration: 'none', animationDelay: `${i * 0.05}s` }}
              className="fade-in-up">
              <div className="group h-full rounded-2xl p-5 cursor-pointer transition-all duration-250"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  minHeight: 148,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(255,215,0,0.04)'
                  el.style.borderColor = 'rgba(255,215,0,0.22)'
                  el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4), 0 0 24px rgba(255,215,0,0.07)'
                  el.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(255,255,255,0.025)'
                  el.style.borderColor = 'rgba(255,255,255,0.07)'
                  el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'
                  el.style.transform = 'translateY(0)'
                }}
              >
                <div>
                  {/* Code badge */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                      style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)', letterSpacing: '0.04em' }}>
                      {c.code}
                    </span>
                  </div>

                  {/* Course name */}
                  <h3 className="text-white font-semibold text-sm leading-snug">{c.name}</h3>

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <ExamCountdown examDate={c.exam_date} size="sm" />
                    {!c.exam_date && (
                      <p className="text-xs" style={{ color: '#33334a' }}>
                        {new Date(c.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Enter CTA */}
                <div className="flex items-center justify-between mt-4 pt-3"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="text-xs" style={{ color: '#33334a' }}>开始复习</span>
                  <div className="flex items-center gap-1 text-xs font-semibold transition-all"
                    style={{ color: '#FFD700' }}>
                    <span>进入</span>
                    <ArrowRight size={12} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
