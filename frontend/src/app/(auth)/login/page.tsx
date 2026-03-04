'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Mail, Lock, Zap, ArrowRight, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 tech-grid" style={{ background: '#08080f' }}>

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div style={{
          position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,215,0,0.07) 0%, transparent 65%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', right: '10%',
          width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(40,38,120,0.18) 0%, transparent 65%)',
        }} />
      </div>

      <div className="w-full max-w-md relative z-10 fade-in-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)' }}>
              <Zap size={20} style={{ color: '#FFD700' }} />
            </div>
            <span className="text-2xl font-black" style={{ color: '#FFD700', letterSpacing: '-0.02em' }}>
              Exam Master
            </span>
          </div>
          <p className="text-xs tracking-widest uppercase" style={{ color: '#44445a' }}>
            AI-Powered Study Platform
          </p>
        </div>

        {/* Card */}
        <div className="glass-gold p-8">

          <h1 className="text-lg font-bold text-white mb-6" style={{ letterSpacing: '-0.01em' }}>
            欢迎回来
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="form-label">邮箱地址</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#33334a' }} />
                <input
                  type="email"
                  className="input-glass pl-10"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="form-label">密码</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#33334a' }} />
                <input
                  type="password"
                  className="input-glass pl-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(255,68,68,0.08)', color: '#ff7070', border: '1px solid rgba(255,68,68,0.2)' }}>
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="btn-gold w-full flex items-center justify-center gap-2 mt-2"
              disabled={loading}
              style={{ padding: '13px', fontSize: '0.95rem' }}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> 登录中…</>
                : <><span>登录账户</span><ArrowRight size={16} /></>
              }
            </button>
          </form>

          {/* Divider */}
          <div className="divider-text my-6">还没有账户？</div>

          <Link href="/register"
            className="btn-outline-gold w-full flex items-center justify-center gap-2 text-sm"
            style={{ textDecoration: 'none', padding: '11px' }}>
            立即注册
          </Link>
        </div>

        {/* Footer hint */}
        <p className="text-center mt-5 text-xs" style={{ color: '#2a2a40' }}>
          需要邀请码 · 仅限 UNSW 学生
        </p>
      </div>
    </div>
  )
}
