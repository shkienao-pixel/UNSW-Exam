'use client'

import { useState } from 'react'
import { useMistakesStore } from '@/lib/mistakes-store'
import type { StoredMistake, FlashcardMistake } from '@/lib/mistakes-store'
import { BookMarked, BookOpen, ChevronDown, ChevronUp, Loader2, Play, RotateCcw, ArrowLeft } from 'lucide-react'
import { GlowButton } from '@/components/GlowButton'
import PillNav from '@/components/PillNav/PillNav'

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = 'past_exam' | 'mock' | 'flashcard'
type StatusFilter = 'active' | 'mastered' | 'all'

const TABS: { id: TabId; icon: string; name: string; color: string }[] = [
  { id: 'past_exam', icon: '📄', name: '真题错题',  color: '#FFD700' },
  { id: 'mock',      icon: '🎯', name: '模拟题错题', color: '#34D399' },
  { id: 'flashcard', icon: '🎴', name: '闪卡错题',  color: '#A78BFA' },
]

// ── Main component ─────────────────────────────────────────────────────────────

export default function MistakesView({ courseId }: { courseId?: string }) {
  const store = useMistakesStore(courseId)
  const [tab, setTab] = useState<TabId>('past_exam')
  const [practicing, setPracticing] = useState(false)

  const currentTab = TABS.find(t => t.id === tab)!
  const examByType = (type: TabId) => store.examMistakes.filter(m => m.source_type === type)

  if (practicing && tab !== 'flashcard') {
    const list = examByType(tab).filter(m => m.mistake_status === 'active')
    return (
      <PracticeMode
        mistakes={list}
        color={currentTab.color}
        onMaster={store.masterExam}
        onExit={() => setPracticing(false)}
      />
    )
  }

  const totalActive =
    store.examMistakes.filter(m => m.mistake_status === 'active').length +
    store.fcMistakes.filter(m => m.mistake_status === 'active').length

  const pillNavItems = TABS.map(t => ({
    id: t.id,
    label: `${t.icon} ${t.name}`,
    badge: t.id === 'flashcard'
      ? store.fcMistakes.filter(m => m.mistake_status === 'active').length
      : examByType(t.id).filter(m => m.mistake_status === 'active').length,
  }))

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <BookMarked size={15} style={{ color: '#A78BFA' }} />
        <h2 className="text-base font-bold text-white">错题本</h2>
        {totalActive > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(255,68,68,0.12)', color: '#FF8080', border: '1px solid rgba(255,68,68,0.2)' }}>
            {totalActive}
          </span>
        )}
      </div>

      {/* Tabs — PillNav */}
      <PillNav
        items={pillNavItems}
        activeId={tab}
        onSelect={id => { setTab(id as TabId); setPracticing(false) }}
        baseColor="rgba(255,255,255,0.04)"
        pillColor="rgba(255,255,255,0.07)"
        pillTextColor="#666"
        hoveredPillTextColor={currentTab.color}
        activePillColor={currentTab.color + '1a'}
      />

      {/* Content */}
      {store.loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="animate-spin" size={18} style={{ color: currentTab.color }} />
        </div>
      ) : tab === 'flashcard' ? (
        <FlashcardList
          items={store.fcMistakes}
          color={currentTab.color}
          onMaster={store.masterFlashcard}
          onRemove={store.removeFlashcard}
        />
      ) : (
        <ExamMistakeList
          items={examByType(tab)}
          color={currentTab.color}
          onMaster={store.masterExam}
          onRemove={store.removeExam}
          onPractice={() => setPracticing(true)}
        />
      )}
    </div>
  )
}

// ── Exam mistake list ──────────────────────────────────────────────────────────

