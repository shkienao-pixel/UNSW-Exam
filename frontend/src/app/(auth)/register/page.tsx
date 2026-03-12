'use client'

import { FormEvent, ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
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
import { api } from '@/lib/api'

const PERKS = [
  'New users get 5 welcome credits',
  'Upload approved files to earn extra credits',
  'High-quality feedback can earn bonus credits',
]

function OtpStep({
  email,
  onSuccess,
  onBack,
}: {
  email: string
  onSuccess: (tokens: { access_token: string; refresh_token: string; expires_in: number }) => void
  onBack: () => void
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  function handleDigit(idx: number, val: string) {
    const v = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = v
    setDigits(next)
    setError('')
    if (v && idx < 7) inputs.current[idx + 1]?.focus()
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8)
    if (text.length === 8) {
      setDigits(text.split(''))
      inputs.current[7]?.focus()
    }
    e.preventDefault()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const code = digits.join('')
    if (code.length < 8) {
      setError('Please enter the full 8-digit verification code.')
      return
    }

    setLoading(true)
    setError('')
    setHint('')
    try {
      const res = await api.auth.verifyOtp(email, code)
      onSuccess(res as { access_token: string; refresh_token: string; expires_in: number })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification code invalid or expired. Please try again.')
      setDigits(['', '', '', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function resendCode() {
    if (cooldown > 0) return
    setResending(true)
    setError('')
    setHint('')
    try {
      await api.auth.resendOtp(email)
      setHint('Verification code has been resent. Please check your inbox (including spam).')
      setCooldown(60)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification code. Please try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(200,165,90,0.12)', border: '1px solid rgba(200,165,90,0.25)' }}
        >
          <MailCheck size={26} className="text-[#c8a55a]" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-white">Verify your email</h3>
          <p className="mt-1.5 text-sm text-white/48 leading-6">
            We sent an 8-digit code to
            <br />
            <span className="text-white/70 font-medium">{email}</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => {
                inputs.current[i] = el
              }}
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
        {hint && (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3">
            <p className="text-sm text-emerald-100/90">{hint}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-gold flex w-full items-center justify-center gap-2 py-3.5 text-sm"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <CheckCircle2 size={16} />
              Confirm code
            </>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-white/28">
        Did not receive the code?{' '}
        <button
          type="button"
          onClick={resendCode}
          disabled={resending || cooldown > 0}
          className="text-white/70 hover:text-white transition-colors underline underline-offset-2 disabled:opacity-50"
        >
          {resending ? 'Sending...' : cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend'}
        </button>
        {' '}·{' '}
        <button
          onClick={onBack}
          className="text-white/48 hover:text-white/70 transition-colors underline underline-offset-2"
          type="button"
        >
          Back to form
        </button>
      </p>
    </div>
  )
}

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [pendingEmail, setPendingEmail] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const presetEmail = (params.get('email') || '').trim()
    const presetModeOtp = params.get('mode') === 'otp'
    if (presetEmail) {
      setEmail(presetEmail)
      setPendingEmail(presetEmail)
    }
    if (presetModeOtp && presetEmail) {
      setStep('otp')
    }
  }, [])

  function clearFieldErrors() {
    setInviteError('')
    setEmailError('')
    setPasswordError('')
    setConfirmError('')
  }

  function bindFieldError(message: string): void {
    const s = message.toLowerCase()
    if (s.includes('invite')) {
      setInviteError(message)
      return
    }
    if (s.includes('email')) {
      setEmailError(message)
      return
    }
    if (s.includes('match') || s.includes('confirm')) {
      setConfirmError(message)
      return
    }
    if (s.includes('password')) {
      setPasswordError(message)
    }
  }


  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    clearFieldErrors()

    if (!inviteCode.trim()) {
      setInviteError('Invite code is required.')
      setError('Invite code is required.')
      return
    }
    if (!email.trim()) {
      setEmailError('Email is required.')
      setError('Email is required.')
      return
    }
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setConfirmError('Passwords do not match.')
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await api.auth.register(email.trim(), password, inviteCode.trim())
      if (res.status === 'otp_sent') {
        setPendingEmail(email.trim())
        setStep('otp')
        return
      }

      if (res.access_token && res.refresh_token) {
        localStorage.setItem('access_token', res.access_token)
        localStorage.setItem('refresh_token', res.refresh_token)
      }
      setSuccess(true)
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1200)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed, please try again.'
      bindFieldError(message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  function handleOtpSuccess(tokens: { access_token: string; refresh_token: string; expires_in: number }) {
    localStorage.setItem('access_token', tokens.access_token)
    localStorage.setItem('refresh_token', tokens.refresh_token)
    setSuccess(true)
    setTimeout(() => {
      window.location.href = '/dashboard'
    }, 1200)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {success && <Toast message="Registration successful. Redirecting..." type="success" onClose={() => setSuccess(false)} />}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,28,42,0.78),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(200,165,90,0.08),transparent_18%),linear-gradient(180deg,#050608_0%,#080b12_50%,#050608_100%)]" />

      <div className="relative z-10 grid w-full max-w-[1120px] gap-8 lg:grid-cols-[1fr_1.04fr]">
        <section className="hidden rounded-[32px] border border-white/8 bg-white/[0.03] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] lg:flex lg:flex-col lg:justify-between">
          <div>
            <ExamMasterLogo height={34} />
            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <Shield className="h-3.5 w-3.5 text-[#c8a55a]" />
              Invite-only access
            </div>
            <h1 className="mt-6 max-w-[13ch] text-5xl font-semibold leading-[0.95] tracking-[-0.06em] text-white">
              Build your Exam Master workspace
            </h1>
            <p className="mt-5 max-w-[440px] text-base leading-8 text-white/52">
              Register once and keep your uploads, generated materials, and AI answers in one place.
            </p>
          </div>
          <div className="space-y-3">
            {PERKS.map(perk => (
              <div key={perk} className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-black/16 px-4 py-3 text-sm text-white/70">
                <CheckCircle2 className="h-4 w-4 text-[#c8a55a]" />
                <span>{perk}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-gold p-6 sm:p-8">
          <div className="lg:hidden mb-6">
            <ExamMasterLogo height={32} />
          </div>

          {step === 'otp' ? (
            <OtpStep email={pendingEmail} onSuccess={handleOtpSuccess} onBack={() => { setStep('form'); setError('') }} />
          ) : (
            <>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
                  <Shield className="h-3.5 w-3.5 text-[#c8a55a]" />
                  Register with invite code
                </div>
                <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white">Create account</h2>
                <p className="mt-3 text-sm leading-7 text-white/48">
                  Account is activated after email verification.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div>
                  <label className="form-label">Invite code</label>
                  <div className="relative">
                    <Ticket size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="text"
                      className={`input-glass pl-11 font-mono uppercase tracking-[0.2em] ${inviteError ? 'border-red-400/40' : ''}`}
                      placeholder="XXXXXXXX"
                      value={inviteCode}
                      onChange={e => {
                        setInviteCode(e.target.value.toUpperCase())
                        setError('')
                        setInviteError('')
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Email address</label>
                  <div className="relative">
                    <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="email"
                      className={`input-glass pl-11 ${emailError ? 'border-red-400/40' : ''}`}
                      placeholder="you@student.unsw.edu.au"
                      value={email}
                      onChange={e => {
                        setEmail(e.target.value)
                        setError('')
                        setEmailError('')
                      }}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Password</label>
                  <div className="relative">
                    <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="password"
                      className={`input-glass pl-11 ${passwordError ? 'border-red-400/40' : ''}`}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={e => {
                        setPassword(e.target.value)
                        setError('')
                        setPasswordError('')
                      }}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Confirm password</label>
                  <div className="relative">
                    <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="password"
                      className={`input-glass pl-11 ${confirmError ? 'border-red-400/40' : ''}`}
                      placeholder="Enter password again"
                      value={confirm}
                      onChange={e => {
                        setConfirm(e.target.value)
                        setError('')
                        setConfirmError('')
                      }}
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
                      Registering...
                    </>
                  ) : (
                    <>
                      <ArrowRight size={16} />
                      Register now
                    </>
                  )}
                </button>
              </form>

              <div className="divider-text my-6">Already have an account?</div>
              <Link href="/login" className="btn-outline-gold flex w-full items-center justify-center gap-2 py-3 text-sm" style={{ textDecoration: 'none' }}>
                Go to login
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
