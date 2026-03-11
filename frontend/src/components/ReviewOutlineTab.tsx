'use client'

/**
 * ReviewOutlineTab
 *
 * Upgrades the "课程大纲 Outline" into a full review plan:
 *  - Top bar: review start date + exam datetime + live countdown (per second)
 *  - Outline tree: parsed from stored markdown, with done checkbox + priority + estimate
 *  - Right panel: node detail with quick-jump links
 *  - Progress panel: total + per-group progress bars
 *  - Today's plan: auto-generated recommended node list
 */

import React, {
  useEffect, useState, useCallback, useMemo, useRef, memo,
} from 'react'
import { api } from '@/lib/api'
import { useLang } from '@/lib/i18n'
import type {
  ReviewSettings, ReviewNodeProgress, ReviewNodeUpdate,
  ReviewPriority, ReviewStatus, OutlineNodeData, TodayPlanResult,
} from '@/lib/types'
import {
  Loader2, ChevronDown, ChevronRight, CheckSquare, Square,
  Clock, Target, BarChart2, RefreshCw, AlertCircle, BookOpen,
  Zap, MessageSquare, PlayCircle, ListTree,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

// ── Outline parser ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60)
}

export function parseOutlineMarkdown(markdown: string): OutlineNodeData[] {
  const lines = markdown.split('\n')
  const flat: OutlineNodeData[] = []
  const stack: OutlineNodeData[] = []   // tracks current ancestry

  for (const raw of lines) {
    const line = raw.trimEnd()

    // Headings: ## → level 1, ### → level 2
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    // Bullets: - → determine level by indent
    const bullet = line.match(/^(\s*)- (.+)/)

    let title = ''
    let level = 0

    if (h2) { title = h2[1].trim(); level = 1 }
    else if (h3) { title = h3[1].trim(); level = 2 }
    else if (bullet) {
      title = bullet[2].trim()
      const indent = bullet[1].length
      level = indent === 0 ? 2 : 3
    }

    if (!title || !level) continue

    // Clean markdown emphasis from title
    title = title.replace(/\*\*(.*?)\*\*/g, '$1').replace(/⭐/g, '').trim()
    if (!title) continue

    const id = `${slugify(title)}_${flat.length}`
    const node: OutlineNodeData = { id, title, level, parent_id: null, children: [] }

    // Find parent: last node in stack with level < current
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop()
    }
    if (stack.length > 0) {
      node.parent_id = stack[stack.length - 1].id
    }

    flat.push(node)
    stack.push(node)
  }

  // Build tree
  const map = new Map(flat.map(n => [n.id, n]))
  flat.forEach(n => {
    if (n.parent_id) {
      const parent = map.get(n.parent_id)
      if (parent) parent.children.push(n)
    }
  })

  return flat.filter(n => n.level === 1)
}

export function flattenTree(roots: OutlineNodeData[]): OutlineNodeData[] {
  const result: OutlineNodeData[] = []
  function walk(nodes: OutlineNodeData[]) {
    for (const n of nodes) {
      result.push(n)
      walk(n.children)
    }
  }
  walk(roots)
  return result
}

// ── Countdown hook ─────────────────────────────────────────────────────────────

