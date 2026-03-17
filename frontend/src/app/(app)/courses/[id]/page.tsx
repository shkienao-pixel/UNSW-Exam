'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'

import { useFloatingAsk } from '@/lib/floating-ask-context'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/i18n'
import { useGeneration } from '@/lib/generation-context'
import type { Course, Artifact, ScopeSet, Output, DocType } from '@/lib/types'
import { DOC_TYPE_LABELS, DOC_TYPE_COLORS } from '@/lib/types'
import { biText } from '@/lib/utils'
import type { BiMode } from '@/lib/utils'
import { useCourseData } from '@/hooks/useCourseData'
import { useEnrollment } from '@/hooks/useEnrollment'
import { useCredits } from '@/hooks/useCredits'
import {
  FileText, Upload, Loader2, History,
  ChevronDown, ChevronRight, BookOpen, RotateCcw,
  ExternalLink, Trash2, Sparkles,
  Code, Lock, Target, Layers3, ListTree,
} from 'lucide-react'
import MistakesView from '@/components/MistakesView'
import InsufficientCreditsModal from '@/components/InsufficientCreditsModal'
import ReactMarkdown from 'react-markdown'

import ResourceHubTab from '@/components/ResourceHubTab'
import ExamPlannerTab from '@/components/ExamPlannerTab'
import CourseLockedScreen from '@/components/CourseLockedScreen'
import ExamTab from '@/components/ExamTab'
import { TranslatablePanel, ContentTranslationPanel } from '@/components/TranslationPanel'
import TypedOutputsView from '@/components/TypedOutputsView'
import SummaryTab from '@/components/SummaryTab'

// ── View routing ──────────────────────────────────────────────────────────────

function CoursePageInner() {
  const { id: courseId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const view = searchParams.get('view') || 'flashcards'

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useLang()
  const { role, user } = useAuth()
  const { setCourseContext } = useFloatingAsk()

  const { course, artifacts, setArtifacts, scopeSets, loading, reload: reloadCourse } = useCourseData(courseId)
  const { isEnrolled, setIsEnrolled, term: enrollTerm, cost: enrollCost } = useEnrollment(courseId, role)
  const { balance: creditBalance, deduct: spendCredits } = useCredits(!!role && role !== 'guest')

  const [outputs, setOutputs] = useState<Output[]>([])

  // Keep floating AI window in sync with this course
  useEffect(() => {
    if (courseId && course) setCourseContext(courseId, course.name)
  }, [courseId, course?.name, setCourseContext])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={32} />
    </div>
  )
  if (!course) return <div className="p-8 text-red-400">{t('course_404')}</div>

  // 未选课 → 锁屏（guest 跳过，管理员跳过）
  if (role !== 'guest' && isEnrolled === false) {
    return (
      <CourseLockedScreen
        courseId={courseId}
        courseName={course.name}
        courseCode={course.code}
        term={enrollTerm}
        cost={enrollCost}
        onEnrolled={() => { setIsEnrolled(true); reloadCourse() }}
      />
    )
  }

  // 考试计划视图
  if (view === 'planner') {
    return (
      <div className="mx-auto w-full max-w-[780px] flex-1 overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">
        <ExamPlannerTab courseId={courseId} />
      </div>
    )
  }

  // 知识摘要视图：管理员上传的结构化课程摘要
  if (view === 'course-summary') {
    return (
      <div className="mx-auto w-full max-w-[1180px] flex-1 overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">
        <SummaryTab courseId={courseId} />
      </div>
    )
  }


  return (
    <div className="mx-auto w-full max-w-[1180px] flex-1 overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">
      {view === 'flashcards' && <FlashcardsTab courseId={courseId} />}
      {view === 'mistakes'   && <MistakesTab courseId={courseId} />}
      {view === 'quiz'       && <ExamTab courseId={courseId} />}

      {view === 'outputs'    && <OutputsTab courseId={courseId} outputs={outputs} setOutputs={setOutputs} />}
      {view === 'resources'  && (
        role === 'guest' ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-lg font-semibold text-white mb-2">课程资料库仅限注册用户</h3>
            <p className="text-sm mb-6" style={{ color: '#555' }}>注册账号后即可上传课件与真题，并参与积分解锁</p>
            <a href="/register"
              className="px-6 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
              立即注册 →
            </a>
          </div>
        ) : (
          <ResourceHubTab
            courseId={courseId}
            artifacts={artifacts}
            setArtifacts={setArtifacts}
            fileInputRef={fileInputRef}
            currentUserId={user?.id ?? ''}
            creditBalance={creditBalance ?? 0}
            onCreditSpent={spendCredits}
          />
        )
      )}

    </div>
  )
}

export default function CoursePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={32} />
      </div>
    }>
      <CoursePageInner />
    </Suspense>
  )
}

// ── Bilingual helpers ─────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string
  options: string[]
  answer: string
  explanation?: string
  source_artifact_id?: number
  source_url?: string
}

interface QuizSource {
  artifact_id: number
  file_name: string
  storage_url: string
}

// ── Quiz Tab ──────────────────────────────────────────────────────────────────

