'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0D0D0D' }}>
      {/* Background glow */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.06) 0%, transparent 70%)' }} />

      <div className="glass p-8 w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl font-bold mb-1" style={{ color: '#FFD700' }}>
            ✦ UNSW Exam Master
          </div>
          <p className="text-sm" style={{ color: '#888' }}>AI 驱动的考前复习平台</p>
        </div>

        <h1 className="text-xl font-semibold text-white mb-6">登录账户</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-2" style={{ color: '#AAA' }}>邮箱</label>
            <input
              type="email"
              className="input-glass"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm mb-2" style={{ color: '#AAA' }}>密码</label>
            <input
              type="password"
              className="input-glass"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(255,68,68,0.1)', color: '#FF6666', border: '1px solid rgba(255,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-gold w-full flex items-center justify-center gap-2" disabled={loading}>
            {loading ? <span className="spinner" /> : null}
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm" style={{ color: '#666' }}>
          还没有账户？{' '}
          <Link href="/register" className="font-medium" style={{ color: '#FFD700' }}>
            立即注册
          </Link>
        </p>
      </div>
    </div>
  )
}