function useCountdown(examAt: string | null) {
  const [diff, setDiff] = useState<number | null>(null)

  useEffect(() => {
    if (!examAt) { setDiff(null); return }
    const target = new Date(examAt).getTime()

    function tick() {
      const d = Math.max(0, target - Date.now())
      setDiff(d)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [examAt])

  if (diff === null) return null
  if (diff === 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }

  const totalSecs = Math.floor(diff / 1000)
  return {
    days:    Math.floor(totalSecs / 86400),
    hours:   Math.floor((totalSecs % 86400) / 3600),
    minutes: Math.floor((totalSecs % 3600) / 60),
    seconds: totalSecs % 60,
    expired: false,
  }
}

// ── ReviewPlanBar ──────────────────────────────────────────────────────────────

interface ReviewPlanBarProps {
  courseId: string
  settings: ReviewSettings
  onSettingsSaved: (s: ReviewSettings) => void
}

function ReviewPlanBar({ courseId, settings, onSettingsSaved }: ReviewPlanBarProps) {
  const [startDate, setStartDate] = useState(
    settings.review_start_at ? settings.review_start_at.slice(0, 10) : ''
  )
  const [examDateTime, setExamDateTime] = useState(
    settings.exam_at ? settings.exam_at.slice(0, 16) : ''
  )
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const countdown = useCountdown(settings.exam_at)

  const triggerSave = useCallback((start: string, exam: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const saved = await api.review.saveSettings(
          courseId,
          start ? new Date(start).toISOString() : null,
          exam  ? new Date(exam).toISOString()  : null,
        )
        onSettingsSaved(saved)
        setToast('已保存')
        setTimeout(() => setToast(null), 2000)
      } catch {
        setToast('保存失败')
        setTimeout(() => setToast(null), 3000)
      } finally {
        setSaving(false)
      }
    }, 800)
  }, [courseId, onSettingsSaved])

  function handleStart(v: string) {
    setStartDate(v)
    triggerSave(v, examDateTime)
  }

  function handleExam(v: string) {
    setExamDateTime(v)
    triggerSave(startDate, v)
  }

  // Compute total cycle days
  const totalDays = useMemo(() => {
    if (!startDate || !examDateTime) return null
    const d = Math.ceil((new Date(examDateTime).getTime() - new Date(startDate).getTime()) / 86400000)
    return d > 0 ? d : null
  }, [startDate, examDateTime])

  return (
    <div className="glass rounded-xl p-4 mb-4"
      style={{ border: '1px solid rgba(255,215,0,0.12)', background: 'rgba(255,215,0,0.03)' }}>
      <div className="flex flex-wrap items-center gap-4">
        {/* Date inputs */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: '#666' }}>开始</span>
          <input type="date" value={startDate}
            onChange={e => handleStart(e.target.value)}
            className="rounded-lg px-2 py-1 text-xs border outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#CCC',
              borderColor: 'rgba(255,255,255,0.08)' }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: '#666' }}>考试</span>
          <input type="datetime-local" value={examDateTime}
            onChange={e => handleExam(e.target.value)}
            className="rounded-lg px-2 py-1 text-xs border outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#CCC',
              borderColor: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* Countdown */}
        {countdown && !countdown.expired && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)' }}>
            <Clock size={13} style={{ color: '#FFD700' }} />
            <span className="text-xs font-mono font-bold" style={{ color: '#FFD700' }}>
              {countdown.days}天 {String(countdown.hours).padStart(2,'0')}:
              {String(countdown.minutes).padStart(2,'0')}:
              {String(countdown.seconds).padStart(2,'0')}
            </span>
          </div>
        )}
        {countdown?.expired && (
          <span className="text-xs px-2 py-1 rounded-lg"
            style={{ background: 'rgba(255,100,100,0.1)', color: '#FF6666', border: '1px solid rgba(255,100,100,0.2)' }}>
            已到考试时间
          </span>
        )}

        {/* Total days */}
        {totalDays && (
          <span className="text-xs" style={{ color: '#555' }}>共 {totalDays} 天复习周期</span>
        )}

        {/* Status */}
        <div className="ml-auto flex items-center gap-2">
          {saving && <Loader2 size={12} className="animate-spin" style={{ color: '#FFD700' }} />}
          {toast && (
            <span className="text-xs" style={{ color: toast === '已保存' ? '#4CAF50' : '#FF6666' }}>
              {toast}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── NodeCheckbox (memoized to avoid tree-wide re-render) ───────────────────────

interface NodeCheckboxProps {
  node: OutlineNodeData
  progress: ReviewNodeProgress | undefined
  isToday: boolean
  onToggleDone: (nodeId: string, newDone: boolean) => void
  onSelect: (node: OutlineNodeData) => void
  isSelected: boolean
}

const NodeRow = memo(function NodeRow({
  node, progress, isToday, onToggleDone, onSelect, isSelected,
}: NodeCheckboxProps) {
  const done = progress?.done ?? false
  const priority = progress?.priority ?? null
  const status = progress?.status ?? 'not_started'

  const priorityColor: Record<ReviewPriority, string> = {
    high:   '#FF6B6B',
    medium: '#FFD700',
    low:    '#4CAF50',
  }

  const statusDot: Record<ReviewStatus, string> = {
    not_started: '#444',
    learned:     '#4CAF50',
    review_due:  '#FFD700',
    mastered:    '#667eea',
  }

  const indentPx = (node.level - 1) * 20

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
      style={{
        marginLeft: indentPx,
        background: isSelected ? 'rgba(255,215,0,0.08)' : isToday ? 'rgba(255,215,0,0.04)' : 'transparent',
        borderLeft: isSelected ? '2px solid #FFD700' : isToday ? '2px solid rgba(255,215,0,0.3)' : '2px solid transparent',
        opacity: done ? 0.5 : 1,
      }}
      onClick={() => onSelect(node)}
    >
      {/* Done checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggleDone(node.id, !done) }}
        className="flex-shrink-0 transition-colors hover:opacity-80"
        title={done ? '标为未完成' : '标为已完成'}
      >
        {done
          ? <CheckSquare size={15} style={{ color: '#FFD700' }} />
          : <Square size={15} style={{ color: '#444' }} />}
      </button>

      {/* Status dot */}
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: statusDot[status] }} title={status} />

      {/* Title */}
      <span className="flex-1 text-sm leading-tight truncate"
        style={{
          color: done ? '#444' : isSelected ? '#FFD700' : node.level === 1 ? '#DDD' : '#AAA',
          fontWeight: node.level === 1 ? 600 : 400,
          textDecoration: done ? 'line-through' : 'none',
          fontSize: node.level === 1 ? '14px' : node.level === 2 ? '13px' : '12px',
        }}>
        {node.title}
      </span>

      {/* Today badge */}
      {isToday && !done && (
        <span className="text-xs px-1 rounded flex-shrink-0"
          style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', fontSize: 10 }}>
          今日
        </span>
      )}

      {/* Priority badge */}
      {priority && (
        <span className="text-xs px-1 rounded flex-shrink-0"
          style={{
            background: `${priorityColor[priority]}18`,
            color: priorityColor[priority],
            border: `1px solid ${priorityColor[priority]}30`,
            fontSize: 9,
          }}>
          {priority === 'high' ? '高' : priority === 'medium' ? '中' : '低'}
        </span>
      )}

      {/* Estimate */}
      {progress?.estimate_minutes && (
        <span className="text-xs flex-shrink-0" style={{ color: '#555', fontSize: 10 }}>
          {progress.estimate_minutes}min
        </span>
      )}
    </div>
  )
})

