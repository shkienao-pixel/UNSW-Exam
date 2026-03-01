'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useLang } from '@/lib/i18n'
import { useGeneration } from '@/lib/generation-context'
import type { Course, Artifact, ScopeSet, Output } from '@/lib/types'
import {
  FileText, Upload, Loader2, Zap, History, Settings2,
  CheckSquare, ChevronDown, MessageSquare, BookOpen, Send, RotateCcw,
  ExternalLink, Trash2, Languages, HelpCircle,
} from 'lucide-react'
import { addMistake } from '@/lib/mistakes-store'
import MistakesView from '@/components/MistakesView'
import ReactMarkdown from 'react-markdown'

// ── View routing ──────────────────────────────────────────────────────────────

function CoursePageInner() {
  const { id: courseId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const view = searchParams.get('view') || 'flashcards'

  const [course, setCourse] = useState<Course | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [scopeSets, setScopeSets] = useState<ScopeSet[]>([])
  const [outputs, setOutputs] = useState<Output[]>([])
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useLang()

  const load = useCallback(async () => {
    try {
      const [c, arts, scopes] = await Promise.all([
        api.courses.get(courseId),
        api.artifacts.list(courseId),
        api.scopeSets.list(courseId),
      ])
      setCourse(c)
      setArtifacts(arts)
      setScopeSets(scopes)
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={32} />
    </div>
  )
  if (!course) return <div className="p-8 text-red-400">{t('course_404')}</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {view === 'flashcards' && <FlashcardsTab courseId={courseId} />}
      {view === 'mistakes'   && <MistakesTab courseId={courseId} />}
      {view === 'quiz'       && <QuizTab courseId={courseId} />}
      {view === 'summary'    && <SummaryTab courseId={courseId} />}
      {view === 'outline'    && <OutlineTab courseId={courseId} />}
      {view === 'ask'        && <AskTab courseId={courseId} scopeSets={scopeSets} artifacts={artifacts} />}
      {view === 'generate'   && (
        <GenerateTab courseId={courseId} scopeSets={scopeSets} setScopeSets={setScopeSets}
          artifacts={artifacts} setOutputs={setOutputs} />
      )}
      {view === 'outputs'    && <OutputsTab courseId={courseId} outputs={outputs} setOutputs={setOutputs} />}
      {view === 'files'      && (
        <FilesTab courseId={courseId} artifacts={artifacts} setArtifacts={setArtifacts}
          fileInputRef={fileInputRef} />
      )}
      {view === 'scope'      && (
        <ScopeTab courseId={courseId} artifacts={artifacts}
          scopeSets={scopeSets} setScopeSets={setScopeSets} />
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

type BiMode = 'full' | 'zh' | 'en'

function biText(text: string, mode: BiMode): string {
  if (mode === 'full') return text
  const parts = text.split(' / ')
  if (parts.length < 2) return text
  return mode === 'zh' ? parts[0].trim() : parts.slice(1).join(' / ').trim()
}

function BilingualToggle({ mode, onChange }: { mode: BiMode; onChange: (m: BiMode) => void }) {
  const options: { key: BiMode; label: string }[] = [
    { key: 'full', label: '中/EN' },
    { key: 'zh',   label: '中'    },
    { key: 'en',   label: 'EN'   },
  ]
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className="px-2 py-1 rounded-md text-xs transition-all"
          style={{
            background: mode === o.key ? 'rgba(255,215,0,0.12)' : 'transparent',
            color: mode === o.key ? '#FFD700' : '#555',
            border: `1px solid ${mode === o.key ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'}`,
          }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Per-question translation toggle ──────────────────────────────────────────

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

interface TranslatablePanelProps {
  texts: string[]   // [question, opt0, opt1, opt2, opt3, explanation?]
  courseId: string
}

function TranslatablePanel({ texts, courseId }: TranslatablePanelProps) {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [translated, setTranslated] = useState<string[] | null>(null)
  const [error, setError] = useState(false)
  const { lang } = useLang()

  async function toggle() {
    if (visible) { setVisible(false); return }
    setVisible(true)
    if (translated) return
    setLoading(true); setError(false)
    try {
      const res = await api.generate.translate(courseId, texts, 'en')
      setTranslated(res.translations)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={toggle}
        className="flex items-center gap-1.5 text-xs mt-2 transition-opacity hover:opacity-100"
        style={{ color: '#555', opacity: 0.8 }}>
        <Languages size={12} />
        {visible
          ? (lang === 'zh' ? '隐藏翻译' : 'Hide translation')
          : (lang === 'zh' ? '显示英文翻译' : 'Show Chinese translation')
        }
      </button>

      {visible && (
        <div className="mt-2 px-3 py-2.5 rounded-xl text-xs space-y-2"
          style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
          {loading && (
            <span className="flex items-center gap-1.5" style={{ color: '#666' }}>
              <Loader2 size={11} className="animate-spin" />
              {lang === 'zh' ? '翻译中...' : 'Translating...'}
            </span>
          )}
          {error && <span style={{ color: '#FF6666' }}>{lang === 'zh' ? '翻译失败' : 'Translation failed'}</span>}
          {translated && !loading && translated.map((t, i) => (
            <p key={i} style={{ color: '#7EB8F5', lineHeight: '1.5' }}>{t}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Full-content translation panel (for summary / outline) ───────────────────

function ContentTranslationPanel({ content, courseId }: { content: string; courseId: string }) {
  const [show, setShow] = useState(false)
  const [translated, setTranslated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const { lang } = useLang()

  async function toggle() {
    if (show) { setShow(false); return }
    setShow(true)
    if (translated) return
    setLoading(true); setError(false)
    try {
      const paragraphs = content.split('\n\n').filter(p => p.trim())
      const res = await api.generate.translate(courseId, paragraphs, 'en')
      setTranslated(res.translations.join('\n\n'))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass p-6 rounded-xl prose prose-invert max-w-none text-sm"
        style={{ color: '#CCC', lineHeight: '1.75' }}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>

      <button onClick={toggle}
        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100"
        style={{ color: '#555', opacity: 0.8 }}>
        <Languages size={13} />
        {show
          ? (lang === 'zh' ? '收起英文翻译' : 'Hide translation')
          : (lang === 'zh' ? '展开英文翻译' : 'Show English translation')
        }
        {loading && <Loader2 size={11} className="animate-spin ml-1" />}
      </button>

      {show && (
        <div className="glass p-6 rounded-xl prose prose-invert max-w-none text-sm"
          style={{ color: '#8BB8D4', lineHeight: '1.75', border: '1px solid rgba(96,165,250,0.12)' }}>
          {loading
            ? <div className="flex items-center gap-2" style={{ color: '#666' }}><Loader2 size={14} className="animate-spin" /> 翻译中...</div>
            : error
            ? <p style={{ color: '#FF6666' }}>翻译失败，请重试</p>
            : translated
            ? <ReactMarkdown>{translated}</ReactMarkdown>
            : null}
        </div>
      )}
    </div>
  )
}

// ── Generic typed-output view ─────────────────────────────────────────────────

interface TypedOutputsViewProps {
  courseId: string
  outputType: string
  icon: React.ReactNode
  title: string
  subtitle: string
  emptyTitle: string
  emptyLinkLabel: string
  headerExtra?: React.ReactNode
  renderContent: (output: Output) => React.ReactNode
}

function TypedOutputsView({
  courseId, outputType, icon, title, subtitle,
  emptyTitle, emptyLinkLabel, headerExtra, renderContent,
}: TypedOutputsViewProps) {
  const [outputs, setOutputs] = useState<Output[]>([])
  const [selected, setSelected] = useState<Output | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.outputs.list(courseId, outputType)
      .then(data => { setOutputs(data); if (data.length > 0) setSelected(data[0]) })
      .finally(() => setLoading(false))
  }, [courseId, outputType])

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} />
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">{icon} {title}</h2>
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-1">
          {headerExtra}
          {outputs.length > 1 && (
            <select className="input-glass text-xs py-1"
              value={selected?.id ?? ''}
              onChange={e => setSelected(outputs.find(o => o.id === Number(e.target.value)) ?? null)}>
              {outputs.map(o => (
                <option key={o.id} value={o.id}>
                  {new Date(o.created_at).toLocaleDateString('zh-CN')}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {outputs.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
          <BookOpen size={52} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-white mb-4">{emptyTitle}</p>
          <a href={`/courses/${courseId}?view=generate`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
            <Zap size={14} /> {emptyLinkLabel}
          </a>
        </div>
      ) : selected ? renderContent(selected) : null}
    </div>
  )
}

// ── Summary Tab ───────────────────────────────────────────────────────────────

function SummaryTab({ courseId }: { courseId: string }) {
  const { t } = useLang()
  return (
    <TypedOutputsView
      courseId={courseId} outputType="summary"
      icon={<span>📄</span>} title={t('summary_title')} subtitle={t('summary_sub')}
      emptyTitle={t('empty_summary')} emptyLinkLabel={t('empty_summary_btn')}
      renderContent={output => (
        <ContentTranslationPanel content={output.content || ''} courseId={courseId} />
      )}
    />
  )
}

// ── Outline Tab ───────────────────────────────────────────────────────────────

function OutlineTab({ courseId }: { courseId: string }) {
  const { t } = useLang()
  return (
    <TypedOutputsView
      courseId={courseId} outputType="outline"
      icon={<span>📋</span>} title={t('outline_title')} subtitle={t('outline_sub')}
      emptyTitle={t('empty_outline')} emptyLinkLabel={t('empty_outline_btn')}
      renderContent={output => (
        <ContentTranslationPanel content={output.content || ''} courseId={courseId} />
      )}
    />
  )
}

// ── Quiz Tab ──────────────────────────────────────────────────────────────────

function QuizTab({ courseId }: { courseId: string }) {
  const { t } = useLang()
  return (
    <TypedOutputsView
      courseId={courseId} outputType="quiz"
      icon={<span>🎯</span>} title={t('quiz_title')} subtitle={t('quiz_sub')}
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
  const router = useRouter()
  const [outputs, setOutputs] = useState<Output[]>([])
  const [selectedOutputId, setSelectedOutputId] = useState<number | null>(null)
  const [cards, setCards] = useState<Flashcard[]>([])
  const [cardIndex, setCardIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [biMode, setBiMode] = useState<BiMode>('full')
  const [loading, setLoading] = useState(true)
  const [finished, setFinished] = useState(false)

  // Wrapped in useCallback so useEffect dep is stable (fixes exhaustive-deps warning)
  const loadCards = useCallback((output: Output) => {
    setSelectedOutputId(output.id)
    setCardIndex(0); setFlipped(false); setChosen(null); setRevealed(false); setFinished(false)
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

  const card = cards[cardIndex]

  function next() {
    if (cardIndex >= cards.length - 1) { setFinished(true); return }
    setCardIndex(i => i + 1); setFlipped(false); setChosen(null); setRevealed(false)
  }
  function prev() { setCardIndex(i => Math.max(i - 1, 0)); setFlipped(false); setChosen(null); setRevealed(false) }
  function restart() { setCardIndex(0); setFlipped(false); setChosen(null); setRevealed(false); setFinished(false) }

  function askAI(question: string) {
    router.push(`/courses/${courseId}?view=ask&q=${encodeURIComponent(question)}`)
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={28} /></div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">🃏 {t('flashcards_title')}</h2>
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('flashcards_sub')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-1">
          <BilingualToggle mode={biMode} onChange={setBiMode} />
          {outputs.length > 0 && (
            <select className="input-glass text-xs py-1" value={selectedOutputId ?? ''}
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
      </div>

      {outputs.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
          <BookOpen size={52} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-white mb-4">{t('empty_fc')}</p>
          <a href={`/courses/${courseId}?view=generate`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
            <Zap size={14} /> {t('empty_fc_btn')}
          </a>
        </div>
      ) : (
        <>
          {/* Reset bar */}
          <div className="flex">
            <button onClick={restart}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ color: '#444', border: '1px solid rgba(255,255,255,0.06)' }}>
              <RotateCcw size={11} /> {t('fc_reset')}
            </button>
          </div>

          {cards.length === 0 ? (
            <div className="text-center py-16 glass rounded-2xl" style={{ color: '#555' }}>
              没有卡片
            </div>
          ) : finished ? (
            /* ── Completion screen ── */
            <div className="glass p-8 rounded-2xl text-center space-y-4"
              style={{ border: '1px solid rgba(255,215,0,0.2)' }}>
              <p className="text-4xl">🎉</p>
              <p className="text-xl font-bold text-white">
                {lang === 'zh' ? '全部完成！' : 'All Done!'}
              </p>
              <p className="text-sm" style={{ color: '#888' }}>
                {lang === 'zh' ? `共 ${cards.length} 张卡片` : `${cards.length} cards`}
              </p>
              <div className="flex gap-3 justify-center pt-2 flex-wrap">
                <button onClick={restart}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#CCC', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <RotateCcw size={14} /> {lang === 'zh' ? '再做一次' : 'Redo'}
                </button>
                <a href={`/courses/${courseId}?view=generate`}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
                  <Zap size={14} /> {lang === 'zh' ? '再来一套' : 'Generate New'}
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Progress */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs" style={{ color: '#555' }}>
                  <span>{cardIndex + 1} / {cards.length}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${((cardIndex + 1) / cards.length) * 100}%`, background: '#FFD700' }} />
                </div>
              </div>

              {card && (
                <>
                  {/* Vocab card */}
                  {card.type === 'vocab' && (
                    <div className="space-y-3">
                      <div
                        className="glass rounded-2xl p-10 cursor-pointer min-h-52 flex flex-col items-center justify-center text-center"
                        style={{ outline: '1px solid rgba(255,215,0,0.12)', userSelect: 'none' }}
                        onClick={() => setFlipped(f => !f)}>
                        <p className="text-xs mb-4" style={{ color: '#555' }}>
                          {flipped ? t('fc_back') : t('fc_front')} · {t('fc_click_tip')}
                        </p>
                        <p className="text-xl font-semibold" style={{ color: flipped ? '#CCC' : '#FFD700' }}>
                          {biText(flipped ? card.back : card.front, biMode)}
                        </p>
                      </div>
                      {/* Ask AI link */}
                      <button onClick={() => askAI(card.front)}
                        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100 mx-auto"
                        style={{ color: '#555', opacity: 0.7 }}>
                        <HelpCircle size={12} />不懂了？问 AI
                      </button>
                    </div>
                  )}

                  {/* MCQ card */}
                  {card.type === 'mcq' && (
                    <div className="glass rounded-2xl p-6 space-y-4">
                      <p className="font-semibold text-white">{biText(card.question, biMode)}</p>
                      <div className="space-y-2">
                        {card.options.map((opt, j) => {
                          const label = String.fromCharCode(65 + j)
                          const isChosen = chosen === label; const isCorrect = label === card.answer
                          let bg = 'rgba(255,255,255,0.04)'; let border = 'rgba(255,255,255,0.08)'
                          if (revealed) {
                            if (isCorrect) { bg = 'rgba(34,197,94,0.1)'; border = '#22C55E' }
                            else if (isChosen) { bg = 'rgba(255,68,68,0.1)'; border = '#FF4444' }
                          }
                          return (
                            <button key={j} onClick={() => { setChosen(label); setRevealed(true) }}
                              className="w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all"
                              style={{ background: bg, border: `1px solid ${border}`, color: '#DDD' }}>
                              <span style={{ color: '#FFD700' }}>{label}.</span> {biText(opt, biMode)}
                            </button>
                          )
                        })}
                      </div>
                      {/* Auto-show explanation on reveal */}
                      {revealed && (
                        <p className="text-xs px-3 py-2 rounded-lg"
                          style={{ background: 'rgba(255,215,0,0.06)', color: '#AAA' }}>
                          💡 {biText(
                            card.explanation || (chosen === card.answer ? '回答正确！' : `正确答案是 ${card.answer}`),
                            biMode,
                          )}
                        </p>
                      )}
                      {revealed && (
                        <button onClick={() => askAI(card.question)}
                          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100"
                          style={{ color: '#555', opacity: 0.7 }}>
                          <HelpCircle size={12} />不懂了？问 AI
                        </button>
                      )}
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button onClick={prev} disabled={cardIndex === 0}
                      className="px-4 py-2 rounded-lg text-sm disabled:opacity-30"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {t('fc_prev')}
                    </button>
                    {card.type === 'vocab' && flipped && (
                      <>
                        <button
                          onClick={() => {
                            addMistake({ courseId, source: 'flashcard', question: card.front, correctAnswer: card.back })
                            next()
                          }}
                          className="px-4 py-2 rounded-lg text-sm"
                          style={{ background: 'rgba(255,68,68,0.1)', color: '#FF6666', border: '1px solid rgba(255,68,68,0.2)' }}>
                          {t('fc_forgot')}
                        </button>
                        <button onClick={next} className="px-4 py-2 rounded-lg text-sm"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
                          {t('fc_got_it')}
                        </button>
                      </>
                    )}
                    {card.type === 'vocab' && !flipped && (
                      <button onClick={() => setFlipped(true)} className="px-4 py-2 rounded-lg text-sm"
                        style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
                        {t('fc_flip')}
                      </button>
                    )}
                    {card.type === 'mcq' && !revealed && (
                      <button onClick={next} disabled={cardIndex === cards.length - 1}
                        className="px-4 py-2 rounded-lg text-sm disabled:opacity-30"
                        style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
                        {t('fc_skip')}
                      </button>
                    )}
                    {card.type === 'mcq' && revealed && (
                      <button
                        onClick={() => {
                          if (chosen !== null && chosen !== card.answer) {
                            addMistake({
                              courseId, source: 'flashcard',
                              question: card.question, options: card.options,
                              correctAnswer: card.answer, userAnswer: chosen,
                              explanation: card.explanation,
                            })
                          }
                          next()
                        }}
                        className="px-4 py-2 rounded-lg text-sm"
                        style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
                        {cardIndex === cards.length - 1 ? t('fc_done') : t('fc_next')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── AI 问答 Tab ───────────────────────────────────────────────────────────────

type AskSource = { artifact_id: number; file_name: string; storage_url: string }
type Message = { role: 'user' | 'assistant'; content: string; sources?: AskSource[] }

function AskTab({ courseId, scopeSets, artifacts }: {
  courseId: string; scopeSets: ScopeSet[]; artifacts: Artifact[]
}) {
  const { t } = useLang()
  const searchParams = useSearchParams()
  const prefilledQ = searchParams.get('q') || ''

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState(prefilledQ)
  const [loading, setLoading] = useState(false)
  const [scopeSetId, setScopeSetId] = useState<number | undefined>(scopeSets[0]?.id)
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoSentRef = useRef(false)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const approvedCount = artifacts.filter(a => a.status === 'approved').length

  async function send(overrideInput?: string) {
    const q = (overrideInput ?? input).trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)
    try {
      const res = await api.generate.ask(courseId, q, scopeSetId)
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer, sources: res.sources }])
    } catch (err: unknown) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err instanceof Error ? err.message : '请求失败'}` }])
    } finally { setLoading(false) }
  }

  // Auto-send pre-filled question once
  useEffect(() => {
    if (prefilledQ && !autoSentRef.current && approvedCount > 0) {
      autoSentRef.current = true
      send(prefilledQ)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledQ, approvedCount])

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 100px)' }}>
      <div className="mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <MessageSquare size={22} style={{ color: '#FFD700' }} /> {t('ask_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('ask_sub')}</p>
      </div>

      {scopeSets.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-shrink-0">
          <label className="text-xs" style={{ color: '#666' }}>{t('ask_scope_label')}</label>
          <select className="input-glass text-xs py-1" value={scopeSetId ?? ''}
            onChange={e => setScopeSetId(Number(e.target.value) || undefined)}>
            {scopeSets.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (全部)' : ''}</option>)}
          </select>
        </div>
      )}

      {approvedCount === 0 && (
        <div className="text-sm px-3 py-2 mb-3 rounded-lg flex-shrink-0"
          style={{ background: 'rgba(255,165,0,0.1)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.2)' }}>
          {t('ask_no_files')}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#444' }}>
            <MessageSquare size={36} className="opacity-30" />
            <p className="text-sm">{t('ask_empty_msg')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[82%] space-y-1.5">
              <div className="px-4 py-3 rounded-2xl text-sm"
                style={{
                  background: m.role === 'user' ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
                  color: m.role === 'user' ? '#FFD700' : '#CCC',
                  border: `1px solid ${m.role === 'user' ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
                }}>
                {m.role === 'assistant'
                  ? <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                  : m.content}
              </div>
              {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                <div className="px-3 py-2 rounded-xl text-xs space-y-1"
                  style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.1)' }}>
                  <p style={{ color: '#666' }}>{t('ask_sources')}</p>
                  {m.sources.map(s => (
                    s.storage_url
                      ? <a key={s.artifact_id} href={s.storage_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 transition-opacity hover:opacity-100"
                          style={{ color: '#FFD700', opacity: 0.75 }}>
                          <ExternalLink size={10} />{s.file_name}
                        </a>
                      : <span key={s.artifact_id} style={{ color: '#555' }}>· {s.file_name}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl text-sm" style={{ background: 'rgba(255,255,255,0.05)', color: '#666' }}>
              <Loader2 size={14} className="animate-spin inline mr-2" />{t('ask_thinking')}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 mt-3 flex-shrink-0">
        <input className="input-glass flex-1 text-sm" placeholder={t('ask_placeholder')}
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={loading || approvedCount === 0} />
        <button className="btn-gold px-4" onClick={() => send()}
          disabled={loading || !input.trim() || approvedCount === 0}>
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

// ── AI 生成 Tab ───────────────────────────────────────────────────────────────

type GenType = 'summary' | 'quiz' | 'outline' | 'flashcards'

function GenerateTab({ courseId, scopeSets, setScopeSets, artifacts, setOutputs }: {
  courseId: string
  scopeSets: ScopeSet[]
  setScopeSets: React.Dispatch<React.SetStateAction<ScopeSet[]>>
  artifacts: Artifact[]
  setOutputs: React.Dispatch<React.SetStateAction<Output[]>>
}) {
  const { t } = useLang()
  const { trackGeneration } = useGeneration()
  const isMounted = useRef(true)
  useEffect(() => () => { isMounted.current = false }, [])

  const [genType, setGenType] = useState<GenType>('summary')
  const [scopeSetId, setScopeSetId] = useState<number | undefined>(scopeSets[0]?.id)
  const [numQuestions, setNumQuestions] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [genSuccess, setGenSuccess] = useState<GenType | null>(null)
  const [error, setError] = useState('')

  const [showCreateScope, setShowCreateScope] = useState(false)
  const [newScopeName, setNewScopeName] = useState('')
  const [newScopeFiles, setNewScopeFiles] = useState<Set<number>>(new Set())
  const [creatingScope, setCreatingScope] = useState(false)

  const approvedArtifacts = artifacts.filter(a => a.status === 'approved')
  const approvedCount = approvedArtifacts.length

  const genTypes = [
    { key: 'summary'    as GenType, emoji: '📄', labelKey: 'gen_summary'    as const, descKey: 'gen_desc_summary'    as const },
    { key: 'quiz'       as GenType, emoji: '🎯', labelKey: 'gen_quiz'       as const, descKey: 'gen_desc_quiz'       as const },
    { key: 'outline'    as GenType, emoji: '📋', labelKey: 'gen_outline'    as const, descKey: 'gen_desc_outline'    as const },
    { key: 'flashcards' as GenType, emoji: '🃏', labelKey: 'gen_flashcards' as const, descKey: 'gen_desc_flashcards' as const },
  ]

  function toggleNewScopeFile(id: number) {
    setNewScopeFiles(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function createScope() {
    if (!newScopeName.trim()) return
    setCreatingScope(true)
    try {
      const created = await api.scopeSets.create(courseId, newScopeName.trim())
      const fileIds = [...newScopeFiles]
      const finalScope = fileIds.length > 0
        ? await api.scopeSets.updateItems(courseId, created.id, fileIds)
        : created
      setScopeSets(prev => [...prev, finalScope])
      setScopeSetId(finalScope.id)
      setShowCreateScope(false); setNewScopeName(''); setNewScopeFiles(new Set())
    } catch { alert(t('save_err')) } finally { setCreatingScope(false) }
  }

  async function generate() {
    setError(''); setGenSuccess(null); setGenerating(true)
    const body = {
      ...(scopeSetId ? { scope_set_id: scopeSetId } : {}),
      ...(genType === 'quiz' ? { num_questions: numQuestions } : {}),
    }
    const promise = api.generate[genType](courseId, body)

    // Register with global progress tracker (persists across navigation)
    trackGeneration({
      label: t(`gen_${genType}`),
      viewLink: `/courses/${courseId}?view=${genType}`,
      promise,
      onSuccess: out => {
        if (isMounted.current) {
          setOutputs(prev => [out, ...prev])
          setGenSuccess(genType)
          setGenerating(false)
        }
      },
      onError: err => {
        if (isMounted.current) {
          setError(err?.message || t('gen_err'))
          setGenerating(false)
        }
      },
    })
  }

  const viewLabels: Record<GenType, string> = {
    summary: t('gen_summary'), quiz: t('gen_quiz'),
    outline: t('gen_outline'), flashcards: t('gen_flashcards'),
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap size={22} style={{ color: '#FFD700' }} /> {t('generate_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('generate_sub')}</p>
      </div>

      {/* Type cards */}
      <div className="grid grid-cols-2 gap-3">
        {genTypes.map(g => (
          <button key={g.key} onClick={() => { setGenType(g.key); setGenSuccess(null) }}
            className="glass p-4 text-left transition-all rounded-xl"
            style={{ outline: genType === g.key ? '1px solid #FFD700' : 'none' }}>
            <div className="text-xl mb-1">{g.emoji}</div>
            <div className="font-medium text-sm text-white">{t(g.labelKey)}</div>
            <div className="text-xs mt-0.5" style={{ color: '#666' }}>{t(g.descKey)}</div>
          </button>
        ))}
      </div>

      {/* Scope selector */}
      <div className="space-y-2">
        <label className="block text-sm" style={{ color: '#AAA' }}>{t('gen_scope')}</label>
        <div className="flex items-center gap-2">
          {scopeSets.length > 0 ? (
            <select className="input-glass text-sm flex-1" value={scopeSetId ?? ''}
              onChange={e => setScopeSetId(Number(e.target.value) || undefined)}>
              {scopeSets.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (全部)' : ''}</option>)}
            </select>
          ) : <span className="text-sm flex-1" style={{ color: '#555' }}>—</span>}
          <button onClick={() => setShowCreateScope(v => !v)}
            className="px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: showCreateScope ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.04)',
              color: showCreateScope ? '#FFD700' : '#666',
              border: `1px solid ${showCreateScope ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
            }}>
            {t('gen_new_scope')}
          </button>
        </div>

        {showCreateScope && (
          <div className="glass p-4 rounded-xl space-y-3" style={{ border: '1px solid rgba(255,215,0,0.12)' }}>
            <input placeholder={t('gen_scope_ph')} value={newScopeName}
              onChange={e => setNewScopeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createScope() }}
              className="input-glass text-sm w-full" />
            {approvedArtifacts.length > 0 && (
              <div>
                <p className="text-xs mb-2" style={{ color: '#555' }}>{t('gen_scope_files')}</p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {approvedArtifacts.map(a => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-yellow-400"
                        checked={newScopeFiles.has(a.id)} onChange={() => toggleNewScopeFile(a.id)} />
                      <span className="text-xs truncate" style={{ color: newScopeFiles.has(a.id) ? '#CCC' : '#666' }}>
                        {a.file_name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1"
                onClick={createScope} disabled={creatingScope || !newScopeName.trim()}>
                {creatingScope && <Loader2 size={12} className="animate-spin" />}{t('gen_create')}
              </button>
              <button onClick={() => { setShowCreateScope(false); setNewScopeName(''); setNewScopeFiles(new Set()) }}
                className="text-xs px-3 py-1.5 rounded-lg" style={{ color: '#666', background: 'rgba(255,255,255,0.04)' }}>
                {t('gen_cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {genType === 'quiz' && (
        <div>
          <label className="block text-sm mb-2" style={{ color: '#AAA' }}>{t('gen_num_q')}</label>
          <input type="number" min={3} max={20} value={numQuestions}
            onChange={e => setNumQuestions(Number(e.target.value))}
            className="input-glass text-sm w-24" />
        </div>
      )}

      {approvedCount === 0 && (
        <div className="text-sm px-3 py-2 rounded-lg"
          style={{ background: 'rgba(255,165,0,0.1)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.2)' }}>
          {t('gen_no_files')}
        </div>
      )}

      <button className="btn-gold flex items-center gap-2 text-sm" onClick={generate}
        disabled={generating || approvedCount === 0}>
        {generating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
        {generating ? t('gen_loading') : t('gen_btn')}
      </button>

      {error && (
        <div className="text-sm px-3 py-2 rounded-lg"
          style={{ background: 'rgba(255,68,68,0.1)', color: '#FF6666', border: '1px solid rgba(255,68,68,0.2)' }}>
          ❌ {error}
        </div>
      )}

      {genSuccess && (
        <div className="flex items-center gap-3 text-sm px-4 py-3 rounded-xl"
          style={{ background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
          ✅ {t('gen_done_prefix')}
          <a href={`/courses/${courseId}?view=${genSuccess}`}
            className="font-semibold underline hover:opacity-80">
            {viewLabels[genSuccess]}
          </a>
          {t('gen_done_suffix')}
        </div>
      )}
    </div>
  )
}

// ── 历史输出 Tab ──────────────────────────────────────────────────────────────

const OUTPUT_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  summary:    { label: '知识摘要', icon: '📄', color: '#60A5FA', bg: 'rgba(96,165,250,0.08)'  },
  quiz:       { label: '模拟题目', icon: '🎯', color: '#34D399', bg: 'rgba(52,211,153,0.08)'  },
  outline:    { label: '课程大纲', icon: '📋', color: '#A78BFA', bg: 'rgba(167,139,250,0.08)' },
  flashcards: { label: '闪卡套组', icon: '🃏', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)'  },
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
                  <div className="text-2xl mb-2">{cfg.icon}</div>
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
                      <span className="text-xs font-medium" style={{ color: cfg?.color ?? '#FFD700' }}>{cfg?.icon} {cfg?.label ?? o.output_type}</span>
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

function FilesTab({ courseId, artifacts, setArtifacts, fileInputRef }: {
  courseId: string; artifacts: Artifact[]
  setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useLang()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function uploadFile(file: File) {
    setUploading(true)
    try { const art = await api.artifacts.upload(courseId, file); setArtifacts(prev => [art, ...prev]) }
    catch (err: unknown) { alert(err instanceof Error ? err.message : t('upload_err')) }
    finally { setUploading(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileText size={22} style={{ color: '#FFD700' }} /> {t('files_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('files_sub')}</p>
      </div>
      <div className="glass rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-10 cursor-pointer transition-all"
        style={{ borderColor: dragOver ? '#FFD700' : 'rgba(255,215,0,0.2)' }}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
        onClick={() => fileInputRef.current?.click()}>
        {uploading ? <Loader2 className="animate-spin mb-3" style={{ color: '#FFD700' }} size={28} /> : <Upload size={28} className="mb-3" style={{ color: dragOver ? '#FFD700' : '#444' }} />}
        <p className="text-sm font-medium" style={{ color: dragOver ? '#FFD700' : '#888' }}>
          {uploading ? t('files_uploading') : t('files_drag')}
        </p>
        <p className="text-xs mt-1" style={{ color: '#555' }}>{t('files_hint')}</p>
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.py" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
      </div>
      <div className="space-y-2">
        {artifacts.map(a => (
          <div key={a.id} className="glass flex items-center gap-3 px-4 py-3">
            <FileText size={16} style={{ color: '#FFD700', flexShrink: 0 }} />
            <span className="flex-1 text-sm text-white truncate">{a.file_name}</span>
            <span className="text-xs px-2 py-0.5 rounded" style={{
              background: a.status === 'approved' ? 'rgba(0,200,100,0.1)' : a.status === 'rejected' ? 'rgba(255,68,68,0.1)' : 'rgba(255,165,0,0.1)',
              color: a.status === 'approved' ? '#00C864' : a.status === 'rejected' ? '#FF4444' : '#FFA500',
            }}>
              {a.status === 'approved' ? t('files_approved') : a.status === 'rejected' ? t('files_rejected') : t('files_pending')}
            </span>
            <span className="text-xs" style={{ color: '#555' }}>{new Date(a.created_at).toLocaleDateString('zh-CN')}</span>
            {a.storage_url && (
              <a href={a.storage_url} target="_blank" rel="noopener noreferrer" title={t('view_file')}
                style={{ color: '#FFD700', opacity: 0.7 }} className="hover:opacity-100 transition-opacity">
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        ))}
        {artifacts.length === 0 && <p className="text-center py-8 text-sm" style={{ color: '#444' }}>{t('files_empty')}</p>}
      </div>
    </div>
  )
}

// ── Scope Tab ─────────────────────────────────────────────────────────────────

function ScopeTab({ courseId, artifacts, scopeSets, setScopeSets }: {
  courseId: string; artifacts: Artifact[]
  scopeSets: ScopeSet[]; setScopeSets: React.Dispatch<React.SetStateAction<ScopeSet[]>>
}) {
  const { t } = useLang()
  const [selected, setSelected] = useState<number | null>(scopeSets[0]?.id ?? null)
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const ss = scopeSets.find(s => s.id === selected)
    if (ss) setCheckedIds(new Set(ss.artifact_ids))
  }, [selected, scopeSets])

  async function save() {
    if (selected == null) return
    setSaving(true)
    try { const u = await api.scopeSets.updateItems(courseId, selected, [...checkedIds]); setScopeSets(prev => prev.map(s => s.id === selected ? u : s)) }
    catch { alert(t('save_err')) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings2 size={22} style={{ color: '#FFD700' }} /> {t('scope_title')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#555' }}>{t('scope_sub')}</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm" style={{ color: '#AAA' }}>{t('scope_current')}</label>
        <select className="input-glass text-sm" style={{ minWidth: '200px' }} value={selected ?? ''} onChange={e => setSelected(Number(e.target.value))}>
          {scopeSets.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_default ? ` ${t('scope_default')}` : ''}</option>)}
        </select>
        <ChevronDown size={14} style={{ color: '#666', marginLeft: -32, pointerEvents: 'none' }} />
      </div>
      <div className="glass p-4 rounded-xl space-y-2">
        <p className="text-sm font-medium text-white mb-3">{t('scope_sel_files')}</p>
        {artifacts.length === 0
          ? <p className="text-sm py-4 text-center" style={{ color: '#444' }}>{t('scope_no_files')}</p>
          : artifacts.map(a => (
            <label key={a.id} className="flex items-center gap-3 cursor-pointer py-1.5">
              <input type="checkbox" checked={checkedIds.has(a.id)} onChange={() => setCheckedIds(prev => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })} className="w-4 h-4 accent-yellow-400 cursor-pointer" />
              <FileText size={14} style={{ color: checkedIds.has(a.id) ? '#FFD700' : '#555' }} />
              <span className="text-sm" style={{ color: checkedIds.has(a.id) ? '#DDD' : '#666' }}>{a.file_name}</span>
            </label>
          ))}
      </div>
      <button className="btn-gold flex items-center gap-2" onClick={save} disabled={saving || selected == null}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
        {saving ? t('scope_saving') : t('scope_save')}
      </button>
      <p className="text-xs" style={{ color: '#555' }}>{t('scope_selected')} {checkedIds.size} / {artifacts.length}</p>
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
  const router = useRouter()
  const { lang } = useLang()
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})

  if (questions.length === 0) return <p className="text-sm" style={{ color: '#666' }}>无题目数据</p>

  const answeredCount = Object.keys(answers).length
  const correctCount = Object.entries(answers).filter(
    ([idx, label]) => label === questions[Number(idx)]?.answer
  ).length
  const allDone = answeredCount === questions.length

  function askAI(question: string) {
    if (!courseId) return
    router.push(`/courses/${courseId}?view=ask&q=${encodeURIComponent(question)}`)
  }

  function handleAnswer(i: number, label: string, q: QuizQuestion) {
    if (revealed[i]) return // already answered
    setAnswers(p => ({ ...p, [i]: label }))
    setRevealed(p => ({ ...p, [i]: true }))
    if (label !== q.answer && courseId) {
      addMistake({
        courseId,
        source: 'quiz',
        question: q.question,
        options: q.options,
        correctAnswer: q.answer,
        userAnswer: label,
        explanation: q.explanation,
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Score bar — visible once at least one question answered */}
      {answeredCount > 0 && (
        <div className="sticky top-0 z-10 glass px-4 py-2.5 rounded-xl flex items-center gap-3"
          style={{ border: '1px solid rgba(255,215,0,0.15)' }}>
          <span className="text-xs font-semibold" style={{ color: '#FFD700' }}>
            {correctCount} / {questions.length} {lang === 'zh' ? '正确' : 'correct'}
          </span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(answeredCount / questions.length) * 100}%`, background: '#FFD700', opacity: 0.6 }} />
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
          <div key={i} className="glass p-4 rounded-xl space-y-3">
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
                    className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all disabled:cursor-default"
                    style={{ background: bg, border: `1px solid ${border}`, color: '#DDD' }}>
                    <span style={{ color: '#FFD700' }}>{label}.</span> {opt}
                  </button>
                )
              })}
            </div>

            {/* Explanation + sources (auto-show on answer) */}
            {show && (
              <div className="space-y-2">
                <p className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(255,215,0,0.06)', color: '#AAA' }}>
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

            {/* Bottom row: translation + ask AI */}
            <div className="flex items-center justify-between pt-1">
              {courseId && (
                <TranslatablePanel
                  courseId={courseId}
                  texts={[q.question, ...q.options, q.explanation || ''].filter(Boolean)}
                />
              )}
              {courseId && (
                <button onClick={() => askAI(q.question)}
                  className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100 flex-shrink-0"
                  style={{ color: '#555', opacity: 0.7 }}>
                  <HelpCircle size={12} />
                  {lang === 'zh' ? '不懂？问 AI' : 'Ask AI'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Final summary card */}
      {allDone && (
        <div className="glass p-6 rounded-2xl text-center space-y-3"
          style={{ border: '1px solid rgba(255,215,0,0.2)' }}>
          <p className="text-3xl font-bold" style={{ color: '#FFD700' }}>
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
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#CCC', border: '1px solid rgba(255,255,255,0.1)' }}>
              <RotateCcw size={14} /> {lang === 'zh' ? '再做一次' : 'Redo'}
            </button>
            {courseId && (
              <a href={`/courses/${courseId}?view=generate`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
                <Zap size={14} /> {lang === 'zh' ? '再来一套' : 'Generate New'}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
