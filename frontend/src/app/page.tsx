'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  PanelLeft,
  Search,
  Shield,
  Sparkles,
} from 'lucide-react'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import { useAuth } from '@/lib/auth-context'

const NAV_ITEMS = ['能力', '工作流', '安全']

const HERO_FACTS = [
  { label: '已解析资料', value: '128 份' },
  { label: '访客课程', value: 'COMP9517' },
  { label: '双模型引擎', value: 'GPT + Gemini' },
]

const SIDEBAR_ITEMS = [
  { label: '课程总览', active: false },
  { label: 'Flashcards', active: true },
  { label: 'Wrong Answer Sets', active: false },
  { label: 'Practice Exams', active: false },
]

const REVIEW_ROWS = [
  {
    title: 'Attention Mechanism 高频考点',
    source: 'Lecture 10 + 2024 Past Paper',
    state: '待重点复习',
    accent: true,
  },
  {
    title: 'Backpropagation 易错题',
    source: 'Tutorial 05 + Wrong Answer Set',
    state: '已整理',
  },
  {
    title: 'RAG 问答可追问材料',
    source: 'Lecture Slides + Notes',
    state: '生成中',
  },
]

const RIGHT_PANEL = [
  { label: '今日计划', value: '错题回看 + 模拟题' },
  { label: 'AI 问答', value: '可直接追问课程内容' },
  { label: '当前产物', value: '36 张闪卡 + 12 道模拟题' },
]

const FEATURE_CARDS = [
  {
    icon: Brain,
    title: 'AI 智能生成',
    description: '上传课件和历年真题后，系统自动提炼考点，生成摘要、闪卡和模拟试题，直接围绕备考任务展开。',
  },
  {
    icon: BookOpen,
    title: '多模型 RAG 问答',
    description: '基于已上传的课程资料和真题构建问答上下文，支持直接追问知识点，而不是给一段脱离材料的泛化回答。',
  },
  {
    icon: Shield,
    title: '错题集与复习追踪',
    description: '把错题、薄弱点和复习节奏串成一条线，帮助你在考前快速知道该回看什么、先练什么。',
  },
]

