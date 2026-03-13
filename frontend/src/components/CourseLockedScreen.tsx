'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Star, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'

const GOLD = '#c8a55a'
const GOLD_LIGHT = '#e6cf98'

export default function CourseLockedScreen({
  courseId, courseName, courseCode, term, cost, onEnrolled,
}: {
  courseId: string
  courseName: string
  courseCode: string
  term: string
  cost: number
  onEnrolled: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleEnroll() {
    setLoading(true)
    setError(null)
    try {
      await api.enrollments.enroll(courseId)
      setDone(true)
      setTimeout(() => onEnrolled(), 800)
    } catch (e: any) {
      setError(e.message || '选课失败，请检查积分余额')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6 min-h-screen"
      style={{
        background: 'radial-gradient(circle at 50% 30%, rgba(200,165,90,0.04), transparent 60%), radial-gradient(circle at top, rgba(20,28,42,0.6), transparent 30%)',
      }}>
      <div className="w-full max-w-md space-y-6">
        {/* Back */}
        <button onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-sm transition-all"
          style={{ color: '#555' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#888')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
          <ArrowLeft size={14} /> 返回课程列表
        </button>

        {/* Card */}
        <div className="rounded-[32px] p-8 space-y-6 text-center"
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
          }}>
          {done ? (
            <>
              <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)' }}>
                <CheckCircle2 size={32} style={{ color: '#4ade80' }} />
              </div>
              <div>
                <p className="text-xl font-semibold text-white">选课成功！</p>
                <p className="text-sm mt-2" style={{ color: '#666' }}>正在进入课程…</p>
              </div>
            </>
          ) : (
            <>
              {/* Lock icon */}
              <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(200,165,90,0.08)', border: '1px solid rgba(200,165,90,0.2)' }}>
                <Lock size={28} style={{ color: GOLD }} />
              </div>

              {/* Course info */}
              <div>
                <p className="text-xs font-mono font-semibold mb-2" style={{ color: GOLD }}>{courseCode}</p>
                <h2 className="text-xl font-semibold text-white leading-snug">{courseName}</h2>
                <p className="text-sm mt-2" style={{ color: '#555' }}>此课程需要选课才能访问</p>
              </div>

              {/* Cost info */}
              <div className="rounded-2xl px-5 py-4 space-y-2"
                style={{ background: 'rgba(200,165,90,0.06)', border: '1px solid rgba(200,165,90,0.16)' }}>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#777' }}>解锁学期</span>
                  <span className="font-semibold" style={{ color: GOLD_LIGHT }}>{term}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#777' }}>所需积分</span>
                  <span className="font-bold text-base" style={{ color: GOLD_LIGHT }}>{cost} ✦</span>
                </div>
                <div className="text-xs pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', color: '#555' }}>
                  仅 {term} 学期有效，下学期需重新选课
                </div>
              </div>

              {error && (
                <p className="text-sm rounded-xl px-4 py-2.5"
                  style={{ background: 'rgba(255,80,80,0.08)', color: '#ff8080', border: '1px solid rgba(255,80,80,0.2)' }}>
                  {error}
                </p>
              )}

              {/* Enroll button */}
              <button onClick={handleEnroll} disabled={loading}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{
                  background: loading ? 'rgba(200,165,90,0.1)' : 'linear-gradient(135deg,rgba(200,165,90,0.28),rgba(200,165,90,0.14))',
                  color: GOLD_LIGHT,
                  border: '1px solid rgba(200,165,90,0.38)',
                  opacity: loading ? 0.7 : 1,
                }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}
                {loading ? '选课中…' : `选课解锁 — ${cost} ✦`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
