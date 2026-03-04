'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import Image from 'next/image'
import { Loader2, Sparkles, Brain, BookOpen, Zap, Shield } from 'lucide-react'
import CampusHeroCard from '@/components/CampusHeroCard'

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
        <Image src="/logo.png" alt="Exam Master" width={120} height={40} style={{ objectFit: 'contain' }} priority />
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
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-20 pb-10">

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
          style={{ color: '#444455', animationDelay: '0.1s' }}>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title}
                className="p-6 rounded-2xl"
                style={{
                  background: 'rgba(255,215,0,0.03)',
                  border: '1px solid rgba(255,215,0,0.1)',
                  backdropFilter: 'blur(8px)',
                }}>
                <div className="mb-4" style={{ color: '#FFD700' }}>{f.icon}</div>
                <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#555' }}>{f.desc}</p>
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