function ProductPreviewCard({
  onGuestLogin,
  guestLoading,
}: {
  onGuestLogin: () => void
  guestLoading: boolean
}) {
  return (
    <div className="relative w-full max-w-[860px]">
      <div className="pointer-events-none absolute left-[-14%] top-[46%] hidden h-px w-[14%] bg-gradient-to-r from-transparent via-[#c8a55a]/12 to-transparent xl:block" />
      <div className="pointer-events-none absolute right-[-14%] top-[46%] hidden h-px w-[14%] bg-gradient-to-l from-transparent via-[#c8a55a]/12 to-transparent xl:block" />

      <div className="relative overflow-hidden rounded-[32px] border border-white/8 bg-[rgba(11,13,18,0.88)] shadow-[0_30px_100px_rgba(0,0,0,0.52)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(200,165,90,0.08),transparent_24%),radial-gradient(circle_at_100%_0%,rgba(91,104,138,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.025),transparent_40%)]" />

        <div className="relative flex items-center justify-between border-b border-white/7 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/14" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#c8a55a]/55" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/34">Exam Master</p>
              <p className="text-sm font-medium text-white/82">Review workspace</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-white/46 sm:flex">
            <Search className="h-3.5 w-3.5" />
            Search notes, papers, mistakes
          </div>
        </div>

        <div className="relative grid min-h-[540px] grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] xl:grid-cols-[188px_minmax(0,1fr)_228px]">
          <aside className="border-b border-white/7 bg-black/14 p-4 md:col-span-2 xl:col-span-1 xl:border-b-0 xl:border-r">
            <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
              <div className="flex items-center gap-2 text-white/78">
                <PanelLeft className="h-4 w-4 text-[#c8a55a]" />
                <span className="text-sm font-medium">COMP9517</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/40">访客模式展示 COMP9517 的资料上传、生成和复习流程。</p>
            </div>

            <div className="mt-5 space-y-1.5">
              {SIDEBAR_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm transition ${
                    item.active
                      ? 'border border-white/10 bg-white/[0.06] text-white'
                      : 'border border-transparent text-white/42'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.active ? <ChevronRight className="h-4 w-4 text-[#c8a55a]" /> : null}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-[#c8a55a]/12 bg-[#c8a55a]/6 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#dbc185]">Guest Demo</p>
              <p className="mt-2 text-sm leading-6 text-white/56">注册后可上传你自己的课程资料；访客模式只开放预载课程体验。</p>
            </div>
          </aside>

          <section className="p-4 sm:p-5 lg:p-6">
            <div className="flex flex-col gap-4 border-b border-white/7 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/33">COMP9517 REVIEW</p>
                <h3 className="mt-2 max-w-[18ch] text-[24px] font-semibold tracking-[-0.04em] text-white sm:text-[26px]">
                  历年考点、闪卡与错题回看在同一块界面
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-7 text-white/50">
                  课件、tutorial、past paper 和错题记录会先被整理进同一个复习工作台，再触发 AI 生成与问答。
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/48">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                2 分钟前同步
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/33">资料来源</p>
                <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">12</p>
                <p className="mt-1 text-sm text-white/42">课件、习题、历年题</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/33">已生成</p>
                <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">36</p>
                <p className="mt-1 text-sm text-white/42">张闪卡</p>
              </div>
              <div className="rounded-[22px] border border-[#c8a55a]/15 bg-[#c8a55a]/7 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/33">模拟题覆盖</p>
                <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">84%</p>
                <div className="mt-3 h-1.5 rounded-full bg-white/8">
                  <div className="h-full w-[84%] rounded-full bg-[#c8a55a]" />
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[26px] border border-white/8 bg-black/18 p-3 sm:p-4">
              <div className="grid gap-3">
                {REVIEW_ROWS.map((row) => (
                  <div
                    key={row.title}
                    className={`rounded-[22px] border px-4 py-3 ${
                      row.accent ? 'border-[#c8a55a]/15 bg-[#c8a55a]/7' : 'border-white/8 bg-white/[0.025]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white/86">{row.title}</p>
                        <p className="mt-1 text-xs text-white/42">{row.source}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          row.accent ? 'bg-[#c8a55a]/14 text-[#dec48b]' : 'bg-white/[0.05] text-white/44'
                        }`}
                      >
                        {row.state}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/33">Ask from your materials</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-7 text-white/56">
                  直接问：Attention Mechanism 为什么是 COMP9517 历年高频点？系统会结合课件与真题上下文回答。
                </p>
                <button
                  type="button"
                  onClick={onGuestLogin}
                  disabled={guestLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/78 transition hover:border-[#c8a55a]/18 hover:bg-[#c8a55a]/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {guestLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在进入
                    </>
                  ) : (
                    <>
                      进入访客体验
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          <aside className="border-t border-white/7 bg-black/14 p-4 md:border-l md:border-t-0 xl:border-l">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/33">今日复习</p>
              <div className="mt-4 space-y-4">
                <div className="flex gap-3">
                  <Clock3 className="mt-0.5 h-4 w-4 text-white/38" />
                  <div>
                    <p className="text-sm font-medium text-white/84">19:00 闪卡回看</p>
                    <p className="mt-1 text-xs text-white/42">18 张高频考点闪卡</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <BookOpen className="mt-0.5 h-4 w-4 text-white/38" />
                  <div>
                    <p className="text-sm font-medium text-white/84">20:30 模拟题训练</p>
                    <p className="mt-1 text-xs text-white/42">聚焦 2024 年 Q3 与 Q5</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#c8a55a]" />
                  <div>
                    <p className="text-sm font-medium text-white/84">21:15 错题整理</p>
                    <p className="mt-1 text-xs text-white/42">AI 汇总薄弱点到错题集</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/33">当前状态</p>
              <div className="mt-4 space-y-3">
                {RIGHT_PANEL.map((item) => (
                  <div key={item.label} className="rounded-2xl bg-black/16 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/30">{item.label}</p>
                    <p className="mt-2 text-sm font-medium text-white/82">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const { user, role, loading, guestLogin } = useAuth()
  const router = useRouter()
  const [guestLoading, setGuestLoading] = useState(false)
  const [guestError, setGuestError] = useState('')

  useEffect(() => {
    if (!loading && user && role !== 'guest') {
      router.replace('/dashboard')
    }
  }, [loading, role, router, user])

  async function handleGuestLogin() {
    setGuestLoading(true)
    setGuestError('')

    try {
      await guestLogin()
      router.push('/dashboard')
    } catch {
      setGuestError('访客模式进入失败，请稍后再试。')
    } finally {
      setGuestLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050608]">
        <Loader2 className="h-8 w-8 animate-spin text-[#c8a55a]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050608] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(20,28,42,0.78),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(200,165,90,0.08),transparent_18%),linear-gradient(180deg,#050608_0%,#080b12_50%,#050608_100%)]" />

      <nav className="sticky top-0 z-30 border-b border-white/6 bg-[rgba(5,6,8,0.72)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-5 py-4 sm:px-6">
          <ExamMasterLogo height={29} />

          <div className="hidden items-center gap-8 lg:flex">
            {NAV_ITEMS.map((item) => (
              <span key={item} className="text-sm text-white/42">
                {item}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/58 transition hover:border-white/14 hover:bg-white/[0.05] hover:text-white/82"
            >
              <Shield className="h-3.5 w-3.5" />
              管理后台
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/66 transition hover:border-white/14 hover:bg-white/[0.04] hover:text-white"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="rounded-full border border-[#c8a55a]/20 bg-[#c8a55a]/10 px-4 py-2 text-sm font-medium text-[#e6cf98] transition hover:border-[#c8a55a]/28 hover:bg-[#c8a55a]/14"
            >
              注册
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="mx-auto flex min-h-[calc(100vh-81px)] max-w-[1280px] flex-col justify-center gap-12 px-5 py-16 sm:px-6 xl:py-20">
          <div className="max-w-[560px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <Sparkles className="h-3.5 w-3.5 text-[#c8a55a]" />
              数据驱动 · AI 助教 · 专为留学生打造
            </div>

            <h1 className="mt-7 text-[clamp(3rem,6vw,6rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">
              Exam Master
            </h1>

            <div className="mt-6 max-w-[620px] space-y-3">
              <p className="text-lg font-medium leading-8 text-white/82 sm:text-[1.45rem]">
                每一个留学生，都值得一位 24/7 的私人助教。
              </p>
              <p className="text-base leading-8 text-white/54 sm:text-lg">
                上传你的专属资料，生成你的专属题库。问你想问，学你想学，Exam Master 比你更懂你的考纲。
              </p>
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#c8a55a]/20 bg-[#c8a55a]/10 px-5 py-3 text-sm font-medium text-[#e6cf98] transition hover:border-[#c8a55a]/28 hover:bg-[#c8a55a]/14"
              >
                创建账号
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={guestLoading}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-white/76 transition hover:border-white/14 hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guestLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在进入演示
                  </>
                ) : (
                  <>
                    进入访客演示
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            {guestError ? (
              <div className="mt-4 rounded-2xl border border-red-400/18 bg-red-500/8 px-4 py-3 text-sm text-red-200/86">
                {guestError}
              </div>
            ) : null}

            <div className="mt-12 grid gap-3 sm:grid-cols-3">
              {HERO_FACTS.map((item) => (
                <div key={item.label} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/30">{item.label}</p>
                  <p className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">{item.value}</p>
                </div>
              ))}
            </div>

            <p className="mt-4 text-sm text-white/34">
              访客模式仅限 COMP9517 课程体验；注册后可上传完整资料并解锁全部功能。
            </p>
          </div>

          <ProductPreviewCard onGuestLogin={handleGuestLogin} guestLoading={guestLoading} />
        </section>

        <section className="mx-auto max-w-[1280px] px-5 pb-16 sm:px-6 lg:pb-24">
          <div className="grid gap-4 lg:grid-cols-3">
            {FEATURE_CARDS.map((feature) => {
              const Icon = feature.icon

              return (
                <div
                  key={feature.title}
                  className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                >
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/18 text-[#c8a55a]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-5 text-xl font-medium tracking-[-0.03em] text-white">{feature.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-white/50">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
