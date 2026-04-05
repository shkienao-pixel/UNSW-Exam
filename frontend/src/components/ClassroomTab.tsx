'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Artifact } from '@/lib/types'
import {
  Sparkles, Loader2, Play, CheckSquare, Square,
} from 'lucide-react'
import { CubesLoader } from '@/components/Cubes'
import {
  ChevronLeft, ChevronRight, HelpCircle, FileText,
  AlertCircle, RefreshCw, History, PencilLine, Globe,
} from 'lucide-react'
import SimpleWhiteboard from '@/components/classroom/SimpleWhiteboard'
import { GlowButton } from '@/components/GlowButton'
import GeneratingState from '@/components/GeneratingState'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SlideContent { heading: string; subheading?: string; bullets: string[]; explanation?: string }
interface QuizOption { label: string; value: string }
interface QuizQuestion {
  id: string; type: string; question: string
  options?: QuizOption[]; answer?: string[]; analysis?: string
}
interface QuizContent { questions: QuizQuestion[] }
interface InteractiveContent { html?: string; url?: string }
interface Scene {
  id: string; type: 'slide' | 'quiz' | 'interactive'; title: string; order: number
  content: SlideContent | QuizContent | InteractiveContent
}
interface Classroom { id: string; title: string; scenes: Scene[] }
interface JobStatus {
  job_id: string; status: 'queued' | 'running' | 'succeeded' | 'failed'
  progress: number; message: string; classroom_id: string | null; error: string | null
}
interface HistoryItem { id: string; title: string; created_at: string }

// ── Slide Viewer ───────────────────────────────────────────────────────────────

function SlideViewer({ content }: { content: SlideContent }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-6"
        style={{ background: 'linear-gradient(135deg, rgba(20,22,40,0.95) 0%, rgba(10,12,28,0.98) 100%)' }}>
        <h2 className="text-2xl font-bold text-white leading-snug">{content.heading}</h2>
        {content.subheading && (
          <p className="text-sm mt-2" style={{ color: '#A78BFA' }}>{content.subheading}</p>
        )}
      </div>
      {/* Bullets */}
      <div className="px-8 py-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <ul className="space-y-3">
          {content.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-3 text-sm" style={{ color: '#CBD5E1' }}>
              <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: 'rgba(167,139,250,0.2)', color: '#A78BFA' }}>
                {i + 1}
              </span>
              <span className="leading-relaxed">{b}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* Explanation */}
      {content.explanation && (
        <div className="px-8 py-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(167,139,250,0.04)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: '#A78BFA' }}>💡 详解</p>
          <p className="text-sm leading-relaxed" style={{ color: '#94A3B8' }}>{content.explanation}</p>
        </div>
      )}
    </div>
  )
}

// ── Quiz Viewer ────────────────────────────────────────────────────────────────

function QuizViewer({ content }: { content: QuizContent }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const toggle = (qid: string, val: string) => {
    if (submitted) return
    setAnswers(prev => ({ ...prev, [qid]: val }))
  }

  const score = submitted
    ? content.questions.filter(q => q.answer && q.answer[0] === answers[q.id]).length
    : 0

  return (
    <div className="space-y-6">
      {content.questions.map((q, i) => {
        const sel = answers[q.id]
        const isCorrect = submitted && q.answer ? q.answer[0] === sel : null
        return (
          <div key={q.id} className="rounded-xl p-5 space-y-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-xs mb-1" style={{ color: '#555' }}>Q{i + 1}</p>
            <p className="text-white text-sm leading-relaxed font-medium">{q.question}</p>
            {q.options && (
              <div className="space-y-2 pt-1">
                {q.options.map(opt => {
                  const chosen = sel === opt.value
                  const isAns = q.answer?.[0] === opt.value
                  let bg = 'rgba(255,255,255,0.03)', border = 'rgba(255,255,255,0.08)', color = '#AAA'
                  if (submitted) {
                    if (isAns) { bg = 'rgba(34,197,94,0.08)'; border = 'rgba(34,197,94,0.35)'; color = '#22C55E' }
                    else if (chosen) { bg = 'rgba(239,68,68,0.08)'; border = 'rgba(239,68,68,0.35)'; color = '#EF4444' }
                  } else if (chosen) { bg = 'rgba(167,139,250,0.1)'; border = 'rgba(167,139,250,0.4)'; color = '#A78BFA' }
                  return (
                    <button key={opt.value} onClick={() => toggle(q.id, opt.value)}
                      className="w-full text-left rounded-xl px-4 py-2.5 text-sm transition-all"
                      style={{ background: bg, border: `1px solid ${border}`, color }}>
                      <span className="font-mono mr-2 opacity-60">{opt.value}.</span>{opt.label}
                    </button>
                  )
                })}
              </div>
            )}
            {submitted && q.analysis && (
              <p className="text-xs pt-2 border-t border-white/8" style={{ color: isCorrect ? '#22C55E' : '#F59E0B' }}>
                {isCorrect ? '✅ ' : '❌ '}{q.analysis}
              </p>
            )}
          </div>
        )
      })}
      {!submitted ? (
        <GlowButton onClick={() => setSubmitted(true)}
          disabled={Object.keys(answers).length < content.questions.length}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
          提交答案
        </GlowButton>
      ) : (
        <div className="text-center py-3 space-y-2">
          <p className="text-2xl font-bold" style={{ color: score === content.questions.length ? '#22C55E' : '#FFD700' }}>
            {score} / {content.questions.length}
          </p>
          <button onClick={() => { setAnswers({}); setSubmitted(false) }}
            className="text-xs" style={{ color: '#555' }}>重做</button>
        </div>
      )}
    </div>
  )
}

