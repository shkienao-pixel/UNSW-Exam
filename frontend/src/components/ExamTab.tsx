'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Flag,
  Heart,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { CubesLoader } from '@/components/Cubes'
import type { ExamQuestion, GradeResult, MockSession, PastExamFile } from '@/lib/types'
import { useLang } from '@/lib/i18n'
import { GlowButton } from '@/components/GlowButton'

type ExamMode = 'past_exam' | 'mock'
type Phase = 'select' | 'doing' | 'result'
type AnswerMap = Record<number, string>
type FlagMap = Record<number, boolean>

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function tt(lang: 'zh' | 'en', zh: string, en: string) {
  return lang === 'zh' ? zh : en
}

function hasAnswer(value?: string | null) {
  return Boolean(value && value.trim())
}

function getInitialAnswers(questions: ExamQuestion[]): AnswerMap {
  return Object.fromEntries(
    questions
      .filter(q => hasAnswer(q.prev_answer))
      .map(q => [q.id, q.prev_answer!.trim()])
  )
}

function getAttemptTitle(lang: 'zh' | 'en', sourceType: ExamQuestion['source_type']) {
  return sourceType === 'past_exam'
    ? tt(lang, '往年真题模式', 'Past Exam Mode')
    : tt(lang, '模拟试卷模式', 'Mock Exam Mode')
}

function getQuestionTypeLabel(lang: 'zh' | 'en', type: ExamQuestion['question_type']) {
  return type === 'mcq'
    ? tt(lang, '选择题', 'Multiple Choice')
    : tt(lang, '简答题', 'Short Answer')
}

function getChoiceLetter(answer: string | null | undefined) {
  const normalized = (answer || '').trim().toUpperCase()
  return normalized ? normalized[0] : ''
}

function getMarkLabel(
  lang: 'zh' | 'en',
  result: GradeResult | undefined,
  answer: string | undefined,
) {
  if (!hasAnswer(answer)) return tt(lang, '未作答', 'Not answered')
  if (!result) return tt(lang, '已作答', 'Answered')
  if (result.is_correct === true) return tt(lang, '1.00 / 1.00', '1.00 out of 1.00')
  if (result.is_correct === false) return tt(lang, '0.00 / 1.00', '0.00 out of 1.00')
  return tt(lang, '待人工判断', 'Needs review')
}

function getResultTone(result: GradeResult | undefined) {
  if (!result) {
    return {
      border: 'rgba(148,163,184,0.28)',
      background: '#f8fafc',
      text: '#475569',
    }
  }
  if (result.is_correct === true) {
    return {
      border: 'rgba(34,197,94,0.35)',
      background: 'rgba(34,197,94,0.08)',
      text: '#15803d',
    }
  }
  if (result.is_correct === false) {
    return {
      border: 'rgba(239,68,68,0.28)',
      background: 'rgba(239,68,68,0.08)',
      text: '#b91c1c',
    }
  }
  return {
    border: 'rgba(245,158,11,0.28)',
    background: 'rgba(245,158,11,0.08)',
    text: '#b45309',
  }
}

function getQuestionStatusLabel(
  lang: 'zh' | 'en',
  answer: string | undefined,
  result?: GradeResult,
) {
  if (!hasAnswer(answer)) return tt(lang, '未作答', 'Not answered')
  if (!result) return tt(lang, '已作答', 'Answered')
  if (result.is_correct === true) return tt(lang, '正确', 'Correct')
  if (result.is_correct === false) return tt(lang, '错误', 'Incorrect')
  return tt(lang, '待复核', 'Needs review')
}

function formatDate(value: string, lang: 'zh' | 'en') {
  return new Date(value).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getRenderableOptions(question: ExamQuestion) {
  const direct = (question.options || []).map(option => String(option).trim()).filter(Boolean)
  if (direct.length >= 4) return direct.slice(0, 4)

  const text = (question.question_text || '').replace(/\r\n/g, '\n')
  const matches = [...text.matchAll(/(?:^|\n)\s*(?:\(?([A-D])\)?[.)])\s*([\s\S]+?)(?=(?:\n\s*\(?[A-D]\)?[.)]\s*)|\Z)/g)]
  if (matches.length < 4) return direct

  const ordered = matches
    .slice(0, 4)
    .sort((a, b) => a.index! - b.index!)

  const labels = ordered.map(match => (match[1] || '').toUpperCase())
  if (labels.join('') !== 'ABCD') return direct

  return ordered.map(match => match[2].replace(/\s+/g, ' ').trim())
}

function isLikelyMcqStem(question: ExamQuestion) {
  const text = question.question_text || ''
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const headLine = lines[0] || text

  const mcqPhrase =
    /\b(which|what)\s+(one\s+of\s+)?the\s+following\b|\bwhich statement\b|\bwhich option\b|\bbest describes?\b|\bbest matches?\b|\bmost likely\b|\b(?:is|are)\s+incorrect\b|\b(?:is|are)\s+correct\b/i.test(
      text
    )

  const structuredStem =
    /\bfollowing\s+(algorithm|kernel|filter|matrix|diagram|figure|table)\b/i.test(headLine) &&
    (headLine.trim().endsWith(':') || lines.slice(1).some(line => /^step\s*\d+\s*:/i.test(line)))

  return mcqPhrase || structuredStem
}

