'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Lock, Loader2, Shield } from 'lucide-react'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import { api } from '@/lib/api'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState('')
  const [tokenType, setTokenType] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const token = params.get('access_token') || ''
    const type = params.get('type') || ''
    setAccessToken(token)
    setTokenType(type)
    if (!token || type !== 'recovery') {
      setError('无效的重置链接，请重新申请。')
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setConfirmError('')

    if (newPassword !== confirmPassword) {
      setConfirmError('两次输入的密码不一致。')
      return
    }
    if (!accessToken) {
      setError('无效的重置链接，请重新申请。')
      return
    }

    setLoading(true)
    try {
      await api.auth.resetPassword(accessToken, newPassword)
      setDone(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重置失败，请重新申请重置链接。')
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
              Set new password
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white">设置新密码</h2>
            <p className="mt-3 text-sm leading-7 text-white/48">
              请输入你的新密码，至少 8 个字符。
            </p>
          </div>

          {done ? (
            <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-6 py-8 text-center">
              <CheckCircle2 size={36} className="text-emerald-400" />
              <p className="text-sm text-emerald-100/90">密码已重置成功，正在跳转到登录页...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label className="form-label">新密码</label>
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="password"
                    className="input-glass pl-11"
                    placeholder="至少 8 个字符"
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setError('') }}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="form-label">确认新密码</label>
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="password"
                    className={`input-glass pl-11 ${confirmError ? 'border-red-400/40' : ''}`}
                    placeholder="再次输入新密码"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setConfirmError('') }}
                    autoComplete="new-password"
                    required
                  />
                </div>
                {confirmError && <p className="mt-1 text-xs text-red-300">{confirmError}</p>}
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
                  <p className="text-sm text-red-200/90">{error}</p>
                  {error.includes('无效') && (
                    <Link href="/forgot-password" className="ml-auto shrink-0 text-xs text-[#c8a55a] hover:underline" style={{ textDecoration: 'none' }}>
                      重新申请
                    </Link>
                  )}
                </div>
              )}

              <button
                type="submit"
                className="btn-gold flex w-full items-center justify-center gap-2 py-3.5 text-sm"
                disabled={loading || !accessToken || tokenType !== 'recovery'}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    重置中...
                  </>
                ) : (
                  '确认重置密码'
                )}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