// ── Interactive Viewer ────────────────────────────────────────────────────────

function InteractiveViewer({ content }: { content: InteractiveContent }) {
  const src = content.url
    ? content.url
    : content.html
      ? `data:text/html;charset=utf-8,${encodeURIComponent(
          content.html.replace(
            '</head>',
            '<style>html,body{margin:0;padding:0;background:#0A0C1C;color:#CBD5E1;font-family:sans-serif}</style></head>',
          ),
        )}`
      : null

  if (!src) {
    return (
      <div className="flex items-center justify-center rounded-2xl h-64"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#444' }}>
        <p className="text-sm">暂无交互内容</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(167,139,250,0.2)', height: 480 }}>
      <iframe
        src={src}
        title="interactive-scene"
        className="w-full h-full"
        sandbox="allow-scripts allow-same-origin"
        style={{ border: 'none', background: '#0A0C1C' }}
      />
    </div>
  )
}

// ── Scene View ─────────────────────────────────────────────────────────────────

function SceneView({ scene }: { scene: Scene }) {
  const tagStyle =
    scene.type === 'quiz'
      ? { bg: 'rgba(255,215,0,0.1)', color: '#FFD700', border: 'rgba(255,215,0,0.25)' }
      : scene.type === 'interactive'
        ? { bg: 'rgba(52,211,153,0.1)', color: '#34D399', border: 'rgba(52,211,153,0.25)' }
        : { bg: 'rgba(167,139,250,0.1)', color: '#A78BFA', border: 'rgba(167,139,250,0.25)' }

  const tagIcon =
    scene.type === 'quiz' ? <HelpCircle size={11} /> :
    scene.type === 'interactive' ? <Globe size={11} /> :
    <FileText size={11} />

  const tagLabel =
    scene.type === 'quiz' ? '测验' :
    scene.type === 'interactive' ? '交互' :
    '讲解'

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
          style={{ background: tagStyle.bg, color: tagStyle.color, border: `1px solid ${tagStyle.border}` }}>
          {tagIcon}{tagLabel}
        </span>
        <h3 className="text-white font-semibold">{scene.title}</h3>
      </div>
      {scene.type === 'slide'
        ? <SlideViewer content={scene.content as SlideContent} />
        : scene.type === 'interactive'
          ? <InteractiveViewer content={scene.content as InteractiveContent} />
          : <QuizViewer content={scene.content as QuizContent} />}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

const COST = 300
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'

function token() {
  return typeof window !== 'undefined' ? (localStorage.getItem('access_token') || '') : ''
}

interface Props {
  courseId: string
  artifacts: Artifact[]
  creditBalance: number
  onCreditSpent: (amount: number) => void
}

const SESSION_KEY = (courseId: string) => `classroom_job_${courseId}`

export default function ClassroomTab({ courseId, artifacts, creditBalance, onCreditSpent }: Props) {
  const [phase, setPhase] = useState<'idle' | 'generating' | 'viewing'>('idle')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [sceneIdx, setSceneIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pdfs = artifacts.filter(a => a.status === 'approved' && a.file_type === 'pdf')

  // 加载历史
  useEffect(() => {
    fetch(`${API}/classroom/list/${courseId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    }).then(r => r.ok ? r.json() : []).then(setHistory).catch(() => {})
  }, [courseId])

  // 恢复上次未完成的生成任务（用户导航离开后再回来）
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY(courseId))
    if (saved) {
      setJobId(saved)
      setPhase('generating')
    }
  }, [courseId])

  const clearSavedJob = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY(courseId))
  }, [courseId])

  const toggleSelect = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  async function startGeneration() {
    if (selected.size === 0) { setError('请先选择至少一个 PDF'); return }
    if (creditBalance < COST) { setError(`积分不足，需要 ${COST} 积分（当前 ${creditBalance}）`); return }

    setError(null)
    setPhase('generating')
    setJobId(null)
    setJobStatus(null)

    try {
      const res = await fetch(`${API}/classroom/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ course_id: courseId, artifact_ids: Array.from(selected) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 402) throw new Error(`积分不足（${err.balance ?? '?'} / ${err.required ?? COST}）`)
        throw new Error(err.detail || '启动失败')
      }
      const data = await res.json()
      onCreditSpent(COST)
      // 持久化 jobId，导航离开再回来可继续轮询
      sessionStorage.setItem(SESSION_KEY(courseId), data.job_id)
      setJobId(data.job_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败')
      setPhase('idle')
    }
  }

  // 轮询
  useEffect(() => {
    if (!jobId || phase !== 'generating') return
    const poll = async () => {
      try {
        const res = await fetch(`${API}/classroom/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        })
        if (res.status === 401) {
          setError('登录已过期，请刷新页面重新登录后再试')
          clearSavedJob()
          setPhase('idle')
          return
        }
        if (!res.ok) { pollRef.current = setTimeout(poll, 4000); return }
        const data: JobStatus = await res.json()
        setJobStatus(data)
        if (data.status === 'succeeded' && data.classroom_id) {
          clearSavedJob()
          const cr = await fetch(`${API}/classroom/${data.classroom_id}`, {
            headers: { Authorization: `Bearer ${token()}` },
          })
          if (cr.ok) {
            const c: Classroom = await cr.json()
            setClassroom(c)
            setSceneIdx(0)
            setPhase('viewing')
            fetch(`${API}/classroom/list/${courseId}`, {
              headers: { Authorization: `Bearer ${token()}` },
            }).then(r => r.ok ? r.json() : []).then(setHistory).catch(() => {})
          } else { setError('加载课堂数据失败'); setPhase('idle') }
        } else if (data.status === 'failed') {
          clearSavedJob()
          setError(data.error || '生成失败（积分已自动退款）')
          setPhase('idle')
        } else {
          pollRef.current = setTimeout(poll, 4000)
        }
      } catch { pollRef.current = setTimeout(poll, 5000) }
    }
    pollRef.current = setTimeout(poll, 2000)
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [jobId, phase, courseId, clearSavedJob])

  async function loadHistoryItem(id: string) {
    const res = await fetch(`${API}/classroom/${id}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
    if (!res.ok) return
    setClassroom(await res.json())
    setSceneIdx(0)
    setPhase('viewing')
    setShowHistory(false)
  }

  const scenes = classroom?.scenes.slice().sort((a, b) => a.order - b.order) ?? []

  // ── Generating ───────────────────────────────────────────────────────────────
  if (phase === 'generating') {
    const pct = jobStatus?.progress
    const msg = jobStatus?.message ?? undefined
    return (
      <GeneratingState
        label="互动课堂"
        timeHint="通常需要 30-60 秒"
        progress={pct}
        message={msg}
      />
    )
  }

  // ── Viewing ───────────────────────────────────────────────────────────────────
  if (phase === 'viewing' && classroom) {
    const scene = scenes[sceneIdx]
    return (
      <>
      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-52 shrink-0 space-y-1">
          <p className="text-xs px-2 mb-3 font-semibold" style={{ color: '#555' }}>
            {classroom.title}
          </p>
          {scenes.map((s, i) => (
            <button key={s.id} onClick={() => setSceneIdx(i)}
              className="w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all truncate"
              style={{
                background: i === sceneIdx ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.02)',
                color: i === sceneIdx ? '#A78BFA' : '#555',
                border: `1px solid ${i === sceneIdx ? 'rgba(167,139,250,0.3)' : 'transparent'}`,
              }}>
              <span className="mr-1.5 opacity-50">{i + 1}.</span>{s.title}
            </button>
          ))}
          <div className="pt-4">
            <button onClick={() => setShowRegenConfirm(true)}
              className="w-full text-xs py-2 rounded-xl transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.06)' }}>
              重新生成
            </button>
          </div>
          {showRegenConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
              <div className="rounded-2xl p-6 space-y-4 max-w-xs w-full mx-4"
                style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p className="text-sm text-white font-medium">确认重新生成？</p>
                <p className="text-xs" style={{ color: '#666' }}>当前课堂内容将被清除，系统将重新生成新的课堂。</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowRegenConfirm(false)}
                    className="flex-1 py-2 rounded-xl text-xs transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
                    取消
                  </button>
                  <GlowButton onClick={() => { setShowRegenConfirm(false); setPhase('idle'); setClassroom(null) }}
                    className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                    style={{ background: 'rgba(167,139,250,0.15)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.3)' }}>
                    确认重新生成
                  </GlowButton>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {scene && <SceneView scene={scene} />}
          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setSceneIdx(i => Math.max(0, i - 1))}
              disabled={sceneIdx === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-20"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#888', border: '1px solid rgba(255,255,255,0.07)' }}>
              <ChevronLeft size={15} /> 上一节
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: '#444' }}>{sceneIdx + 1} / {scenes.length}</span>
              <button onClick={() => setWhiteboardOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all"
                style={{ background: 'rgba(167,139,250,0.08)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.2)' }}>
                <PencilLine size={13} /> 白板
              </button>
            </div>
            <button onClick={() => setSceneIdx(i => Math.min(scenes.length - 1, i + 1))}
              disabled={sceneIdx === scenes.length - 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-20"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#888', border: '1px solid rgba(255,255,255,0.07)' }}>
              下一节 <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
      <SimpleWhiteboard isOpen={whiteboardOpen} onClose={() => setWhiteboardOpen(false)} />
      </>
    )
  }

  // ── Idle ──────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 max-w-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(249,168,212,0.1)', border: '1px solid rgba(249,168,212,0.2)' }}>
            <Sparkles size={20} style={{ color: '#F9A8D4' }} />
          </div>
          <div>
            <h2 className="text-white font-semibold">AI 互动课堂</h2>
            <p className="text-xs" style={{ color: '#555' }}>选 PDF → 消耗 {COST} 积分 → 自动生成幻灯片 + 测验</p>
          </div>
        </div>
        {history.length > 0 && (
          <button onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all"
            style={{ background: showHistory ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)', color: '#555', border: '1px solid rgba(255,255,255,0.08)' }}>
            <History size={13} /> 历史
          </button>
        )}
      </div>

      {/* History list */}
      {showHistory && (
        <div className="rounded-xl border border-white/8 divide-y divide-white/5 overflow-hidden">
          {history.map(h => (
            <button key={h.id} onClick={() => loadHistoryItem(h.id)}
              className="w-full text-left px-4 py-3 flex items-center justify-between transition-all hover:bg-white/3">
              <span className="text-sm text-white">{h.title}</span>
              <span className="text-xs" style={{ color: '#444' }}>
                {new Date(h.created_at).toLocaleDateString('zh-CN')}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* PDF 选择 */}
      {pdfs.length === 0 ? (
        <div className="rounded-xl border border-white/8 p-8 text-center text-sm" style={{ color: '#444' }}>
          暂无已审核的 PDF 文件，请先上传并等待审核
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: '#555' }}>选择用于生成的 PDF（可多选）</p>
          {pdfs.map(a => {
            const on = selected.has(a.id)
            return (
              <button key={a.id} onClick={() => toggleSelect(a.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                style={{
                  background: on ? 'rgba(249,168,212,0.07)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${on ? 'rgba(249,168,212,0.35)' : 'rgba(255,255,255,0.07)'}`,
                }}>
                {on ? <CheckSquare size={16} style={{ color: '#F9A8D4' }} /> : <Square size={16} style={{ color: '#444' }} />}
                <span className="text-sm flex-1 truncate" style={{ color: on ? '#F9A8D4' : '#888' }}>{a.file_name}</span>
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
          <AlertCircle size={15} />{error}
        </div>
      )}

      <GlowButton
        onClick={startGeneration}
        disabled={selected.size === 0 || creditBalance < COST || pdfs.length === 0}
        className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'rgba(249,168,212,0.12)', color: '#F9A8D4', border: '1px solid rgba(249,168,212,0.3)' }}>
        {creditBalance < COST
          ? <><RefreshCw size={15} /> 积分不足（需 {COST}，当前 {creditBalance}）</>
          : <><Play size={15} /> 生成互动课堂（{COST} 积分）</>}
      </GlowButton>
    </div>
  )
}
