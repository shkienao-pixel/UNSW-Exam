'use client'

import { useState } from 'react'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import { useLang } from '@/lib/i18n'
import { Sparkles, RefreshCw, ChevronLeft } from 'lucide-react'
import { SIDEBAR_CARD } from '@/lib/navigation'

export default function SidebarHeader({
  collapsed, user, role, credits, onToggleCollapse, onRefreshCredits,
}: {
  collapsed: boolean
  user: { email: string } | null
  role?: string | null
  credits?: number | null
  onToggleCollapse?: () => void
  onRefreshCredits?: () => void
}) {
  const { t } = useLang()
  const [refreshing, setRefreshing] = useState(false)
  const lowCredits = (credits ?? 0) < 100

  async function handleRefresh() {
    if (!onRefreshCredits || refreshing) return
    setRefreshing(true)
    await onRefreshCredits()
    setRefreshing(false)
  }

  return (
    <div className="border-b border-white/7 p-3">
      <div className={`${SIDEBAR_CARD} ${collapsed ? 'flex flex-col items-center gap-2 p-2.5' : 'p-3'}`}>
        <div className={`flex ${collapsed ? 'w-full flex-col items-center gap-2' : 'items-start justify-between gap-3'}`}>
          <ExamMasterLogo height={collapsed ? 28 : 32} showText={!collapsed} />

          {onToggleCollapse ? (
            <button
              onClick={onToggleCollapse}
              className={`flex items-center justify-center border border-white/8 bg-white/[0.04] text-white/56 transition hover:border-white/12 hover:bg-white/[0.06] hover:text-white/80 ${collapsed ? 'h-10 w-10 rounded-2xl' : 'h-8 w-8 rounded-xl'}`}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronLeft
                size={14}
                style={{
                  transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s ease',
                }}
              />
            </button>
          ) : null}
        </div>

        {!collapsed ? (
          <div className="mt-3 space-y-2">
            <p className="truncate text-xs text-white/34">{user?.email}</p>
            {role !== 'guest' && credits !== null && credits !== undefined ? (
              <>
                <div className="flex items-center gap-2">
                  <div
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold shadow-[0_0_22px_rgba(200,165,90,0.08)] ${lowCredits ? 'animate-pulse' : ''}`}
                    style={{
                      border: `1px solid ${lowCredits ? 'rgba(239,68,68,0.35)' : 'rgba(200,165,90,0.18)'}`,
                      background: lowCredits ? 'rgba(239,68,68,0.1)' : 'rgba(200,165,90,0.1)',
                      color: lowCredits ? '#fca5a5' : '#e6cf98',
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="text-base leading-none">{credits} 积分</span>
                  </div>
                  {onRefreshCredits && (
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      title="刷新积分"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/40 transition hover:border-white/16 hover:text-white/70 disabled:opacity-40"
                    >
                      <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                  )}
                </div>
                {lowCredits && (
                  <p className="text-[11px] text-red-300/85">{t('sidebar_low_credits')}</p>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
