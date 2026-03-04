'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Loader2, Sparkles, Brain, BookOpen, Zap, Shield } from 'lucide-react'
import CampusHeroCard from '@/components/CampusHeroCard'
import ExamMasterLogo from '@/components/ExamMasterLogo'

// ── Hero AI Knowledge Nodes (outer bubbles in negative space) ─────────────────

type HeroNodePos = { top: string; left?: string; right?: string }

const HERO_OUTER_NODES: Array<{
  id: number; text: string; pos: HeroNodePos
  svgX: number; svgY: number; cpX: number; cpY: number; srcX: number; srcY: number
  floatDur: string; floatDelay: string; enterDelay: string
}> = [
  {
    id: 0, text: 'Explain Backprop?',
    pos: { top: '32%', left: '3%' },
    svgX: 4,  svgY: 32, cpX: 14, cpY: 44, srcX: 21, srcY: 56,
    floatDur: '4.8s', floatDelay: '0s',    enterDelay: '0.4s',
  },
  {
    id: 1, text: 'How to optimize RAG?',
    pos: { top: '63%', left: '5%' },
    svgX: 6,  svgY: 63, cpX: 14, cpY: 58, srcX: 21, srcY: 60,
    floatDur: '6.5s', floatDelay: '1.3s', enterDelay: '0.7s',
  },
  {
    id: 2, text: 'COMP9517 历年考点',
    pos: { top: '28%', right: '3%' },
    svgX: 96, svgY: 28, cpX: 86, cpY: 40, srcX: 79, srcY: 54,
    floatDur: '5.2s', floatDelay: '0.7s', enterDelay: '0.55s',
  },
  {
    id: 3, text: 'Attention Mechanism?',
    pos: { top: '65%', right: '4%' },
    svgX: 95, svgY: 65, cpX: 86, cpY: 60, srcX: 79, srcY: 59,
    floatDur: '4.2s', floatDelay: '1.9s', enterDelay: '0.85s',
  },
]

