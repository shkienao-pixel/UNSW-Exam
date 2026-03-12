'use client'

import { FormEvent, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  Shield,
  Ticket,
} from 'lucide-react'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import Toast from '@/components/Toast'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

const PERKS = [
  '新用户注册即送 5 积分',
  '文件审核通过可获得额外积分',
  '优质反馈被采纳后继续加分',
]

// ── Step 2：OTP 验证 ───────────────────────────────────────────────────────────

function OtpStep({
  email,
  onSuccess,
  onBack,
}: {
  email: string
  onSuccess: (tokens: { access_token: string; refresh_token: string; expires_in: number }) => void
  onBack: () => void
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  function handleDigit(idx: number, val: string) {
    const v = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = v
    setDigits(next)
    setError('')
    if (v && idx < 5) inputs.current[idx + 1]?.focus()
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setDigits(text.split(''))
      inputs.current[5]?.focus()
    }
    e.preventDefault()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const code = digits.join('')
    if (code.length < 6) { setError('请输入完整的 6 位验证码'); return }
    setLoading(true)
    setError('')
    try {
      const res = await api.auth.verifyOtp(email, code)
      onSuccess(res as { access_token: string; refresh_token: string; expires_in: number })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '验证码错误或已过期，请重试。')
      setDigits(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(200,165,90,0.12)', border: '1px solid rgba(200,165,90,0.25)' }}>
          <MailCheck size={26} className="text-[#c8a55a]" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-white">验证你的邮箱</h3>
          <p className="mt-1.5 text-sm text-white/48 leading-6">
            我们已发送 6 位验证码至<br />
            <span className="text-white/70 font-medium">{email}</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 6格验证码输入 */}
        <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className={[
                'w-11 h-14 text-center text-xl font-bold rounded-xl outline-none transition-all duration-150',
                'bg-white/5 text-white',
                error
                  ? 'border border-red-400/40'
                  : d
                    ? 'border border-[#c8a55a]/50 shadow-[0_0_12px_rgba(200,165,90,0.15)]'
                    : 'border border-white/10 focus:border-[#c8a55a]/40',
              ].join(' ')}
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
            <p className="text-sm text-red-200/90">{error}</p>
          </div>
        )}

        <button type="submit" disabled={loading}
          className="btn-gold flex w-full items-center justify-center gap-2 py-3.5 text-sm">
          {loading
            ? <><Loader2 size={16} className="animate-spin" />验证中...</>
            : <><CheckCircle2 size={16} />确认验证码</>}
        </button>
      </form>

      <p className="text-center text-xs text-white/28">
        没收到邮件？请检查垃圾邮件文件夹 ·{' '}
        <button onClick={onBack} className="text-white/48 hover:text-white/70 transition-colors underline underline-offset-2">
          重新填写信息
        </button>
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [pendingEmail, setPendingEmail] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('两次输入的密码不一致，请重新确认。')
      return
    }
    if (password.length < 8) {
      setError('密码至少需要 8 位，请重新输入。')
      return
    }
    if (!inviteCode.trim()) {
      setError('请输入邀请码。')
      return
    }

    setLoading(true)
    try {
      const res = await api.auth.register(email, password, inviteCode.trim())

      if (res.status === 'otp_sent') {
        // Supabase 开了邮件验证 → 进入第二步
        setPendingEmail(email)
        setStep('otp')
      } else {
        // 直接注册成功，存 token 跳转
        if (res.access_token) {
          localStorage.setItem('access_token', res.access_token)
          localStorage.setItem('refresh_token', res.refresh_token!)
        }
        setSuccess(true)
        setTimeout(() => { window.location.href = '/dashboard' }, 1200)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  function handleOtpSuccess(tokens: { access_token: string; refresh_token: string; expires_in: number }) {
    localStorage.setItem('access_token', tokens.access_token)
    localStorage.setItem('refresh_token', tokens.refresh_token)
    setSuccess(true)
    setTimeout(() => { window.location.href = '/dashboard' }, 1200)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {success && (
        <Toast message="注册成功，欢迎加入 Exam Master！" type="success" onClose={() => setSuccess(false)} />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,28,42,0.78),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(200,165,90,0.08),transparent_18%),linear-gradient(180deg,#050608_0%,#080b12_50%,#050608_100%)]" />

      <div className="relative z-10 grid w-full max-w-[1120px] gap-8 lg:grid-cols-[1fr_1.04fr]">
        {/* 左侧介绍栏 */}
        <section className="hidden rounded-[32px] border border-white/8 bg-white/[0.03] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] lg:flex lg:flex-col lg:justify-between">
          <div>
            <ExamMasterLogo height={34} />
            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <Shield className="h-3.5 w-3.5 text-[#c8a55a]" />
              Invite-only access
            </div>
            <h1 className="mt-6 max-w-[13ch] text-5xl font-semibold leading-[0.95] tracking-[-0.06em] text-white">
              创建你的 Exam Master 学习空间
            </h1>
            <p className="mt-5 max-w-[440px] text-base leading-8 text-white/52">
              注册后即可上传自己的课程资料，生成闪卡、模拟题、摘要和 AI 问答记录，把复习过程沉淀成一套长期可用的工作流。
            </p>
          </div>
          <div className="space-y-3">
            {PERKS.map((perk) => (
              <div key={perk} className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-black/16 px-4 py-3 text-sm text-white/70">
                <CheckCircle2 className="h-4 w-4 text-[#c8a55a]" />
                <span>{perk}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 右侧表单 */}
        <section className="glass-gold p-6 sm:p-8">
          <div className="lg:hidden mb-6">
            <ExamMasterLogo height={32} />
          </div>

          {step === 'otp' ? (
            <OtpStep
              email={pendingEmail}
              onSuccess={handleOtpSuccess}
              onBack={() => { setStep('form'); setError('') }}
            />
          ) : (
            <>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
                  <Shield className="h-3.5 w-3.5 text-[#c8a55a]" />
                  Register with invite code
                </div>
                <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white">创建账号</h2>
                <p className="mt-3 text-sm leading-7 text-white/48">
                  仅限邀请码注册。创建后即可访问课程资料上传、生成记录、错题追踪与学习工作台。
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div>
                  <label className="form-label">邀请码</label>
                  <div className="relative">
                    <Ticket size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="text"
                      className={`input-glass pl-11 font-mono uppercase tracking-[0.2em] ${error && !inviteCode.trim() ? 'border-red-400/40' : ''}`}
                      placeholder="XXXXXXXX"
                      value={inviteCode}
                      onChange={e => { setInviteCode(e.target.value.toUpperCase()); setError('') }}
                      autoComplete="off"
                      spellCheck={false}
                      required
                    />
                  </div>
                </div>

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

                <div>
                  <label className="form-label">密码</label>
                  <div className="relative">
                    <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="password"
                      className={`input-glass pl-11 ${error && error.includes('密码') ? 'border-red-400/40' : ''}`}
                      placeholder="至少 8 位"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">确认密码</label>
                  <div className="relative">
                    <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="password"
                      className={`input-glass pl-11 ${error && error.includes('不一致') ? 'border-red-400/40' : ''}`}
                      placeholder="再次输入密码"
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); setError('') }}
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
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" />正在注册</>
                    : <><ArrowRight size={16} />立即注册</>}
                </button>
              </form>

              <div className="divider-text my-6">已有账号？</div>
              <Link href="/login" className="btn-outline-gold flex w-full items-center justify-center gap-2 py-3 text-sm" style={{ textDecoration: 'none' }}>
                去登录
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
