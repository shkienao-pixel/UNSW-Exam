'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ExternalLink, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { adminReq, Spinner, Empty, ErrorBox, Toast, rowStyle, cardStyle } from './_shared'

interface CreditOrder {
  id: string
  user_id: string
  user_email: string
  credits_amount: number
  price_cents: number
  currency: string
  status: 'pending' | 'paid'
  stripe_session_id: string | null
  stripe_payment_intent: string | null
  created_at: string
  paid_at: string | null
}

const STATUS_CONFIG = {
  paid:    { label: '已到账', color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)',  icon: <CheckCircle size={12} /> },
  pending: { label: '待处理', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)',  icon: <Clock size={12} /> },
}

function fmt(cents: number) {
  return `A$${(cents / 100).toFixed(2)}`
}

export function CreditOrdersTab({ secret }: { secret: string }) {
  const [orders, setOrders] = useState<CreditOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all')
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const path = statusFilter === 'all' ? '/admin/credit-orders' : `/admin/credit-orders?status=${statusFilter}`
      const data = await adminReq<CreditOrder[]>(secret, path)
      setOrders(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [secret, statusFilter])

  useEffect(() => { void load() }, [load])

  async function handleMarkPaid(order: CreditOrder) {
    if (!confirm(`确认手动补发 ${order.credits_amount} 积分给 ${order.user_email || order.user_id}？`)) return
    setMarkingId(order.id)
    try {
      await adminReq(secret, `/admin/credit-orders/${order.id}/mark-paid`, { method: 'POST' })
      setToast(`已补发 ${order.credits_amount} 积分`)
      void load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setMarkingId(null)
    }
  }

  // 统计
  const paidOrders  = orders.filter(o => o.status === 'paid')
  const pendingOrders = orders.filter(o => o.status === 'pending')
  const totalRevenue = paidOrders.reduce((s, o) => s + o.price_cents, 0)

  const displayed = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">充值管理</h2>
          <p className="text-xs mt-0.5" style={{ color: '#555' }}>Stripe 订单 · 手动补发积分</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '总收入', value: fmt(totalRevenue), color: '#4ade80' },
          { label: '已到账订单', value: `${paidOrders.length} 笔`, color: '#FFD700' },
          { label: '待处理', value: `${pendingOrders.length} 笔`, color: pendingOrders.length > 0 ? '#fbbf24' : '#555' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl text-center" style={cardStyle}>
            <p className="text-xl font-bold" style={{ color: card.color }}>{card.value}</p>
            <p className="text-xs mt-1" style={{ color: '#555' }}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* 筛选 */}
      <div className="flex gap-2">
        {(['all', 'paid', 'pending'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={{
              background: statusFilter === s ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.04)',
              color: statusFilter === s ? '#FFD700' : '#555',
              border: `1px solid ${statusFilter === s ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.07)'}`,
            }}>
            {s === 'all' ? '全部' : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {error && (
        <div className="relative">
          <ErrorBox msg={error} />
          <button
            onClick={() => setError('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400/60 hover:text-red-400 text-lg leading-none"
          >×</button>
        </div>
      )}
      {loading ? <Spinner /> : displayed.length === 0 ? <Empty text="暂无订单" /> : (
        <div className="space-y-2">
          {displayed.map(order => {
            const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending
            return (
              <div key={order.id} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={rowStyle}>
                {/* 状态标签 */}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium flex-shrink-0"
                  style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                  {cfg.icon} {cfg.label}
                </span>

                {/* 用户 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{order.user_email || order.user_id}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                    {new Date(order.created_at).toLocaleString('zh-CN')}
                    {order.paid_at && ` · 到账 ${new Date(order.paid_at).toLocaleString('zh-CN')}`}
                  </p>
                </div>

                {/* 金额 + 积分 */}
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-white">{fmt(order.price_cents)}</p>
                  <p className="text-xs" style={{ color: '#FFD700' }}>{order.credits_amount.toLocaleString()} ✦</p>
                </div>

                {/* Stripe 链接 */}
                {order.stripe_session_id && (
                  <a
                    href={`https://dashboard.stripe.com/payments/${order.stripe_payment_intent || ''}`}
                    target="_blank" rel="noopener noreferrer"
                    title="在 Stripe Dashboard 查看"
                    className="flex-shrink-0 transition-opacity hover:opacity-100"
                    style={{ color: '#60A5FA', opacity: 0.6 }}>
                    <ExternalLink size={14} />
                  </a>
                )}

                {/* 手动补发（仅 pending） */}
                {order.status === 'pending' && (
                  <button
                    onClick={() => handleMarkPaid(order)}
                    disabled={markingId === order.id}
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                    <AlertCircle size={11} />
                    {markingId === order.id ? '处理中…' : '手动补发'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
