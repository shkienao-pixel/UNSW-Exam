'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Loader2, Zap, Target, Shuffle, RotateCcw,
  Heart, ChevronLeft, ChevronRight, BookOpen, CheckCircle,
  XCircle, AlertCircle, Sparkles, History,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { ExamQuestion, PastExamFile, MockSession, GradeResult } from '@/lib/types'
import { useLang } from '@/lib/i18n'

// ── Types ─────────────────────────────────────────────────────────────────────

type ExamMode = 'past_exam' | 'mock'
type Phase = 'select' | 'doing' | 'result'

// ── Main ExamTab ──────────────────────────────────────────────────────────────

export default function ExamTab({ courseId }: { courseId: string }) {
  const [mode, setMode] = useState<ExamMode>('past_exam')
  const [phase, setPhase] = useState<Phase>('select')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [results, setResults] = useState<GradeResult[]>([])
  const [selectedArtifactId, setSelectedArtifactId] = useState<number | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const { lang } = useLang()

  function startDoing(qs: ExamQuestion[], artifactId?: number, sessionId?: string) {
    setQuestions(qs)
    setSelectedArtifactId(artifactId ?? null)
    setSelectedSessionId(sessionId ?? null)
    setPhase('doing')
  }

  function onSubmitDone(res: GradeResult[], finalQs: ExamQuestion[]) {
    setResults(res)
    setQuestions(finalQs)
    setPhase('result')
  }

  if (phase === 'doing') {
    return (
      <ExamDoingPage
        courseId={courseId}
        questions={questions}
        onBack={() => setPhase('select')}
        onSubmitDone={onSubmitDone}
      />
    )
  }

  if (phase === 'result') {
    return (
      <ExamResultPage
        courseId={courseId}
        questions={questions}
        results={results}
        onBack={() => setPhase('select')}
        onRedo={() => setPhase('doing')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Target size={22} style={{ color: '#FFD700' }} />
          {lang === 'zh' ? '真题 & 模拟题' : 'Exams'}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>
          {lang === 'zh' ? '真题直接提取自往年试卷 · 模拟题由 AI 仿写生成' : 'Real past exam questions · AI-generated mock exams'}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        {(['past_exam', 'mock'] as ExamMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: mode === m ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.03)',
              color: mode === m ? '#FFD700' : '#666',
              border: `1px solid ${mode === m ? 'rgba(255,215,0,0.35)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {m === 'past_exam'
              ? (lang === 'zh' ? '📄 真题' : '📄 Past Exams')
              : (lang === 'zh' ? '✨ 模拟题' : '✨ Mock Exams')}
          </button>
        ))}
      </div>

      {mode === 'past_exam'
        ? <PastExamList courseId={courseId} onStart={startDoing} />
        : <MockSessionList courseId={courseId} onStart={startDoing} />
      }
    </div>
  )
}

// ── Past Exam List ─────────────────────────────────────────────────────────────

function PastExamList({
  courseId,
  onStart,
}: {
  courseId: string
  onStart: (qs: ExamQuestion[], artifactId: number) => void
}) {
  const [files, setFiles] = useState<PastExamFile[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<number | null>(null)
  const [unlocking, setUnlocking] = useState<number | null>(null)
  const { lang } = useLang()

  const loadFiles = useCallback(() => {
    api.exam.listPastExams(courseId)
      .then(setFiles)
      .finally(() => setLoading(false))
  }, [courseId])

  useEffect(() => { loadFiles() }, [loadFiles])

  async function handleUnlock(artifactId: number) {
    setUnlocking(artifactId)
    try {
      await api.exam.unlockPastExam(courseId, artifactId)
      loadFiles()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(msg)
    } finally {
      setUnlocking(null)
    }
  }

  async function handleStart(artifactId: number) {
    setStarting(artifactId)
    try {
      const { questions } = await api.exam.getQuestions(courseId, { artifact_id: artifactId })
      if (questions.length === 0) {
        alert(lang === 'zh' ? '该试卷暂无题目，请稍后重试' : 'No questions found yet')
        return
      }
      onStart(questions, artifactId)
    } finally {
      setStarting(null)
    }
  }

  if (loading) return <LoadingSpinner />

  if (files.length === 0) {
    return (
      <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
        <FileText size={48} className="mx-auto mb-4 opacity-20" />
        <p className="text-base font-medium text-white mb-2">
          {lang === 'zh' ? '暂无往年真题' : 'No past exam papers'}
        </p>
        <p className="text-sm" style={{ color: '#555' }}>
          {lang === 'zh'
            ? '管理员上传并审核通过 past_exam 类型文件后，题目会自动提取'
            : 'Questions will be auto-extracted when admin approves past_exam files'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {files.map(f => (
        <div
          key={f.artifact_id}
          className="flex items-center justify-between gap-4 rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={18} style={{ color: '#f97316', flexShrink: 0 }} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{f.file_name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                {f.question_count} {lang === 'zh' ? '道题' : 'questions'} ·{' '}
                {new Date(f.created_at).toLocaleDateString('zh-CN')}
              </p>
            </div>
          </div>
          {f.is_unlocked ? (
            <button
              onClick={() => handleStart(f.artifact_id)}
              disabled={starting === f.artifact_id}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0 transition-all disabled:opacity-60"
              style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}
            >
              {starting === f.artifact_id
                ? <Loader2 size={14} className="animate-spin" />
                : <Target size={14} />}
              {lang === 'zh' ? '开始做题' : 'Start'}
            </button>
          ) : (
            <button
              onClick={() => handleUnlock(f.artifact_id)}
              disabled={unlocking === f.artifact_id}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0 transition-all disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#aaa', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              {unlocking === f.artifact_id
                ? <Loader2 size={14} className="animate-spin" />
                : <span style={{ fontSize: 14 }}>🔒</span>}
              {lang === 'zh' ? '解锁 150积分' : 'Unlock 150cr'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Mock Session List ──────────────────────────────────────────────────────────

function MockSessionList({
  courseId,
  onStart,
}: {
  courseId: string
  onStart: (qs: ExamQuestion[], artifactId: undefined, sessionId: string) => void
}) {
  const [sessions, setSessions] = useState<MockSession[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)
  const [numMcq, setNumMcq] = useState(10)
  const [numShort, setNumShort] = useState(5)
  const { lang } = useLang()

  const loadSessions = useCallback(() => {
    api.exam.listMockSessions(courseId)
      .then(setSessions)
      .finally(() => setLoading(false))
  }, [courseId])

  useEffect(() => { loadSessions() }, [loadSessions])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { session_id } = await api.exam.generateMock(courseId, { num_mcq: numMcq, num_short: numShort })
      await loadSessions()
      // Auto-start the new session
      const { questions } = await api.exam.getQuestions(courseId, { mock_session_id: session_id })
      if (questions.length > 0) {
        onStart(questions, undefined, session_id)
      } else {
        alert(lang === 'zh' ? '生成完成但未返回题目，请重试' : 'Generation completed but no questions returned, please retry')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(msg)
    } finally {
      setGenerating(false)
    }
  }

  async function handleStart(sessionId: string) {
    setStarting(sessionId)
    try {
      const { questions } = await api.exam.getQuestions(courseId, { mock_session_id: sessionId })
      if (questions.length === 0) {
        alert(lang === 'zh' ? '暂无题目' : 'No questions found')
        return
      }
      onStart(questions, undefined, sessionId)
    } finally {
      setStarting(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Generate new mock */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.12)' }}>
        <p className="text-sm font-semibold text-white">{lang === 'zh' ? '生成新模拟题' : 'Generate New Mock'}</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2" style={{ color: '#999' }}>
            {lang === 'zh' ? '选择题：' : 'MCQ:'}
            <select
              value={numMcq}
              onChange={e => setNumMcq(Number(e.target.value))}
              className="input-glass py-1 text-sm"
            >
              {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2" style={{ color: '#999' }}>
            {lang === 'zh' ? '简答题：' : 'Short answer:'}
            <select
              value={numShort}
              onChange={e => setNumShort(Number(e.target.value))}
              className="input-glass py-1 text-sm"
            >
              {[0, 3, 5, 8].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
          style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}
        >
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {generating
            ? (lang === 'zh' ? '生成中，请稍候...' : 'Generating...')
            : (lang === 'zh' ? '开始生成 · 100积分' : 'Generate · 100cr')}
        </button>
      </div>

      {/* History */}
      {loading ? <LoadingSpinner /> : sessions.length === 0 ? (
        <div className="text-center py-10" style={{ color: '#444' }}>
          <History size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">{lang === 'zh' ? '暂无历史模拟题' : 'No mock exams yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium" style={{ color: '#555' }}>
            {lang === 'zh' ? '历史模拟题' : 'History'}
          </p>
          {sessions.map(s => (
            <div
              key={s.session_id}
              className="flex items-center justify-between gap-4 rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center gap-3">
                <Sparkles size={16} style={{ color: '#a78bfa' }} />
                <div>
                  <p className="text-sm font-medium text-white">
                    {s.question_count} {lang === 'zh' ? '道题' : 'questions'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                    {new Date(s.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleStart(s.session_id)}
                disabled={starting === s.session_id}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0 transition-all disabled:opacity-60"
                style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }}
              >
                {starting === s.session_id ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
                {lang === 'zh' ? '做题' : 'Start'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Exam Doing Page ───────────────────────────────────────────────────────────

const MCQ_PER_PAGE = 10
const SHORT_PER_PAGE = 4

function buildPages(questions: ExamQuestion[]): ExamQuestion[][] {
  const pages: ExamQuestion[][] = []
  let current: ExamQuestion[] = []
  let mcqCount = 0
  let shortCount = 0

  for (const q of questions) {
    const isMcq = q.question_type === 'mcq'
    const limitReached = isMcq
      ? mcqCount >= MCQ_PER_PAGE
      : shortCount >= SHORT_PER_PAGE

    if (limitReached && current.length > 0) {
      pages.push(current)
      current = []
      mcqCount = 0
      shortCount = 0
    }

    current.push(q)
    if (isMcq) mcqCount++
    else shortCount++
  }
  if (current.length > 0) pages.push(current)
  return pages
}

function ExamDoingPage({
  courseId,
  questions: initialQuestions,
  onBack,
  onSubmitDone,
}: {
  courseId: string
  questions: ExamQuestion[]
  onBack: () => void
  onSubmitDone: (results: GradeResult[], finalQs: ExamQuestion[]) => void
}) {
  const [questions, setQuestions] = useState<ExamQuestion[]>(initialQuestions)
  // Pre-fill answers from previous attempts
  const [answers, setAnswers] = useState<Record<number, string>>(
    () => Object.fromEntries(
      initialQuestions
        .filter(q => q.prev_answer)
        .map(q => [q.id, q.prev_answer!])
    )
  )
  const [currentPage, setCurrentPage] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [favorites, setFavorites] = useState<Record<number, boolean>>(
    Object.fromEntries(initialQuestions.map(q => [q.id, q.is_favorite ?? false]))
  )
  const { lang } = useLang()

  const pages = buildPages(questions)
  const page = pages[currentPage] ?? []
  const totalPages = pages.length
  const answeredCount = Object.keys(answers).length

  function shuffleAndReset() {
    const shuffled = [...questions].sort(() => Math.random() - 0.5)
    setQuestions(shuffled)
    setAnswers({})
    setCurrentPage(0)
  }

  async function toggleFav(qId: number) {
    const prev = favorites[qId] ?? false
    setFavorites(f => ({ ...f, [qId]: !prev }))
    try {
      const { is_favorite } = await api.exam.toggleFavorite(courseId, qId)
      setFavorites(f => ({ ...f, [qId]: is_favorite }))
    } catch {
      setFavorites(f => ({ ...f, [qId]: prev }))
    }
  }

  async function handleSubmit() {
    const answeredIds = Object.keys(answers).map(Number)
    if (answeredIds.length === 0) {
      alert(lang === 'zh' ? '请至少回答一道题' : 'Answer at least one question')
      return
    }
    setSubmitting(true)
    try {
      const payload = answeredIds.map(qid => ({
        question_id: qid,
        user_answer: answers[qid],
      }))
      const { results } = await api.exam.submitAnswers(courseId, payload)
      onSubmitDone(results, questions)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-100"
          style={{ color: '#666' }}
        >
          <ChevronLeft size={16} /> {lang === 'zh' ? '返回' : 'Back'}
        </button>
        <div className="flex items-center gap-2">
          {/* Shuffle & Reset */}
          <button
            onClick={shuffleAndReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}
            title={lang === 'zh' ? '打乱题目顺序并重置答题' : 'Shuffle questions and reset answers'}
          >
            <Shuffle size={13} />
            {lang === 'zh' ? '打乱重置' : 'Shuffle & Reset'}
          </button>
          <button
            onClick={() => { setAnswers({}); setCurrentPage(0) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RotateCcw size={13} />
            {lang === 'zh' ? '重置' : 'Reset'}
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs" style={{ color: '#555' }}>
          <span>{lang === 'zh' ? `已答 ${answeredCount} / ${questions.length} 题` : `${answeredCount} / ${questions.length} answered`}</span>
          <span>{lang === 'zh' ? `第 ${currentPage + 1} / ${totalPages} 页` : `Page ${currentPage + 1} / ${totalPages}`}</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(answeredCount / questions.length) * 100}%`, background: '#c8a55a' }}
          />
        </div>
      </div>

      {/* Questions on current page */}
      <div className="space-y-4">
        {page.map((q, pageIdx) => {
          const globalIdx = questions.indexOf(q)
          return (
            <QuestionCard
              key={q.id}
              question={q}
              questionNumber={globalIdx + 1}
              answer={answers[q.id]}
              isFavorite={favorites[q.id] ?? false}
              onAnswer={val => setAnswers(a => ({ ...a, [q.id]: val }))}
              onToggleFav={() => toggleFav(q.id)}
            />
          )
        })}
      </div>

      {/* Pagination + Submit */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
          disabled={currentPage === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm disabled:opacity-30 transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#aaa', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ChevronLeft size={15} /> {lang === 'zh' ? '上一页' : 'Prev'}
        </button>

        {currentPage < totalPages - 1 ? (
          <button
            onClick={() => setCurrentPage(p => p + 1)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-all"
            style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}
          >
            {lang === 'zh' ? '下一页' : 'Next'} <ChevronRight size={15} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: 'rgba(255,215,0,0.2)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.4)' }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {submitting
              ? (lang === 'zh' ? 'AI 批改中...' : 'Grading...')
              : (lang === 'zh' ? '提交全卷' : 'Submit All')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Question Card ─────────────────────────────────────────────────────────────

function QuestionCard({
  question: q,
  questionNumber,
  answer,
  isFavorite,
  onAnswer,
  onToggleFav,
}: {
  question: ExamQuestion
  questionNumber: number
  answer: string | undefined
  isFavorite: boolean
  onAnswer: (val: string) => void
  onToggleFav: () => void
}) {
  const { lang } = useLang()
  const [lightbox, setLightbox] = useState(false)

  return (
    <div
      className="rounded-[24px] p-5 space-y-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Visual missing warning */}
      {q.has_visual && !q.page_image_url && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'rgba(250,204,21,0.07)', border: '1px solid rgba(250,204,21,0.2)', color: '#ca8a04' }}>
          ⚠️ {lang === 'zh' ? '本题含图表，图片未能自动提取，请参考原始试卷' : 'This question contains a figure. Please refer to the original exam paper.'}
        </div>
      )}

      {/* Question image (per-question crop, click to zoom) */}
      {q.page_image_url && (
        <>
          <div
            className="rounded-[16px] overflow-hidden border cursor-zoom-in"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            onClick={() => setLightbox(true)}
            title={lang === 'zh' ? '点击放大' : 'Click to enlarge'}
          >
            <img
              src={q.page_image_url}
              alt="Exam figure"
              className="w-full object-contain"
              style={{ maxHeight: 400, background: '#fff' }}
            />
          </div>
          {lightbox && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center cursor-zoom-out"
              style={{ background: 'rgba(0,0,0,0.85)' }}
              onClick={() => setLightbox(false)}
            >
              <img
                src={q.page_image_url}
                alt="Exam figure"
                className="rounded-xl shadow-2xl"
                style={{ maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain', background: '#fff' }}
                onClick={e => e.stopPropagation()}
              />
              <button
                className="absolute top-4 right-4 text-white text-2xl font-bold opacity-70 hover:opacity-100"
                onClick={() => setLightbox(false)}
              >✕</button>
            </div>
          )}
        </>
      )}

      {/* Question header */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-white leading-relaxed flex-1">
          <span style={{ color: '#FFD700' }}>Q{questionNumber}. </span>
          {q.question_text}
          {q.prev_correct === true && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full align-middle"
              style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
              ✓ {lang === 'zh' ? '上次答对' : 'Prev: correct'}
            </span>
          )}
          {q.prev_correct === false && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full align-middle"
              style={{ background: 'rgba(255,68,68,0.1)', color: '#ff6b6b', border: '1px solid rgba(255,68,68,0.2)' }}>
              ✗ {lang === 'zh' ? '上次答错' : 'Prev: wrong'}
            </span>
          )}
        </p>
        <button
          onClick={onToggleFav}
          className="flex-shrink-0 transition-all hover:scale-110"
          title={isFavorite ? (lang === 'zh' ? '取消收藏' : 'Unfavorite') : (lang === 'zh' ? '收藏' : 'Favorite')}
        >
          <Heart
            size={18}
            fill={isFavorite ? '#FF6B6B' : 'none'}
            style={{ color: isFavorite ? '#FF6B6B' : '#444' }}
          />
        </button>
      </div>

      {/* MCQ Options */}
      {q.question_type === 'mcq' && q.options && (
        <div className="space-y-2">
          {q.options.map((opt, j) => {
            const label = String.fromCharCode(65 + j)
            const isChosen = answer === label
            return (
              <button
                key={j}
                onClick={() => onAnswer(label)}
                className="w-full text-left px-4 py-3 rounded-[16px] text-sm transition-all"
                style={{
                  background: isChosen ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isChosen ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  color: isChosen ? '#FFD700' : '#CCC',
                }}
              >
                <span style={{ color: '#FFD700', marginRight: 8 }}>{label}.</span>
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {/* Short answer textarea */}
      {q.question_type === 'short_answer' && (
        <textarea
          value={answer ?? ''}
          onChange={e => onAnswer(e.target.value)}
          placeholder={lang === 'zh' ? '在此输入你的答案...' : 'Type your answer here...'}
          rows={4}
          className="w-full rounded-[16px] px-4 py-3 text-sm resize-y"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#CCC',
            outline: 'none',
            minHeight: 100,
          }}
        />
      )}
    </div>
  )
}

// ── Result Page ───────────────────────────────────────────────────────────────

function ExamResultPage({
  courseId,
  questions,
  results,
  onBack,
  onRedo,
}: {
  courseId: string
  questions: ExamQuestion[]
  results: GradeResult[]
  onBack: () => void
  onRedo: () => void
}) {
  const { lang } = useLang()
  const resultMap = Object.fromEntries(results.map(r => [r.question_id, r]))
  const answered = results.length
  const correct = results.filter(r => r.is_correct === true).length

  return (
    <div className="space-y-5">
      {/* Back + score */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: '#666' }}
        >
          <ChevronLeft size={16} /> {lang === 'zh' ? '返回' : 'Back'}
        </button>
        <div className="flex gap-3">
          <button
            onClick={onRedo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#aaa', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RotateCcw size={14} /> {lang === 'zh' ? '再做一次' : 'Redo'}
          </button>
        </div>
      </div>

      {/* Score card */}
      <div className="rounded-2xl p-6 text-center space-y-2" style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.18)' }}>
        <p className="text-4xl font-bold" style={{ color: '#e6cf98' }}>{correct} / {answered}</p>
        <p className="text-sm" style={{ color: '#888' }}>
          {lang === 'zh'
            ? `答对 ${correct} 题 · 答错 ${answered - correct} 题`
            : `${correct} correct · ${answered - correct} incorrect`}
        </p>
        {answered - correct > 0 && (
          <p className="text-xs" style={{ color: '#555' }}>
            {lang === 'zh' ? '选择题错题已收录到错题集' : 'Wrong MCQ answers saved to Mistakes'}
          </p>
        )}
      </div>

      {/* Per-question results */}
      <div className="space-y-4">
        {questions.map((q, i) => {
          const r = resultMap[q.id]
          if (!r) return null
          const isCorrect = r.is_correct === true
          const isWrong = r.is_correct === false
          const isPending = r.is_correct === null

          return (
            <div
              key={q.id}
              className="rounded-[24px] p-5 space-y-3"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.25)' : isWrong ? 'rgba(255,68,68,0.2)' : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {isCorrect && <CheckCircle size={18} style={{ color: '#22C55E' }} />}
                  {isWrong   && <XCircle    size={18} style={{ color: '#FF4444' }} />}
                  {isPending && <AlertCircle size={18} style={{ color: '#888' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">
                    <span style={{ color: '#FFD700' }}>Q{i + 1}. </span>
                    {q.question_text}
                  </p>
                  {r.feedback && (
                    <p className="text-xs mt-2 px-3 py-2 rounded-xl"
                      style={{ background: 'rgba(200,165,90,0.08)', color: '#d6d6dc', border: '1px solid rgba(200,165,90,0.14)' }}>
                      💡 {r.feedback}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} />
    </div>
  )
}
