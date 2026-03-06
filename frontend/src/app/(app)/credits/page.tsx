'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, CreditCard, Loader2, Sparkles, XCircle } from 'lucide-react'
import { api } from '@/lib/api'

type Txn = { id: string; amount: number; type: string; note: string | null; created_at: string }

const TYPE_LABELS: Record<string, string> = {
  welcome_bonus: '新用户欢迎积分',
  artifact_approved: '文件审核通过',
  feedback_adopted: '反馈被采纳',
  admin_grant: '管理员赠送',
  purchase: '积分购买',
  refund: '生成失败退款',
  gen_flashcards: '生成闪卡',
  gen_quiz: '生成模拟题',
  gen_summary: '生成摘要',
  gen_outline: '生成大纲',
  gen_plan: '生成复习规划',
  gen_ask: 'AI 问答',
  unlock_upload: '解锁上传',
}

function CreditsPageInner() {
  const searchParams = useSearchParams()
  const [balance, setBalance] = useState<number | null>(null)
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

  const payStatus = searchParams.get('pay')

  const load = useCallback(async () => {
    try {
      const [bal, list] = await Promise.all([api.credits.balance(), api.credits.transactions()])
      setBalance(bal.balance)
      setTxns(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleCheckout() {
    setPaying(true)
    setPayError('')
    try {
      const origin = window.location.origin
      const { checkout_url } = await api.credits.checkout(`${origin}/credits?pay=success`, `${origin}/credits?pay=cancel`)
      window.location.href = checkout_url
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : '支付创建失败，请稍后重试。')
      setPaying(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">
      <section className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <CreditCard className="h-3.5 w-3.5 text-[#c8a55a]" />
              Credits
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-[0.96] tracking-[-0.05em] text-white">积分与额度</h1>
            <p className="mt-4 max-w-[460px] text-base leading-8 text-white/52">
              用户端页面统一切到新的深色产品语言后，积分页也保持同一套层级。你可以在这里查看余额、购买额度以及每一次积分变化。
            </p>

            <div className="mt-8 rounded-[28px] border border-[#c8a55a]/16 bg-[#c8a55a]/8 p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-white/32">Current balance</p>
              {loading ? (
                <Loader2 className="mt-4 h-7 w-7 animate-spin text-[#c8a55a]" />
              ) : (
                <div className="mt-5 flex items-end gap-3">
                  <span className="text-6xl font-semibold tracking-[-0.06em] text-white">{balance ?? 0}</span>
                  <span className="pb-2 text-sm font-medium uppercase tracking-[0.2em] text-[#e6cf98]">credits</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {payStatus === 'success' ? (
              <div className="flex items-start gap-3 rounded-[24px] border border-emerald-400/18 bg-emerald-500/8 px-4 py-4 text-sm text-emerald-200/88">
                <CheckCircle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">支付成功</p>
                  <p className="mt-1 text-emerald-100/64">积分通常会在几秒内到账，如未到账请刷新页面。</p>
                </div>
              </div>
            ) : null}

            {payStatus === 'cancel' ? (
              <div className="flex items-start gap-3 rounded-[24px] border border-red-400/18 bg-red-500/8 px-4 py-4 text-sm text-red-200/88">
                <XCircle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">支付已取消</p>
                  <p className="mt-1 text-red-100/64">本次积分余额没有变化。</p>
                </div>
              </div>
            ) : null}

            <div className="rounded-[28px] border border-white/8 bg-black/18 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/32">Bundle</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">10 Credits</p>
                  <p className="mt-2 text-sm leading-7 text-white/48">可用于闪卡、模拟题、摘要、大纲与 AI 问答等生成请求。</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-semibold tracking-[-0.04em] text-white">A$4.99</p>
                  <p className="mt-1 text-xs text-white/36">A$0.50 / credit</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  '生成闪卡 -1',
                  '生成模拟题 -1',
                  '生成摘要 -1',
                  'AI 问答 -1',
                ].map((item) => (
                  <div key={item} className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/58">
                    {item}
                  </div>
                ))}
              </div>

              {payError ? (
                <div className="mt-5 rounded-2xl border border-red-400/18 bg-red-500/8 px-4 py-3 text-sm text-red-200/88">
                  {payError}
                </div>
              ) : null}

              <button type="button" onClick={handleCheckout} disabled={paying} className="btn-gold mt-6 flex w-full items-center justify-center gap-2 py-3.5 text-sm">
                {paying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在跳转支付
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    立即购买 10 积分
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">积分流水</h2>
        <p className="mt-1 text-sm text-white/42">每一次生成、购买、退款和奖励都会记录在这里。</p>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#c8a55a]" />
          </div>
        ) : txns.length === 0 ? (
          <div className="mt-5 rounded-[28px] border border-white/8 bg-white/[0.03] px-6 py-16 text-center text-sm text-white/42">
            暂无积分流水。
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {txns.map((txn) => (
              <div key={txn.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-white">{TYPE_LABELS[txn.type] ?? txn.type}</p>
                  {txn.note ? <p className="mt-1 text-sm text-white/42">{txn.note}</p> : null}
                  <p className="mt-2 text-xs text-white/32">
                    {new Date(txn.created_at).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className={`text-lg font-semibold ${txn.amount > 0 ? 'text-emerald-300' : 'text-white/72'}`}>
                  {txn.amount > 0 ? '+' : ''}
                  {txn.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default function CreditsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#c8a55a]" />
        </div>
      }
    >
      <CreditsPageInner />
    </Suspense>
  )
}
