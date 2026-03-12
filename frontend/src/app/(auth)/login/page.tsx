'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight, Loader2, Lock, Mail, Shield } from 'lucide-react'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import Toast from '@/components/Toast'
import { useAuth } from '@/lib/auth-context'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 1000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {success && (
        <Toast message="登录成功，正在跳转..." type="success" onClose={() => setSuccess(false)} />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,28,42,0.78),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(200,165,90,0.08),transparent_18%),linear-gradient(180deg,#050608_0%,#080b12_50%,#050608_100%)]" />

      <div className="relative z-10 grid w-full max-w-[1080px] gap-8 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="hidden rounded-[32px] border border-white/8 bg-white/[0.03] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] lg:flex lg:flex-col lg:justify-between">
          <div>
            <ExamMasterLogo height={34} />
            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <Shield className="h-3.5 w-3.5 text-[#c8a55a]" />
              Secure student workspace
            </div>
            <h1 className="mt-6 max-w-[12ch] text-5xl font-semibold leading-[0.95] tracking-[-0.06em] text-white">
              登录后继续你的备考工作流
            </h1>
            <p className="mt-5 max-w-[420px] text-base leading-8 text-white/52">
              课程资料、闪卡、模拟题、错题集和 AI 问答都保留在同一个工作台里，登录后直接回到上次学习位置。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-white/8 bg-black/16 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Flashcards</p>
              <p className="mt-3 text-lg font-semibold text-white">36 cards</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/16 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Mock exams</p>
              <p className="mt-3 text-lg font-semibold text-white">12 questions</p>
            </div>
            <div className="rounded-[22px] border border-[#c8a55a]/16 bg-[#c8a55a]/8 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">RAG Q&A</p>
              <p className="mt-3 text-lg font-semibold text-white">GPT + Gemini</p>
            </div>
          </div>
        </section>

        <section className="glass-gold p-6 sm:p-8">
          <div className="lg:hidden">
            <ExamMasterLogo height={32} />
          </div>

          <div className="mt-8 lg:mt-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <Shield className="h-3.5 w-3.5 text-[#c8a55a]" />
              Account access
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white">欢迎回来</h2>
            <p className="mt-3 text-sm leading-7 text-white/48">
              使用你的账号继续访问课程资料、生成记录、错题集和复习进度。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="form-label">邮箱地址</label>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="email"
                  className={`input-glass pl-11 ${error ? 'border-red-400/40' : ''}`}
                  placeholder="you@student.unsw.edu.au"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="form-label">密码</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="password"
                  className={`input-glass pl-11 ${error ? 'border-red-400/40' : ''}`}
                  placeholder="请输入密码"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
                <p className="text-sm text-red-200/90">{error}</p>
              </div>
            )}

            <button type="submit" className="btn-gold flex w-full items-center justify-center gap-2 py-3.5 text-sm" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  正在登录
                </>
              ) : (
                <>
                  登录账号
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="divider-text my-6">还没有账号？</div>

          <Link
            href="/register"
            className="btn-outline-gold flex w-full items-center justify-center gap-2 py-3 text-sm"
            style={{ textDecoration: 'none' }}
          >
            立即注册
          </Link>

          <p className="mt-6 text-center text-xs text-white/30">需要邀请码，仅限 UNSW 学生。</p>
        </section>
      </div>
    </div>
  )
}
