'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import type { PlannerPlan, PlannerDay, PlannerKP, PlannerPaper } from '@/lib/types'
import { CalendarDays, CheckCircle2, Circle, BookOpen, FileText, ChevronDown, ChevronRight, Loader2, AlertCircle, Trophy } from 'lucide-react'

const GOLD = '#c8a55a'
const GOLD_LIGHT = '#e6cf98'

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '16px 20px',
}

const todayCardStyle: React.CSSProperties = {
  background: 'rgba(200,165,90,0.08)',
  border: '1px solid rgba(200,165,90,0.28)',
  borderRadius: 16,
  padding: '16px 20px',
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatPill({ label, done, total, color }: { label: string; done: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div style={{ ...cardStyle, flex: 1, minWidth: 120, padding: '12px 16px' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: '#888' }}>{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1.5 text-xs" style={{ color: '#666' }}>
        {done} / {total}
      </div>
    </div>
  )
}

// ── Checkbox item ─────────────────────────────────────────────────────────────

function CheckItem({
  id, label, topic, done, onToggle, color,
}: {
  id: string; label: string; topic?: string; done: boolean; onToggle: (id: string, done: boolean) => void; color: string
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (loading) return
    setLoading(true)
    await onToggle(id, !done)
    setLoading(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-start gap-2.5 text-left py-2 px-3 rounded-xl transition-all duration-150"
      style={{
        background: done ? 'rgba(255,255,255,0.015)' : 'transparent',
        opacity: loading ? 0.6 : 1,
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
      onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = done ? 'rgba(255,255,255,0.015)' : 'transparent' }}
    >
      {loading
        ? <Loader2 size={15} className="animate-spin flex-shrink-0 mt-0.5" style={{ color }} />
        : done
          ? <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" style={{ color }} />
          : <Circle size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#444' }} />
      }
      <div className="flex-1 min-w-0">
        <span className="text-sm leading-snug" style={{ color: done ? '#555' : '#ccc', textDecoration: done ? 'line-through' : 'none' }}>
          {label}
        </span>
        {topic && !done && (
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#666' }}>
            {topic}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Day card ──────────────────────────────────────────────────────────────────

function DayCard({
  day, onToggleKP, onTogglePaper, defaultOpen,
}: {
  day: PlannerDay
  onToggleKP: (id: string, done: boolean) => void
  onTogglePaper: (id: string, done: boolean) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const hasItems = day.knowledge_points.length > 0 || day.papers.length > 0
  const allDone = hasItems &&
    day.knowledge_points.every(k => k.done) &&
    day.papers.every(p => p.done)

  const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('zh-CN', {
    month: 'short', day: 'numeric', weekday: 'short',
  })

  const style = day.is_today ? todayCardStyle : cardStyle

  return (
    <div style={style}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          {/* Day badge */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: day.is_today ? `rgba(200,165,90,0.2)` : 'rgba(255,255,255,0.05)',
              color: day.is_today ? GOLD : '#666',
              border: day.is_today ? `1px solid rgba(200,165,90,0.35)` : '1px solid rgba(255,255,255,0.06)',
            }}>
            {day.day_number}
          </div>
          <div className="text-left">
            <div className="text-sm font-medium" style={{ color: day.is_today ? GOLD_LIGHT : '#bbb' }}>
              {day.is_today ? '今天' : dateLabel}
              {!day.is_today && <span className="ml-2 text-xs" style={{ color: '#555' }}>{dateLabel}</span>}
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#555' }}>
              {day.knowledge_points.length > 0 && `${day.knowledge_points.length} 个知识点`}
              {day.knowledge_points.length > 0 && day.papers.length > 0 && ' · '}
              {day.papers.length > 0 && `${day.papers.length} 套试卷`}
              {!hasItems && '休息日'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allDone && <CheckCircle2 size={14} style={{ color: '#4ade80' }} />}
          {open ? <ChevronDown size={14} style={{ color: '#444' }} /> : <ChevronRight size={14} style={{ color: '#444' }} />}
        </div>
      </button>

      {open && hasItems && (
        <div className="mt-3 space-y-1 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {day.knowledge_points.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1 px-3">
                <BookOpen size={11} style={{ color: '#87B6FF' }} />
                <span className="text-xs font-medium" style={{ color: '#87B6FF' }}>知识点</span>
              </div>
              {day.knowledge_points.map(kp => (
                <CheckItem
                  key={kp.id}
                  id={kp.id}
                  label={kp.title}
                  topic={kp.topic}
                  done={kp.done}
                  onToggle={onToggleKP}
                  color="#87B6FF"
                />
              ))}
            </div>
          )}
          {day.papers.length > 0 && (
            <div className={day.knowledge_points.length > 0 ? 'mt-3' : ''}>
              <div className="flex items-center gap-1.5 mb-1 px-3">
                <FileText size={11} style={{ color: '#F4A261' }} />
                <span className="text-xs font-medium" style={{ color: '#F4A261' }}>试卷</span>
              </div>
              {day.papers.map(paper => (
                <CheckItem
                  key={paper.id}
                  id={paper.id}
                  label={paper.title}
                  done={paper.done}
                  onToggle={onTogglePaper}
                  color="#F4A261"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── No blueprint placeholder ──────────────────────────────────────────────────

function NoBlueprintPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <CalendarDays size={40} style={{ color: '#333' }} />
      <div>
        <p className="text-base font-medium" style={{ color: '#555' }}>学习计划尚未配置</p>
        <p className="text-sm mt-1" style={{ color: '#444' }}>管理员尚未为此课程上传考试蓝图，请稍后再来</p>
      </div>
    </div>
  )
}

function NoExamDatePlaceholder({ stats }: { stats: PlannerPlan['stats'] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <StatPill label="知识点" done={stats.done_kp} total={stats.total_kp} color="#87B6FF" />
        <StatPill label="试卷" done={stats.done_paper} total={stats.total_paper} color="#F4A261" />
      </div>
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-3" style={cardStyle}>
        <CalendarDays size={32} style={{ color: '#444' }} />
        <p className="text-sm" style={{ color: '#555' }}>尚未设置考试日期，无法生成每日计划</p>
        <p className="text-xs" style={{ color: '#444' }}>请联系管理员在课程设置中添加考试日期</p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExamPlannerTab({ courseId }: { courseId: string }) {
  const [plan, setPlan] = useState<PlannerPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // optimistic: track in-flight toggles
  const pendingRef = useRef(new Set<string>())

  const loadPlan = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.planner.getPlan(courseId)
      setPlan(data)
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => { loadPlan() }, [loadPlan])

  const handleToggleKP = useCallback(async (kpId: string, done: boolean) => {
    const key = `kp:${kpId}`
    if (pendingRef.current.has(key)) return
    pendingRef.current.add(key)
    // Optimistic update
    setPlan(prev => {
      if (!prev) return prev
      return {
        ...prev,
        stats: {
          ...prev.stats,
          done_kp: done ? prev.stats.done_kp + 1 : prev.stats.done_kp - 1,
        },
        days: prev.days.map(day => ({
          ...day,
          knowledge_points: day.knowledge_points.map(kp =>
            kp.id === kpId ? { ...kp, done } : kp
          ),
        })),
      }
    })
    try {
      await api.planner.toggle(courseId, 'kp', kpId, done)
    } catch {
      // Revert on error
      setPlan(prev => {
        if (!prev) return prev
        return {
          ...prev,
          stats: {
            ...prev.stats,
            done_kp: done ? prev.stats.done_kp - 1 : prev.stats.done_kp + 1,
          },
          days: prev.days.map(day => ({
            ...day,
            knowledge_points: day.knowledge_points.map(kp =>
              kp.id === kpId ? { ...kp, done: !done } : kp
            ),
          })),
        }
      })
    } finally {
      pendingRef.current.delete(key)
    }
  }, [courseId])

  const handleTogglePaper = useCallback(async (paperId: string, done: boolean) => {
    const key = `paper:${paperId}`
    if (pendingRef.current.has(key)) return
    pendingRef.current.add(key)
    setPlan(prev => {
      if (!prev) return prev
      return {
        ...prev,
        stats: {
          ...prev.stats,
          done_paper: done ? prev.stats.done_paper + 1 : prev.stats.done_paper - 1,
        },
        days: prev.days.map(day => ({
          ...day,
          papers: day.papers.map(p =>
            p.id === paperId ? { ...p, done } : p
          ),
        })),
      }
    })
    try {
      await api.planner.toggle(courseId, 'paper', paperId, done)
    } catch {
      setPlan(prev => {
        if (!prev) return prev
        return {
          ...prev,
          stats: {
            ...prev.stats,
            done_paper: done ? prev.stats.done_paper - 1 : prev.stats.done_paper + 1,
          },
          days: prev.days.map(day => ({
            ...day,
            papers: day.papers.map(p =>
              p.id === paperId ? { ...p, done: !done } : p
            ),
          })),
        }
      })
    } finally {
      pendingRef.current.delete(key)
    }
  }, [courseId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" style={{ color: GOLD }} size={28} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm" style={{ color: '#ff8080' }}>
        <AlertCircle size={16} /> {error}
      </div>
    )
  }

  if (!plan || !plan.blueprint_exists) {
    return <NoBlueprintPlaceholder />
  }

  if (!plan.exam_date) {
    return <NoExamDatePlaceholder stats={plan.stats} />
  }

  const examDateLabel = new Date(plan.exam_date + 'T00:00:00').toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const kpPct = plan.stats.total_kp > 0 ? Math.round((plan.stats.done_kp / plan.stats.total_kp) * 100) : 0
  const paperPct = plan.stats.total_paper > 0 ? Math.round((plan.stats.done_paper / plan.stats.total_paper) * 100) : 0
  const allComplete = kpPct === 100 && paperPct === 100

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: GOLD_LIGHT }}>考试倒计时计划</h2>
          <p className="text-sm mt-0.5" style={{ color: '#666' }}>
            考试日期：{examDateLabel}
            {plan.remaining_days > 0 && (
              <span className="ml-2" style={{ color: GOLD }}>还有 {plan.remaining_days} 天</span>
            )}
          </p>
        </div>
        {allComplete && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>
            <Trophy size={14} /> 全部完成！
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <StatPill label="知识点" done={plan.stats.done_kp} total={plan.stats.total_kp} color="#87B6FF" />
        <StatPill label="试卷" done={plan.stats.done_paper} total={plan.stats.total_paper} color="#F4A261" />
      </div>

      {/* Day cards */}
      <div className="space-y-3">
        {plan.days.map(day => (
          <DayCard
            key={day.date}
            day={day}
            onToggleKP={handleToggleKP}
            onTogglePaper={handleTogglePaper}
            defaultOpen={day.is_today}
          />
        ))}
        {plan.days.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: '#555' }}>
            所有任务已完成，准备好迎接考试了！
          </div>
        )}
      </div>
    </div>
  )
}