function ExamMistakeList({ items, color, onMaster, onRemove, onPractice }: {
  items: StoredMistake[]
  color: string
  onMaster: (id: number) => void
  onRemove: (id: number) => void
  onPractice: () => void
}) {
  const [filter, setFilter] = useState<StatusFilter>('active')
  const activeCount = items.filter(m => m.mistake_status === 'active').length
  const masteredCount = items.filter(m => m.mistake_status === 'mastered').length
  const visible = items.filter(m => filter === 'all' || m.mistake_status === filter)

  if (items.length === 0) return <EmptyState />

  return (
    <div className="space-y-3">
      {/* Stats + practice */}
      <div className="flex items-center justify-between">
        <StatsBar total={items.length} active={activeCount} mastered={masteredCount} color={color} />
        {activeCount > 0 && (
          <GlowButton onClick={onPractice}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
            style={{ background: color + '12', color, border: `1px solid ${color}32` }}>
            <Play size={11} /> 练习 ({activeCount})
          </GlowButton>
        )}
      </div>

      <FilterTabs value={filter} onChange={setFilter} color={color} />

      {visible.length === 0 ? (
        <EmptyFilter filter={filter} />
      ) : (
        <div className="space-y-2">
          {visible.map(m => (
            <ExamCard key={m.question_id} mistake={m} onMaster={onMaster} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Flashcard mistake list ─────────────────────────────────────────────────────

function FlashcardList({ items, color, onMaster, onRemove }: {
  items: FlashcardMistake[]
  color: string
  onMaster: (id: number) => void
  onRemove: (id: number) => void
}) {
  const [filter, setFilter] = useState<StatusFilter>('active')
  const activeCount = items.filter(m => m.mistake_status === 'active').length
  const masteredCount = items.filter(m => m.mistake_status === 'mastered').length
  const visible = items.filter(m => filter === 'all' || m.mistake_status === filter)

  if (items.length === 0) return <EmptyState hint="闪卡训练中点「✗ 没记住」会收录到这里" />

  return (
    <div className="space-y-3">
      <StatsBar total={items.length} active={activeCount} mastered={masteredCount} color={color} />
      <FilterTabs value={filter} onChange={setFilter} color={color} />

      {visible.length === 0 ? (
        <EmptyFilter filter={filter} />
      ) : (
        <div className="space-y-2">
          {visible.map(m => (
            <FlashcardCard key={m.id} item={m} color={color} onMaster={onMaster} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function StatsBar({ total, active, mastered, color }: {
  total: number; active: number; mastered: number; color: string
}) {
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0
  return (
    <div className="flex items-center gap-4 flex-1">
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-[11px] mb-1">
          <span style={{ color }} className="font-medium">{total} 条</span>
          <span style={{ color: '#333' }}>{pct}% 已掌握</span>
        </div>
        <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: '#22C55E', opacity: 0.75 }} />
        </div>
      </div>
      <div className="flex gap-3 text-[11px] flex-shrink-0">
        <span style={{ color: '#FF8080' }}>{active} 待复习</span>
        <span style={{ color: '#22C55E' }}>{mastered} 已掌握</span>
      </div>
    </div>
  )
}

function FilterTabs({ value, onChange, color }: {
  value: StatusFilter; onChange: (v: StatusFilter) => void; color: string
}) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-xl w-fit"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {(['active', 'mastered', 'all'] as StatusFilter[]).map(f => (
        <button key={f} onClick={() => onChange(f)}
          className="px-3 py-1.5 rounded-[10px] text-xs transition-all"
          style={{
            background: value === f ? color + '16' : 'transparent',
            color: value === f ? color : '#444',
            border: value === f ? `1px solid ${color}30` : '1px solid transparent',
            fontWeight: value === f ? 600 : 400,
          }}>
          {f === 'active' ? '待复习' : f === 'mastered' ? '已掌握' : '全部'}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ hint }: { hint?: string }) {
  return (
    <div className="rounded-2xl text-center py-12"
      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <BookOpen size={28} className="mx-auto mb-3 opacity-[0.12]" />
      <p className="text-sm text-white mb-1.5">暂无错题</p>
      <p className="text-[11px] px-8 leading-relaxed" style={{ color: '#2e2e3a' }}>
        {hint ?? '答错的题目会自动收录到这里'}
      </p>
    </div>
  )
}

function EmptyFilter({ filter }: { filter: StatusFilter }) {
  return (
    <div className="rounded-2xl text-center py-8"
      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p className="text-xs" style={{ color: '#333' }}>
        {filter === 'active' ? '🎉 没有待复习的内容' : '暂无记录'}
      </p>
    </div>
  )
}

// ── Exam mistake card ──────────────────────────────────────────────────────────

function ExamCard({ mistake: m, onMaster, onRemove }: {
  mistake: StoredMistake
  onMaster: (id: number) => void
  onRemove: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isMastered = m.mistake_status === 'mastered'
  const hasDetails = !!(m.options || m.feedback || m.explanation)

  return (
    <div className="group rounded-xl overflow-hidden"
      style={{
        background: isMastered ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.025)',
        border: isMastered ? '1px solid rgba(34,197,94,0.14)' : '1px solid rgba(255,255,255,0.06)',
      }}>

      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full"
          style={{ background: isMastered ? '#22C55E' : m.source_type === 'mock' ? '#34D399' : '#FFD700' }} />

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
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

      {hasDetails && (
        <>
          <button onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] hover:opacity-70 transition-opacity"
            style={{ color: '#2e2e3a', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            {expanded ? <><ChevronUp size={10} />收起</> : <><ChevronDown size={10} />展开详情</>}
          </button>

          {expanded && (
            <div className="px-4 pb-3 pt-2 space-y-2"
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

// ── Flashcard mistake card ─────────────────────────────────────────────────────

function FlashcardCard({ item: m, color, onMaster, onRemove }: {
  item: FlashcardMistake
  color: string
  onMaster: (id: number) => void
  onRemove: (id: number) => void
}) {
  const isMastered = m.mistake_status === 'mastered'
  return (
    <div className="group rounded-xl px-4 py-3 flex items-start gap-3"
      style={{
        background: isMastered ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.025)',
        border: isMastered ? '1px solid rgba(34,197,94,0.14)' : '1px solid rgba(255,255,255,0.06)',
      }}>
      <div className="flex-shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full"
        style={{ background: isMastered ? '#22C55E' : color }} />

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] px-1.5 py-px rounded-full font-medium"
            style={{ background: color + '18', color, border: `1px solid ${color}35` }}>
            {m.card_type === 'vocab' ? '词汇卡' : '概念卡'}
          </span>
          {isMastered && (
            <span className="text-[10px] px-1.5 py-px rounded-full"
              style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E' }}>✓ 已掌握</span>
          )}
        </div>
        <p className="text-xs font-medium text-white leading-relaxed line-clamp-2">{m.card_front}</p>
        <p className="text-[11px] leading-relaxed" style={{ color: '#555' }}>答案：{m.card_back}</p>
      </div>

      <div className="flex-shrink-0 flex flex-col gap-1.5 items-end pt-0.5">
        {!isMastered && (
          <button onClick={() => onMaster(m.id)}
            className="text-[10px] px-2 py-1 rounded-lg whitespace-nowrap"
            style={{ background: 'rgba(34,197,94,0.07)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.18)' }}>
            ✓ 已掌握
          </button>
        )}
        <button onClick={() => onRemove(m.id)}
          className="text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.06)' }}>
          删除
        </button>
      </div>
    </div>
  )
}

// ── Practice mode ──────────────────────────────────────────────────────────────

function PracticeMode({ mistakes, color, onMaster, onExit }: {
  mistakes: StoredMistake[]
  color: string
  onMaster: (id: number) => void
  onExit: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [session, setSession] = useState<Record<number, 'correct' | 'wrong'>>({})

  if (mistakes.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-white">🎉 没有待复习的错题！</p>
        <button onClick={onExit}
          className="px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ background: color + '1a', color, border: `1px solid ${color}40` }}>
          返回
        </button>
      </div>
    )
  }

  const m = mistakes[idx]
  const isShort = m.question_type === 'short_answer'
  const done = Object.keys(session).length
  const correct = Object.values(session).filter(v => v === 'correct').length
  const isLast = idx === mistakes.length - 1
  const isFinished = done === mistakes.length

  function advance() {
    setRevealed(false); setChosen(null)
    if (!isLast) setIdx(i => i + 1)
  }

  function handleMCQ(label: string) {
    if (chosen !== null) return
    setChosen(label); setRevealed(true)
    const ok = label === m.correct_answer
    setSession(prev => ({ ...prev, [m.question_id]: ok ? 'correct' : 'wrong' }))
    if (ok) onMaster(m.question_id)
  }

  function handleShort(ok: boolean) {
    setSession(prev => ({ ...prev, [m.question_id]: ok ? 'correct' : 'wrong' }))
    if (ok) onMaster(m.question_id)
    advance()
  }

  if (isFinished) {
    return (
      <div className="rounded-2xl p-10 text-center space-y-4"
        style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${color}26` }}>
        <p className="text-5xl font-bold" style={{ color }}>{correct}/{mistakes.length}</p>
        <p className="text-lg text-white font-semibold">练习完成！</p>
        <p className="text-sm" style={{ color: correct === mistakes.length ? '#22C55E' : '#888' }}>
          {correct === mistakes.length
            ? '🎉 全部掌握，太厉害了！'
            : `✅ 掌握 ${correct} 题 · 还需复习 ${mistakes.length - correct} 题`}
        </p>
        <div className="flex gap-3 justify-center pt-3">
          <button onClick={() => { setIdx(0); setRevealed(false); setChosen(null); setSession({}) }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#555', border: '1px solid rgba(255,255,255,0.1)' }}>
            <RotateCcw size={13} /> 重新练习
          </button>
          <button onClick={onExit}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: color + '1a', color, border: `1px solid ${color}40` }}>
            返回错题本
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <button onClick={onExit}
          className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity flex-shrink-0"
          style={{ color: '#444' }}>
          <ArrowLeft size={12} /> 返回
        </button>
        <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${((idx + 1) / mistakes.length) * 100}%`, background: color }} />
        </div>
        <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>{idx + 1}/{mistakes.length}</span>
        {correct > 0 && <span className="text-xs flex-shrink-0" style={{ color: '#22C55E' }}>✓ {correct}</span>}
      </div>

      {/* Card */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <span className="text-[10px]" style={{ color: '#444' }}>{isShort ? '简答题' : '选择题'}</span>
        <p className="text-sm font-semibold text-white leading-relaxed">{m.question_text}</p>

        {m.options && !isShort && (
          <div className="space-y-2">
            {m.options.map((opt, j) => {
              const label = String.fromCharCode(65 + j)
              const isChosen = chosen === label
              const isCorrect = label === m.correct_answer
              let bg = 'rgba(255,255,255,0.03)', border = 'rgba(255,255,255,0.07)', txtColor = '#CCC'
              if (revealed) {
                if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = '#22C55E44'; txtColor = '#22C55E' }
                else if (isChosen) { bg = 'rgba(255,68,68,0.08)'; border = '#FF444433'; txtColor = '#FF8080' }
              }
              return (
                <button key={j} onClick={() => handleMCQ(label)}
                  disabled={chosen !== null}
                  className="w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all disabled:cursor-default"
                  style={{ background: bg, border: `1px solid ${border}`, color: txtColor }}>
                  <span style={{ color, marginRight: 6 }}>{label}.</span>{opt}
                </button>
              )
            })}
          </div>
        )}

        {isShort && !revealed && (
          <button onClick={() => setRevealed(true)}
            className="w-full py-3 rounded-xl text-sm font-medium"
            style={{ background: color + '14', color, border: `1px solid ${color}33` }}>
            查看参考答案
          </button>
        )}
        {isShort && revealed && m.correct_answer && (
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

      {isShort && revealed && (
        <div className="flex gap-3 justify-center">
          <button onClick={() => handleShort(false)}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,68,68,0.08)', color: '#FF8080', border: '1px solid rgba(255,68,68,0.18)' }}>
            ✗ 还没记住
          </button>
          <button onClick={() => handleShort(true)}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            ✓ 已掌握
          </button>
        </div>
      )}

      {!isShort && revealed && (
        <div className="flex justify-end">
          <button onClick={advance}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: color + '1a', color, border: `1px solid ${color}38` }}>
            {isLast ? '完成 ✓' : '下一题 →'}
          </button>
        </div>
      )}
    </div>
  )
}
