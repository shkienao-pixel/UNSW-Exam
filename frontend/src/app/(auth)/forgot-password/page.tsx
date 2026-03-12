'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Mail, Shield } from 'lucide-react'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import { api } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.auth.requestReset(email.trim())
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '发送失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,28,42,0.78),transparent_30%),linear-gradient(180deg,#050608_0%,#080b12_50%,#050608_100%)]" />

      <div className="relative z-10 w-full max-w-md">
        <section className="glass-gold p-6 sm:p-8">
          <ExamMasterLogo height={32} />

          <div className="mt-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <Shield className="h-3.5 w-3.5 text-[#c8a55a]" />
              Password recovery
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white">重置密码</h2>
            <p className="mt-3 text-sm leading-7 text-white/48">
              输入注册时使用的邮箱，我们将发送重置链接。
            </p>
          </div>

          {sent ? (
            <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-6 py-8 text-center">
              <CheckCircle2 size={36} className="text-emerald-400" />
              <p className="text-sm text-emerald-100/90">
                重置链接已发送至 <strong>{email}</strong>，请检查邮箱（含垃圾邮件）。
              </p>
              <Link href="/login" className="btn-outline-gold mt-2 px-6 py-2.5 text-sm" style={{ textDecoration: 'none' }}>
                返回登录
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label className="form-label">邮箱地址</label>
                <div className="relative">
                  <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="email"
                    className="input-glass pl-11"
                    placeholder="you@student.unsw.edu.au"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    autoComplete="email"
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
                    发送中...
                  </>
                ) : (
                  <>
                    发送重置链接
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="text-center">
                <Link href="/login" className="text-xs text-white/40 hover:text-[#c8a55a] transition-colors" style={{ textDecoration: 'none' }}>
                  返回登录
                </Link>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
