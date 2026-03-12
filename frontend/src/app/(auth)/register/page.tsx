'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Shield,
  Ticket,
} from 'lucide-react'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import Toast, { ToastType } from '@/components/Toast'
import { useAuth } from '@/lib/auth-context'

interface ToastState { message: string; type: ToastType }

const PERKS = [
  '新用户注册即送 5 积分',
  '文件审核通过可获得额外积分',
  '优质反馈被采纳后继续加分',
]

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setToast(null)

    if (password !== confirm) {
      setToast({ message: '两次输入的密码不一致。', type: 'error' })
      return
    }
    if (password.length < 8) {
      setToast({ message: '密码至少需要 8 位。', type: 'error' })
      return
    }
    if (!inviteCode.trim()) {
      setToast({ message: '请输入邀请码。', type: 'error' })
      return
    }

    setLoading(true)
    try {
      await register(email, password, inviteCode.trim())
      setToast({ message: '注册成功，欢迎加入 Exam Master！', type: 'success' })
      setTimeout(() => router.push('/dashboard'), 1200)
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : '注册失败，请稍后重试。', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
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

        <section className="glass-gold p-6 sm:p-8">
          <div className="lg:hidden">
            <ExamMasterLogo height={32} />
          </div>

          <div className="mt-8 lg:mt-0">
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
                  className="input-glass pl-11 font-mono uppercase tracking-[0.2em]"
                  placeholder="XXXXXXXX"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value.toUpperCase())}
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
                  onChange={e => setEmail(e.target.value)}
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
                  className="input-glass pl-11"
                  placeholder="至少 8 位"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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
                  className="input-glass pl-11"
                  placeholder="再次输入密码"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>
            </div>


            <button type="submit" className="btn-gold flex w-full items-center justify-center gap-2 py-3.5 text-sm" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  正在注册
                </>
              ) : (
                <>
                  立即注册
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="divider-text my-6">已有账号？</div>

          <Link
            href="/login"
            className="btn-outline-gold flex w-full items-center justify-center gap-2 py-3 text-sm"
            style={{ textDecoration: 'none' }}
          >
            去登录
          </Link>
        </section>
      </div>
    </div>
  )
}
