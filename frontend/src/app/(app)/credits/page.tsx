'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Loader2, CreditCard, Zap, CheckCircle, XCircle } from 'lucide-react'

type Txn = { id: string; amount: number; type: string; note: string | null; created_at: string }

const TYPE_LABELS: Record<string, string> = {
  welcome_bonus:     '新用户欢迎积分',
  artifact_approved: '文件审核通过',
  feedback_adopted:  '反馈被采纳',
  admin_grant:       '管理员赠送',
  purchase:          '充值',
  refund:            '生成失败退款',
  gen_flashcards:    '生成闪卡',
  gen_quiz:          '生成模拟题',
  gen_summary:       '生成摘要',
  gen_outline:       '生成大纲',
  gen_plan:          '生成复习规划',
  gen_ask:           'AI 问答',
  unlock_upload:     '解锁上传',
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
      const [bal, list] = await Promise.all([
        api.credits.balance(),
        api.credits.transactions(),
      ])
      setBalance(bal.balance)
      setTxns(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCheckout() {
    setPaying(true)
    setPayError('')
    try {
      const origin = window.location.origin
      const { checkout_url } = await api.credits.checkout(
        `${origin}/credits?pay=success`,
        `${origin}/credits?pay=cancel`,
      )
      window.location.href = checkout_url
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : '支付创建失败，请稍后重试')
      setPaying(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto overflow-y-auto flex-1 space-y-8">

      {/* Pay result banners */}
      {payStatus === 'success' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22C55E' }}>
          <CheckCircle size={18} />
          <div>
            <p className="font-semibold text-sm">支付成功！</p>
            <p className="text-xs opacity-75">积分将在几秒内到账，如未到账请刷新页面。</p>
          </div>
        </div>
      )}
      {payStatus === 'cancel' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', color: '#ff8080' }}>
          <XCircle size={18} />
          <p className="text-sm">支付已取消，积分未变动。</p>
        </div>
      )}

      {/* Balance card */}
      <div className="rounded-2xl p-6"
        style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.15)' }}>
        <p className="text-xs mb-1" style={{ color: '#666' }}>当前积分余额</p>
        {loading ? (
          <Loader2 size={20} className="animate-spin" style={{ color: '#FFD700' }} />
        ) : (
          <div className="flex items-end gap-2">
            <span className="text-5xl font-black" style={{ color: '#FFD700' }}>{balance ?? 0}</span>
            <span className="text-xl mb-1" style={{ color: '#FFD700' }}>✦</span>
          </div>
        )}
      </div>

      {/* Purchase */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <CreditCard size={16} style={{ color: '#FFD700' }} /> 充值积分
        </h2>

        <div className="rounded-2xl p-5 mb-4"
          style={{ background: 'rgba(255,215,0,0.05)', border: '2px solid rgba(255,215,0,0.3)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black" style={{ color: '#FFD700' }}>10</span>
                <span className="text-lg" style={{ color: '#FFD700' }}>✦</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>积分</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#555' }}>可生成闪卡、摘要、问答各 10 次</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">A$4.99</p>
              <p className="text-xs" style={{ color: '#555' }}>A$0.50 / 积分</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: '生成闪卡', cost: 1 },
              { label: '生成摘要', cost: 1 },
              { label: 'AI 问答', cost: 1 },
              { label: '生成大纲', cost: 5 },
            ].map(({ label, cost }) => (
              <div key={label} className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(255,255,255,0.03)', color: '#666' }}>
                <span>{label}</span>
                <span style={{ color: '#FFD700' }}>-{cost} ✦</span>
              </div>
            ))}
          </div>

          {payError && (
            <p className="text-xs mb-3 px-3 py-2 rounded-lg"
              style={{ color: '#ff8080', background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.2)' }}>
              ⚠️ {payError}
            </p>
          )}

          <button
            onClick={handleCheckout}
            disabled={paying}
            className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,180,0,0.2))',
              color: '#FFD700',
              border: '1px solid rgba(255,215,0,0.5)',
              boxShadow: paying ? 'none' : '0 0 24px rgba(255,215,0,0.18)',
            }}>
            {paying
              ? <><Loader2 size={15} className="animate-spin" /> 跳转支付中…</>
              : <><Zap size={15} /> 立即充值 — A$4.99</>
            }
          </button>

          <p className="text-xs text-center mt-3" style={{ color: '#444' }}>
            通过 Stripe 安全支付 · 信用卡 / Apple Pay / Google Pay
          </p>
        </div>

        {/* Free ways */}
        <div className="rounded-xl p-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-semibold mb-3" style={{ color: '#555' }}>免费获得积分</p>
          <div className="space-y-2 text-xs" style={{ color: '#666' }}>
            <div className="flex items-center justify-between">
              <span>📁 上传文件，审核通过</span>
              <span style={{ color: '#FFD700' }}>+1 ✦</span>
            </div>
            <div className="flex items-center justify-between">
              <span>💬 提交反馈，被管理员采纳</span>
              <span style={{ color: '#FFD700' }}>+1 ✦</span>
            </div>
            <div className="flex items-center justify-between">
              <span>🎁 新用户注册欢迎积分</span>
              <span style={{ color: '#FFD700' }}>+5 ✦</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4">积分流水</h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: '#FFD700' }} />
          </div>
        ) : txns.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: '#444' }}>暂无记录</p>
        ) : (
          <div className="space-y-2">
            {txns.map(t => (
              <div key={t.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <p className="text-sm text-white">{TYPE_LABELS[t.type] ?? t.type}</p>
                  {t.note && <p className="text-xs mt-0.5" style={{ color: '#555' }}>{t.note}</p>}
                  <p className="text-xs mt-0.5" style={{ color: '#444' }}>
                    {new Date(t.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="text-sm font-bold"
                  style={{ color: t.amount > 0 ? '#4ade80' : '#888' }}>
                  {t.amount > 0 ? '+' : ''}{t.amount} ✦
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CreditsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={28} />
      </div>
    }>
      <CreditsPageInner />
    </Suspense>
  )
}