function HeroAINodes() {
  const [hov, setHov] = useState<number | null>(null)

  return (
    <div className="absolute inset-0 hidden md:block pointer-events-none" style={{ zIndex: 2 }}>

      {/* SVG bezier lines + energy particles */}
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="heroGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {HERO_OUTER_NODES.map((n, i) => {
          const d = `M ${n.srcX} ${n.srcY} Q ${n.cpX} ${n.cpY} ${n.svgX} ${n.svgY}`
          const isHov = hov === i
          return (
            <g key={i}>
              <path d={d} fill="none"
                stroke={isHov ? 'rgba(255,215,0,0.45)' : 'rgba(255,193,7,0.09)'}
                strokeWidth={isHov ? 0.45 : 0.22}
                strokeLinecap="round"
                style={{
                  transition: 'stroke 0.3s, stroke-width 0.3s',
                  strokeDasharray: 200,
                  strokeDashoffset: 200,
                  animation: `heroLineGrow 1.1s ease-out ${0.3 + i * 0.18}s forwards`,
                }}
              />
              <circle r="0.65" fill="rgba(255,230,80,0.92)" filter="url(#heroGlow)">
                <animateMotion path={d}
                  dur={`${2.6 + i * 0.6}s`}
                  begin={`${1.1 + i * 0.4}s`}
                  repeatCount="indefinite"
                  calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.6 1"
                />
              </circle>
            </g>
          )
        })}
      </svg>

      {/* Floating question bubbles */}
      {HERO_OUTER_NODES.map((n, i) => (
        <div key={i} className="pointer-events-auto absolute"
          style={{ ...n.pos, transform: 'translateY(-50%)' }}
          onMouseEnter={() => setHov(i)}
          onMouseLeave={() => setHov(null)}
        >
          {/* Balloon float wrapper */}
          <div style={{
            animation: `heroFloat${i} ${n.floatDur} ease-in-out ${n.floatDelay} infinite`,
            animationPlayState: hov === i ? 'paused' : 'running',
          }}>
            <div style={{
              padding: '5px 12px',
              borderRadius: 10,
              background: hov === i ? 'rgba(255,215,0,0.12)' : 'rgba(6,5,16,0.68)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${hov === i ? 'rgba(255,215,0,0.55)' : 'rgba(255,193,7,0.18)'}`,
              color: hov === i ? '#FFD700' : 'rgba(175,175,198,0.78)',
              fontSize: '0.68rem',
              fontWeight: hov === i ? 600 : 400,
              whiteSpace: 'nowrap',
              boxShadow: hov === i
                ? '0 0 18px rgba(255,215,0,0.2), 0 4px 16px rgba(0,0,0,0.6)'
                : '0 3px 12px rgba(0,0,0,0.5)',
              transform: hov === i ? 'scale(1.06)' : 'scale(1)',
              transition: 'all 0.25s ease',
              animation: `heroBubbleIn 0.6s cubic-bezier(0.34,1.56,0.64,1) ${n.enterDelay} both`,
            }}>
              {n.text}
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes heroLineGrow {
          from { stroke-dashoffset: 200; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes heroBubbleIn {
          from { opacity: 0; transform: scale(0.3) translateY(10px); filter: blur(4px); }
          to   { opacity: 1; transform: scale(1)   translateY(0);    filter: blur(0); }
        }
        @keyframes heroFloat0 {
          0%,100% { transform: translateY(0px)   translateX(0px); }
          33%     { transform: translateY(-20px) translateX(3px); }
          66%     { transform: translateY(-9px)  translateX(-2px); }
        }
        @keyframes heroFloat1 {
          0%,100% { transform: translateY(0px)   translateX(0px); }
          40%     { transform: translateY(-24px) translateX(-3px); }
          70%     { transform: translateY(-11px) translateX(2px); }
        }
        @keyframes heroFloat2 {
          0%,100% { transform: translateY(0px)   translateX(0px); }
          35%     { transform: translateY(-18px) translateX(2px); }
          65%     { transform: translateY(-25px) translateX(-2px); }
        }
        @keyframes heroFloat3 {
          0%,100% { transform: translateY(0px)   translateX(0px); }
          45%     { transform: translateY(-15px) translateX(-2px); }
          75%     { transform: translateY(-22px) translateX(3px); }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <Zap size={24} />,
    title: 'AI 智能生成',
    desc: '一键生成闪卡、模拟题、知识摘要，基于你上传的真题资料，精准覆盖考点。',
  },
  {
    icon: <Brain size={24} />,
    title: '多模型 RAG 问答',
    desc: '向 AI 直接提问课程内容，GPT-4o + Gemini 2.0 双引擎实时检索知识库作答。',
  },
  {
    icon: <BookOpen size={24} />,
    title: '错题集 & 复习追踪',
    desc: '自动记录错题，智能安排复习节奏，让每次练习都有针对性，考前不再慌乱。',
  },
]

export default function LandingPage() {
  const { user, role, loading, guestLogin } = useAuth()
  const router = useRouter()
  const [guestLoading, setGuestLoading] = useState(false)
  const [guestError, setGuestError] = useState('')

  // Already logged-in non-guest users → go directly to dashboard
  useEffect(() => {
    if (!loading && user && role !== 'guest') {
      router.replace('/dashboard')
    }
  }, [user, role, loading, router])

  async function handleGuestLogin() {
    setGuestLoading(true)
    setGuestError('')
    try {
      await guestLogin()
      router.push('/dashboard')
    } catch {
      setGuestError('游客登录失败，请稍后重试')
    } finally {
      setGuestLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#08080f' }}>
        <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#08080f', color: '#fff' }}>

      {/* ── Navbar ── */}
      <nav className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: 'rgba(255,215,0,0.08)', backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 10, background: 'rgba(8,8,15,0.85)' }}>
        <ExamMasterLogo height={28} />
        <div className="flex items-center gap-3">
          <Link href="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ color: '#888', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
            <Shield size={13} />
            管理后台
          </Link>
          <Link href="/login"
            className="px-4 py-1.5 rounded-lg text-sm transition-all"
            style={{ color: '#999', border: '1px solid rgba(255,255,255,0.1)' }}>
            登录
          </Link>
          <Link href="/register"
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
            注册
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden flex-1 flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-20 pb-10">

        {/* AI knowledge nodes — outer negative-space bubbles (desktop only) */}
        <HeroAINodes />

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-7 fade-in-up"
          style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
          <Sparkles size={12} />
          数据驱动 · AI 助教 · 专为留学生打造
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-7xl font-black mb-4 leading-tight fade-in-up"
          style={{
            background: 'linear-gradient(135deg, #FFD700 0%, #FFF3B0 50%, #FFD700 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animationDelay: '0.05s',
          }}>
          Exam Master
        </h1>

        {/* Subtitle */}
        <p className="text-base md:text-lg mb-2 max-w-lg leading-relaxed fade-in-up"
          style={{ color: '#444455', fontWeight: 300, animationDelay: '0.1s' }}>
          上传课件与历年真题，AI 自动提炼考点，生成闪卡与模拟试题。
        </p>

        {guestError && (
          <p className="text-sm mt-3 px-4 py-2 rounded-lg"
            style={{ color: '#ff8080', background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.2)' }}>
            {guestError}
          </p>
        )}

        {/* ── Campus Hero Card ── */}
        <CampusHeroCard onGuestLogin={handleGuestLogin} guestLoading={guestLoading} />

        {/* Footer hint */}
        <p className="text-xs mt-2" style={{ color: '#2a2a3a' }}>
          游客模式仅限 COMP9517 课程体验 · 注册解锁全部功能
        </p>
      </section>

      {/* ── Features ── */}
      <section className="px-6 py-16 border-t" style={{ borderColor: 'rgba(255,215,0,0.06)' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12 text-white">为什么选择 Exam Master？</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {FEATURES.map(f => (
              <div key={f.title}
                className="p-7 rounded-2xl transition-all duration-300 group"
                style={{
                  background: 'rgba(255,215,0,0.025)',
                  border: '1px solid rgba(255,215,0,0.09)',
                  backdropFilter: 'blur(8px)',
                  cursor: 'default',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,215,0,0.055)'
                  ;(e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(212,168,67,0.22)'
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 28px rgba(212,168,67,0.08), 0 8px 32px rgba(0,0,0,0.4)'
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,215,0,0.025)'
                  ;(e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(255,215,0,0.09)'
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                }}
              >
                <div className="mb-4" style={{ color: '#D4A843' }}>{f.icon}</div>
                <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#505060', fontWeight: 300 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 text-center border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <p className="text-xs" style={{ color: '#333' }}>
          © 2024 Exam Master · 专为 UNSW 学生打造
          {' '}
          <Link href="/admin"
            style={{ color: '#222', textDecoration: 'none' }}
            title="admin">⌘</Link>
        </p>
      </footer>
    </div>
  )
}