function QuizTab({ courseId }: { courseId: string }) {
  const { t } = useLang()
  return (
    <TypedOutputsView
      courseId={courseId} outputType="quiz"
      icon={<Target size={20} style={{ color: '#FFD700' }} />} title={t('quiz_title')} subtitle={t('quiz_sub')}
      emptyTitle={t('empty_quiz')} emptyLinkLabel={t('empty_quiz_btn')}
      renderContent={output => {
        let questions: QuizQuestion[] = []
        let sources: QuizSource[] = []
        try {
          const parsed = JSON.parse(output.content || '[]')
          if (Array.isArray(parsed)) {
            questions = parsed
          } else {
            questions = parsed.questions || []
            sources = parsed.sources || []
          }
        } catch {}
        return <QuizDisplay questions={questions} sources={sources} courseId={courseId} />
      }}
    />
  )
}

// ── Mistakes Tab ──────────────────────────────────────────────────────────────

function MistakesTab({ courseId }: { courseId: string }) {
  return <MistakesView courseId={courseId} />
}

// ── Flashcards Tab ────────────────────────────────────────────────────────────

type Flashcard =
  | { type: 'vocab'; front: string; back: string }
  | { type: 'mcq'; question: string; options: string[]; answer: string; explanation?: string }

function FlashcardsTab({ courseId }: { courseId: string }) {
  const { t, lang } = useLang()
  const [outputs, setOutputs] = useState<Output[]>([])
  const [selectedOutputId, setSelectedOutputId] = useState<number | null>(null)
  const [cards, setCards] = useState<Flashcard[]>([])
  const [cardIndex, setCardIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [biMode] = useState<BiMode>('full')
  const [loading, setLoading] = useState(true)
  const [finished, setFinished] = useState(false)
  const [remembered, setRemembered] = useState(0)
  const [forgotten, setForgotten] = useState(0)
  const [isSliding, setIsSliding] = useState(false)
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left')

  // refs for keyboard handler to read latest state without stale closure
  const stateRef = useRef({ cardIndex, flipped, revealed, chosen, cards, finished })
  useEffect(() => { stateRef.current = { cardIndex, flipped, revealed, chosen, cards, finished } })

  const loadCards = useCallback((output: Output) => {
    setSelectedOutputId(output.id)
    setCardIndex(0); setFlipped(false); setChosen(null); setRevealed(false); setFinished(false)
    setRemembered(0); setForgotten(0)
    try {
      const parsed = JSON.parse(output.content || '[]')
      setCards(Array.isArray(parsed) ? parsed : [])
    } catch { setCards([]) }
  }, [])

  useEffect(() => {
    api.outputs.list(courseId, 'flashcards')
      .then(data => { setOutputs(data); if (data.length > 0) loadCards(data[0]) })
      .finally(() => setLoading(false))
  }, [courseId, loadCards])

  function animateSlide(dir: 'left' | 'right') {
    setSlideDir(dir)
    setIsSliding(true)
    setTimeout(() => setIsSliding(false), 220)
  }

  function next() {
    const { cardIndex: ci, cards: cs } = stateRef.current
    if (ci >= cs.length - 1) { setFinished(true); return }
    animateSlide('left')
    setCardIndex(i => i + 1); setFlipped(false); setChosen(null); setRevealed(false)
  }
  function prev() {
    const { cardIndex: ci } = stateRef.current
    if (ci === 0) return
    animateSlide('right')
    setCardIndex(i => i - 1); setFlipped(false); setChosen(null); setRevealed(false)
  }
  function restart() {
    setCardIndex(0); setFlipped(false); setChosen(null); setRevealed(false); setFinished(false)
    setRemembered(0); setForgotten(0)
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const { cardIndex: ci, flipped: fl, revealed: rv, chosen: ch, cards: cs, finished: fin } = stateRef.current
      if (fin || cs.length === 0) return
      const c = cs[ci]
      if (!c) return
      if (e.key === ' ') {
        e.preventDefault()
        if (c.type === 'vocab') setFlipped(f => !f)
      }
      if (e.key === 'ArrowRight') {
        if (c.type === 'vocab' && fl) { setRemembered(r => r + 1); next() }
        else if (c.type === 'mcq' && rv) {
          next()
        }
      }
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [courseId])

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={28} />
    </div>
  )

  const card = cards[cardIndex]
  const progress = cards.length > 0 ? ((cardIndex + 1) / cards.length) * 100 : 0
  const accuracy = (remembered + forgotten) > 0 ? Math.round((remembered / (remembered + forgotten)) * 100) : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Layers3 size={22} style={{ color: '#FFD700' }} /> {t('flashcards_title')}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('flashcards_sub')}</p>
        </div>
        {outputs.length > 0 && (
          <select className="input-glass text-xs py-1 flex-shrink-0 mt-1" value={selectedOutputId ?? ''}
            onChange={e => { const o = outputs.find(x => x.id === Number(e.target.value)); if (o) loadCards(o) }}>
            {outputs.map(o => (
              <option key={o.id} value={o.id}>
                {new Date(o.created_at).toLocaleDateString('zh-CN')}
                {selectedOutputId === o.id && cards.length > 0 ? ` (${cards.length})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {outputs.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
          <BookOpen size={52} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-white mb-4">{t('empty_fc')}</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl" style={{ color: '#555' }}>没有卡片</div>
      ) : finished ? (
        /* ── Completion screen ── */
        <div className="glass p-10 rounded-[28px] text-center space-y-6"
          style={{ border: '1px solid rgba(255,215,0,0.15)' }}>
          <div className="text-5xl">🎉</div>
          <div>
            <p className="text-2xl font-bold text-white mb-1">{lang === 'zh' ? '全部完成！' : 'All Done!'}</p>
            <p className="text-sm" style={{ color: '#666' }}>{lang === 'zh' ? `共 ${cards.length} 张卡片` : `${cards.length} cards`}</p>
          </div>
          {(remembered > 0 || forgotten > 0) && (
            <div className="flex justify-center gap-8">
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#4ade80' }}>{remembered}</p>
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>{lang === 'zh' ? '记住了' : 'Got it'}</p>
              </div>
              {accuracy !== null && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{accuracy}%</p>
                  <p className="text-xs mt-0.5" style={{ color: '#555' }}>{lang === 'zh' ? '正确率' : 'Accuracy'}</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#ff8d8d' }}>{forgotten}</p>
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>{lang === 'zh' ? '忘了' : 'Forgot'}</p>
              </div>
            </div>
          )}
          <button onClick={restart}
            className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium mx-auto"
            style={{ background: 'rgba(255,255,255,0.07)', color: '#ddd', border: '1px solid rgba(255,255,255,0.1)' }}>
            <RotateCcw size={13} /> {lang === 'zh' ? '再做一次' : 'Redo'}
          </button>
        </div>
      ) : (
        <>
          {/* Progress bar + stats row */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: '#555' }}>{cardIndex + 1} / {cards.length}</span>
              <div className="flex items-center gap-3">
                {(remembered > 0 || forgotten > 0) && (
                  <div className="flex items-center gap-2.5">
                    <span style={{ color: '#4ade80' }}>✓ {remembered}</span>
                    <span style={{ color: '#ff8d8d' }}>✗ {forgotten}</span>
                  </div>
                )}
                <button onClick={restart}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1"
                  style={{ color: 'rgba(255,255,255,0.28)', border: '1px solid rgba(255,255,255,0.06)', background: 'transparent' }}>
                  <RotateCcw size={10} /> {t('fc_reset')}
                </button>
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #b8924a, #FFD700)' }} />
            </div>
          </div>

          {/* Card area with slide transition */}
          {card && (
            <div style={{
              opacity: isSliding ? 0 : 1,
              transform: isSliding ? `translateX(${slideDir === 'left' ? '-16px' : '16px'})` : 'translateX(0)',
              transition: 'opacity 0.18s ease, transform 0.18s ease',
            }}>
              {/* Card type badge */}
              <div className="flex items-center justify-center mb-4">
                <span className="text-xs px-3 py-0.5 rounded-full font-medium"
                  style={{
                    background: card.type === 'vocab' ? 'rgba(200,165,90,0.1)' : 'rgba(96,165,250,0.1)',
                    color: card.type === 'vocab' ? '#d4b46a' : '#93C5FD',
                    border: `1px solid ${card.type === 'vocab' ? 'rgba(200,165,90,0.22)' : 'rgba(96,165,250,0.22)'}`,
                  }}>
                  {card.type === 'vocab' ? '词汇卡' : '选择题'}
                </span>
              </div>

              {/* ── Vocab card with 3D flip (CodePen pattern) ── */}
              {card.type === 'vocab' && (
                <div className="space-y-4">
                  {/* box-item: outer wrapper with backface-visibility hidden */}
                  <div className="mx-auto w-full max-w-[640px]"
                    style={{ position: 'relative', WebkitBackfaceVisibility: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setFlipped(f => !f)}>
                    {/* flip-box: preserve-3d + perspective */}
                    <div style={{
                      transformStyle: 'preserve-3d',
                      WebkitTransformStyle: 'preserve-3d',
                      perspective: '1000px',
                      WebkitPerspective: '1000px',
                    }}>
                      {/* flip-box-front */}
                      <div style={{
                        minHeight: '300px',
                        borderRadius: '28px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
                        transition: 'transform 0.7s cubic-bezier(.4,.2,.2,1)',
                        WebkitTransition: 'transform 0.7s cubic-bezier(.4,.2,.2,1)',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transformStyle: 'preserve-3d',
                        WebkitTransformStyle: 'preserve-3d',
                        transform: flipped ? 'rotateY(-180deg)' : 'rotateY(0deg)',
                      }}>
                        {/* inner content with translateZ depth */}
                        <div style={{
                          position: 'absolute', left: 0, width: '100%', top: '50%',
                          padding: '40px 48px',
                          outline: '1px solid transparent',
                          WebkitPerspective: 'inherit',
                          perspective: 'inherit',
                          zIndex: 2,
                          transform: 'translateY(-50%) translateZ(60px) scale(.94)',
                          WebkitTransform: 'translateY(-50%) translateZ(60px) scale(.94)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
                        }}>
                          <span className="text-xs px-2.5 py-0.5 rounded-full"
                            style={{ color: 'rgba(255,215,0,0.45)', border: '1px solid rgba(255,215,0,0.12)', background: 'rgba(255,215,0,0.04)' }}>
                            {t('fc_front')}
                          </span>
                          <p className="text-2xl font-semibold text-center" style={{ color: '#FFD700', lineHeight: 1.5 }}>
                            {biText(card.front, biMode)}
                          </p>
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.18)' }}>
                            {t('fc_click_tip')} · Space
                          </p>
                        </div>
                      </div>

                      {/* flip-box-back */}
                      <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%',
                        minHeight: '300px',
                        borderRadius: '28px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.11)',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
                        transition: 'transform 0.7s cubic-bezier(.4,.2,.2,1)',
                        WebkitTransition: 'transform 0.7s cubic-bezier(.4,.2,.2,1)',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transformStyle: 'preserve-3d',
                        WebkitTransformStyle: 'preserve-3d',
                        transform: flipped ? 'rotateY(0deg)' : 'rotateY(180deg)',
                      }}>
                        {/* inner content with translateZ depth */}
                        <div style={{
                          position: 'absolute', left: 0, width: '100%', top: '50%',
                          padding: '40px 48px',
                          outline: '1px solid transparent',
                          WebkitPerspective: 'inherit',
                          perspective: 'inherit',
                          zIndex: 2,
                          transform: 'translateY(-50%) translateZ(60px) scale(.94)',
                          WebkitTransform: 'translateY(-50%) translateZ(60px) scale(.94)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
                        }}>
                          <span className="text-xs px-2.5 py-0.5 rounded-full"
                            style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                            {t('fc_back')}
                          </span>
                          <p className="text-xl font-medium text-center" style={{ color: '#E2E2E2', lineHeight: 1.6 }}>
                            {biText(card.back, biMode)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Vocab navigation */}
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button onClick={prev} disabled={cardIndex === 0}
                      className="px-4 py-2 rounded-full text-sm disabled:opacity-25"
                      style={{ background: 'rgba(255,255,255,0.04)', color: '#888', border: '1px solid rgba(255,255,255,0.07)' }}>
                      ← {t('fc_prev')}
                    </button>
                    {!flipped ? (
                      <button onClick={() => setFlipped(true)}
                        className="px-5 py-2 rounded-full text-sm font-medium"
                        style={{ background: 'rgba(200,165,90,0.14)', color: '#e6cf98', border: '1px solid rgba(200,165,90,0.24)' }}>
                        {t('fc_flip')}
                      </button>
                    ) : (
                      <>
                        <button onClick={() => {
                          setForgotten(f => f + 1)
                          next()
                        }}
                          className="px-4 py-2 rounded-full text-sm"
                          style={{ background: 'rgba(255,68,68,0.09)', color: '#ff8d8d', border: '1px solid rgba(255,68,68,0.18)' }}>
                          ✗ {t('fc_forgot')}
                        </button>
                        <button onClick={() => { setRemembered(r => r + 1); next() }}
                          className="px-5 py-2 rounded-full text-sm font-medium"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
                          ✓ {t('fc_got_it')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── MCQ card ── */}
              {card.type === 'mcq' && (
                <div className="space-y-4">
                  <div className="rounded-[26px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_20px_56px_rgba(0,0,0,0.22)] space-y-4">
                    <p className="font-semibold text-white text-[1.05rem] leading-snug">{biText(card.question, biMode)}</p>
                    <div className="space-y-2.5">
                      {card.options.map((opt, j) => {
                        const label = String.fromCharCode(65 + j)
                        const isChosen = chosen === label
                        const isCorrect = label === card.answer
                        let bg = 'rgba(255,255,255,0.04)'
                        let border = 'rgba(255,255,255,0.08)'
                        let color = '#CCC'
                        let labelColor = '#FFD700'
                        if (revealed) {
                          if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = 'rgba(34,197,94,0.45)'; color = '#86efac'; labelColor = '#4ade80' }
                          else if (isChosen) { bg = 'rgba(255,68,68,0.08)'; border = 'rgba(255,68,68,0.35)'; color = '#fca5a5'; labelColor = '#f87171' }
                          else { color = '#555'; labelColor = '#444' }
                        }
                        return (
                          <button key={j}
                            onClick={() => { if (!revealed) { setChosen(label); setRevealed(true) } }}
                            disabled={revealed}
                            className="w-full text-left px-4 py-3 rounded-[15px] text-sm transition-all duration-200"
                            style={{ background: bg, border: `1px solid ${border}`, color }}>
                            <span style={{ color: labelColor, fontWeight: 600, marginRight: '6px' }}>{label}.</span>
                            {biText(opt, biMode)}
                            {revealed && isCorrect && <span className="float-right" style={{ color: '#4ade80' }}>✓</span>}
                            {revealed && isChosen && !isCorrect && <span className="float-right" style={{ color: '#f87171' }}>✗</span>}
                          </button>
                        )
                      })}
                    </div>
                    {revealed && (
                      <div className="rounded-2xl px-4 py-3"
                        style={{ background: 'rgba(200,165,90,0.07)', border: '1px solid rgba(200,165,90,0.14)' }}>
                        <p className="text-xs leading-relaxed" style={{ color: '#d0d0d8' }}>
                          💡 {biText(card.explanation || (chosen === card.answer ? '回答正确！' : `正确答案是 ${card.answer}`), biMode)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* MCQ navigation */}
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button onClick={prev} disabled={cardIndex === 0}
                      className="px-4 py-2 rounded-full text-sm disabled:opacity-25"
                      style={{ background: 'rgba(255,255,255,0.04)', color: '#888', border: '1px solid rgba(255,255,255,0.07)' }}>
                      ← {t('fc_prev')}
                    </button>
                    {!revealed ? (
                      <button onClick={next} disabled={cardIndex === cards.length - 1}
                        className="px-4 py-2 rounded-full text-sm disabled:opacity-25"
                        style={{ background: 'rgba(200,165,90,0.12)', color: '#e6cf98', border: '1px solid rgba(200,165,90,0.2)' }}>
                        {t('fc_skip')} →
                      </button>
                    ) : (
                      <button
                        onClick={() => { next() }}
                        className="px-5 py-2 rounded-full text-sm font-medium"
                        style={{
                          background: chosen === card.answer ? 'rgba(34,197,94,0.1)' : 'rgba(200,165,90,0.12)',
                          color: chosen === card.answer ? '#4ade80' : '#e6cf98',
                          border: `1px solid ${chosen === card.answer ? 'rgba(34,197,94,0.22)' : 'rgba(200,165,90,0.22)'}`,
                        }}>
                        {cardIndex === cards.length - 1 ? t('fc_done') : `${t('fc_next')} →`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Keyboard hint */}
              <p className="text-center text-xs mt-3" style={{ color: 'rgba(255,255,255,0.12)' }}>
                ← → 导航 · Space 翻转
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}


// ── 历史输出 Tab ──────────────────────────────────────────────────────────────

const OUTPUT_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  summary:    { label: '知识摘要', icon: <FileText size={16} style={{ color: '#60A5FA' }} />, color: '#60A5FA', bg: 'rgba(96,165,250,0.08)'  },
  quiz:       { label: '模拟题目', icon: <Target size={16} style={{ color: '#34D399' }} />, color: '#34D399', bg: 'rgba(52,211,153,0.08)'  },
  outline:    { label: '课程大纲', icon: <ListTree size={16} style={{ color: '#A78BFA' }} />, color: '#A78BFA', bg: 'rgba(167,139,250,0.08)' },
  flashcards: { label: '闪卡套组', icon: <Layers3 size={16} style={{ color: '#F59E0B' }} />, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)'  },
}

function OutputsTab({ courseId, outputs, setOutputs }: {
  courseId: string; outputs: Output[]
  setOutputs: React.Dispatch<React.SetStateAction<Output[]>>
}) {
  const { t } = useLang()
  const [loadingList, setLoadingList] = useState(true)
  const [selected, setSelected] = useState<Output | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    api.outputs.list(courseId)
      .then(data => { setOutputs(data); if (data.length > 0) setSelected(data[0]) })
      .finally(() => setLoadingList(false))
  }, [courseId, setOutputs])

  async function handleDelete(id: number) {
    if (!confirm('确定删除该记录？')) return
    await api.outputs.delete(courseId, id)
    setOutputs(prev => { const next = prev.filter(o => o.id !== id); if (selected?.id === id) setSelected(next[0] ?? null); return next })
  }

  function selectType(type: string) {
    setTypeFilter(type)
    const latest = outputs.find(o => type === 'all' || o.output_type === type)
    if (latest) setSelected(latest)
  }

  const filtered = typeFilter === 'all' ? outputs : outputs.filter(o => o.output_type === typeFilter)

  if (loadingList) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} /></div>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <History size={22} style={{ color: '#FFD700' }} /> {t('history_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('history_sub')}</p>
      </div>

      {outputs.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl" style={{ color: '#444' }}>
          <History size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">{t('history_empty')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(OUTPUT_TYPE_CONFIG).map(([type, cfg]) => {
              const typeOutputs = outputs.filter(o => o.output_type === type)
              const latest = typeOutputs[0]; const isActive = typeFilter === type
              return (
                <button key={type} onClick={() => selectType(type)}
                  className="text-left p-4 rounded-xl transition-all"
                  style={{ background: isActive ? cfg.bg : 'rgba(255,255,255,0.03)', border: `1px solid ${isActive ? cfg.color : 'rgba(255,255,255,0.06)'}` }}>
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03]">
                    {cfg.icon}
                  </div>
                  <div className="text-sm font-semibold text-white mb-0.5">{cfg.label}</div>
                  {typeOutputs.length > 0
                    ? <div className="text-xs" style={{ color: cfg.color }}>{typeOutputs.length} 份</div>
                    : <div className="text-xs" style={{ color: '#444' }}>暂无</div>}
                  {latest && <div className="text-xs mt-0.5" style={{ color: '#555' }}>{new Date(latest.created_at).toLocaleDateString('zh-CN')}</div>}
                </button>
              )
            })}
          </div>

          <div className="flex gap-4">
            <div className="w-52 flex-shrink-0 space-y-1.5">
              <button onClick={() => selectType('all')}
                className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-all mb-2"
                style={{ background: typeFilter === 'all' ? 'rgba(255,215,0,0.1)' : 'transparent', color: typeFilter === 'all' ? '#FFD700' : '#555', border: `1px solid ${typeFilter === 'all' ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                {t('history_all')} ({outputs.length})
              </button>
              {filtered.map(o => {
                const cfg = OUTPUT_TYPE_CONFIG[o.output_type]
                return (
                  <div key={o.id} className="p-3 rounded-xl cursor-pointer transition-all"
                    style={{ background: selected?.id === o.id ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected?.id === o.id ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'}` }}
                    onClick={() => setSelected(o)}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: cfg?.color ?? '#FFD700' }}>
                        {cfg?.icon} {cfg?.label ?? o.output_type}
                      </span>
                      <button onClick={e => { e.stopPropagation(); handleDelete(o.id) }} style={{ color: '#FF4444', opacity: 0.6 }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: '#555' }}>
                      {new Date(o.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="flex-1 glass p-5 rounded-xl overflow-auto" style={{ minHeight: '400px' }}>
              {selected
                ? <div>
                    <div className="flex items-center gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-lg">{OUTPUT_TYPE_CONFIG[selected.output_type]?.icon}</span>
                      <span className="text-sm font-semibold text-white">{OUTPUT_TYPE_CONFIG[selected.output_type]?.label ?? selected.output_type}</span>
                      <span className="text-xs ml-auto" style={{ color: '#555' }}>{new Date(selected.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <OutputDisplay output={selected} courseId={courseId} />
                  </div>
                : <div className="flex items-center justify-center h-full text-sm" style={{ color: '#444' }}>← 选择左侧记录查看内容</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── 文件上传 Tab ──────────────────────────────────────────────────────────────

const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: 'lecture',    label: 'Lecture Notes' },
  { value: 'tutorial',   label: 'Tutorial / Lab' },
  { value: 'revision',   label: 'Revision Summary' },
  { value: 'past_exam',  label: 'Past Exam' },
  { value: 'assignment', label: 'Assignment / Project' },
  { value: 'other',      label: 'Other' },
]

function FilesTab({ courseId, artifacts, setArtifacts, fileInputRef }: {
  courseId: string; artifacts: Artifact[]
  setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useLang()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pendingDocType, setPendingDocType] = useState<DocType>('lecture')
  const [filterDocType, setFilterDocType] = useState<DocType | 'all'>('all')
  const [unlockTarget, setUnlockTarget] = useState<Artifact | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const art = await api.artifacts.upload(courseId, file, pendingDocType)
      setArtifacts(prev => [art, ...prev])
    }
    catch (err: unknown) { alert(err instanceof Error ? err.message : t('upload_err')) }
    finally { setUploading(false) }
  }

  async function handleUnlock() {
    if (!unlockTarget) return
    setUnlocking(true)
    setUnlockError('')
    try {
      const res = await api.artifacts.unlock(courseId, unlockTarget.id)
      // 解锁成功：更新本地 artifact 列表 is_locked=false + storage_url
      setArtifacts(prev => prev.map(a =>
        a.id === unlockTarget.id
          ? { ...a, is_locked: false, storage_url: res.storage_url ?? a.storage_url }
          : a
      ))
      setUnlockTarget(null)
    } catch (err: unknown) {
      setUnlockError(err instanceof Error ? err.message : '解锁失败，请稍后重试')
    } finally {
      setUnlocking(false)
    }
  }

  const displayed = filterDocType === 'all'
    ? artifacts
    : artifacts.filter(a => a.doc_type === filterDocType)

  return (
    <div className="space-y-5">

      {/* 解锁确认 Modal */}
      {unlockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => !unlocking && setUnlockTarget(null)}>
          <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl" onClick={e => e.stopPropagation()}
            style={{ background: '#0e0e1c', border: '1px solid rgba(255,165,0,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Lock size={18} style={{ color: '#FFA500' }} />
              <h3 className="text-base font-bold text-white">解锁文件访问</h3>
            </div>
            <p className="text-sm mb-1" style={{ color: '#aaa' }}>
              文件：<span className="text-white font-medium">{unlockTarget.file_name}</span>
            </p>
            <p className="text-sm mb-4" style={{ color: '#888' }}>
              此「{DOC_TYPE_LABELS[unlockTarget.doc_type]}」需消耗 <span style={{ color: '#FFD700', fontWeight: 600 }}>50 积分</span> 深度解析。
            </p>
            {unlockError && (
              <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: '#ff8080', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }}>
                {unlockError}
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setUnlockTarget(null)} disabled={unlocking}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#777', border: '1px solid rgba(255,255,255,0.1)' }}>
                取消
              </button>
              <button onClick={handleUnlock} disabled={unlocking}
                className="flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: 'rgba(255,165,0,0.18)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.35)' }}>
                {unlocking ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                {unlocking ? '解析中...' : '确认深度解析（-50 积分）'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileText size={22} style={{ color: '#FFD700' }} /> {t('files_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('files_sub')}</p>
      </div>

      {/* 文件类型选择 + 上传区 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium flex-shrink-0" style={{ color: '#888' }}>上传为：</label>
          <select
            value={pendingDocType}
            onChange={e => setPendingDocType(e.target.value as DocType)}
            className="flex-1 text-sm rounded-lg px-3 py-1.5 outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,215,0,0.25)',
              color: DOC_TYPE_COLORS[pendingDocType],
            }}>
            {DOC_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value} style={{ background: '#0d0d1a', color: '#fff' }}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="glass rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 cursor-pointer transition-all"
          style={{ borderColor: dragOver ? '#FFD700' : 'rgba(255,215,0,0.2)' }}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
          onClick={() => fileInputRef.current?.click()}>
          {uploading
            ? <Loader2 className="animate-spin mb-2" style={{ color: '#FFD700' }} size={24} />
            : <Upload size={24} className="mb-2" style={{ color: dragOver ? '#FFD700' : '#444' }} />}
          <p className="text-sm font-medium" style={{ color: dragOver ? '#FFD700' : '#888' }}>
            {uploading ? t('files_uploading') : t('files_drag')}
          </p>
          <p className="text-xs mt-1" style={{ color: '#555' }}>{t('files_hint')}</p>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.py,.txt,.ipynb" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: '#555' }}>筛选：</span>
        {(['all', ...Object.keys(DOC_TYPE_LABELS)] as const).map(dt => (
          <button key={dt} onClick={() => setFilterDocType(dt as DocType | 'all')}
            className="px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filterDocType === dt
                ? dt === 'all' ? 'rgba(255,215,0,0.15)' : `${DOC_TYPE_COLORS[dt as DocType]}22`
                : 'rgba(255,255,255,0.04)',
              color: filterDocType === dt
                ? dt === 'all' ? '#FFD700' : DOC_TYPE_COLORS[dt as DocType]
                : '#555',
              border: `1px solid ${filterDocType === dt
                ? dt === 'all' ? 'rgba(255,215,0,0.3)' : `${DOC_TYPE_COLORS[dt as DocType]}44`
                : 'rgba(255,255,255,0.07)'}`,
            }}>
            {dt === 'all' ? '全部' : DOC_TYPE_LABELS[dt as DocType]}
          </button>
        ))}
      </div>

      {/* 文件列表 */}
      <div className="space-y-2">
        {displayed.map(a => {
          const isCode = a.file_type === 'python' || a.file_type === 'notebook'
          const fileIcon = isCode
            ? <Code size={16} style={{ color: '#8B5CF6', flexShrink: 0 }} />
            : <FileText size={16} style={{ color: '#FFD700', flexShrink: 0 }} />
          return (
            <div key={a.id} className="glass flex items-center gap-3 px-4 py-3">
              {fileIcon}
              <span className="flex-1 text-sm text-white truncate">{a.file_name}</span>
              {/* 代码文件标识 */}
              {isCode && (
                <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{
                  background: 'rgba(139,92,246,0.12)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.25)',
                }}>
                  {a.file_type === 'notebook' ? 'Jupyter' : 'Python'}
                </span>
              )}
              {/* doc_type 标签 */}
              <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{
                background: `${DOC_TYPE_COLORS[a.doc_type]}1a`,
                color: DOC_TYPE_COLORS[a.doc_type],
                border: `1px solid ${DOC_TYPE_COLORS[a.doc_type]}44`,
              }}>
                {DOC_TYPE_LABELS[a.doc_type]}
              </span>
              {/* 审核状态 */}
              <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{
                background: a.status === 'approved' ? 'rgba(0,200,100,0.1)' : a.status === 'rejected' ? 'rgba(255,68,68,0.1)' : 'rgba(255,165,0,0.1)',
                color: a.status === 'approved' ? '#00C864' : a.status === 'rejected' ? '#FF4444' : '#FFA500',
              }}>
                {a.status === 'approved' ? t('files_approved') : a.status === 'rejected' ? t('files_rejected') : t('files_pending')}
              </span>
              <span className="text-xs flex-shrink-0" style={{ color: '#555' }}>{new Date(a.created_at).toLocaleDateString('zh-CN')}</span>
              {a.is_locked ? (
                <button
                  onClick={() => { setUnlockTarget(a); setUnlockError('') }}
                  title="花 50 积分深度解析"
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all hover:opacity-80 flex-shrink-0"
                  style={{ background: 'rgba(255,165,0,0.1)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.25)' }}>
                  <Lock size={11} /> 深度解析
                </button>
              ) : a.storage_url ? (
                <a href={a.storage_url} target="_blank" rel="noopener noreferrer" title={t('view_file')}
                  style={{ color: '#FFD700', opacity: 0.7 }} className="hover:opacity-100 transition-opacity flex-shrink-0">
                  <ExternalLink size={14} />
                </a>
              ) : null}
            </div>
          )
        })}
        {displayed.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: '#444' }}>
            {filterDocType === 'all' ? t('files_empty') : `暂无「${DOC_TYPE_LABELS[filterDocType as DocType]}」类型文件`}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Output display helpers ────────────────────────────────────────────────────

function OutputDisplay({ output, courseId }: { output: Output; courseId?: string }) {
  if (!output.content) return <p className="text-sm" style={{ color: '#666' }}>无内容</p>

  if (output.output_type === 'quiz') {
    let questions: QuizQuestion[] = []; let sources: QuizSource[] = []
    try {
      const parsed = JSON.parse(output.content)
      if (Array.isArray(parsed)) { questions = parsed }
      else { questions = parsed.questions || []; sources = parsed.sources || [] }
    } catch {}
    return <QuizDisplay questions={questions} sources={sources} courseId={courseId} />
  }

  if (output.output_type === 'flashcards') {
    return (
      <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(255,215,0,0.06)', color: '#AAA' }}>
        📌 闪卡已保存，前往左侧「闪卡」进行学习
      </div>
    )
  }

  return (
    <div className="prose prose-invert max-w-none text-sm" style={{ color: '#CCC', lineHeight: '1.7' }}>
      <ReactMarkdown>{output.content}</ReactMarkdown>
    </div>
  )
}

// ── Quiz Display (with translation, sources, ask AI) ─────────────────────────

function QuizDisplay({
  questions, sources = [], courseId,
}: {
  questions: QuizQuestion[]
  sources?: QuizSource[]
  courseId?: string
}) {
  const { lang } = useLang()
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})

  if (questions.length === 0) return <p className="text-sm" style={{ color: '#666' }}>无题目数据</p>

  const answeredCount = Object.keys(answers).length
  const correctCount = Object.entries(answers).filter(
    ([idx, label]) => label === questions[Number(idx)]?.answer
  ).length
  const allDone = answeredCount === questions.length

  function handleAnswer(i: number, label: string, q: QuizQuestion) {
    if (revealed[i]) return // already answered
    setAnswers(p => ({ ...p, [i]: label }))
    setRevealed(p => ({ ...p, [i]: true }))
  }

  return (
    <div className="space-y-5">
      {/* Score bar — visible once at least one question answered */}
      {answeredCount > 0 && (
        <div className="sticky top-4 z-10 flex items-center gap-3 rounded-[22px] border border-white/8 bg-[rgba(11,13,18,0.82)] px-4 py-3 backdrop-blur-xl">
          <span className="text-xs font-semibold" style={{ color: '#e6cf98' }}>
            {correctCount} / {questions.length} {lang === 'zh' ? '正确' : 'correct'}
          </span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(answeredCount / questions.length) * 100}%`, background: '#c8a55a', opacity: 0.85 }} />
          </div>
          <span className="text-xs" style={{ color: '#555' }}>{answeredCount}/{questions.length}</span>
        </div>
      )}

      {questions.map((q, i) => {
        const chosen = answers[i]; const show = revealed[i]
        // Find source for this question
        const sourceObj = q.source_artifact_id
          ? sources.find(s => s.artifact_id === q.source_artifact_id) || null
          : null

        return (
          <div key={i} className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] space-y-4 sm:p-6">
            {/* Question */}
            <p className="font-medium text-white text-sm">
              <span style={{ color: '#FFD700' }}>Q{i + 1}. </span>
              {q.question}
            </p>

            {/* Options */}
            <div className="space-y-2">
              {q.options.map((opt, j) => {
                const label = String.fromCharCode(65 + j)
                const isChosen = chosen === label; const isCorrect = label === q.answer
                let bg = 'rgba(255,255,255,0.04)'; let border = 'rgba(255,255,255,0.08)'
                if (show) {
                  if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = '#22C55E' }
                  else if (isChosen) { bg = 'rgba(255,68,68,0.1)'; border = '#FF4444' }
                }
                return (
                  <button key={j}
                    onClick={() => handleAnswer(i, label, q)}
                    disabled={!!show}
                    className="w-full text-left px-4 py-3 rounded-[18px] text-sm transition-all disabled:cursor-default"
                    style={{ background: bg, border: `1px solid ${border}`, color: '#DDD' }}>
                    <span style={{ color: '#FFD700' }}>{label}.</span> {opt}
                  </button>
                )
              })}
            </div>

            {/* Explanation + sources (auto-show on answer) */}
            {show && (
              <div className="space-y-2">
                <p className="text-xs px-3 py-2 rounded-2xl"
                  style={{ background: 'rgba(200,165,90,0.08)', color: '#d6d6dc', border: '1px solid rgba(200,165,90,0.14)' }}>
                  💡 {q.explanation || (chosen === q.answer ? '回答正确！' : `正确答案是 ${q.answer}`)}
                </p>

                {/* Source PDF attribution */}
                {sourceObj && sourceObj.storage_url && (
                  <a href={sourceObj.storage_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100 px-1"
                    style={{ color: '#60A5FA', opacity: 0.8 }}>
                    <FileText size={12} />
                    {lang === 'zh' ? '来源：' : 'Source: '}{sourceObj.file_name}
                    <ExternalLink size={10} />
                  </a>
                )}
                {/* Fallback: show overall sources */}
                {!sourceObj && sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-1">
                    {sources.slice(0, 3).map(s => s.storage_url ? (
                      <a key={s.artifact_id} href={s.storage_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs transition-opacity hover:opacity-100"
                        style={{ color: '#60A5FA', opacity: 0.7 }}>
                        <FileText size={11} />{s.file_name}<ExternalLink size={9} />
                      </a>
                    ) : null)}
                  </div>
                )}
              </div>
            )}

            {/* Translation row */}
            {courseId && (
              <div className="pt-1">
                <TranslatablePanel
                  courseId={courseId}
                  texts={[q.question, ...q.options, q.explanation || ''].filter(Boolean)}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* Final summary card */}
      {allDone && (
        <div className="rounded-[30px] border border-white/8 bg-white/[0.03] p-6 text-center space-y-3">
          <p className="text-3xl font-bold" style={{ color: '#e6cf98' }}>
            {correctCount} / {questions.length}
          </p>
          <p className="text-sm" style={{ color: '#AAA' }}>
            {lang === 'zh'
              ? `答对 ${correctCount} 题，答错 ${questions.length - correctCount} 题`
              : `${correctCount} correct, ${questions.length - correctCount} incorrect`}
          </p>
          {questions.length - correctCount > 0 && (
            <p className="text-xs" style={{ color: '#666' }}>
              {lang === 'zh' ? '错题已自动收录到「错题集」' : 'Wrong answers saved to Mistakes'}
            </p>
          )}
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => { setAnswers({}); setRevealed({}) }}
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#ddd', border: '1px solid rgba(255,255,255,0.08)' }}>
              <RotateCcw size={14} /> {lang === 'zh' ? '再做一次' : 'Redo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
