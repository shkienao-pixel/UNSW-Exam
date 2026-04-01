'use client'

import { useState, useEffect } from 'react'
import { useMistakes } from '@/lib/mistakes-store'
import type { StoredMistake, FlashcardMistake } from '@/lib/types'
import {
  AlertTriangle, BookOpen, CheckCircle, Trash2,
  Play, RotateCcw, Loader2, Layers3,
  ArrowLeft, BookMarked, MoreHorizontal, Pencil,
} from 'lucide-react'
import { api } from '@/lib/api'

type StatusFilter = 'active' | 'mastered' | 'all'
type NotebookId = 'past_exam' | 'mock' | 'flashcard'

// ── Notebook config ────────────────────────────────────────────────────────────

const NOTEBOOK_META: Record<NotebookId, {
  icon: string; name: string; desc: string; color: string; accentBg: string; accentBorder: string
}> = {
  past_exam: {
    icon: '📄',
    name: '真题错题',
    desc: '往年考题中答错的记录，可针对薄弱点反复练习',
    color: '#FFD700',
    accentBg: 'rgba(255,215,0,0.06)',
    accentBorder: 'rgba(255,215,0,0.18)',
  },
  mock: {
    icon: '🎯',
    name: '模拟题错题',
    desc: '模拟考试中的错误记录，还原真实考试压力',
    color: '#34D399',
    accentBg: 'rgba(52,211,153,0.06)',
    accentBorder: 'rgba(52,211,153,0.18)',
  },
  flashcard: {
    icon: '🎴',
    name: '闪卡笔记',
    desc: '闪卡训练中标记"没记住"的内容',
    color: '#A78BFA',
    accentBg: 'rgba(167,139,250,0.06)',
    accentBorder: 'rgba(167,139,250,0.18)',
  },
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function MistakesView({ courseId }: { courseId?: string }) {
  const { all, active, mastered, master, remove, loading } = useMistakes(courseId)
  const [fcMistakes, setFcMistakes] = useState<FlashcardMistake[]>([])
  const [view, setView] = useState<'list' | 'detail' | 'practice'>('list')
  const [activeNotebook, setActiveNotebook] = useState<NotebookId | null>(null)
  const [practiceSource, setPracticeSource] = useState<NotebookId | null>(null)

  // One-time migration notice
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

  // Counts per notebook
  const counts = {
    past_exam: {
      total: all.filter(m => m.source_type === 'past_exam').length,
      active: active.filter(m => m.source_type === 'past_exam').length,
    },
    mock: {
      total: all.filter(m => m.source_type === 'mock').length,
      active: active.filter(m => m.source_type === 'mock').length,
    },
    flashcard: {
      total: fcMistakes.length,
      active: fcMistakes.filter(m => m.mistake_status === 'active').length,
    },
  }

  // Practice list for the current notebook
  const practiceList = active.filter(m =>
    practiceSource === null || m.source_type === practiceSource
  )

  // ── Practice mode ──
  if (view === 'practice') {
    return (
      <PracticeMode
        mistakes={practiceList}
        onMaster={master}
        onExit={() => setView('detail')}
      />
    )
  }

  // ── Notebook detail ──
  if (view === 'detail' && activeNotebook) {
    const meta = NOTEBOOK_META[activeNotebook]
    return (
      <NotebookDetail
        notebookId={activeNotebook}
        meta={meta}
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

  // ── Notebook list ──
  return (
    <div className="space-y-5">
      {showMigrationNotice && (
        <div className="rounded-xl px-4 py-3 text-xs flex items-start justify-between gap-3"
          style={{ background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.2)', color: '#AAA' }}>
          <span>📦 错题本已升级为云端同步，历史本地记录已清理，下次答题后自动重新收录。</span>
          <button onClick={() => setShowMigrationNotice(false)} className="flex-shrink-0 opacity-40 hover:opacity-80">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BookMarked size={17} style={{ color: '#FFD700' }} />
            我的笔记本
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#444' }}>学习内容收纳与整理</p>
        </div>
        {/* Total active across all notebooks */}
        {(counts.past_exam.active + counts.mock.active + counts.flashcard.active) > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,68,68,0.08)', color: '#FF6666', border: '1px solid rgba(255,68,68,0.2)' }}>
            {counts.past_exam.active + counts.mock.active + counts.flashcard.active} 条待复习
          </span>
        )}
      </div>

      {/* Notebook cards */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={22} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(NOTEBOOK_META) as NotebookId[]).map(id => {
            const meta = NOTEBOOK_META[id]
            const cnt = counts[id]
            const hasContent = cnt.total > 0
            return (
              <button
                key={id}
                onClick={() => { setActiveNotebook(id); setView('detail') }}
                className="group relative rounded-2xl p-5 text-left transition-all duration-200"
                style={{
                  background: hasContent ? meta.accentBg : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${hasContent ? meta.accentBorder : 'rgba(255,255,255,0.06)'}`,
                  opacity: hasContent ? 1 : 0.5,
                }}
                onMouseEnter={e => {
                  if (!hasContent) return
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${meta.accentBorder}`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = ''
                  e.currentTarget.style.boxShadow = ''
                }}
              >
                {/* Active badge */}
                {cnt.active > 0 && (
                  <span className="absolute right-4 top-4 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                    style={{ background: 'rgba(255,68,68,0.85)', color: '#fff' }}>
                    {cnt.active}
                  </span>
                )}

                <div className="mb-3 text-2xl leading-none">{meta.icon}</div>
                <p className="text-sm font-semibold text-white mb-1">{meta.name}</p>
                <p className="text-xs leading-relaxed mb-4" style={{ color: '#555' }}>{meta.desc}</p>

                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: hasContent ? meta.color : '#333' }}>
                    {hasContent ? `${cnt.total} 条内容` : '暂无内容'}
                  </span>
                  <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: meta.color }}>
                    打开 →
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && counts.past_exam.total + counts.mock.total + counts.flashcard.total === 0 && (
        <div className="rounded-2xl text-center py-14"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: '#444' }}>
          <BookOpen size={40} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm text-white mb-1.5">笔记本还是空的</p>
          <p className="text-xs" style={{ color: '#444' }}>
            做真题、模拟题时答错的题目，以及闪卡标记"没记住"的内容，会自动收录到对应笔记本
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
  counts: { total: number; active: number }
  loading: boolean
  onMaster: (id: number) => void
  onRemove: (id: number) => void
  onFcMaster: (id: string) => void
  onFcRemove: (id: string) => void
  onBack: () => void
  onStartPractice: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')

  const isFlashcard = notebookId === 'flashcard'

  const filteredMistakes = isFlashcard ? [] : all.filter(m => {
    const matchSource = m.source_type === notebookId
    const matchStatus = statusFilter === 'all' || m.mistake_status === statusFilter
    return matchSource && matchStatus
  })

  const filteredFc = isFlashcard
    ? fcMistakes.filter(m => statusFilter === 'all' || m.mistake_status === statusFilter)
    : []

  const activeCount = isFlashcard ? counts.active : active.filter(m => m.source_type === notebookId).length

  const isEmpty = isFlashcard ? filteredFc.length === 0 : filteredMistakes.length === 0

  return (
    <div className="space-y-5">
      {/* Breadcrumb + back */}
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80"
        style={{ color: '#555' }}>
        <ArrowLeft size={13} /> 所有笔记本
      </button>

      {/* Notebook header */}
      <div className="rounded-2xl px-5 py-4 flex items-start justify-between gap-4"
        style={{ background: meta.accentBg, border: `1px solid ${meta.accentBorder}` }}>
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5">{meta.icon}</span>
          <div>
            <h2 className="text-base font-bold text-white">{meta.name}</h2>
            <p className="text-xs mt-0.5" style={{ color: '#555' }}>{meta.desc}</p>
            <div className="flex items-center gap-3 mt-2.5 text-xs">
              <span style={{ color: meta.color }}>{counts.total} 条内容</span>
              {activeCount > 0 && (
                <span style={{ color: '#FF6666' }}>{activeCount} 待复习</span>
              )}
              {mastered.filter(m => isFlashcard || m.source_type === notebookId).length > 0 && (
                <span style={{ color: '#22C55E' }}>
                  {isFlashcard
                    ? fcMistakes.filter(m => m.mistake_status === 'mastered').length
                    : mastered.filter(m => m.source_type === notebookId).length} 已掌握
                </span>
              )}
            </div>
          </div>
        </div>
        {activeCount > 0 && !isFlashcard && (
          <button onClick={onStartPractice}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold"
            style={{ background: meta.accentBg, color: meta.color, border: `1px solid ${meta.accentBorder}` }}>
            <Play size={12} /> 练习 ({activeCount})
          </button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-1 p-0.5 rounded-xl w-fit"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {(['active', 'mastered', 'all'] as StatusFilter[]).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: statusFilter === f ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: statusFilter === f ? '#DDD' : '#444',
              border: `1px solid ${statusFilter === f ? 'rgba(255,255,255,0.14)' : 'transparent'}`,
            }}>
            {f === 'active' ? '待复习' : f === 'mastered' ? '已掌握' : '全部'}
          </button>
        ))}
      </div>

      {/* Content list */}
      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={22} />
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl text-center py-14"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <BookOpen size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm text-white mb-1">
            {statusFilter === 'active' ? '🎉 没有待复习的内容！' : '暂无记录'}
          </p>
          {statusFilter === 'active' && (
            <p className="text-xs" style={{ color: '#444' }}>
              {isFlashcard ? '闪卡训练中点"✗ 没记住"会记录到这里' : '答错的题目会自动收录'}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Flashcard entries */}
          {isFlashcard && filteredFc.map(m => (
            <EntryCard
              key={m.id}
              type="flashcard"
              status={m.mistake_status}
              title={m.card_front}
              subtitle={`答案：${m.card_back}`}
              badge={m.card_type === 'vocab' ? '词汇卡' : '选择题'}
              badgeColor="#A78BFA"
              onMaster={() => onFcMaster(m.id)}
              onRemove={() => onFcRemove(m.id)}
            />
          ))}
          {/* Exam mistake entries */}
          {!isFlashcard && filteredMistakes.map(m => (
            <MistakeCard key={m.question_id} mistake={m} onMaster={onMaster} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Entry Card (generic notebook entry) ───────────────────────────────────────

function EntryCard({
  type, status, title, subtitle, badge, badgeColor, onMaster, onRemove,
}: {
  type: 'flashcard' | 'mistake'
  status: 'active' | 'mastered'
  title: string
  subtitle: string
  badge: string
  badgeColor: string
  onMaster: () => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl p-4 space-y-3 group"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: status === 'mastered'
          ? '1px solid rgba(34,197,94,0.18)'
          : '1px solid rgba(255,255,255,0.06)',
      }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: `${badgeColor}1a`, color: badgeColor, border: `1px solid ${badgeColor}40` }}>
          {badge}
        </span>
        {status === 'mastered' && (
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            ✓ 已掌握
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-white leading-relaxed">{title}</p>
      <p className="text-xs leading-relaxed" style={{ color: '#777' }}>{subtitle}</p>
      <div className="flex items-center gap-2 pt-0.5">
        {status === 'active' && (
          <button onClick={onMaster}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle size={11} /> 已掌握
          </button>
        )}
        <button onClick={onRemove}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-opacity opacity-0 group-hover:opacity-100"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Trash2 size={11} /> 删除
        </button>
      </div>
    </div>
  )
}

// ── Mistake Card (exam mistake entry) ─────────────────────────────────────────

function MistakeCard({
  mistake: m, onMaster, onRemove,
}: {
  mistake: StoredMistake
  onMaster: (id: number) => void
  onRemove: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl p-4 space-y-3 group"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: m.mistake_status === 'mastered'
          ? '1px solid rgba(34,197,94,0.18)'
          : '1px solid rgba(255,255,255,0.06)',
      }}>
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: m.source_type === 'mock' ? 'rgba(52,211,153,0.1)' : 'rgba(255,215,0,0.1)',
            color: m.source_type === 'mock' ? '#34D399' : '#FFD700',
            border: `1px solid ${m.source_type === 'mock' ? 'rgba(52,211,153,0.25)' : 'rgba(255,215,0,0.2)'}`,
          }}>
          {m.source_type === 'mock' ? '模拟题' : '真题'}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}>
          {m.question_type === 'mcq' ? '选择题' : '简答题'}
        </span>
        {m.mistake_status === 'mastered' && (
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            ✓ 已掌握
          </span>
        )}
        <span className="ml-auto text-xs" style={{ color: '#333' }}>
          {new Date(m.created_at).toLocaleDateString('zh-CN')}
        </span>
      </div>

      {/* Question */}
      <p className="text-sm text-white leading-relaxed">{m.question_text}</p>

      {/* MCQ options */}
      {m.options && m.question_type === 'mcq' && (
        <div className="space-y-1.5">
          {m.options.map((opt, j) => {
            const label = String.fromCharCode(65 + j)
            const isCorrect = label === m.correct_answer
            const isWrong = m.user_answer === label && !isCorrect
            return (
              <div key={j} className="px-3 py-2 rounded-lg text-xs"
                style={{
                  background: isCorrect ? 'rgba(34,197,94,0.08)' : isWrong ? 'rgba(255,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isCorrect ? '#22C55E33' : isWrong ? '#FF444425' : 'rgba(255,255,255,0.05)'}`,
                  color: isCorrect ? '#22C55E' : isWrong ? '#FF6666' : '#555',
                }}>
                <span style={{ fontWeight: isCorrect ? 600 : 400 }}>{label}. {opt}</span>
                {isCorrect && <span className="ml-2 opacity-50">← 正确</span>}
                {isWrong && <span className="ml-2 opacity-50">← 你的答案</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Short answer reference */}
      {m.question_type === 'short_answer' && m.correct_answer && (
        <div className="px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', color: '#22C55E' }}>
          参考答案：{m.correct_answer}
        </div>
      )}

      {/* Explanation */}
      {(m.feedback || m.explanation) && (
        <div>
          <button onClick={() => setExpanded(v => !v)}
            className="text-xs hover:opacity-100 transition-opacity"
            style={{ color: '#444', opacity: 0.7 }}>
            {expanded ? '▲ 收起解析' : '▼ 查看解析'}
          </button>
          {expanded && (
            <p className="mt-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,215,0,0.04)', color: '#888' }}>
              💡 {m.feedback || m.explanation}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        {m.mistake_status === 'active' && (
          <button onClick={() => onMaster(m.question_id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle size={11} /> 已掌握
          </button>
        )}
        <button onClick={() => onRemove(m.question_id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-opacity opacity-0 group-hover:opacity-100"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Trash2 size={11} /> 删除
        </button>
      </div>
    </div>
  )
}

// ── Practice Mode ──────────────────────────────────────────────────────────────

function PracticeMode({
  mistakes, onMaster, onExit,
}: {
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
          style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.28)' }}>
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
            style={{ background: 'rgba(255,255,255,0.05)', color: '#666', border: '1px solid rgba(255,255,255,0.1)' }}>
            <RotateCcw size={13} /> 重新练习
          </button>
          <button onClick={onExit}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.28)' }}>
            返回笔记本
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onExit} className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
          style={{ color: '#444' }}>
          <ArrowLeft size={12} /> 返回笔记本
        </button>
        <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${((idx + 1) / mistakes.length) * 100}%`, background: '#FFD700' }} />
        </div>
        <span className="text-xs" style={{ color: '#444' }}>{idx + 1}/{mistakes.length}</span>
        {correctDone > 0 && <span className="text-xs" style={{ color: '#22C55E' }}>✓ {correctDone}</span>}
      </div>

      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: m.source_type === 'mock' ? 'rgba(52,211,153,0.1)' : 'rgba(255,215,0,0.1)',
              color: m.source_type === 'mock' ? '#34D399' : '#FFD700',
            }}>
            {m.source_type === 'mock' ? '模拟题' : '真题'}
          </span>
          <span className="text-xs" style={{ color: '#555' }}>{isShortAnswer ? '简答题' : '选择题'}</span>
        </div>

        <p className="text-base font-semibold text-white leading-relaxed">{m.question_text}</p>

        {m.options && !isShortAnswer && (
          <div className="space-y-2">
            {m.options.map((opt, j) => {
              const label = String.fromCharCode(65 + j)
              const isChosen = chosenAnswer === label
              const isCorrect = label === m.correct_answer
              let bg = 'rgba(255,255,255,0.03)', border = 'rgba(255,255,255,0.07)', color = '#CCC'
              if (revealed) {
                if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = '#22C55E44'; color = '#22C55E' }
                else if (isChosen) { bg = 'rgba(255,68,68,0.08)'; border = '#FF444433'; color = '#FF6666' }
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
            style={{ background: 'rgba(255,215,0,0.08)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.22)' }}>
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
            style={{ background: 'rgba(255,68,68,0.08)', color: '#FF6666', border: '1px solid rgba(255,68,68,0.2)' }}>
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
            style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
            {isLastCard ? '完成 ✓' : '下一题 →'}
          </button>
        </div>
      )}
    </div>
  )
}
