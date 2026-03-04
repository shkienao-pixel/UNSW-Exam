'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Mail, Lock, Ticket, Zap, ArrowRight, Loader2, CheckCircle } from 'lucide-react'

const PERKS = [
  '新用户注册即送 5 积分',
  '上传文件审核通过 +1 积分',
  '反馈被采纳 +1 积分',
]

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('两次输入的密码不一致'); return }
    if (password.length < 8) { setError('密码至少 8 位'); return }
    if (!inviteCode.trim()) { setError('请输入邀请码'); return }
    setLoading(true)
    try {
      await register(email, password, inviteCode.trim())
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 tech-grid" style={{ background: '#08080f' }}>

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div style={{
          position: 'absolute', top: '15%', left: '40%', transform: 'translateX(-50%)',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,215,0,0.065) 0%, transparent 65%)',
        }} />
      </div>

      <div className="w-full max-w-md relative z-10 fade-in-up">

        {/* Logo */}
        <div className="text-center mb-7">
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
          <h1 className="text-lg font-bold text-white mb-1" style={{ letterSpacing: '-0.01em' }}>
            创建账户
          </h1>
          <p className="text-xs mb-6" style={{ color: '#44445a' }}>需要邀请码 · 仅限 UNSW 在读学生</p>

          {/* Perks */}
          <div className="flex flex-wrap gap-2 mb-6">
            {PERKS.map(p => (
              <div key={p} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.15)', color: '#b09050' }}>
                <CheckCircle size={11} style={{ color: '#FFD700' }} />
                {p}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Invite code */}
            <div>
              <label className="form-label">邀请码</label>
              <div className="relative">
                <Ticket size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#33334a' }} />
                <input
                  type="text"
                  className="input-glass pl-10 font-mono tracking-widest uppercase"
                  placeholder="XXXXXXXX"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  required
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="form-label">邮箱地址</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#33334a' }} />
                <input
                  type="email"
                  className="input-glass pl-10"
                  placeholder="you@student.unsw.edu.au"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="form-label">密码（至少 8 位）</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#33334a' }} />
                <input
                  type="password"
                  className="input-glass pl-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* Confirm */}
            <div>
              <label className="form-label">确认密码</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#33334a' }} />
                <input
                  type="password"
                  className="input-glass pl-10"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
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

            <button
              type="submit"
              className="btn-gold w-full flex items-center justify-center gap-2 mt-1"
              disabled={loading}
              style={{ padding: '13px', fontSize: '0.95rem' }}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> 注册中…</>
                : <><span>立即注册</span><ArrowRight size={16} /></>
              }
            </button>
          </form>

          <div className="divider-text mt-5 mb-4">已有账户？</div>

          <Link href="/login"
            className="btn-outline-gold w-full flex items-center justify-center gap-2 text-sm"
            style={{ textDecoration: 'none', padding: '11px' }}>
            去登录
          </Link>
        </div>
      </div>
    </div>
  )
}