export default function ExamTab({ courseId }: { courseId: string }) {
  const [mode, setMode] = useState<ExamMode>('past_exam')
  const [phase, setPhase] = useState<Phase>('select')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [results, setResults] = useState<GradeResult[]>([])
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [flags, setFlags] = useState<FlagMap>({})
  const { lang } = useLang()

  function startDoing(qs: ExamQuestion[]) {
    setQuestions(qs)
    setAnswers(getInitialAnswers(qs))
    setFlags({})
    setResults([])
    setPhase('doing')
  }

  function onSubmitDone(
    finalResults: GradeResult[],
    finalQuestions: ExamQuestion[],
    finalAnswers: AnswerMap,
    finalFlags: FlagMap,
  ) {
    setResults(finalResults)
    setQuestions(finalQuestions)
    setAnswers(finalAnswers)
    setFlags(finalFlags)
    setPhase('result')
  }

  if (phase === 'doing' && questions.length > 0) {
    return (
      <ExamDoingPage
        courseId={courseId}
        questions={questions}
        initialAnswers={answers}
        initialFlags={flags}
        onBack={() => setPhase('select')}
        onSubmitDone={onSubmitDone}
      />
    )
  }

  if (phase === 'result' && questions.length > 0) {
    return (
      <ExamResultPage
        questions={questions}
        results={results}
        answers={answers}
        flags={flags}
        onBack={() => setPhase('select')}
        onRedo={() => { setAnswers(getInitialAnswers(questions)); setFlags({}); setPhase('doing') }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Target size={22} style={{ color: '#d4a843' }} />
          <h2 className="text-2xl font-bold text-white">
            {tt(lang, '真题与模拟题', 'Past Papers & Mock Exams')}
          </h2>
        </div>
        <p className="max-w-3xl text-sm leading-6" style={{ color: '#9ca3af' }}>
          {tt(
            lang,
            '把你提供的题库直接做成更像学校考试系统的做题页。真题来自往年试卷抽取，模拟题会尽量按同一门课的真实出题口吻来生成。',
            'Use your uploaded question bank in a more exam-like interface. Past papers come from extracted real exams, and mocks are generated to better match the course’s real paper style.'
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['past_exam', 'mock'] as ExamMode[]).map(item => {
          const active = item === mode
          return (
            <button
              key={item}
              onClick={() => setMode(item)}
              className="rounded-2xl px-4 py-2 text-sm font-medium transition-all"
              style={{
                background: active ? 'rgba(212,168,67,0.16)' : 'rgba(255,255,255,0.04)',
                color: active ? '#f4d37a' : '#cbd5e1',
                border: `1px solid ${active ? 'rgba(212,168,67,0.35)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {item === 'past_exam'
                ? tt(lang, '往年真题', 'Past Papers')
                : tt(lang, '模拟试卷', 'Mock Papers')}
            </button>
          )
        })}
      </div>

      {mode === 'past_exam'
        ? <PastExamList courseId={courseId} onStart={startDoing} />
        : <MockSessionList courseId={courseId} onStart={startDoing} />
      }
    </div>
  )
}

function PastExamList({
  courseId,
  onStart,
}: {
  courseId: string
  onStart: (qs: ExamQuestion[]) => void
}) {
  const [files, setFiles] = useState<PastExamFile[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<number | null>(null)
  const [unlocking, setUnlocking] = useState<number | null>(null)
  const { lang } = useLang()

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      setFiles(await api.exam.listPastExams(courseId))
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  async function handleUnlock(artifactId: number) {
    setUnlocking(artifactId)
    try {
      await api.exam.unlockPastExam(courseId, artifactId)
      await loadFiles()
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setUnlocking(null)
    }
  }

  async function handleStart(artifactId: number) {
    setStarting(artifactId)
    try {
      const { questions } = await api.exam.getQuestions(courseId, { artifact_id: artifactId })
      if (!questions.length) {
        alert(tt(lang, '这份真题暂时还没有可做的题目。', 'No questions were found for this paper yet.'))
        return
      }
      onStart(questions)
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setStarting(null)
    }
  }

  if (loading) return <LoadingSpinner />

  if (!files.length) {
    return (
      <EmptyState
        icon={<FileText size={44} className="opacity-70" />}
        title={tt(lang, '还没有可做的往年真题', 'No past papers yet')}
        description={tt(
          lang,
          '管理员上传并审核通过 `past_exam` 文件后，系统会自动抽题并在这里展示。',
          'Once `past_exam` files are approved by admin, extracted questions will appear here automatically.'
        )}
      />
    )
  }

  return (
    <div className="space-y-4">
      {files.map(file => (
        <div
          key={file.artifact_id}
          className="rounded-[28px] p-5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText size={18} style={{ color: '#f59e0b' }} />
                <p className="text-base font-semibold text-white">{file.file_name}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs" style={{ color: '#94a3b8' }}>
                <span className="rounded-full px-3 py-1" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
                  {file.question_count} {tt(lang, '道题', 'questions')}
                </span>
                <span>{formatDate(file.created_at, lang)}</span>
              </div>
            </div>

            {file.is_unlocked ? (
              <GlowButton
                onClick={() => handleStart(file.artifact_id)}
                disabled={starting === file.artifact_id}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all disabled:opacity-60"
                style={{ background: 'rgba(212,168,67,0.16)', color: '#f4d37a', border: '1px solid rgba(212,168,67,0.32)' }}
              >
                {starting === file.artifact_id ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
                {tt(lang, '进入考试页', 'Open Exam View')}
              </GlowButton>
            ) : (
              <GlowButton
                onClick={() => handleUnlock(file.artifact_id)}
                disabled={unlocking === file.artifact_id}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all disabled:opacity-60"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {unlocking === file.artifact_id ? <Loader2 size={16} className="animate-spin" /> : <Bookmark size={16} />}
                {tt(lang, '解锁真题 150 积分', 'Unlock for 150 credits')}
              </GlowButton>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function MockSessionList({
  courseId,
  onStart,
}: {
  courseId: string
  onStart: (qs: ExamQuestion[]) => void
}) {
  const [sessions, setSessions] = useState<MockSession[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)
  const [numMcq, setNumMcq] = useState(10)
  const [numShort, setNumShort] = useState(5)
  const { lang } = useLang()

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      setSessions(await api.exam.listMockSessions(courseId))
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { session_id } = await api.exam.generateMock(courseId, { num_mcq: numMcq, num_short: numShort })
      await loadSessions()
      const { questions } = await api.exam.getQuestions(courseId, { mock_session_id: session_id })
      if (!questions.length) {
        alert(tt(lang, '题目生成完成，但还没有拿到题目数据，请再试一次。', 'Generation finished, but no questions were returned yet. Please retry.'))
        return
      }
      onStart(questions)
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setGenerating(false)
    }
  }

  async function handleStart(sessionId: string) {
    setStarting(sessionId)
    try {
      const { questions } = await api.exam.getQuestions(courseId, { mock_session_id: sessionId })
      if (!questions.length) {
        alert(tt(lang, '这份模拟卷暂时没有题目。', 'No questions were found for this mock paper.'))
        return
      }
      onStart(questions)
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setStarting(null)
    }
  }

  return (
    <div className="space-y-5">
      <div
        className="rounded-[28px] p-5"
        style={{ background: 'linear-gradient(135deg, rgba(212,168,67,0.12), rgba(59,130,246,0.06))', border: '1px solid rgba(212,168,67,0.18)' }}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-base font-semibold text-white">{tt(lang, '生成新模拟卷', 'Generate a New Mock Paper')}</p>
            <p className="text-sm leading-6" style={{ color: '#cbd5e1' }}>
              {tt(
                lang,
                '系统会根据你已上传的真题风格重新组织题型和措辞，尽量做出更像学校正式考试的感觉。',
                'The system will reuse your past-paper style signals to produce a paper that feels closer to the real school exam.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="space-y-1 text-sm" style={{ color: '#e2e8f0' }}>
              <span>{tt(lang, '选择题数量', 'MCQ count')}</span>
              <select
                value={numMcq}
                onChange={e => setNumMcq(Number(e.target.value))}
                className="input-glass min-w-[120px] py-2 text-sm"
              >
                {[5, 10, 15, 20].map(count => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>

            <label className="space-y-1 text-sm" style={{ color: '#e2e8f0' }}>
              <span>{tt(lang, '简答题数量', 'Short-answer count')}</span>
              <select
                value={numShort}
                onChange={e => setNumShort(Number(e.target.value))}
                className="input-glass min-w-[120px] py-2 text-sm"
              >
                {[0, 3, 5, 8].map(count => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
          </div>

          <GlowButton
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: 'rgba(212,168,67,0.16)', color: '#f4d37a', border: '1px solid rgba(212,168,67,0.32)' }}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating
              ? tt(lang, '正在生成试卷...', 'Generating paper...')
              : tt(lang, '生成模拟卷 · 100 积分', 'Generate Mock · 100 credits')}
          </GlowButton>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : !sessions.length ? (
        <EmptyState
          icon={<Sparkles size={44} className="opacity-70" />}
          title={tt(lang, '还没有历史模拟卷', 'No mock papers yet')}
          description={tt(
            lang,
            '先生成一份模拟卷，系统会自动带你进入正式做题页。',
            'Generate your first mock paper and the app will open it in the exam view automatically.'
          )}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: '#94a3b8' }}>
            {tt(lang, '历史试卷', 'History')}
          </p>
          {sessions.map(session => (
            <div
              key={session.session_id}
              className="rounded-[24px] p-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">
                    {tt(lang, '模拟卷', 'Mock Paper')} · {session.question_count} {tt(lang, '道题', 'questions')}
                  </p>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>
                    {formatDate(session.created_at, lang)}
                  </p>
                </div>

                <GlowButton
                  onClick={() => handleStart(session.session_id)}
                  disabled={starting === session.session_id}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-60"
                  style={{ background: 'rgba(99,102,241,0.16)', color: '#c7d2fe', border: '1px solid rgba(99,102,241,0.28)' }}
                >
                  {starting === session.session_id ? <Loader2 size={15} className="animate-spin" /> : <Target size={15} />}
                  {tt(lang, '继续做题', 'Open Paper')}
                </GlowButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExamDoingPage({
  courseId,
  questions,
  initialAnswers,
  initialFlags,
  onBack,
  onSubmitDone,
}: {
  courseId: string
  questions: ExamQuestion[]
  initialAnswers: AnswerMap
  initialFlags: FlagMap
  onBack: () => void
  onSubmitDone: (
    results: GradeResult[],
    finalQuestions: ExamQuestion[],
    finalAnswers: AnswerMap,
    finalFlags: FlagMap,
  ) => void
}) {
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers)
  const [flags, setFlags] = useState<FlagMap>(initialFlags)
  const [favorites, setFavorites] = useState<Record<number, boolean>>(
    Object.fromEntries(questions.map(q => [q.id, q.is_favorite ?? false]))
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const { lang } = useLang()

  const currentQuestion = questions[currentIndex]
  const answeredCount = questions.filter(q => hasAnswer(answers[q.id])).length
  const remainingCount = questions.length - answeredCount
  const mcqCount = questions.filter(q => q.question_type === 'mcq').length
  const shortCount = questions.length - mcqCount

  async function toggleFavorite(questionId: number) {
    const previous = favorites[questionId] ?? false
    setFavorites(state => ({ ...state, [questionId]: !previous }))
    try {
      const { is_favorite } = await api.exam.toggleFavorite(courseId, questionId)
      setFavorites(state => ({ ...state, [questionId]: is_favorite }))
    } catch {
      setFavorites(state => ({ ...state, [questionId]: previous }))
    }
  }

  async function handleSubmit() {
    const payload = questions
      .filter(q => hasAnswer(answers[q.id]))
      .map(q => ({
        question_id: q.id,
        user_answer: answers[q.id].trim(),
      }))

    if (!payload.length) {
      alert(tt(lang, '至少先作答 1 道题再提交。', 'Answer at least one question before submitting.'))
      return
    }

    setSubmitting(true)
    try {
      const { results } = await api.exam.submitAnswers(courseId, payload)
      onSubmitDone(results, questions, answers, flags)
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : tt(lang, '提交失败，请稍后重试。', 'Submission failed. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  function clearCurrentAnswer() {
    if (!currentQuestion) return
    setAnswers(state => {
      const next = { ...state }
      delete next[currentQuestion.id]
      return next
    })
  }

  function resetAttempt() {
    setAnswers({})
    setFlags({})
    setCurrentIndex(0)
  }

  if (!currentQuestion) return null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#94a3b8' }}>
          <ChevronLeft size={16} />
          {tt(lang, '返回试卷列表', 'Back to papers')}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={resetAttempt}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RotateCcw size={15} />
            {tt(lang, '重置本次作答', 'Reset attempt')}
          </button>

          <GlowButton
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: 'rgba(212,168,67,0.16)', color: '#f4d37a', border: '1px solid rgba(212,168,67,0.32)' }}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
            {submitting ? tt(lang, '正在判分...', 'Submitting...') : tt(lang, '提交整份试卷', 'Submit Paper')}
          </GlowButton>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className="rounded-[28px] p-5 xl:sticky xl:top-5 xl:h-fit"
          style={{ background: '#f8fafc', border: '1px solid rgba(148,163,184,0.24)', color: '#0f172a' }}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em]" style={{ color: '#64748b' }}>
                {tt(lang, '考试视图', 'Exam View')}
              </p>
              <p className="text-lg font-semibold">{getAttemptTitle(lang, currentQuestion.source_type)}</p>
            </div>

            <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid rgba(148,163,184,0.22)' }}>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span style={{ color: '#64748b' }}>{tt(lang, '当前题号', 'Current')}</span>
                  <span className="font-semibold">Q{currentIndex + 1}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: '#64748b' }}>{tt(lang, '已作答', 'Answered')}</span>
                  <span className="font-semibold">{answeredCount}/{questions.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: '#64748b' }}>{tt(lang, '剩余题目', 'Remaining')}</span>
                  <span className="font-semibold">{remainingCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: '#64748b' }}>{tt(lang, '题型组成', 'Paper mix')}</span>
                  <span className="font-semibold">{mcqCount} MCQ / {shortCount} SA</span>
                </div>
              </div>
            </div>

            <QuestionNavigator
              lang={lang}
              questions={questions}
              currentIndex={currentIndex}
              answers={answers}
              flags={flags}
              onSelect={setCurrentIndex}
            />

            <div className="flex flex-col gap-2">
              <button
                onClick={() => setFlags(state => ({ ...state, [currentQuestion.id]: !state[currentQuestion.id] }))}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all"
                style={{
                  background: flags[currentQuestion.id] ? 'rgba(251,191,36,0.18)' : '#ffffff',
                  color: flags[currentQuestion.id] ? '#92400e' : '#334155',
                  border: `1px solid ${flags[currentQuestion.id] ? 'rgba(251,191,36,0.38)' : 'rgba(148,163,184,0.24)'}`,
                }}
              >
                <Flag size={15} />
                {flags[currentQuestion.id]
                  ? tt(lang, '已标记，点击取消', 'Flagged, click to remove')
                  : tt(lang, '标记这道题', 'Flag this question')}
              </button>

              <button
                onClick={clearCurrentAnswer}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all"
                style={{ background: '#ffffff', color: '#334155', border: '1px solid rgba(148,163,184,0.24)' }}
              >
                <RotateCcw size={15} />
                {tt(lang, '清空当前答案', 'Clear current answer')}
              </button>
            </div>
          </div>
        </aside>

        <section
          className="rounded-[30px] p-4 sm:p-6"
          style={{ background: '#e9eef6', border: '1px solid rgba(148,163,184,0.22)' }}
        >
          <div className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
                    style={{ background: '#ffffff', color: '#475569', border: '1px solid rgba(148,163,184,0.24)' }}
                  >
                    {tt(lang, '第', 'Question ')}{currentIndex + 1}{tt(lang, '题', '')}
                  </span>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: 'rgba(59,130,246,0.1)', color: '#1d4ed8', border: '1px solid rgba(59,130,246,0.18)' }}
                  >
                    {getQuestionTypeLabel(lang, currentQuestion.question_type)}
                  </span>
                  {flags[currentQuestion.id] && (
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ background: 'rgba(251,191,36,0.18)', color: '#92400e', border: '1px solid rgba(251,191,36,0.32)' }}
                    >
                      {tt(lang, '已标记', 'Flagged')}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-6" style={{ color: '#64748b' }}>
                  {tt(
                    lang,
                    '按学校考试页的节奏逐题查看。题号导航会实时显示你已经作答和标记的问题。',
                    'Work through the paper one question at a time. The navigator updates as you answer and flag questions.'
                  )}
                </p>
              </div>

              <button
                onClick={() => toggleFavorite(currentQuestion.id)}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition-all"
                style={{ background: '#ffffff', color: '#334155', border: '1px solid rgba(148,163,184,0.24)' }}
              >
                <Heart
                  size={15}
                  fill={favorites[currentQuestion.id] ? '#ef4444' : 'none'}
                  style={{ color: favorites[currentQuestion.id] ? '#ef4444' : '#64748b' }}
                />
                {favorites[currentQuestion.id]
                  ? tt(lang, '已收藏', 'Saved')
                  : tt(lang, '收藏题目', 'Save question')}
              </button>
            </div>

            <QuestionPanel
              lang={lang}
              question={currentQuestion}
              questionNumber={currentIndex + 1}
              answer={answers[currentQuestion.id]}
              onAnswer={value => setAnswers(state => ({ ...state, [currentQuestion.id]: value }))}
            />

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'rgba(148,163,184,0.22)' }}>
              <div className="inline-flex items-center gap-2 text-sm" style={{ color: '#64748b' }}>
                <Clock3 size={15} />
                {tt(lang, '提交后会进入整卷回顾页，并显示每道题的判分结果。', 'After submission you will enter the review page with per-question grading.')}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCurrentIndex(index => Math.max(index - 1, 0))}
                  disabled={currentIndex === 0}
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-40"
                  style={{ background: '#ffffff', color: '#334155', border: '1px solid rgba(148,163,184,0.24)' }}
                >
                  <ChevronLeft size={15} />
                  {tt(lang, '上一题', 'Previous')}
                </button>

                <button
                  onClick={() => setCurrentIndex(index => Math.min(index + 1, questions.length - 1))}
                  disabled={currentIndex === questions.length - 1}
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-40"
                  style={{ background: '#ffffff', color: '#334155', border: '1px solid rgba(148,163,184,0.24)' }}
                >
                  {tt(lang, '下一题', 'Next')}
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function ExamResultPage({
  questions,
  results,
  answers,
  flags,
  onBack,
  onRedo,
}: {
  questions: ExamQuestion[]
  results: GradeResult[]
  answers: AnswerMap
  flags: FlagMap
  onBack: () => void
  onRedo: () => void
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const { lang } = useLang()

  const resultMap = useMemo(
    () => Object.fromEntries(results.map(result => [result.question_id, result])),
    [results]
  )

  const currentQuestion = questions[currentIndex]
  const currentResult = currentQuestion ? resultMap[currentQuestion.id] : undefined
  const answeredCount = questions.filter(q => hasAnswer(answers[q.id])).length
  const correctCount = results.filter(result => result.is_correct === true).length
  const wrongCount = results.filter(result => result.is_correct === false).length
  const reviewCount = results.filter(result => result.is_correct === null).length

  if (!currentQuestion) return null

  const tone = getResultTone(currentResult)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#94a3b8' }}>
          <ChevronLeft size={16} />
          {tt(lang, '返回试卷列表', 'Back to papers')}
        </button>

        <button
          onClick={onRedo}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <RotateCcw size={15} />
          {tt(lang, '重新进入作答页', 'Return to attempt view')}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className="rounded-[28px] p-5 xl:sticky xl:top-5 xl:h-fit"
          style={{ background: '#f8fafc', border: '1px solid rgba(148,163,184,0.24)', color: '#0f172a' }}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em]" style={{ color: '#64748b' }}>
                {tt(lang, '试卷回顾', 'Paper Review')}
              </p>
              <p className="text-lg font-semibold">{getAttemptTitle(lang, currentQuestion.source_type)}</p>
            </div>

            <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid rgba(148,163,184,0.22)' }}>
              <div className="space-y-3">
                <div>
                  <p className="text-3xl font-bold" style={{ color: '#0f172a' }}>
                    {correctCount} / {answeredCount}
                  </p>
                  <p className="text-xs" style={{ color: '#64748b' }}>
                    {tt(lang, '本次已判分题目', 'Graded answers this attempt')}
                  </p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span style={{ color: '#64748b' }}>{tt(lang, '正确', 'Correct')}</span>
                    <span className="font-semibold" style={{ color: '#15803d' }}>{correctCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: '#64748b' }}>{tt(lang, '错误', 'Incorrect')}</span>
                    <span className="font-semibold" style={{ color: '#b91c1c' }}>{wrongCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: '#64748b' }}>{tt(lang, '待复核', 'Needs review')}</span>
                    <span className="font-semibold" style={{ color: '#b45309' }}>{reviewCount}</span>
                  </div>
                </div>
              </div>
            </div>

            <QuestionNavigator
              lang={lang}
              questions={questions}
              currentIndex={currentIndex}
              answers={answers}
              flags={flags}
              results={resultMap}
              onSelect={setCurrentIndex}
            />
          </div>
        </aside>

        <section
          className="rounded-[30px] p-4 sm:p-6"
          style={{ background: '#e9eef6', border: '1px solid rgba(148,163,184,0.22)' }}
        >
          <div className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
                    style={{ background: '#ffffff', color: '#475569', border: '1px solid rgba(148,163,184,0.24)' }}
                  >
                    {tt(lang, '第', 'Question ')}{currentIndex + 1}{tt(lang, '题', '')}
                  </span>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: tone.background, color: tone.text, border: `1px solid ${tone.border}` }}
                  >
                    {getQuestionStatusLabel(lang, answers[currentQuestion.id], currentResult)}
                  </span>
                  {flags[currentQuestion.id] && (
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ background: 'rgba(251,191,36,0.18)', color: '#92400e', border: '1px solid rgba(251,191,36,0.32)' }}
                    >
                      {tt(lang, '已标记', 'Flagged')}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-6" style={{ color: '#64748b' }}>
                  {tt(
                    lang,
                    '这里按学校 quiz review 的逻辑显示当前题、你的作答、判分结果和参考答案。',
                    'This review mirrors a school quiz-review flow: current question, your answer, grading result, and the reference answer.'
                  )}
                </p>
              </div>

              <div
                className="rounded-2xl px-4 py-3 text-sm font-semibold"
                style={{ background: '#ffffff', color: tone.text, border: `1px solid ${tone.border}` }}
              >
                {tt(lang, '得分', 'Mark')}: {getMarkLabel(lang, currentResult, answers[currentQuestion.id])}
              </div>
            </div>

            <QuestionReviewPanel
              lang={lang}
              question={currentQuestion}
              answer={answers[currentQuestion.id]}
              result={currentResult}
            />

            <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: 'rgba(148,163,184,0.22)' }}>
              <button
                onClick={() => setCurrentIndex(index => Math.max(index - 1, 0))}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-40"
                style={{ background: '#ffffff', color: '#334155', border: '1px solid rgba(148,163,184,0.24)' }}
              >
                <ChevronLeft size={15} />
                {tt(lang, '上一题', 'Previous')}
              </button>

              <button
                onClick={() => setCurrentIndex(index => Math.min(index + 1, questions.length - 1))}
                disabled={currentIndex === questions.length - 1}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-40"
                style={{ background: '#ffffff', color: '#334155', border: '1px solid rgba(148,163,184,0.24)' }}
              >
                {tt(lang, '下一题', 'Next')}
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function QuestionNavigator({
  lang,
  questions,
  currentIndex,
  answers,
  flags,
  results,
  onSelect,
}: {
  lang: 'zh' | 'en'
  questions: ExamQuestion[]
  currentIndex: number
  answers: AnswerMap
  flags: FlagMap
  results?: Record<number, GradeResult>
  onSelect: (index: number) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: '#64748b' }}>
          {tt(lang, '题号导航', 'Question Navigator')}
        </p>
        <p className="text-xs" style={{ color: '#64748b' }}>
          {questions.length} {tt(lang, '题', 'items')}
        </p>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {questions.map((question, index) => {
          const result = results?.[question.id]
          const answered = hasAnswer(answers[question.id])
          const active = index === currentIndex
          const flagged = Boolean(flags[question.id])

          let background = '#ffffff'
          let color = '#334155'
          let border = 'rgba(148,163,184,0.24)'

          if (result?.is_correct === true) {
            background = 'rgba(34,197,94,0.1)'
            color = '#15803d'
            border = 'rgba(34,197,94,0.3)'
          } else if (result?.is_correct === false) {
            background = 'rgba(239,68,68,0.1)'
            color = '#b91c1c'
            border = 'rgba(239,68,68,0.26)'
          } else if (result?.is_correct === null && result) {
            background = 'rgba(245,158,11,0.08)'
            color = '#b45309'
            border = 'rgba(245,158,11,0.26)'
          } else if (answered) {
            background = 'rgba(59,130,246,0.08)'
            color = '#1d4ed8'
            border = 'rgba(59,130,246,0.24)'
          }

          if (active) {
            border = '#0f172a'
          }

          return (
            <button
              key={question.id}
              onClick={() => onSelect(index)}
              className="relative rounded-xl px-0 py-2 text-sm font-semibold transition-all"
              style={{ background, color, border: `1px solid ${border}` }}
              title={`${tt(lang, '第', 'Question ')}${index + 1}${tt(lang, '题', '')}`}
            >
              {index + 1}
              {flagged && (
                <span
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                  style={{ background: '#f59e0b' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function QuestionPanel({
  lang,
  question,
  questionNumber,
  answer,
  onAnswer,
}: {
  lang: 'zh' | 'en'
  question: ExamQuestion
  questionNumber: number
  answer: string | undefined
  onAnswer: (value: string) => void
}) {
  const [lightbox, setLightbox] = useState(false)
  const renderableOptions = getRenderableOptions(question)
  const treatAsMcq = question.question_type === 'mcq' || isLikelyMcqStem(question)
  const missingMcqOptions = treatAsMcq && renderableOptions.length < 4

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-[13px] font-semibold uppercase tracking-[0.22em]" style={{ color: '#64748b' }}>
              {tt(lang, '题目内容', 'Question Prompt')}
            </p>
            <div className="rounded-[22px] p-5" style={{ background: '#f8fafc', border: '1px solid rgba(148,163,184,0.2)' }}>
              <p className="whitespace-pre-wrap text-[17px] leading-8" style={{ color: '#0f172a' }}>
                <span className="font-semibold" style={{ color: '#1d4ed8' }}>Question {questionNumber}. </span>
                {question.question_text}
              </p>
            </div>
          </div>

          {question.has_visual && !question.page_image_url && (
            <div
              className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm"
              style={{ background: 'rgba(245,158,11,0.08)', color: '#92400e', border: '1px solid rgba(245,158,11,0.24)' }}
            >
              <AlertCircle size={16} />
              {tt(lang, '这道题依赖图表，但图像暂时没有自动提取出来，请结合原试卷查看。', 'This question depends on a figure, but the image could not be extracted automatically. Please refer to the original paper if needed.')}
            </div>
          )}

          {missingMcqOptions && (
            <div
              className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#991b1b', border: '1px solid rgba(239,68,68,0.18)' }}
            >
              <AlertCircle size={16} />
              {tt(
                lang,
                '这道选择题的选项在提取时缺失了。重新抽取后会优先保留整页图像；当前请点击图片查看原页内容。',
                'The answer options for this MCQ were lost during extraction. Re-extraction will now preserve the full page image first; for now, click the image to inspect the original page.'
              )}
            </div>
          )}

          {question.page_image_url && (
            <>
              <button
                onClick={() => setLightbox(true)}
                className="w-full overflow-hidden rounded-[22px] border bg-white transition-all"
                style={{ borderColor: 'rgba(148,163,184,0.2)' }}
              >
                <img
                  src={question.page_image_url}
                  alt="Exam visual"
                  className="w-full object-contain"
                  style={{ maxHeight: 420 }}
                />
              </button>

              {lightbox && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
                  onClick={() => setLightbox(false)}
                >
                  <img
                    src={question.page_image_url}
                    alt="Exam visual"
                    className="max-h-[92vh] max-w-[96vw] rounded-2xl bg-white"
                    onClick={event => event.stopPropagation()}
                  />
                </div>
              )}
            </>
          )}

          {treatAsMcq && renderableOptions.length >= 4 ? (
            <div className="space-y-3">
              {renderableOptions.map((option, index) => {
                const letter = LETTERS[index] || String(index + 1)
                const chosen = getChoiceLetter(answer) === letter
                return (
                  <button
                    key={`${question.id}-${letter}`}
                    onClick={() => onAnswer(letter)}
                    className="flex w-full items-start gap-3 rounded-[20px] px-4 py-4 text-left transition-all"
                    style={{
                      background: chosen ? 'rgba(37,99,235,0.08)' : '#ffffff',
                      color: '#0f172a',
                      border: `1px solid ${chosen ? 'rgba(37,99,235,0.36)' : 'rgba(148,163,184,0.22)'}`,
                    }}
                  >
                    <span
                      className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      style={{
                        background: chosen ? '#2563eb' : '#e2e8f0',
                        color: chosen ? '#ffffff' : '#334155',
                      }}
                    >
                      {letter}
                    </span>
                    <span className="text-sm leading-7">{option}</span>
                  </button>
                )
              })}
            </div>
          ) : !treatAsMcq ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: '#475569' }}>
                {tt(lang, '你的答案', 'Your Answer')}
              </label>
              <textarea
                value={answer ?? ''}
                onChange={event => onAnswer(event.target.value)}
                rows={7}
                placeholder={tt(lang, '在这里输入你的作答内容...', 'Type your answer here...')}
                className="w-full rounded-[22px] px-4 py-4 text-sm leading-7"
                style={{
                  background: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.24)',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function QuestionReviewPanel({
  lang,
  question,
  answer,
  result,
}: {
  lang: 'zh' | 'en'
  question: ExamQuestion
  answer: string | undefined
  result: GradeResult | undefined
}) {
  const tone = getResultTone(result)
  const selectedLetter = getChoiceLetter(answer)
  const correctLetter = getChoiceLetter(question.correct_answer)
  const renderableOptions = getRenderableOptions(question)
  const treatAsMcq = question.question_type === 'mcq' || isLikelyMcqStem(question)

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <div className="space-y-4">
          <div className="rounded-[22px] p-5" style={{ background: '#f8fafc', border: '1px solid rgba(148,163,184,0.2)' }}>
            <p className="whitespace-pre-wrap text-[17px] leading-8" style={{ color: '#0f172a' }}>
              {question.question_text}
            </p>
          </div>

          {treatAsMcq && renderableOptions.length >= 4 ? (
            <div className="space-y-3">
              {renderableOptions.map((option, index) => {
                const letter = LETTERS[index] || String(index + 1)
                const chosen = selectedLetter === letter
                const correct = correctLetter === letter

                let background = '#ffffff'
                let border = 'rgba(148,163,184,0.22)'
                let color = '#0f172a'

                if (correct) {
                  background = 'rgba(34,197,94,0.08)'
                  border = 'rgba(34,197,94,0.3)'
                  color = '#166534'
                } else if (chosen) {
                  background = 'rgba(239,68,68,0.08)'
                  border = 'rgba(239,68,68,0.26)'
                  color = '#991b1b'
                }

                return (
                  <div
                    key={`${question.id}-${letter}`}
                    className="flex items-start gap-3 rounded-[20px] px-4 py-4"
                    style={{ background, border: `1px solid ${border}`, color }}
                  >
                    <span
                      className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      style={{
                        background: correct ? '#22c55e' : chosen ? '#ef4444' : '#e2e8f0',
                        color: correct || chosen ? '#ffffff' : '#334155',
                      }}
                    >
                      {letter}
                    </span>
                    <div className="space-y-1 text-sm leading-7">
                      <p>{option}</p>
                      {chosen && (
                        <p className="text-xs font-semibold" style={{ color: selectedLetter === correctLetter ? '#15803d' : '#b91c1c' }}>
                          {tt(lang, '你的选择', 'Your choice')}
                        </p>
                      )}
                      {correct && (
                        <p className="text-xs font-semibold" style={{ color: '#15803d' }}>
                          {tt(lang, '正确答案', 'Correct answer')}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : !treatAsMcq ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ReviewAnswerBlock
                title={tt(lang, '你的答案', 'Your answer')}
                content={hasAnswer(answer) ? answer! : tt(lang, '未作答', 'Not answered')}
                toneBorder="rgba(148,163,184,0.22)"
                toneBg="#ffffff"
                toneText="#0f172a"
              />

              <ReviewAnswerBlock
                title={tt(lang, '参考答案', 'Reference answer')}
                content={question.correct_answer || tt(lang, '暂无参考答案', 'No reference answer provided')}
                toneBorder="rgba(34,197,94,0.24)"
                toneBg="rgba(34,197,94,0.06)"
                toneText="#166534"
              />
            </div>
          ) : (
            <ReviewAnswerBlock
              title={tt(lang, '选项缺失', 'Missing options')}
              content={tt(
                lang,
                '这道选择题在抽题时没有拿到完整选项。建议重新提取该真题文件后再做。',
                'This MCQ was extracted without its full answer options. Re-extract the past paper to repair it.'
              )}
              toneBorder="rgba(239,68,68,0.22)"
              toneBg="rgba(239,68,68,0.06)"
              toneText="#991b1b"
            />
          )}
        </div>
      </div>

      <div
        className="rounded-[24px] p-5"
        style={{ background: tone.background, border: `1px solid ${tone.border}`, color: tone.text }}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">
            {result?.is_correct === true && <CheckCircle2 size={18} />}
            {result?.is_correct === false && <XCircle size={18} />}
            {(result?.is_correct === null || !result) && <AlertCircle size={18} />}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              {getQuestionStatusLabel(lang, answer, result)}
            </p>

            {result?.feedback && (
              <p className="text-sm leading-7">{result.feedback}</p>
            )}

            {question.question_type === 'mcq' && correctLetter && (
              <p className="text-sm leading-7">
                {tt(lang, '正确答案是：', 'The correct answer is: ')}
                <span className="font-semibold">{correctLetter}</span>
              </p>
            )}

            {question.explanation && (
              <p className="text-sm leading-7">
                {tt(lang, '题目解释：', 'Explanation: ')}
                {question.explanation}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewAnswerBlock({
  title,
  content,
  toneBorder,
  toneBg,
  toneText,
}: {
  title: string
  content: string
  toneBorder: string
  toneBg: string
  toneText: string
}) {
  return (
    <div className="rounded-[22px] p-4" style={{ background: toneBg, border: `1px solid ${toneBorder}`, color: toneText }}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{title}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{content}</p>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div
      className="rounded-[28px] px-6 py-16 text-center"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#cbd5e1' }}
    >
      <div className="mb-4 flex justify-center text-slate-400">{icon}</div>
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6" style={{ color: '#94a3b8' }}>
        {description}
      </p>
    </div>
  )
}

function LoadingSpinner() {
  return <CubesLoader className="py-16" />
}
