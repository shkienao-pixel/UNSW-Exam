'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  Loader2, Play, BookOpen, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, RefreshCw, Sparkles,
  ListOrdered, FileText, HelpCircle, Layers
} from 'lucide-react'

// ── Types (subset needed for viewer) ──────────────────────────────────────────

interface QuizOption { label: string; value: string }
interface QuizQuestion {
  id: string; type: string; question: string
  options?: QuizOption[]; answer?: string[]; analysis?: string
}
interface SlideElement {
  id: string; type: string; left: number; top: number; width: number; height: number
  content?: string; defaultFontColor?: string; fontSize?: number; fontWeight?: string
  fill?: string; src?: string; url?: string
}
interface Slide {
  id: string; background?: { type: string; color?: string }
  elements?: SlideElement[]
}
interface Scene {
  id: string; type: 'slide' | 'quiz' | 'interactive' | 'pbl'; title: string; order: number
  content: {
    type: string
    canvas?: Slide
    questions?: QuizQuestion[]
    html?: string; url?: string
  }
}

interface JobStatus {
  jobId: string; status: 'queued' | 'running' | 'succeeded' | 'failed'
  step: string; progress: number; message: string; done: boolean
  scenesGenerated?: number; totalScenes?: number
  result?: { classroomId: string; url: string; scenesCount: number }
  error?: string
}

interface Classroom { id: string; stage: { name: string }; scenes: Scene[] }

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseElementText(el: SlideElement): string {
  if (el.type !== 'text') return ''
  // content may be ProseMirror JSON or plain string
  try {
    const doc = JSON.parse(el.content || '{}')
    const extractText = (node: { type?: string; text?: string; content?: unknown[] }): string => {
      if (node.text) return node.text
      if (node.content) return (node.content as typeof node[]).map(extractText).join('')
      return ''
    }
    return extractText(doc)
  } catch {
    return el.content || ''
  }
}

// ── Slide viewer (simple CSS-based) ───────────────────────────────────────────

