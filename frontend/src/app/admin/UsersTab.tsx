'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, CheckCircle, X, SlidersHorizontal, RefreshCw, Wifi } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import {
  User, tx, localeByLang, adminReq,
  Spinner, Empty, ErrorBox, Toast,
  rowStyle,
} from './_shared'

// ── 积分调整 Modal ─────────────────────────────────────────────────────────────

function PointsAdjustModal({
  user,
  secret,
  onClose,
  onSuccess,
}: {
  user: User
  secret: string
  onClose: () => void
  onSuccess: (userId: string, newBalance: number) => void
}) {
  const { lang } = useLang()
  const tt = (zh: string, en: string) => tx(lang, zh, en)
  const [action, setAction] = useState<'add' | 'deduct'>('add')
  const [amount, setAmount] = useState('50')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError(tt('请输入正整数金额', 'Please enter a positive integer')); return }
    setLoading(true); setError('')
    try {
      const res = await adminReq<{ ok: boolean; balance: number }>(
        secret,
        `/admin/users/${user.id}/credits/adjust`,
        { method: 'POST', body: JSON.stringify({ action, amount: n, note: note.trim() || undefined }) },
      )
      onSuccess(user.id, res.balance)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : tt('操作失败', 'Operation failed'))
    } finally {
      setLoading(false)
    }
  }

  const currentCredits = user.credits ?? 0
  const previewBalance = action === 'add'
    ? currentCredits + (parseInt(amount, 10) || 0)
    : Math.max(0, currentCredits - (parseInt(amount, 10) || 0))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={() => !loading && onClose()}>
      <div className="relative w-full max-w-md mx-4 rounded-2xl p-6"
        style={{ background: '#0c0c1a', border: '1px solid rgba(255,215,0,0.2)', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}>

        {/* 标题 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={17} style={{ color: '#FFD700' }} />
            <h3 className="text-base font-bold text-white">{tt('调整用户积分', 'Adjust User Credits')}</h3>
          </div>
          <button onClick={() => !loading && onClose()} style={{ color: '#555' }}>
            <X size={16} />
          </button>
        </div>

        {/* 用户信息 */}
        <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
            style={{ background: 'rgba(255,215,0,0.14)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
            {user.email[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user.email}</p>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: '#888' }}>
              <span>{tt('当前余额：', 'Current balance:')}</span>
              <span className="font-semibold" style={{ color: '#FFD700' }}>⭐ {currentCredits} {tt('积分', 'credits')}</span>
            </p>
          </div>
        </div>

        {/* 操作类型切换 */}
        <div className="mb-4">
          <p className="text-xs mb-2 font-medium" style={{ color: '#666' }}>{tt('操作类型', 'Action')}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['add', 'deduct'] as const).map(a => (
              <button key={a} onClick={() => setAction(a)}
                className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: action === a
                    ? (a === 'add' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)')
                    : 'rgba(255,255,255,0.04)',
                  color: action === a
                    ? (a === 'add' ? '#4ade80' : '#f87171')
                    : '#555',
                  border: action === a
                    ? `1px solid ${a === 'add' ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.35)'}`
                    : '1px solid rgba(255,255,255,0.07)',
                }}>
                {a === 'add' ? tt('↑ 赠送 / 增加', '↑ Add') : tt('↓ 扣除', '↓ Deduct')}
              </button>
            ))}
          </div>
        </div>

        {/* 变动数量 */}
        <div className="mb-4">
          <p className="text-xs mb-2 font-medium" style={{ color: '#666' }}>{tt('变动数量（积分）', 'Amount (credits)')}</p>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,215,0,0.45)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            placeholder={tt('输入正整数', 'Positive integer')}
          />
        </div>

        {/* 备注 */}
        <div className="mb-5">
          <p className="text-xs mb-2 font-medium" style={{ color: '#666' }}>{tt('备注 / 原因（可选）', 'Note / reason (optional)')}</p>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,215,0,0.45)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            placeholder={tt('如：内测奖励、Bug 补偿、充值到账...', 'e.g. beta reward, bug compensation')}
          />
        </div>

        {/* 执行后预览余额 */}
        <div className="mb-4 px-4 py-2.5 rounded-xl flex justify-between items-center text-sm"
          style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.12)' }}>
          <span style={{ color: '#777' }}>{tt('执行后余额', 'Balance after')}</span>
          <span className="font-bold" style={{ color: '#FFD700' }}>⭐ {previewBalance} {tt('积分', 'credits')}</span>
        </div>

        {error && (
          <p className="mb-3 text-xs px-3 py-2 rounded-lg"
            style={{ color: '#ff8080', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)' }}>
            {error}
          </p>
        )}

        {/* 按钮 */}
        <div className="flex gap-3">
          <button onClick={() => !loading && onClose()} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>
            {tt('取消', 'Cancel')}
          </button>
          <button onClick={confirm} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'rgba(255,215,0,0.18)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.35)' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {loading ? tt('执行中...', 'Applying...') : tt('确认执行', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Users Tab ──────────────────────────────────────────────────────────────────

export function UsersTab({ secret }: { secret: string }) {
  const { lang } = useLang()
  const tt = (zh: string, en: string) => tx(lang, zh, en)
  const locale = localeByLang(lang)
  const [users, setUsers] = useState<User[]>([])
  const [credits, setCredits] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adjustTarget, setAdjustTarget] = useState<User | null>(null)
  const [toast, setToast] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const prevCountRef = useRef<number | null>(null)

  const POLL_INTERVAL = 15_000 // 15秒

  const load = useCallback(async (silent = false) => {
    if (!silent) setError('')
    if (silent) setRefreshing(true)
    try {
      const [usersData, creditsData] = await Promise.all([
        adminReq<User[]>(secret, '/admin/users'),
        adminReq<Record<string, number>>(secret, '/admin/users/credits'),
      ])
      setUsers(prev => {
        // 检测新注册用户
        if (prevCountRef.current !== null && usersData.length > prevCountRef.current) {
          const diff = usersData.length - prevCountRef.current
          setToast(tt(`🎉 ${diff} 位新用户刚刚注册！`, `🎉 ${diff} new user(s) just registered!`))
        }
        prevCountRef.current = usersData.length
        return usersData
      })
      setCredits(creditsData)
      setLastUpdated(new Date())
    } catch (e: unknown) {
      if (!silent) setError(String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [secret]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
    const timer = setInterval(() => load(true), POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [load])

  function handleAdjustSuccess(userId: string, newBalance: number) {
    setCredits(prev => ({ ...prev, [userId]: newBalance }))
    const u = users.find(u => u.id === userId)
    setToast(
      u
        ? tt(`已成功更新 ${u.email} 的积分余额为 ${newBalance}`, `Updated ${u.email} credits to ${newBalance}`)
        : tt('积分已更新', 'Credits updated'),
    )
  }

  const userWithCredits = users.map(u => ({ ...u, credits: credits[u.id] ?? 0 }))

  return (
    <div className="space-y-4 fade-in-up">
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {/* 实时状态栏 */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Wifi size={13} style={{ color: '#4ade80' }} />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          </div>
          <span className="text-xs" style={{ color: '#555' }}>
            {tt('实时监控 · 每 15 秒自动刷新', 'Live · auto-refresh every 15s')}
          </span>
          {lastUpdated && (
            <span className="text-xs" style={{ color: '#383838' }}>
              · {tt('上次更新', 'Last updated')} {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
          style={{ color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#FFD700'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.3)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          {tt('立即刷新', 'Refresh')}
        </button>
      </div>

      {adjustTarget && (
        <PointsAdjustModal
          user={{ ...adjustTarget, credits: credits[adjustTarget.id] ?? 0 }}
          secret={secret}
          onClose={() => setAdjustTarget(null)}
          onSuccess={handleAdjustSuccess}
        />
      )}
      {error && <ErrorBox msg={error} />}
      {loading ? <Spinner /> : (
        <>
          <div className="space-y-2">
            {userWithCredits.map(u => (
              <div key={u.id}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200"
                style={rowStyle}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.18)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
                }}>

                {/* 头像 */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                  style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
                  {u.email[0].toUpperCase()}
                </div>

                {/* 邮箱 + 时间 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{u.email}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                    {tt('注册', 'Registered')} {new Date(u.created_at).toLocaleDateString(locale)}
                    {u.last_sign_in_at && ` · ${tt('最近登录', 'Last sign-in')} ${new Date(u.last_sign_in_at).toLocaleDateString(locale)}`}
                  </p>
                </div>

                {/* 积分余额 */}
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg flex-shrink-0"
                  style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.16)' }}>
                  <span style={{ color: '#FFD700', fontSize: 12 }}>⭐</span>
                  <span className="text-xs font-semibold" style={{ color: '#FFD700' }}>{u.credits}</span>
                </div>

                {/* 验证状态 */}
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex-shrink-0 ${u.email_confirmed ? 'badge-success' : 'badge-warning'}`}>
                  {u.email_confirmed ? tt('已验证', 'Verified') : tt('未验证', 'Unverified')}
                </span>

                {/* 调整积分按钮 */}
                <button
                  onClick={() => setAdjustTarget(u)}
                  title={tt('调整积分', 'Adjust credits')}
                  className="flex-shrink-0 p-1.5 rounded-lg transition-all"
                  style={{ color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = '#FFD700'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.35)'
                    ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.08)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = '#555'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
                    ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}>
                  <SlidersHorizontal size={14} />
                </button>
              </div>
            ))}
            {users.length === 0 && <Empty text={tt('暂无用户', 'No users yet')} />}
          </div>
          <p className="text-xs" style={{ color: '#444' }}>{tt('共', 'Total')} {users.length} {tt('个用户', 'users')}</p>
        </>
      )}
    </div>
  )
}
