'use client'

import { useLang } from '@/lib/i18n'
import { Globe, LogOut } from 'lucide-react'
import { SIDEBAR_CARD } from '@/lib/navigation'

export default function SidebarFooter({
  logout, collapsed,
}: {
  logout: () => void
  collapsed: boolean
}) {
  const { lang, setLang, t } = useLang()

  if (collapsed) {
    return (
      <div className="border-t border-white/7 px-3 py-4">
        <div className={`${SIDEBAR_CARD} flex flex-col items-center gap-2 p-2`}>
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-xs text-white/58 transition-colors hover:border-white/12 hover:bg-white/[0.06]"
            title={lang === 'zh' ? 'English Version' : 'Chinese Version'}
          >
            <Globe size={14} />
          </button>
          <button
            onClick={logout}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white/42 transition-colors hover:bg-white/[0.04] hover:text-white/70"
            title={t('logout')}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-white/7 px-3 py-4">
      <div className={`${SIDEBAR_CARD} space-y-2 p-2`}>
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="flex w-full items-center gap-2 rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-2.5 text-xs text-white/58 transition-colors hover:border-white/12 hover:bg-white/[0.06] hover:text-white/80"
        >
          <Globe size={14} /> {lang === 'zh' ? 'English Version' : 'Chinese Version'}
        </button>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-[16px] px-3 py-2.5 text-sm text-white/42 transition-colors hover:bg-white/[0.04] hover:text-white/74"
        >
          <LogOut size={16} /> {t('logout')}
        </button>
      </div>
    </div>
  )
}
