'use client'

import { useState, useEffect } from 'react'
import { useMistakes } from '@/lib/mistakes-store'
import type { StoredMistake, FlashcardMistake } from '@/lib/types'
import {
  BookOpen, CheckCircle, Trash2,
  Play, RotateCcw, Loader2,
  ArrowLeft, BookMarked, ChevronDown, ChevronUp,
} from 'lucide-react'
import { api } from '@/lib/api'

type StatusFilter = 'active' | 'mastered' | 'all'
type NotebookId = 'past_exam' | 'mock' | 'flashcard'

// ── Notebook config ────────────────────────────────────────────────────────────

const NOTEBOOK_META: Record<NotebookId, {
  icon: string; name: string; desc: string
  color: string; accentBg: string; accentBorder: string
}> = {
  past_exam: {
    icon: '📄', name: '真题错题',
    desc: '往年考题中答错的记录，针对薄弱点反复练习',
    color: '#FFD700', accentBg: 'rgba(255,215,0,0.05)', accentBorder: 'rgba(255,215,0,0.15)',
  },
  mock: {
    icon: '🎯', name: '模拟题错题',
    desc: '模拟考试中的错误记录，还原真实考试压力',
    color: '#34D399', accentBg: 'rgba(52,211,153,0.05)', accentBorder: 'rgba(52,211,153,0.15)',
  },
  flashcard: {
    icon: '🎴', name: '闪卡笔记',
    desc: '闪卡训练中标记"没记住"的内容',
    color: '#A78BFA', accentBg: 'rgba(167,139,250,0.05)', accentBorder: 'rgba(167,139,250,0.15)',
  },
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function MistakesView({ courseId }: { courseId?: string }) {
  const { all, active, mastered, master, remove, loading } = useMistakes(courseId)
  const [fcMistakes, setFcMistakes] = useState<FlashcardMistake[]>([])
  const [view, setView] = useState<'list' | 'detail' | 'practice'>('list')
  const [activeNotebook, setActiveNotebook] = useState<NotebookId | null>(null)
  const [practiceSource, setPracticeSource] = useState<NotebookId | null>(null)

  const [showMigrationNotice, setShowMigrationNotice] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('exam_mistakes_v1')) {
      localStorage.removeItem('exam_mistakes_v1')
      setShowMigrationNotice(true)
    }
  }, [])

  useEffect(() => {
    if (!courseId) return
    api.flashcardMistakes.list(courseId).then(setFcMistakes).catch(() => {})
  }, [courseId])

  const counts = {
    past_exam: {
      total: all.filter(m => m.source_type === 'past_exam').length,
      active: active.filter(m => m.source_type === 'past_exam').length,
      mastered: mastered.filter(m => m.source_type === 'past_exam').length,
    },
    mock: {
      total: all.filter(m => m.source_type === 'mock').length,
      active: active.filter(m => m.source_type === 'mock').length,
      mastered: mastered.filter(m => m.source_type === 'mock').length,
    },
    flashcard: {
      total: fcMistakes.length,
      active: fcMistakes.filter(m => m.mistake_status === 'active').length,
      mastered: fcMistakes.filter(m => m.mistake_status === 'mastered').length,
    },
  }

  const practiceList = active.filter(m =>
    practiceSource === null || m.source_type === practiceSource
  )

  if (view === 'practice') {
    return (
      <PracticeMode
        mistakes={practiceList}
        onMaster={master}
        onExit={() => setView('detail')}
      />
    )
  }

  if (view === 'detail' && activeNotebook) {
    return (
      <NotebookDetail
        notebookId={activeNotebook}
        meta={NOTEBOOK_META[activeNotebook]}
        all={all}
        active={active}
        mastered={mastered}
        fcMistakes={fcMistakes}
        counts={counts[activeNotebook]}
        loading={loading}
        onMaster={master}
        onRemove={remove}
        onFcMaster={id => {
          api.flashcardMistakes.update(courseId!, id, 'mastered').catch(() => {})
          setFcMistakes(prev => prev.map(x => x.id === id ? { ...x, mistake_status: 'mastered' as const } : x))
        }}
        onFcRemove={id => {
          api.flashcardMistakes.delete(courseId!, id).catch(() => {})
          setFcMistakes(prev => prev.filter(x => x.id !== id))
        }}
        onBack={() => setView('list')}
        onStartPractice={() => {
          setPracticeSource(activeNotebook === 'flashcard' ? null : activeNotebook)
          setView('practice')
        }}
      />
    )
  }

  // ── Notebook list view ─────────────────────────────────────────────────────

  const totalActive = counts.past_exam.active + counts.mock.active + counts.flashcard.active
  const totalAll = counts.past_exam.total + counts.mock.total + counts.flashcard.total

  return (
    <div className="space-y-5">

      {showMigrationNotice && (
        <div className="rounded-xl px-4 py-3 text-xs flex items-start justify-between gap-3"
          style={{ background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.18)', color: '#999' }}>
          <span>📦 错题本已升级为云端同步，历史本地记录已清理，下次答题后自动重新收录。</span>
          <button onClick={() => setShowMigrationNotice(false)} className="flex-shrink-0 opacity-40 hover:opacity-80">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookMarked size={15} style={{ color: '#A78BFA' }} />
            <h2 className="text-base font-bold text-white">我的笔记本</h2>
            {totalActive > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(255,68,68,0.12)', color: '#FF8080', border: '1px solid rgba(255,68,68,0.2)' }}>
                {totalActive}
              </span>
            )}
          </div>
          <p className="text-[11px] mt-0.5 pl-5" style={{ color: '#333' }}>
            {totalAll > 0 ? `共 ${totalAll} 条记录` : '答题错误与闪卡标记会自动收录'}
          </p>
        </div>
      </div>

      {/* Notebook cards */}
      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="animate-spin" size={18} style={{ color: '#A78BFA' }} />
        </div>
      ) : (
        <div className="space-y-2">
          {(Object.keys(NOTEBOOK_META) as NotebookId[]).map(id => {
            const meta = NOTEBOOK_META[id]
            const cnt = counts[id]
            const hasContent = cnt.total > 0
            const pct = hasContent ? Math.round((cnt.mastered / cnt.total) * 100) : 0

            return (
              <button
                key={id}
                onClick={() => { setActiveNotebook(id); setView('detail') }}
                className="group w-full text-left rounded-2xl transition-all duration-150"
                style={{
                  background: hasContent ? meta.accentBg : 'rgba(255,255,255,0.015)',
                  border: `1px solid ${hasContent ? meta.accentBorder : 'rgba(255,255,255,0.05)'}`,
                  padding: '14px 16px',
                  opacity: hasContent ? 1 : 0.55,
                }}
                onMouseEnter={e => {
                  if (!hasContent) return
                  e.currentTarget.style.borderColor = meta.color + '40'
                  e.currentTarget.style.boxShadow = `0 4px 18px rgba(0,0,0,0.25), 0 0 0 1px ${meta.color}18`
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = hasContent ? meta.accentBorder : 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.boxShadow = ''
                  e.currentTarget.style.transform = ''
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Icon box */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{
                      background: hasContent ? meta.color + '12' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${hasContent ? meta.color + '28' : 'rgba(255,255,255,0.06)'}`,
                    }}>
                    {meta.icon}
                  </div>

                  {/* Text block */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold" style={{ color: hasContent ? '#e8e8f0' : '#2e2e3a' }}>
                        {meta.name}
                      </span>
                      {cnt.active > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-px rounded-full"
                          style={{ background: 'rgba(255,68,68,0.8)', color: '#fff' }}>
                          {cnt.active}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] truncate mb-2" style={{ color: '#333' }}>{meta.desc}</p>

                    {/* Progress */}
                    {hasContent ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: '#22C55E', opacity: 0.7 }} />
                        </div>
                        <span className="text-[10px] flex-shrink-0" style={{ color: '#333' }}>
                          {cnt.mastered}/{cnt.total} 已掌握
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px]" style={{ color: '#252530' }}>暂无内容</span>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="flex-shrink-0 transition-all duration-150 opacity-0 translate-x-0 group-hover:opacity-100 group-hover:translate-x-0.5"
                    style={{ color: meta.color, fontSize: 14 }}>
                    →
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && totalAll === 0 && (
        <div className="rounded-2xl text-center py-12"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <BookOpen size={30} className="mx-auto mb-3 opacity-[0.12]" />
          <p className="text-sm text-white mb-2">笔记本还是空的</p>
          <p className="text-[11px] px-8 leading-relaxed" style={{ color: '#2e2e3a' }}>
            做真题、模拟题时答错的题目，以及闪卡标记"没记住"的内容
            <br />会自动收录到对应笔记本
          </p>
        </div>
      )}
    </div>
  )
}

// ── Notebook Detail ────────────────────────────────────────────────────────────

function NotebookDetail({
  notebookId, meta, all, active, mastered, fcMistakes, counts, loading,
  onMaster, onRemove, onFcMaster, onFcRemove, onBack, onStartPractice,
}: {
  notebookId: NotebookId
  meta: typeof NOTEBOOK_META[NotebookId]
  all: StoredMistake[]
  active: StoredMistake[]
  mastered: StoredMistake[]
  fcMistakes: FlashcardMistake[]
  counts: { total: number; active: number; mastered: number }
  loading: boolean
  onMaster: (id: number) => void
  onRemove: (id: number) => void
  onFcMaster: (id: number) => void
  onFcRemove: (id: number) => void
  onBack: () => void
  onStartPractice: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const isFlashcard = notebookId === 'flashcard'

  const filteredMistakes = isFlashcard ? [] : all.filter(m => {
    return m.source_type === notebookId &&
      (statusFilter === 'all' || m.mistake_status === statusFilter)
  })

  const filteredFc = isFlashcard
    ? fcMistakes.filter(m => statusFilter === 'all' || m.mistake_status === statusFilter)
    : []

  const activeCount = isFlashcard
    ? counts.active
    : active.filter(m => m.source_type === notebookId).length

  const isEmpty = isFlashcard ? filteredFc.length === 0 : filteredMistakes.length === 0
  const pct = counts.total > 0 ? Math.round((counts.mastered / counts.total) * 100) : 0

  return (
    <div className="space-y-4">

      {/* ── Nav bar ── */}
      <div className="flex items-center gap-3 h-8">
        <button onClick={onBack}
          className="flex items-center gap-1 text-xs hover:opacity-70 transition-opacity flex-shrink-0"
          style={{ color: '#444' }}>
          <ArrowLeft size={12} /> 返回
        </button>
        <div className="w-px h-3.5" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <span className="text-sm leading-none">{meta.icon}</span>
        <span className="text-sm font-semibold text-white flex-1 min-w-0 truncate">{meta.name}</span>
        {activeCount > 0 && !isFlashcard && (
          <button onClick={onStartPractice}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: meta.color + '12', color: meta.color, border: `1px solid ${meta.color}32` }}>
            <Play size={11} /> 练习 ({activeCount})
          </button>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div className="rounded-xl px-4 py-3"
        style={{ background: meta.accentBg, border: `1px solid ${meta.accentBorder}` }}>
        <div className="flex items-center gap-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5 text-[11px]">
              <span style={{ color: meta.color }} className="font-medium">{counts.total} 条内容</span>
              <span style={{ color: '#333' }}>{pct}% 已掌握</span>
            </div>
            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: '#22C55E', opacity: 0.75 }} />
            </div>
          </div>
          <div className="flex gap-4 text-[11px] flex-shrink-0">
            <div className="text-center">
              <div className="font-semibold" style={{ color: '#FF8080' }}>{counts.active}</div>
              <div style={{ color: '#333' }}>待复习</div>
            </div>
            <div className="text-center">
              <div className="font-semibold" style={{ color: '#22C55E' }}>{counts.mastered}</div>
              <div style={{ color: '#333' }}>已掌握</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status filter ── */}
      <div className="flex gap-0.5 p-0.5 rounded-xl w-fit"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {(['active', 'mastered', 'all'] as StatusFilter[]).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className="px-3 py-1.5 rounded-[10px] text-xs transition-all"
            style={{
              background: statusFilter === f ? meta.color + '16' : 'transparent',
              color: statusFilter === f ? meta.color : '#444',
              border: statusFilter === f ? `1px solid ${meta.color}30` : '1px solid transparent',
              fontWeight: statusFilter === f ? 600 : 400,
            }}>
            {f === 'active' ? '待复习' : f === 'mastered' ? '已掌握' : '全部'}
          </button>
        ))}
      </div>

      {/* ── Content list ── */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin" size={18} style={{ color: meta.color }} />
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl text-center py-10"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <BookOpen size={26} className="mx-auto mb-2.5 opacity-[0.12]" />
          <p className="text-xs" style={{ color: '#333' }}>
            {statusFilter === 'active' ? '🎉 没有待复习的内容' : '暂无记录'}
          </p>
          {statusFilter === 'active' && (
            <p className="text-[10px] mt-1" style={{ color: '#252530' }}>
              {isFlashcard ? '闪卡训练中点"✗ 没记住"会记录到这里' : '答错的题目会自动收录'}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {isFlashcard && filteredFc.map(m => (
            <EntryCard key={m.id}
              status={m.mistake_status}
              title={m.card_front}
              subtitle={`答案：${m.card_back}`}
              badge={m.card_type === 'vocab' ? '词汇卡' : '选择题'}
              badgeColor="#A78BFA"
              onMaster={() => onFcMaster(m.id)}
              onRemove={() => onFcRemove(m.id)} />
          ))}
          {!isFlashcard && filteredMistakes.map(m => (
            <MistakeCard key={m.question_id} mistake={m} onMaster={onMaster} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Entry Card (flashcard mistake) ────────────────────────────────────────────

function EntryCard({ status, title, subtitle, badge, badgeColor, onMaster, onRemove }: {
  status: 'active' | 'mastered'
  title: string; subtitle: string; badge: string; badgeColor: string
  onMaster: () => void; onRemove: () => void
}) {
  return (
    <div className="group rounded-xl px-4 py-3 flex items-start gap-3 transition-colors"
      style={{
        background: status === 'mastered' ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.025)',
        border: status === 'mastered' ? '1px solid rgba(34,197,94,0.14)' : '1px solid rgba(255,255,255,0.06)',
      }}>
      <div className="flex-shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full"
        style={{ background: status === 'mastered' ? '#22C55E' : badgeColor }} />

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] px-1.5 py-px rounded-full font-medium"
            style={{ background: badgeColor + '18', color: badgeColor, border: `1px solid ${badgeColor}35` }}>
            {badge}
          </span>
          {status === 'mastered' && (
            <span className="text-[10px] px-1.5 py-px rounded-full"
              style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E' }}>✓ 已掌握</span>
          )}
        </div>
        <p className="text-xs font-medium text-white leading-relaxed line-clamp-2">{title}</p>
        <p className="text-[11px] leading-relaxed" style={{ color: '#555' }}>{subtitle}</p>
      </div>

      <div className="flex-shrink-0 flex flex-col gap-1.5 items-end pt-0.5">
        {status === 'active' && (
          <button onClick={onMaster}
            className="text-[10px] px-2 py-1 rounded-lg whitespace-nowrap"
            style={{ background: 'rgba(34,197,94,0.07)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.18)' }}>
            ✓ 已掌握
          </button>
        )}
        <button onClick={onRemove}
          className="text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.06)' }}>
          删除
        </button>
      </div>
    </div>
  )
}

// ── Mistake Card ──────────────────────────────────────────────────────────────

function MistakeCard({ mistake: m, onMaster, onRemove }: {
  mistake: StoredMistake
  onMaster: (id: number) => void
  onRemove: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isMastered = m.mistake_status === 'mastered'
  const sourceColor = m.source_type === 'mock' ? '#34D399' : '#FFD700'
  const sourceBg = m.source_type === 'mock' ? 'rgba(52,211,153,0.08)' : 'rgba(255,215,0,0.08)'
  const sourceBorder = m.source_type === 'mock' ? 'rgba(52,211,153,0.18)' : 'rgba(255,215,0,0.18)'
  const hasDetails = !!(m.options || m.feedback || m.explanation)

  return (
    <div className="group rounded-xl overflow-hidden transition-colors"
      style={{
        background: isMastered ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.025)',
        border: isMastered ? '1px solid rgba(34,197,94,0.14)' : '1px solid rgba(255,255,255,0.06)',
      }}>

      {/* Main row */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full"
          style={{ background: isMastered ? '#22C55E' : sourceColor }} />

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] px-1.5 py-px rounded-full font-medium"
              style={{ background: sourceBg, color: sourceColor, border: `1px solid ${sourceBorder}` }}>
              {m.source_type === 'mock' ? '模拟题' : '真题'}
            </span>
            <span className="text-[10px] px-1.5 py-px rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#444', border: '1px solid rgba(255,255,255,0.07)' }}>
              {m.question_type === 'mcq' ? '选择题' : '简答题'}
            </span>
            {isMastered && (
              <span className="text-[10px] px-1.5 py-px rounded-full"
                style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E' }}>✓ 已掌握</span>
            )}
            <span className="ml-auto text-[10px]" style={{ color: '#252530' }}>
              {new Date(m.created_at).toLocaleDateString('zh-CN')}
            </span>
          </div>

          <p className="text-xs text-white leading-relaxed line-clamp-2">{m.question_text}</p>

          {/* Collapsed answer preview */}
          {!expanded && m.question_type === 'mcq' && m.correct_answer && (
            <p className="text-[10px]" style={{ color: '#22C55E' }}>
              正确：{m.correct_answer}
              {m.user_answer && m.user_answer !== m.correct_answer && (
                <span style={{ color: '#FF8080' }}> · 你选了 {m.user_answer}</span>
              )}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 flex flex-col gap-1.5 items-end pt-0.5">
          {!isMastered && (
            <button onClick={() => onMaster(m.question_id)}
              className="text-[10px] px-2 py-1 rounded-lg whitespace-nowrap"
              style={{ background: 'rgba(34,197,94,0.07)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.18)' }}>
              ✓ 已掌握
            </button>
          )}
          <button onClick={() => onRemove(m.question_id)}
            className="text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.06)' }}>
            删除
          </button>
        </div>
      </div>

      {/* Expand toggle */}
      {hasDetails && (
        <>
          <button onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] hover:opacity-70 transition-opacity"
            style={{ color: '#2e2e3a', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            {expanded ? <><ChevronUp size={10} />收起</> : <><ChevronDown size={10} />展开详情</>}
          </button>

          {expanded && (
            <div className="px-4 pb-3 space-y-2 pt-2"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              {m.options && m.question_type === 'mcq' && (
                <div className="space-y-1">
                  {m.options.map((opt, j) => {
                    const label = String.fromCharCode(65 + j)
                    const isCorrect = label === m.correct_answer
                    const isWrong = m.user_answer === label && !isCorrect
                    return (
                      <div key={j} className="px-3 py-1.5 rounded-lg text-[11px] flex items-start gap-1.5"
                        style={{
                          background: isCorrect ? 'rgba(34,197,94,0.08)' : isWrong ? 'rgba(255,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.2)' : isWrong ? 'rgba(255,68,68,0.14)' : 'rgba(255,255,255,0.04)'}`,
                          color: isCorrect ? '#22C55E' : isWrong ? '#FF8080' : '#555',
                        }}>
                        <span style={{ flexShrink: 0, fontWeight: 600 }}>{label}.</span>
                        <span className="flex-1">{opt}</span>
                        {isCorrect && <span className="opacity-40 flex-shrink-0">← 正确</span>}
                        {isWrong && <span className="opacity-40 flex-shrink-0">← 你选的</span>}
                      </div>
                    )
                  })}
                </div>
              )}
              {m.question_type === 'short_answer' && m.correct_answer && (
                <div className="px-3 py-2 rounded-lg text-[11px]"
                  style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.14)', color: '#22C55E' }}>
                  参考答案：{m.correct_answer}
                </div>
              )}
              {(m.feedback || m.explanation) && (
                <div className="px-3 py-2 rounded-lg text-[11px]"
                  style={{ background: 'rgba(255,215,0,0.04)', color: '#666', border: '1px solid rgba(255,215,0,0.08)' }}>
                  💡 {m.feedback || m.explanation}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Practice Mode ──────────────────────────────────────────────────────────────

function PracticeMode({ mistakes, onMaster, onExit }: {
  mistakes: StoredMistake[]
  onMaster: (id: number) => void
  onExit: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [chosenAnswer, setChosenAnswer] = useState<string | null>(null)
  const [session, setSession] = useState<Record<number, 'correct' | 'wrong'>>({})

  if (mistakes.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-white">🎉 没有待复习的错题！</p>
        <button onClick={onExit}
          className="px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
          返回笔记本
        </button>
      </div>
    )
  }

  const m = mistakes[idx]
  const isShortAnswer = m.question_type === 'short_answer'
  const totalDone = Object.keys(session).length
  const correctDone = Object.values(session).filter(v => v === 'correct').length
  const isLastCard = idx === mistakes.length - 1
  const isSessionDone = totalDone === mistakes.length

  function advance() {
    setRevealed(false); setChosenAnswer(null)
    if (!isLastCard) setIdx(i => i + 1)
  }

  function handleMCQAnswer(label: string) {
    if (chosenAnswer !== null) return
    setChosenAnswer(label); setRevealed(true)
    const isCorrect = label === m.correct_answer
    setSession(prev => ({ ...prev, [m.question_id]: isCorrect ? 'correct' : 'wrong' }))
    if (isCorrect) onMaster(m.question_id)
  }

  function handleShortAnswerResult(correct: boolean) {
    setSession(prev => ({ ...prev, [m.question_id]: correct ? 'correct' : 'wrong' }))
    if (correct) onMaster(m.question_id)
    advance()
  }

  if (isSessionDone) {
    return (
      <div className="rounded-2xl p-10 text-center space-y-4"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,215,0,0.15)' }}>
        <p className="text-5xl font-bold" style={{ color: '#FFD700' }}>{correctDone}/{mistakes.length}</p>
        <p className="text-lg text-white font-semibold">练习完成！</p>
        <p className="text-sm" style={{ color: correctDone === mistakes.length ? '#22C55E' : '#888' }}>
          {correctDone === mistakes.length
            ? '🎉 全部掌握，太厉害了！'
            : `✅ 掌握 ${correctDone} 题 · 还需复习 ${mistakes.length - correctDone} 题`}
        </p>
        <div className="flex gap-3 justify-center pt-3">
          <button onClick={() => { setIdx(0); setRevealed(false); setChosenAnswer(null); setSession({}) }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#555', border: '1px solid rgba(255,255,255,0.1)' }}>
            <RotateCcw size={13} /> 重新练习
          </button>
          <button onClick={onExit}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
            返回笔记本
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <button onClick={onExit}
          className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity flex-shrink-0"
          style={{ color: '#444' }}>
          <ArrowLeft size={12} /> 返回笔记本
        </button>
        <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${((idx + 1) / mistakes.length) * 100}%`, background: '#FFD700' }} />
        </div>
        <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>{idx + 1}/{mistakes.length}</span>
        {correctDone > 0 && <span className="text-xs flex-shrink-0" style={{ color: '#22C55E' }}>✓ {correctDone}</span>}
      </div>

      {/* Question card */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-px rounded-full font-medium"
            style={{
              background: m.source_type === 'mock' ? 'rgba(52,211,153,0.1)' : 'rgba(255,215,0,0.1)',
              color: m.source_type === 'mock' ? '#34D399' : '#FFD700',
            }}>
            {m.source_type === 'mock' ? '模拟题' : '真题'}
          </span>
          <span className="text-[10px]" style={{ color: '#444' }}>{isShortAnswer ? '简答题' : '选择题'}</span>
        </div>

        <p className="text-sm font-semibold text-white leading-relaxed">{m.question_text}</p>

        {m.options && !isShortAnswer && (
          <div className="space-y-2">
            {m.options.map((opt, j) => {
              const label = String.fromCharCode(65 + j)
              const isChosen = chosenAnswer === label
              const isCorrect = label === m.correct_answer
              let bg = 'rgba(255,255,255,0.03)', border = 'rgba(255,255,255,0.07)', color = '#CCC'
              if (revealed) {
                if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = '#22C55E44'; color = '#22C55E' }
                else if (isChosen) { bg = 'rgba(255,68,68,0.08)'; border = '#FF444433'; color = '#FF8080' }
              }
              return (
                <button key={j} onClick={() => handleMCQAnswer(label)}
                  disabled={chosenAnswer !== null}
                  className="w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all disabled:cursor-default"
                  style={{ background: bg, border: `1px solid ${border}`, color }}>
                  <span style={{ color: '#FFD700', marginRight: 6 }}>{label}.</span>{opt}
                </button>
              )
            })}
          </div>
        )}

        {isShortAnswer && !revealed && (
          <button onClick={() => setRevealed(true)}
            className="w-full py-3 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,215,0,0.08)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
            查看参考答案
          </button>
        )}
        {isShortAnswer && revealed && m.correct_answer && (
          <div className="px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)', color: '#22C55E' }}>
            {m.correct_answer}
          </div>
        )}

        {revealed && (m.feedback || m.explanation) && (
          <p className="text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,215,0,0.04)', color: '#888' }}>
            💡 {m.feedback || m.explanation}
          </p>
        )}
      </div>

      {isShortAnswer && revealed && (
        <div className="flex gap-3 justify-center">
          <button onClick={() => handleShortAnswerResult(false)}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,68,68,0.08)', color: '#FF8080', border: '1px solid rgba(255,68,68,0.18)' }}>
            ✗ 还没记住
          </button>
          <button onClick={() => handleShortAnswerResult(true)}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            ✓ 已掌握
          </button>
        </div>
      )}

      {!isShortAnswer && revealed && (
        <div className="flex justify-end">
          <button onClick={advance}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.22)' }}>
            {isLastCard ? '完成 ✓' : '下一题 →'}
          </button>
        </div>
      )}
    </div>
  )
}
