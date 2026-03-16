'use client'

import { useState, useEffect } from 'react'
import { useMistakes, masterMistake, deleteMistake } from '@/lib/mistakes-store'
import type { StoredMistake } from '@/lib/mistakes-store'
import {
  AlertTriangle, BookOpen, CheckCircle, Trash2,
  ExternalLink, FileText, Play, RotateCcw, Heart, Loader2, XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { ExamQuestion } from '@/lib/types'

type StatusFilter = 'active' | 'mastered' | 'all'
type SourceFilter = 'all' | 'quiz' | 'flashcard'
type MainTab = 'mistakes' | 'favorites'

// ── Main view (used both standalone + inside course tab) ──────────────────────

export default function MistakesView({ courseId }: { courseId?: string }) {
  const { all, active, mastered, master, remove } = useMistakes()
  const [mainTab, setMainTab] = useState<MainTab>('mistakes')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [practiceMode, setPracticeMode] = useState(false)

  // When inside a course, scope to that course only
  const scoped = courseId ? all.filter(m => m.courseId === courseId) : all
  const scopedActive   = scoped.filter(m => m.status === 'active')
  const scopedMastered = scoped.filter(m => m.status === 'mastered')

  const filtered = scoped.filter(m => {
    const matchStatus = statusFilter === 'all' || m.status === statusFilter
    const matchSource = sourceFilter === 'all' || m.source === sourceFilter
    return matchStatus && matchSource
  })

  if (practiceMode) {
    return (
      <PracticeMode
        mistakes={scopedActive.filter(m => sourceFilter === 'all' || m.source === sourceFilter)}
        onMaster={master}
        onExit={() => setPracticeMode(false)}
      />
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Main tab switcher ── */}
      <div className="flex gap-2">
        {(['mistakes', 'favorites'] as MainTab[]).map(t => (
          <button
            key={t}
            onClick={() => setMainTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: mainTab === t ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.03)',
              color: mainTab === t ? '#FFD700' : '#666',
              border: `1px solid ${mainTab === t ? 'rgba(255,215,0,0.35)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {t === 'mistakes' ? '❌ 错题集' : '❤️ 收藏'}
          </button>
        ))}
      </div>

      {mainTab === 'favorites' && <FavoritesTab courseId={courseId} />}
      {mainTab === 'mistakes' && <>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <AlertTriangle size={20} style={{ color: '#FFD700' }} />
            错题集
          </h2>
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>
            汇聚闪卡与模拟题的错误 · 针对薄弱环节反复练习
          </p>
        </div>
        {scopedActive.length > 0 && (
          <button
            onClick={() => setPracticeMode(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
            style={{
              background: 'rgba(255,215,0,0.15)',
              color: '#FFD700',
              border: '1px solid rgba(255,215,0,0.35)',
            }}
          >
            <Play size={14} /> 开始练习 ({scopedActive.length})
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '待复习', value: scopedActive.length,   color: '#FF6666', bg: 'rgba(255,68,68,0.07)'   },
          { label: '已掌握', value: scopedMastered.length,  color: '#22C55E', bg: 'rgba(34,197,94,0.07)'   },
          { label: '合计',   value: scoped.length,          color: '#FFD700', bg: 'rgba(255,215,0,0.05)'   },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 text-center"
            style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: '#666' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {(['active', 'mastered', 'all'] as StatusFilter[]).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className="px-3 py-1.5 rounded-md text-xs transition-all"
              style={{
                background: statusFilter === f ? 'rgba(255,215,0,0.12)' : 'transparent',
                color: statusFilter === f ? '#FFD700' : '#555',
                border: `1px solid ${statusFilter === f ? 'rgba(255,215,0,0.3)' : 'transparent'}`,
              }}>
              {f === 'active' ? '待复习' : f === 'mastered' ? '已掌握' : '全部'}
            </button>
          ))}
        </div>

        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {(['all', 'quiz', 'flashcard'] as SourceFilter[]).map(f => (
            <button key={f} onClick={() => setSourceFilter(f)}
              className="px-3 py-1.5 rounded-md text-xs transition-all"
              style={{
                background: sourceFilter === f ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: sourceFilter === f ? '#DDD' : '#555',
                border: `1px solid ${sourceFilter === f ? 'rgba(255,255,255,0.18)' : 'transparent'}`,
              }}>
              {f === 'all' ? '全部来源' : f === 'quiz' ? '🎯 模拟题' : '🃏 闪卡'}
            </button>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
          <BookOpen size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm text-white mb-2">
            {statusFilter === 'active' ? '🎉 没有待复习的错题！' : '暂无记录'}
          </p>
          <p className="text-xs" style={{ color: '#555' }}>
            {statusFilter === 'active' ? '做模拟题或闪卡时，答错的题目会自动收录到这里' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => (
            <MistakeCard key={m.id} mistake={m} onMaster={master} onRemove={remove} />
          ))}
        </div>
      )}
      </>}
    </div>
  )
}

// ── Favorites Tab ─────────────────────────────────────────────────────────────

function FavoritesTab({ courseId }: { courseId?: string }) {
  const [favorites, setFavorites] = useState<ExamQuestion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fn = courseId
      ? () => api.exam.listCourseFavorites(courseId)
      : () => api.exam.listAllFavorites()
    fn().then(setFavorites).finally(() => setLoading(false))
  }, [courseId])

  async function handleUnfavorite(qId: number) {
    const q = favorites.find(f => f.id === qId)
    if (!q) return
    setFavorites(prev => prev.filter(f => f.id !== qId))
    try {
      await api.exam.toggleFavorite(q.course_id, qId)
    } catch {
      setFavorites(prev => [...prev, q])
    }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} />
    </div>
  )

  if (favorites.length === 0) return (
    <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
      <Heart size={48} className="mx-auto mb-4 opacity-20" />
      <p className="text-sm text-white mb-2">暂无收藏</p>
      <p className="text-xs" style={{ color: '#555' }}>做题时点击心形图标即可收藏</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {favorites.map(q => (
        <div
          key={q.id}
          className="rounded-2xl p-4 space-y-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,107,107,0.15)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-xs px-2 py-0.5 rounded-full mr-2" style={{ background: 'rgba(255,107,107,0.1)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.2)' }}>
                {q.question_type === 'mcq' ? '选择题' : '简答题'}
              </span>
              <span className="text-xs" style={{ color: '#555' }}>
                {q.source_type === 'past_exam' ? '真题' : '模拟题'}
              </span>
              <p className="text-sm text-white mt-2 leading-relaxed">{q.question_text}</p>
              {q.options && (
                <div className="mt-2 space-y-1">
                  {q.options.map((opt, j) => (
                    <p key={j} className="text-xs" style={{ color: '#666' }}>
                      {String.fromCharCode(65 + j)}. {opt}
                    </p>
                  ))}
                </div>
              )}
              {q.correct_answer && (
                <p className="text-xs mt-2" style={{ color: '#22C55E' }}>
                  ✓ {q.question_type === 'mcq' ? `正确答案：${q.correct_answer}` : q.correct_answer}
                </p>
              )}
            </div>
            <button
              onClick={() => handleUnfavorite(q.id)}
              className="flex-shrink-0 transition-all hover:scale-110"
              title="取消收藏"
            >
              <Heart size={18} fill="#FF6B6B" style={{ color: '#FF6B6B' }} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Mistake card ──────────────────────────────────────────────────────────────

function MistakeCard({
  mistake: m,
  onMaster,
  onRemove,
}: {
  mistake: StoredMistake
  onMaster: (id: string) => void
  onRemove: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isVocab = m.source === 'flashcard' && !m.options

  return (
    <div className="glass p-4 rounded-xl space-y-3"
      style={{
        border: m.status === 'mastered'
          ? '1px solid rgba(34,197,94,0.18)'
          : '1px solid rgba(255,255,255,0.07)',
      }}>
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: m.source === 'quiz' ? 'rgba(52,211,153,0.1)' : 'rgba(255,215,0,0.1)',
            color: m.source === 'quiz' ? '#34D399' : '#FFD700',
            border: `1px solid ${m.source === 'quiz' ? 'rgba(52,211,153,0.25)' : 'rgba(255,215,0,0.2)'}`,
          }}>
          {m.source === 'quiz' ? '🎯 模拟题' : '🃏 闪卡'}
        </span>
        {m.status === 'mastered' && (
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
            ✓ 已掌握
          </span>
        )}
        <span className="ml-auto text-xs" style={{ color: '#3a3a3a' }}>
          {new Date(m.createdAt).toLocaleDateString('zh-CN')}
        </span>
      </div>

      {/* Question */}
      <p className="text-sm text-white leading-relaxed">{m.question}</p>

      {/* MCQ options */}
      {m.options && (
        <div className="space-y-1.5">
          {m.options.map((opt, j) => {
            const label = String.fromCharCode(65 + j)
            const isCorrect = label === m.correctAnswer
            const isWrong = m.userAnswer === label && !isCorrect
            return (
              <div key={j} className="px-3 py-2 rounded-lg text-xs"
                style={{
                  background: isCorrect ? 'rgba(34,197,94,0.1)' : isWrong ? 'rgba(255,68,68,0.07)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isCorrect ? '#22C55E44' : isWrong ? '#FF444433' : 'rgba(255,255,255,0.05)'}`,
                  color: isCorrect ? '#22C55E' : isWrong ? '#FF6666' : '#555',
                }}>
                <span style={{ fontWeight: isCorrect ? 600 : 400 }}>{label}. {opt}</span>
                {isCorrect && <span className="ml-2 opacity-60">← 正确答案</span>}
                {isWrong && <span className="ml-2 opacity-60">← 你的答案</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Vocab answer */}
      {isVocab && (
        <div className="px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)', color: '#22C55E' }}>
          正确答案：{m.correctAnswer}
        </div>
      )}

      {/* Explanation */}
      {m.explanation && (
        <div>
          <button onClick={() => setExpanded(v => !v)}
            className="text-xs transition-opacity hover:opacity-100"
            style={{ color: '#555', opacity: 0.7 }}>
            {expanded ? '▲ 收起解析' : '▼ 查看解析'}
          </button>
          {expanded && (
            <p className="mt-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,215,0,0.05)', color: '#AAA' }}>
              💡 {m.explanation}
            </p>
          )}
        </div>
      )}

      {/* Source PDF */}
      {m.sourceUrl && m.sourceFile && (
        <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100"
          style={{ color: '#60A5FA', opacity: 0.75 }}>
          <FileText size={12} />来源：{m.sourceFile}
          <ExternalLink size={10} />
        </a>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {m.status === 'active' && (
          <button onClick={() => onMaster(m.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' }}>
            <CheckCircle size={12} /> 已掌握
          </button>
        )}
        <button onClick={() => onRemove(m.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Trash2 size={12} /> 删除
        </button>
      </div>
    </div>
  )
}

// ── Practice mode ─────────────────────────────────────────────────────────────

function PracticeMode({
  mistakes,
  onMaster,
  onExit,
}: {
  mistakes: StoredMistake[]
  onMaster: (id: string) => void
  onExit: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [chosenAnswer, setChosenAnswer] = useState<string | null>(null)
  const [session, setSession] = useState<Record<string, 'correct' | 'wrong'>>({})

  if (mistakes.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-white text-lg">🎉 没有待复习的错题！</p>
        <button onClick={onExit}
          className="px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
          返回错题集
        </button>
      </div>
    )
  }

  const m = mistakes[idx]
  const isVocab = m.source === 'flashcard' && !m.options
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
    const isCorrect = label === m.correctAnswer
    setSession(prev => ({ ...prev, [m.id]: isCorrect ? 'correct' : 'wrong' }))
    if (isCorrect) onMaster(m.id)
  }

  function handleVocabResult(correct: boolean) {
    setSession(prev => ({ ...prev, [m.id]: correct ? 'correct' : 'wrong' }))
    if (correct) onMaster(m.id)
    advance()
  }

  // Session complete
  if (isSessionDone) {
    return (
      <div className="glass p-10 rounded-2xl text-center space-y-4"
        style={{ border: '1px solid rgba(255,215,0,0.2)' }}>
        <p className="text-5xl font-bold" style={{ color: '#FFD700' }}>{correctDone}/{mistakes.length}</p>
        <p className="text-lg text-white font-semibold">练习完成！</p>
        <p className="text-sm" style={{ color: correctDone === mistakes.length ? '#22C55E' : '#AAA' }}>
          {correctDone === mistakes.length
            ? '🎉 全部掌握，太厉害了！'
            : `✅ 掌握 ${correctDone} 题 · 还需继续复习 ${mistakes.length - correctDone} 题`}
        </p>
        <div className="flex gap-3 justify-center pt-3">
          <button onClick={() => { setIdx(0); setRevealed(false); setChosenAnswer(null); setSession({}) }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#888', border: '1px solid rgba(255,255,255,0.1)' }}>
            <RotateCcw size={14} /> 重新练习
          </button>
          <button onClick={onExit}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
            返回错题集
          </button>
        </div>
      </div>
    )
  }

  // Practice card
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <button onClick={onExit} className="text-xs transition-opacity hover:opacity-100"
          style={{ color: '#555', opacity: 0.7 }}>← 返回列表</button>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${((idx + 1) / mistakes.length) * 100}%`, background: '#FFD700' }} />
        </div>
        <span className="text-xs" style={{ color: '#555' }}>{idx + 1}/{mistakes.length}</span>
        {correctDone > 0 && <span className="text-xs" style={{ color: '#22C55E' }}>✓ {correctDone}</span>}
      </div>

      {/* Card */}
      <div className="glass p-6 rounded-2xl space-y-4">
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{
            background: m.source === 'quiz' ? 'rgba(52,211,153,0.1)' : 'rgba(255,215,0,0.1)',
            color: m.source === 'quiz' ? '#34D399' : '#FFD700',
          }}>
          {m.source === 'quiz' ? '🎯 模拟题' : '🃏 闪卡'}
        </span>

        <p className="text-base font-semibold text-white leading-relaxed">{m.question}</p>

        {m.options && (
          <div className="space-y-2">
            {m.options.map((opt, j) => {
              const label = String.fromCharCode(65 + j)
              const isChosen = chosenAnswer === label
              const isCorrect = label === m.correctAnswer
              let bg = 'rgba(255,255,255,0.04)', border = 'rgba(255,255,255,0.08)', color = '#DDD'
              if (revealed) {
                if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = '#22C55E'; color = '#22C55E' }
                else if (isChosen) { bg = 'rgba(255,68,68,0.1)'; border = '#FF4444'; color = '#FF6666' }
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

        {isVocab && !revealed && (
          <button onClick={() => setRevealed(true)}
            className="w-full py-3 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
            翻转查看答案 →
          </button>
        )}
        {isVocab && revealed && (
          <div className="px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E' }}>
            {m.correctAnswer}
          </div>
        )}

        {revealed && m.explanation && (
          <p className="text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,215,0,0.05)', color: '#AAA' }}>
            💡 {m.explanation}
          </p>
        )}

        {revealed && m.sourceUrl && m.sourceFile && (
          <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100"
            style={{ color: '#60A5FA', opacity: 0.8 }}>
            <FileText size={12} />来源：{m.sourceFile}<ExternalLink size={10} />
          </a>
        )}
      </div>

      {isVocab && revealed && (
        <div className="flex gap-3 justify-center">
          <button onClick={() => handleVocabResult(false)}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,68,68,0.1)', color: '#FF6666', border: '1px solid rgba(255,68,68,0.25)' }}>
            ✗ 还没记住
          </button>
          <button onClick={() => handleVocabResult(true)}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' }}>
            ✓ 已掌握
          </button>
        </div>
      )}

      {m.options && revealed && (
        <div className="flex justify-end">
          <button onClick={advance}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
            {isLastCard ? '完成 ✓' : '下一题 →'}
          </button>
        </div>
      )}
    </div>
  )
}
