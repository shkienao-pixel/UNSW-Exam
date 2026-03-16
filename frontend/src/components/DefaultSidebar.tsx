'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/i18n'
import HoverLink from '@/components/HoverLink'
import { LayoutDashboard, CreditCard, BookOpen } from 'lucide-react'
import { SIDEBAR_CARD } from '@/lib/navigation'
import type { Course } from '@/lib/types'

export default function DefaultSidebar({
  courses, pathname, collapsed, onNavClick,
}: {
  courses: Course[]
  pathname: string
  collapsed: boolean
  onNavClick?: () => void
}) {
  const [coursesOpen, setCoursesOpen] = useState(true)
  const { t } = useLang()
  const { role } = useAuth()

  function navItem(href: string, icon: React.ReactNode, label: string) {
    const active = pathname === href
    return (
      <HoverLink href={href} onClick={onNavClick}
        className={`items-center text-sm ${collapsed ? 'h-11 w-11 justify-center rounded-[14px] px-0 py-0' : 'gap-3 rounded-[18px] px-3 py-2.5'}`}
        style={{
          color: active ? '#ffffff' : 'rgba(255,255,255,0.5)',
          background: active ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.01)',
          border: `1px solid ${active ? 'rgba(200,165,90,0.16)' : 'rgba(255,255,255,0.03)'}`,
          boxShadow: active ? '0 14px 30px rgba(0,0,0,0.2)' : 'none',
          textShadow: 'none',
        }}>
        <span
          className={`flex flex-shrink-0 items-center justify-center border border-white/6 ${collapsed ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-xl'}`}
          style={{
            color: active ? '#e6cf98' : 'rgba(255,255,255,0.58)',
            background: active ? 'rgba(200,165,90,0.12)' : 'rgba(255,255,255,0.03)',
          }}
        >
          {icon}
        </span>
        {!collapsed && label}
      </HoverLink>
    )
  }

  return (
    <nav className={`no-scrollbar flex-1 overflow-y-auto overflow-x-hidden ${collapsed ? 'space-y-2 px-2 py-3' : 'space-y-2 px-3 py-4'}`}>
      {navItem('/dashboard', <LayoutDashboard size={16} />, t('dashboard'))}
      {role !== 'guest' && navItem('/credits', <CreditCard size={16} />, '积分 & 充值')}

      {!collapsed && (
        <div>
          <button onClick={() => setCoursesOpen(v => !v)}
            className="flex w-full items-center gap-2 rounded-[18px] border border-white/6 bg-white/[0.02] px-3 py-2.5 text-sm transition-colors"
            style={{ color: 'rgba(255,255,255,0.48)' }}>
            <BookOpen size={16} />
            <span className="flex-1 text-left">{t('my_courses')}</span>
            <span style={{ fontSize: 10, color: '#555' }}>{coursesOpen ? '▲' : '▼'}</span>
          </button>
          {coursesOpen && (
            <div className={`${SIDEBAR_CARD} mt-2 space-y-1 p-2 pl-3`}>
              {courses.map(c => {
                const href = `/courses/${c.id}?view=flashcards`
                const active = pathname.startsWith(`/courses/${c.id}`)
                return (
                  <HoverLink key={c.id} href={href} onClick={onNavClick}
                    className="items-center gap-2 rounded-[16px] px-3 py-2 text-[11px] truncate"
                    style={{
                      color: active ? '#fff' : 'rgba(255,255,255,0.46)',
                      background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                      textShadow: 'none',
                    }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: active ? '#c8a55a' : 'rgba(255,255,255,0.22)' }} />
                    {c.code} {c.name}
                  </HoverLink>
                )
              })}
              {courses.length === 0 && (
                <p className="px-3 py-1.5 text-xs" style={{ color: '#444' }}>{t('no_courses')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {collapsed && (
        <div className="flex justify-center px-2 py-1">
          <BookOpen size={16} style={{ color: 'rgba(255,255,255,0.32)' }} />
        </div>
      )}
    </nav>
  )
}