function SlideViewer({ canvas }: { canvas: Slide }) {
  const bg = canvas.background?.color || '#1e293b'
  const textEls = (canvas.elements || []).filter(e => e.type === 'text')
  const imageEls = (canvas.elements || []).filter(e => e.type === 'image')

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/10"
      style={{ background: bg, aspectRatio: '16/9', width: '100%' }}>
      {imageEls.map(el => (
        <div key={el.id} className="absolute" style={{
          left: `${el.left}%`, top: `${el.top}%`,
          width: `${el.width}%`, height: `${el.height}%`,
        }}>
          {el.src && <img src={el.src} alt="" className="w-full h-full object-cover" />}
        </div>
      ))}
      {textEls.map(el => {
        const text = parseElementText(el)
        if (!text.trim()) return null
        return (
          <div key={el.id} className="absolute overflow-hidden" style={{
            left: `${el.left}%`, top: `${el.top}%`,
            width: `${el.width}%`, height: `${el.height}%`,
            color: el.defaultFontColor || '#ffffff',
            fontSize: `${(el.fontSize || 24) * 0.7}px`,
            fontWeight: el.fontWeight || 'normal',
            whiteSpace: 'pre-wrap',
            display: 'flex', alignItems: 'center',
          }}>
            <span>{text}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Quiz viewer ────────────────────────────────────────────────────────────────

function QuizViewer({ questions }: { questions: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [submitted, setSubmitted] = useState(false)

  const toggle = (qid: string, val: string, multi: boolean) => {
    if (submitted) return
    setAnswers(prev => {
      const cur = prev[qid] || []
      if (multi) {
        return { ...prev, [qid]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] }
      }
      return { ...prev, [qid]: [val] }
    })
  }

  const correct = submitted ? questions.filter(q => {
    if (!q.answer) return true
    const sel = answers[q.id] || []
    return q.answer.every(a => sel.includes(a)) && sel.every(a => q.answer!.includes(a))
  }).length : 0

  return (
    <div className="space-y-6">
      {questions.map((q, i) => {
        const isMulti = q.type === 'multiple'
        const sel = answers[q.id] || []
        const isCorrect = submitted && q.answer
          ? q.answer.every(a => sel.includes(a)) && sel.every(a => q.answer!.includes(a))
          : null
        return (
          <div key={q.id} className="rounded-xl border border-white/10 p-4"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-sm text-white/60 mb-2">Q{i + 1} · {isMulti ? '多选' : '单选'}</p>
            <p className="text-white mb-3">{q.question}</p>
            {q.options && (
              <div className="space-y-2">
                {q.options.map(opt => {
                  const chosen = sel.includes(opt.value)
                  const isAns = q.answer?.includes(opt.value)
                  let borderColor = 'rgba(255,255,255,0.1)'
                  let bg = 'rgba(255,255,255,0.03)'
                  if (submitted) {
                    if (isAns) { borderColor = '#22c55e'; bg = 'rgba(34,197,94,0.1)' }
                    else if (chosen && !isAns) { borderColor = '#ef4444'; bg = 'rgba(239,68,68,0.1)' }
                  } else if (chosen) {
                    borderColor = 'rgba(255,215,0,0.6)'; bg = 'rgba(255,215,0,0.08)'
                  }
                  return (
                    <button key={opt.value} onClick={() => toggle(q.id, opt.value, isMulti)}
                      className="w-full text-left rounded-lg px-4 py-2 text-sm transition-all"
                      style={{ border: `1px solid ${borderColor}`, background: bg, color: '#fff' }}>
                      <span className="font-mono mr-2">{opt.value}.</span>{opt.label}
                    </button>
                  )
                })}
              </div>
            )}
            {submitted && q.analysis && (
              <p className="mt-3 text-xs text-white/50 border-t border-white/10 pt-2">
                {isCorrect ? '✅ ' : '❌ '}{q.analysis}
              </p>
            )}
          </div>
        )
      })}
      {!submitted ? (
        <button onClick={() => setSubmitted(true)}
          className="w-full py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
          提交答案
        </button>
      ) : (
        <div className="text-center py-3 text-sm"
          style={{ color: correct === questions.length ? '#22c55e' : '#FFD700' }}>
          得分 {correct}/{questions.length}
          <button onClick={() => { setAnswers({}); setSubmitted(false) }}
            className="ml-4 text-xs text-white/40 hover:text-white/70">重做</button>
        </div>
      )}
    </div>
  )
}

// ── Scene renderer ─────────────────────────────────────────────────────────────

function SceneView({ scene }: { scene: Scene }) {
  const icon = scene.type === 'quiz' ? <HelpCircle size={14} />
    : scene.type === 'interactive' ? <Layers size={14} />
    : <FileText size={14} />
  const label = scene.type === 'quiz' ? '测验' : scene.type === 'interactive' ? '互动' : '讲解'

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
          {icon}{label}
        </span>
        <h2 className="text-white font-semibold">{scene.title}</h2>
      </div>

      {scene.type === 'slide' && scene.content.canvas && (
        <SlideViewer canvas={scene.content.canvas} />
      )}
      {scene.type === 'quiz' && scene.content.questions && (
        <QuizViewer questions={scene.content.questions} />
      )}
      {scene.type === 'interactive' && (
        <div className="rounded-xl overflow-hidden border border-white/10" style={{ height: 480 }}>
          {scene.content.html
            ? <iframe srcDoc={scene.content.html} className="w-full h-full" title={scene.title} />
            : scene.content.url
            ? <iframe src={scene.content.url} className="w-full h-full" title={scene.title} />
            : <div className="flex items-center justify-center h-full text-white/40">暂无互动内容</div>
          }
        </div>
      )}
    </div>
  )
}

// ── Main ClassroomTab ─────────────────────────────────────────────────────────

interface Props { courseId: string }

export default function ClassroomTab({ courseId }: Props) {
  useAuth() // ensure auth context is available
  const [phase, setPhase] = useState<'idle' | 'generating' | 'viewing'>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [sceneIndex, setSceneIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const apiBase = process.env.NEXT_PUBLIC_API_URL || ''

  // Start generation
  const startGeneration = useCallback(async () => {
    setError(null)
    setPhase('generating')
    setJobId(null)
    setJobStatus(null)
    setClassroom(null)

    try {
      // 1. Fetch course text content from backend
      const accessToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') : ''
      const contentRes = await fetch(`${apiBase}/courses/${courseId}/content`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!contentRes.ok) throw new Error('获取课程内容失败')
      const contentData = await contentRes.json()
      const pdfText = (contentData.artifacts || []).map((a: { text: string }) => a.text).join('\n\n').slice(0, 15000)

      if (!pdfText.trim()) {
        throw new Error('课程暂无可用文本内容，请先上传 PDF 资料')
      }

      // 2. Call Next.js API route to start generation
      const genRes = await fetch('/api/classroom/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: `为以下课程内容生成互动课堂：`,
          pdfContent: { text: pdfText, images: [] },
          language: 'zh-CN',
        }),
      })
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}))
        throw new Error(err.error?.message || '启动生成失败')
      }
      const genData = await genRes.json()
      setJobId(genData.jobId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败')
      setPhase('idle')
    }
  }, [courseId, apiBase])

  // Poll job status
  useEffect(() => {
    if (!jobId || phase !== 'generating') return

    const poll = async () => {
      try {
        const res = await fetch(`/api/classroom/${jobId}`)
        const data = await res.json()
        if (!data.success) return
        const status = data as JobStatus
        setJobStatus(status)

        if (status.done) {
          if (status.status === 'succeeded' && status.result) {
            // Load classroom data
            const classRes = await fetch(`/api/classroom/${status.result.classroomId}/classroom`)
            const classData = await classRes.json()
            if (classData.success) {
              setClassroom(classData.classroom)
              setSceneIndex(0)
              setPhase('viewing')
            } else {
              setError('加载课堂数据失败')
              setPhase('idle')
            }
          } else {
            setError(status.error || '生成失败')
            setPhase('idle')
          }
        } else {
          pollRef.current = setTimeout(poll, 5000)
        }
      } catch {
        pollRef.current = setTimeout(poll, 5000)
      }
    }

    pollRef.current = setTimeout(poll, 2000)
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [jobId, phase])

  const scenes = classroom?.scenes.slice().sort((a, b) => a.order - b.order) || []
  const currentScene = scenes[sceneIndex]

  // ── Idle state ──────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.2)' }}>
          <Sparkles size={28} style={{ color: '#FFD700' }} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2">AI 互动课堂</h2>
          <p className="text-sm text-white/50 max-w-xs">
            基于本课程上传的 PDF 资料，AI 自动生成讲解幻灯片、测验题和互动场景
          </p>
        </div>
        {error && (
          <p className="text-sm text-red-400 max-w-xs">{error}</p>
        )}
        <button onClick={startGeneration}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
          <Play size={16} /> 生成互动课堂
        </button>
      </div>
    )
  }

  // ── Generating state ────────────────────────────────────────────────────────
  if (phase === 'generating') {
    const steps: Record<string, string> = {
      queued: '等待中...', initializing: '初始化...', researching: '分析课程内容...',
      generating_outlines: '生成场景大纲...', generating_scenes: '生成场景内容...',
      persisting: '保存课堂...', completed: '完成！',
    }
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
        <Loader2 size={40} className="animate-spin" style={{ color: '#FFD700' }} />
        <div>
          <p className="text-white font-semibold">
            {jobStatus ? steps[jobStatus.step] || jobStatus.message : '启动中...'}
          </p>
          {jobStatus && (
            <p className="text-xs text-white/40 mt-1">
              {jobStatus.progress}%
              {jobStatus.scenesGenerated ? ` · 已生成 ${jobStatus.scenesGenerated} 个场景` : ''}
            </p>
          )}
        </div>
        {jobStatus && (
          <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${jobStatus.progress}%`, background: '#FFD700' }} />
          </div>
        )}
      </div>
    )
  }

  // ── Viewing state ───────────────────────────────────────────────────────────
  if (!classroom || scenes.length === 0) return null

  return (
    <div className="flex gap-4 min-h-0">
      {/* Sidebar: scene list */}
      <div className="w-52 shrink-0 flex flex-col gap-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/50">{scenes.length} 个场景</span>
          <button onClick={() => setPhase('idle')} title="重新生成"
            className="text-white/30 hover:text-white/70 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
        {scenes.map((s, i) => {
          const Icon = s.type === 'quiz' ? HelpCircle : s.type === 'interactive' ? Layers : FileText
          return (
            <button key={s.id} onClick={() => setSceneIndex(i)}
              className="flex items-start gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all"
              style={{
                background: i === sceneIndex ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${i === sceneIndex ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: i === sceneIndex ? '#FFD700' : '#aaa',
              }}>
              <Icon size={12} className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{s.title}</span>
            </button>
          )
        })}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {currentScene && <SceneView scene={currentScene} />}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
          <button onClick={() => setSceneIndex(i => Math.max(0, i - 1))}
            disabled={sceneIndex === 0}
            className="flex items-center gap-1 text-sm px-4 py-2 rounded-lg disabled:opacity-30 transition-all"
            style={{ color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
            <ChevronLeft size={16} /> 上一场景
          </button>
          <span className="text-xs text-white/40">{sceneIndex + 1} / {scenes.length}</span>
          <button onClick={() => setSceneIndex(i => Math.min(scenes.length - 1, i + 1))}
            disabled={sceneIndex === scenes.length - 1}
            className="flex items-center gap-1 text-sm px-4 py-2 rounded-lg disabled:opacity-30 transition-all"
            style={{ color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
            下一场景 <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
