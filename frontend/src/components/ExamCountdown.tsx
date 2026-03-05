'use client'

import { useEffect, useState } from 'react'
import { Clock, CheckCircle2, CalendarClock } from 'lucide-react'

interface Props {
  examDate?: string | null
  size?: 'sm' | 'lg'
}

function calcRemaining(target: Date) {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return null

  const totalSec = Math.floor(diff / 1000)
  const days     = Math.floor(totalSec / 86400)
  const hours    = Math.floor((totalSec % 86400) / 3600)
  const minutes  = Math.floor((totalSec % 3600)  / 60)
  const seconds  = totalSec % 60
  const weeks    = Math.floor(days / 7)

  return { days, hours, minutes, seconds, weeks, totalSec }
}

export default function ExamCountdown({ examDate, size = 'sm' }: Props) {
  const [tick, setTick] = useState(0)

  const target = examDate ? new Date(examDate) : null
  const rem    = target ? calcRemaining(target) : null
  const isOver = target && !rem

  // 只有 ≤ 3 周时才需要每秒 tick
  useEffect(() => {
    if (!target || !rem || rem.weeks > 3) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examDate, rem?.weeks])

  if (!target) return null

  // ── 考试已结束 ────────────────────────────────────────────────────────────
  if (isOver) {
    if (size === 'sm') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'rgba(100,100,120,0.15)', color: '#555566', border: '1px solid rgba(100,100,120,0.2)' }}>
          <CheckCircle2 size={10} /> 考试已结束
        </span>
      )
    }
    return (
      <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium"
        style={{ background: 'rgba(80,80,100,0.12)', color: '#55556a', border: '1px solid rgba(100,100,120,0.18)' }}>
        <CheckCircle2 size={15} />
        <span>考试已结束</span>
        <span className="ml-1 text-xs opacity-60">
          {target.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>
    )
  }

  // ── 大于 3 周 ─────────────────────────────────────────────────────────────
  if (rem && rem.weeks > 3) {
    const label = `还有 ${rem.weeks} 周考试`
    if (size === 'sm') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'rgba(255,212,0,0.08)', color: '#a07800', border: '1px solid rgba(255,212,0,0.15)' }}>
          <CalendarClock size={10} /> {label}
        </span>
      )
    }
    return (
      <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium"
        style={{ background: 'rgba(255,212,0,0.07)', color: '#c09000', border: '1px solid rgba(255,212,0,0.18)' }}>
        <CalendarClock size={15} />
        <span>{label}</span>
        <span className="ml-1 text-xs opacity-55">
          {target.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
        </span>
      </div>
    )
  }

  // ── 小于等于 3 周：精确倒计时 ─────────────────────────────────────────────
  if (rem) {
    const urgent = rem.days < 3

    if (size === 'sm') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium tabular-nums"
          style={{
            background: urgent ? 'rgba(239,68,68,0.10)' : 'rgba(255,212,0,0.09)',
            color:      urgent ? '#e05050'              : '#b08000',
            border: `1px solid ${urgent ? 'rgba(239,68,68,0.22)' : 'rgba(255,212,0,0.20)'}`,
          }}>
          <Clock size={10} />
          {rem.days > 0 && `${rem.days}天 `}{String(rem.hours).padStart(2,'0')}:{String(rem.minutes).padStart(2,'0')}:{String(rem.seconds).padStart(2,'0')}
        </span>
      )
    }

    // lg — 课程页顶部横幅
    return (
      <div className="flex items-center justify-center gap-3 py-3 px-5 rounded-2xl"
        style={{
          background: urgent ? 'rgba(239,68,68,0.08)' : 'rgba(255,212,0,0.07)',
          border: `1px solid ${urgent ? 'rgba(239,68,68,0.20)' : 'rgba(255,212,0,0.18)'}`,
        }}>
        <Clock size={16} style={{ color: urgent ? '#e05050' : '#c09000', flexShrink: 0 }} />
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs" style={{ color: urgent ? '#9a3030' : '#7a6000' }}>距考试还有</span>
          {rem.days > 0 && (
            <><span className="text-xl font-bold tabular-nums" style={{ color: urgent ? '#e05050' : '#c09000' }}>{rem.days}</span>
            <span className="text-xs" style={{ color: urgent ? '#9a3030' : '#7a6000' }}>天</span></>
          )}
          <span className="text-xl font-bold tabular-nums" style={{ color: urgent ? '#e05050' : '#c09000' }}>
            {String(rem.hours).padStart(2,'0')}
          </span>
          <span className="text-xs" style={{ color: urgent ? '#9a3030' : '#7a6000' }}>时</span>
          <span className="text-xl font-bold tabular-nums" style={{ color: urgent ? '#e05050' : '#c09000' }}>
            {String(rem.minutes).padStart(2,'0')}
          </span>
          <span className="text-xs" style={{ color: urgent ? '#9a3030' : '#7a6000' }}>分</span>
          <span className="text-xl font-bold tabular-nums" style={{ color: urgent ? '#e05050' : '#c09000' }}>
            {String(rem.seconds).padStart(2,'0')}
          </span>
          <span className="text-xs" style={{ color: urgent ? '#9a3030' : '#7a6000' }}>秒</span>
        </div>
        <span className="text-xs ml-1" style={{ color: urgent ? '#7a3030' : '#605040', opacity: 0.7 }}>
          {target.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
        </span>
      </div>
    )
  }

  return null
}