// ── NodeDetailPanel ────────────────────────────────────────────────────────────

interface NodeDetailPanelProps {
  node: OutlineNodeData
  progress: ReviewNodeProgress | undefined
  courseId: string
  onUpdate: (update: ReviewNodeUpdate) => void
  onClose: () => void
}

function NodeDetailPanel({ node, progress, courseId, onUpdate, onClose }: NodeDetailPanelProps) {
  const router = useRouter()
  const { lang } = useLang()
  const [estimateInput, setEstimateInput] = useState(
    String(progress?.estimate_minutes ?? '')
  )

  const statusLabels: Record<ReviewStatus, string> = {
    not_started: '未开始',
    learned:     '已学习',
    review_due:  '需复习',
    mastered:    '已掌握',
  }

  const nextReviewDays: Record<string, number> = {
    mastered:   7,
    learned:    3,
    review_due: 1,
  }

  function handleStatusChange(s: ReviewStatus) {
    const now = new Date().toISOString()
    const days = nextReviewDays[s]
    const nextReview = days
      ? new Date(Date.now() + days * 86400000).toISOString()
      : null

    onUpdate({
      node_id: node.id,
      status: s,
      last_reviewed_at: now,
      next_review_at: nextReview,
      done: s === 'mastered' ? true : undefined,
    })
  }

  function handlePriority(p: ReviewPriority | null) {
    onUpdate({ node_id: node.id, priority: p })
  }

  function handleEstimateBlur() {
    const v = parseInt(estimateInput)
    onUpdate({ node_id: node.id, estimate_minutes: isNaN(v) ? null : v })
  }

  function jumpTo(view: string) {
    router.push(`/courses/${courseId}?view=${view}`)
  }

  return (
    <div className="glass rounded-xl p-5 flex flex-col gap-4"
      style={{ border: '1px solid rgba(255,215,0,0.15)', minHeight: 200 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white leading-tight flex-1">{node.title}</h3>
        <button onClick={onClose} className="text-xs flex-shrink-0" style={{ color: '#555' }}>✕</button>
      </div>

      {/* Status picker */}
      <div>
        <p className="text-xs mb-1.5" style={{ color: '#555' }}>掌握状态</p>
        <div className="flex flex-wrap gap-1.5">
          {(['not_started', 'learned', 'review_due', 'mastered'] as ReviewStatus[]).map(s => (
            <button key={s}
              onClick={() => handleStatusChange(s)}
              className="px-2 py-1 rounded text-xs transition-all"
              style={{
                background: progress?.status === s ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.04)',
                color: progress?.status === s ? '#FFD700' : '#666',
                border: `1px solid ${progress?.status === s ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'}`,
              }}>
              {statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div>
        <p className="text-xs mb-1.5" style={{ color: '#555' }}>优先级</p>
        <div className="flex gap-1.5">
          {(['high', 'medium', 'low'] as ReviewPriority[]).map(p => {
            const colors = { high: '#FF6B6B', medium: '#FFD700', low: '#4CAF50' }
            const labels = { high: '高', medium: '中', low: '低' }
            const active = progress?.priority === p
            return (
              <button key={p}
                onClick={() => handlePriority(active ? null : p)}
                className="px-2 py-1 rounded text-xs transition-all"
                style={{
                  background: active ? `${colors[p]}18` : 'rgba(255,255,255,0.04)',
                  color: active ? colors[p] : '#666',
                  border: `1px solid ${active ? `${colors[p]}40` : 'rgba(255,255,255,0.06)'}`,
                }}>
                {labels[p]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Estimate minutes */}
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: '#555' }}>预计时间</span>
        <input
          type="number" min={1} max={300}
          value={estimateInput}
          onChange={e => setEstimateInput(e.target.value)}
          onBlur={handleEstimateBlur}
          placeholder="分钟"
          className="w-20 px-2 py-1 rounded text-xs border outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#CCC',
            borderColor: 'rgba(255,255,255,0.08)' }} />
        <span className="text-xs" style={{ color: '#555' }}>min</span>
      </div>

      {/* Quick jump */}
      <div>
        <p className="text-xs mb-1.5" style={{ color: '#555' }}>快捷跳转</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { icon: <Zap size={11} />,         label: '闪卡',     view: 'flashcards' },
            { icon: <Target size={11} />,       label: '模拟题',   view: 'quiz'       },
            { icon: <BookOpen size={11} />,     label: '摘要',     view: 'summary'    },
            { icon: <MessageSquare size={11} />, label: 'AI问答',  view: 'ask'        },
          ].map(({ icon, label, view }) => (
            <button key={view}
              onClick={() => jumpTo(view)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all hover:opacity-80"
              style={{ background: 'rgba(255,215,0,0.07)', color: '#FFD700',
                border: '1px solid rgba(255,215,0,0.15)' }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Next review */}
      {progress?.next_review_at && progress.status !== 'mastered' && (
        <p className="text-xs" style={{ color: '#555' }}>
          下次复习：{new Date(progress.next_review_at).toLocaleDateString('zh-CN')}
        </p>
      )}
    </div>
  )
}

// ── ProgressPanel ──────────────────────────────────────────────────────────────

function ProgressPanel({
  roots, progressMap, todayIds,
}: {
  roots: OutlineNodeData[]
  progressMap: Map<string, ReviewNodeProgress>
  todayIds: Set<string>
}) {
  const flat = useMemo(() => flattenTree(roots), [roots])
  const totalCount = flat.length
  const doneCount = flat.filter(n => progressMap.get(n.id)?.done).length

  const todayDone = Array.from(todayIds).filter(id => progressMap.get(id)?.done).length
  const todayTotal = todayIds.size

  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)

  return (
    <div className="glass rounded-xl p-4 mt-4"
      style={{ border: '1px solid rgba(255,215,0,0.08)' }}>
      {/* Overall */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: '#CCC' }}>总体进度</span>
        <span className="text-xs" style={{ color: '#FFD700' }}>{doneCount} / {totalCount} · {pct}%</span>
      </div>
      <div className="h-2 rounded-full mb-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#FFD700,#FFA000)' }} />
      </div>

      {/* Today plan */}
      {todayTotal > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs" style={{ color: '#777' }}>今日任务</span>
            <span className="text-xs" style={{ color: todayDone === todayTotal ? '#4CAF50' : '#FFD700' }}>
              {todayDone} / {todayTotal}
            </span>
          </div>
          <div className="h-1.5 rounded-full mb-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-1.5 rounded-full transition-all"
              style={{
                width: `${todayTotal === 0 ? 0 : Math.round(todayDone / todayTotal * 100)}%`,
                background: 'linear-gradient(90deg,#4CAF50,#66BB6A)',
              }} />
          </div>
        </>
      )}

      {/* Per root group */}
      <div className="space-y-2">
        {roots.map(root => {
          const groupFlat = flattenTree([root])
          const groupDone = groupFlat.filter(n => progressMap.get(n.id)?.done).length
          const groupTotal = groupFlat.length
          const groupPct = groupTotal === 0 ? 0 : Math.round(groupDone / groupTotal * 100)
          return (
            <div key={root.id}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs truncate" style={{ color: '#666', maxWidth: 200 }}>
                  {root.title.slice(0, 40)}
                </span>
                <span className="text-xs flex-shrink-0" style={{ color: '#555' }}>
                  {groupDone}/{groupTotal}
                </span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="h-1 rounded-full transition-all"
                  style={{
                    width: `${groupPct}%`,
                    background: groupPct === 100 ? '#4CAF50' : 'rgba(255,215,0,0.4)',
                  }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TodayPlanPanel ─────────────────────────────────────────────────────────────

function TodayPlanPanel({
  courseId, roots, progressMap, onTodayIdsChange,
}: {
  courseId: string
  roots: OutlineNodeData[]
  progressMap: Map<string, ReviewNodeProgress>
  onTodayIdsChange: (ids: Set<string>) => void
}) {
  const [result, setResult] = useState<TodayPlanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [todayIds, setTodayIds] = useState<Set<string>>(new Set())

  const flat = useMemo(() => flattenTree(roots), [roots])

  const fetchPlan = useCallback(async () => {
    if (flat.length === 0) return
    setLoading(true)
    try {
      const nodes = flat.map(n => {
        const p = progressMap.get(n.id)
        return {
          node_id: n.id,
          title: n.title,
          level: n.level,
          done: p?.done ?? false,
          priority: p?.priority ?? null,
          estimate_minutes: p?.estimate_minutes ?? null,
          status: p?.status ?? null,
        }
      })
      const r = await api.review.getTodayPlan(courseId, nodes)
      setResult(r)
      const ids = new Set(r.node_ids)
      setTodayIds(ids)
      onTodayIdsChange(ids)
    } catch {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }, [courseId, flat, progressMap, onTodayIdsChange])

  useEffect(() => { fetchPlan() }, [fetchPlan])

  const todayNodes = useMemo(
    () => flat.filter(n => todayIds.has(n.id)),
    [flat, todayIds],
  )

  if (!result && !loading) return null

  return (
    <div className="glass rounded-xl p-4 mt-3"
      style={{ border: '1px solid rgba(255,215,0,0.1)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target size={14} style={{ color: '#FFD700' }} />
          <span className="text-sm font-semibold" style={{ color: '#CCC' }}>今日任务</span>
          {result && (
            <span className="text-xs px-2 py-0.5 rounded"
              style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700' }}>
              剩余 {result.remaining_days} 天 · 建议完成 {result.target_count} 个
            </span>
          )}
        </div>
        <button onClick={fetchPlan} title="换一批"
          className="flex items-center gap-1 text-xs transition-opacity hover:opacity-80"
          style={{ color: '#555' }}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {loading ? '计算中' : '刷新'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 size={13} className="animate-spin" style={{ color: '#FFD700' }} />
          <span className="text-xs" style={{ color: '#555' }}>生成今日计划...</span>
        </div>
      ) : todayNodes.length === 0 ? (
        <p className="text-xs" style={{ color: '#555' }}>
          {result?.total_undone === 0 ? '🎉 所有节点已完成！' : '暂无推荐任务'}
        </p>
      ) : (
        <div className="space-y-1">
          {todayNodes.map(n => {
            const done = progressMap.get(n.id)?.done ?? false
            return (
              <div key={n.id} className="flex items-center gap-2 text-xs"
                style={{ color: done ? '#444' : '#888', textDecoration: done ? 'line-through' : 'none' }}>
                <span style={{ color: done ? '#4CAF50' : '#666' }}>{done ? '✓' : '○'}</span>
                {n.title}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── buildNodesFromContentJson ──────────────────────────────────────────────────

function buildNodesFromContentJson(json: {
  weeks?: { week: number; title: string; nodes: { id: string; title: string; level: number }[] }[]
}): OutlineNodeData[] {
  const roots: OutlineNodeData[] = []
  for (const w of json.weeks ?? []) {
    const weekNode: OutlineNodeData = {
      id: `week_${w.week}`,
      title: `Week ${w.week}: ${w.title}`,
      level: 1,
      parent_id: null,
      children: w.nodes.map(n => ({
        id: n.id,
        title: n.title,
        level: 2,
        parent_id: `week_${w.week}`,
        children: [],
      })),
    }
    roots.push(weekNode)
  }
  return roots
}

// ── Main ReviewOutlineTab ──────────────────────────────────────────────────────

interface Props {
  courseId: string
}

export default function ReviewOutlineTab({ courseId }: Props) {
  const { t } = useLang()

  // Outline data
  const [outlineLoading, setOutlineLoading] = useState(true)
  const [roots, setRoots]       = useState<OutlineNodeData[]>([])
  const [unlockStatus, setUnlockStatus] = useState<'loading' | 'not_published' | 'locked' | 'unlocked'>('loading')
  const [creditsRequired, setCreditsRequired] = useState(300)
  const [unlocking, setUnlocking] = useState(false)
  const flatNodes = useMemo(() => flattenTree(roots), [roots])

  // Review state
  const [settings, setSettings]       = useState<ReviewSettings>({ id: null, user_id: '', course_id: courseId, review_start_at: null, exam_at: null })
  const [progressList, setProgressList] = useState<ReviewNodeProgress[]>([])
  const [reviewLoading, setReviewLoading] = useState(true)

  const progressMap = useMemo(() => {
    return new Map(progressList.map(p => [p.node_id, p]))
  }, [progressList])

  // UI state
  const [collapsed, setCollapsed]     = useState<Set<string>>(new Set())
  const [selected, setSelected]       = useState<OutlineNodeData | null>(null)
  const [todayIds, setTodayIds]       = useState<Set<string>>(new Set())
  const [confirmCascade, setConfirmCascade] = useState<{ nodeId: string; newDone: boolean } | null>(null)

  // Pending updates (debounced flush)
  const pendingRef = useRef<Map<string, ReviewNodeUpdate>>(new Map())
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load outline & review data ─────────────────────────────────────────────
  useEffect(() => {
    let active = true
    setOutlineLoading(true)

    api.courseContent.status(courseId, 'outline').then(res => {
      if (!active) return
      setUnlockStatus(res.status)
      setCreditsRequired(res.credits_required)
      if (res.status === 'unlocked') {
        return api.courseContent.get(courseId, 'outline').then(data => {
          if (!active) return
          const json = data.content_json as { weeks?: { week: number; title: string; nodes: { id: string; title: string; level: number }[] }[] }
          setRoots(buildNodesFromContentJson(json))
        })
      }
    }).catch(() => {
      if (active) setUnlockStatus('not_published')
    }).finally(() => {
      if (active) setOutlineLoading(false)
    })

    Promise.allSettled([
      api.review.getSettings(courseId),
      api.review.getProgress(courseId),
    ]).then(([s, p]) => {
      if (!active) return
      if (s.status === 'fulfilled') setSettings(s.value)
      if (p.status === 'fulfilled') setProgressList(p.value)
      setReviewLoading(false)
    })

    return () => { active = false }
  }, [courseId])

  // ── Flush pending updates ──────────────────────────────────────────────────
  const flushUpdates = useCallback(() => {
    const updates = Array.from(pendingRef.current.values())
    if (updates.length === 0) return
    pendingRef.current.clear()
    api.review.saveProgress(courseId, updates).catch(() => {})
  }, [courseId])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(flushUpdates, 600)
  }, [flushUpdates])

  // ── Handle node update (local + debounced remote) ─────────────────────────
  const handleUpdate = useCallback((update: ReviewNodeUpdate) => {
    setProgressList(prev => {
      const existing = prev.find(p => p.node_id === update.node_id)
      if (existing) {
        return prev.map(p =>
          p.node_id === update.node_id ? { ...p, ...update } as ReviewNodeProgress : p
        )
      }
      return [...prev, {
        course_id: courseId,
        done: false,
        priority: null,
        estimate_minutes: null,
        status: 'not_started',
        last_reviewed_at: null,
        next_review_at: null,
        ...update,
      } as ReviewNodeProgress]
    })
    pendingRef.current.set(update.node_id, {
      ...(pendingRef.current.get(update.node_id) || {}),
      ...update,
    })
    scheduleFlush()
  }, [courseId, scheduleFlush])

  // ── Toggle done (with cascade confirmation) ───────────────────────────────
  const getAllDescendants = useCallback((nodeId: string): string[] => {
    const nodeMap = new Map(flatNodes.map(n => [n.id, n]))
    const result: string[] = []
    function walk(id: string) {
      for (const n of flatNodes) {
        if (n.parent_id === id) {
          result.push(n.id)
          walk(n.id)
        }
      }
    }
    walk(nodeId)
    return result
  }, [flatNodes])

  const handleToggleDone = useCallback((nodeId: string, newDone: boolean) => {
    const descendants = getAllDescendants(nodeId)
    if (descendants.length > 0 && newDone) {
      setConfirmCascade({ nodeId, newDone })
    } else {
      handleUpdate({ node_id: nodeId, done: newDone })
      // Auto-check parent if all siblings done
      const node = flatNodes.find(n => n.id === nodeId)
      if (node?.parent_id && newDone) {
        const parent = flatNodes.find(n => n.id === node.parent_id)
        if (parent) {
          const siblings = flatNodes.filter(n => n.parent_id === parent.id)
          const allDone = siblings.every(s =>
            s.id === nodeId ? newDone : (progressMap.get(s.id)?.done ?? false)
          )
          if (allDone) handleUpdate({ node_id: parent.id, done: true })
        }
      }
    }
  }, [getAllDescendants, handleUpdate, flatNodes, progressMap])

  function handleCascadeConfirm(cascade: boolean) {
    if (!confirmCascade) return
    const { nodeId, newDone } = confirmCascade
    handleUpdate({ node_id: nodeId, done: newDone })
    if (cascade) {
      getAllDescendants(nodeId).forEach(id => handleUpdate({ node_id: id, done: newDone }))
    }
    setConfirmCascade(null)
  }

  // ── Toggle collapse ────────────────────────────────────────────────────────
  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Render tree node ───────────────────────────────────────────────────────
  function renderNode(node: OutlineNodeData): React.ReactNode {
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(node.id)

    return (
      <div key={node.id}>
        <div className="flex items-center group">
          {/* Collapse toggle */}
          {hasChildren ? (
            <button
              onClick={() => toggleCollapse(node.id)}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: '#555' }}>
              {isCollapsed
                ? <ChevronRight size={12} />
                : <ChevronDown size={12} />}
            </button>
          ) : (
            <span className="w-5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <NodeRow
              node={node}
              progress={progressMap.get(node.id)}
              isToday={todayIds.has(node.id)}
              onToggleDone={handleToggleDone}
              onSelect={setSelected}
              isSelected={selected?.id === node.id}
            />
          </div>
        </div>
        {!isCollapsed && hasChildren && (
          <div>{node.children.map(renderNode)}</div>
        )}
      </div>
    )
  }

  // ── Unlock handler ─────────────────────────────────────────────────────────
  async function handleUnlock() {
    setUnlocking(true)
    try {
      await api.courseContent.unlock(courseId, 'outline')
      setUnlockStatus('unlocked')
      const data = await api.courseContent.get(courseId, 'outline')
      const json = data.content_json as Parameters<typeof buildNodesFromContentJson>[0]
      setRoots(buildNodesFromContentJson(json))
    } catch (e: unknown) {
      console.error(e)
    } finally {
      setUnlocking(false)
    }
  }

  // ── Gate: not_published / locked ──────────────────────────────────────────
  if (unlockStatus === 'not_published') return (
    <div className="text-center py-20 glass rounded-2xl">
      <ListTree size={52} className="mx-auto mb-4 opacity-20" style={{ color: '#A78BFA' }} />
      <p className="text-base font-medium text-white mb-2">复习大纲准备中</p>
      <p className="text-sm" style={{ color: '#555' }}>管理员正在整理，敬请期待</p>
    </div>
  )

  if (unlockStatus === 'locked') return (
    <div className="text-center py-20 glass rounded-2xl space-y-4">
      <ListTree size={52} className="mx-auto opacity-30" style={{ color: '#A78BFA' }} />
      <p className="text-xl font-bold text-white">复习大纲</p>
      <p className="text-sm" style={{ color: '#777' }}>按 Week 拆分的复习节点，支持打勾进度与考试规划</p>
      <button
        onClick={handleUnlock} disabled={unlocking}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
        style={{ background: 'rgba(167,139,250,0.15)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.3)' }}>
        {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
        {unlocking ? '解锁中...' : `解锁复习大纲 ${creditsRequired} ✦`}
      </button>
      <p className="text-xs" style={{ color: '#444' }}>一次解锁，永久可用</p>
    </div>
  )

  // ── Loading state ──────────────────────────────────────────────────────────
  if (outlineLoading || reviewLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={28} />
      </div>
    )
  }

  if (roots.length === 0) {
    return (
      <div className="text-center py-20">
        <BookOpen size={40} className="mx-auto mb-4" style={{ color: '#333' }} />
        <p className="text-lg" style={{ color: '#555' }}>暂无大纲</p>
        <p className="text-sm mt-1" style={{ color: '#444' }}>管理员尚未发布大纲内容</p>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* ── Left: outline tree + controls ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-0 overflow-y-auto min-h-0">
        {/* Review plan bar */}
        <ReviewPlanBar
          courseId={courseId}
          settings={settings}
          onSettingsSaved={setSettings}
        />

        {/* Outline header */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold text-white">复习大纲</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#555' }}>
              {flatNodes.filter(n => progressMap.get(n.id)?.done).length}/{flatNodes.length} 完成
            </span>
            <button
              onClick={() => setCollapsed(new Set())}
              className="text-xs transition-opacity hover:opacity-80"
              style={{ color: '#555' }}>
              全展开
            </button>
            <button
              onClick={() => setCollapsed(new Set(roots.map(r => r.id)))}
              className="text-xs transition-opacity hover:opacity-80"
              style={{ color: '#555' }}>
              全收起
            </button>
          </div>
        </div>

        {/* Tree */}
        <div className="glass rounded-xl"
          style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="p-2">
            {roots.map(renderNode)}
          </div>
        </div>

        {/* Today plan */}
        <TodayPlanPanel
          courseId={courseId}
          roots={roots}
          progressMap={progressMap}
          onTodayIdsChange={setTodayIds}
        />

        {/* Progress */}
        <ProgressPanel roots={roots} progressMap={progressMap} todayIds={todayIds} />
      </div>

      {/* ── Right: detail panel ── */}
      {selected && (
        <div className="w-72 flex-shrink-0">
          <NodeDetailPanel
            node={selected}
            progress={progressMap.get(selected.id)}
            courseId={courseId}
            onUpdate={handleUpdate}
            onClose={() => setSelected(null)}
          />
        </div>
      )}

      {/* ── Cascade confirm modal ── */}
      {confirmCascade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="glass rounded-2xl p-6 max-w-sm mx-4"
            style={{ border: '1px solid rgba(255,215,0,0.2)' }}>
            <p className="text-white text-sm font-semibold mb-2">级联操作</p>
            <p className="text-sm mb-4" style={{ color: '#888' }}>
              是否同时将所有子节点标记为
              {confirmCascade.newDone ? '已完成' : '未完成'}？
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => handleCascadeConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-sm transition-all hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#CCC' }}>
                仅父节点
              </button>
              <button
                onClick={() => handleCascadeConfirm(true)}
                className="px-3 py-1.5 rounded-lg text-sm transition-all hover:opacity-80"
                style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700',
                  border: '1px solid rgba(255,215,0,0.3)' }}>
                全部级联
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
