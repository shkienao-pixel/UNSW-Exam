'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/i18n'
import HoverLink from '@/components/HoverLink'
import { ArrowLeft } from 'lucide-react'
import { FEATURES, FEATURE_ICON_MAP, SIDEBAR_CARD } from '@/lib/navigation'
import type { Course } from '@/lib/types'

function CourseSidebarInner({
  courseId, course, collapsed, onNavClick,
}: {
  courseId: string
  course: Course | undefined
  collapsed: boolean
  onNavClick?: () => void
}) {
  const searchParams = useSearchParams()
  const { t } = useLang()
  const { role } = useAuth()
  const currentView = searchParams.get('view') || 'flashcards'

  return (
    <nav className={`no-scrollbar flex flex-1 flex-col overflow-y-auto overflow-x-hidden ${collapsed ? 'items-center gap-2 px-2 py-3' : 'gap-2 px-3 py-4'}`}>
      {/* Back */}
      <HoverLink
        href="/dashboard"
        className={`flex items-center gap-2 rounded-[14px] border border-white/6 bg-white/[0.02] text-xs text-white/46 transition hover:border-white/10 hover:bg-white/[0.04] hover:text-white/72 ${collapsed ? 'h-11 w-11 justify-center px-0 py-0' : 'mb-1 px-3 py-2.5'}`}
        onClick={onNavClick}
      >
        <ArrowLeft size={13} className="flex-shrink-0" />
        {!collapsed && <span>{t('all_courses')}</span>}
      </HoverLink>

      {/* Course badge */}
      {!collapsed && course && (
        <div className={`${SIDEBAR_CARD} mb-1 px-3 py-3`}>
          <span
            className="rounded-md bg-[#c8a55a]/14 px-1.5 py-0.5 text-xs font-bold"
            style={{ color: '#e6cf98' }}
          >
            {course.code}
          </span>
          <p className="mt-2 text-sm font-medium leading-tight text-white/86">{course.name}</p>
        </div>
      )}

      {/* Feature links */}
      {FEATURES.filter(f => !(f.view === 'resources' && role === 'guest')).map(f => {
        const isActive = currentView === f.view
        const href = `/courses/${courseId}?view=${f.view}`
        const label = t(f.labelKey as any)
        const featureMeta = FEATURE_ICON_MAP[f.view as keyof typeof FEATURE_ICON_MAP]
        const Icon = featureMeta.icon

        if ('featured' in f && f.featured) {
          return (
            <HoverLink key={f.view} href={href} onClick={onNavClick}
              className={`items-center rounded-[14px] text-sm font-semibold ${collapsed ? 'h-11 w-11 justify-center px-0 py-0' : 'gap-2.5 px-3 py-3'}`}
              style={{
                background: isActive
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.035))'
                  : 'rgba(255,255,255,0.03)',
                color: isActive ? '#ffffff' : '#efe0b8',
                border: `1px solid ${isActive ? 'rgba(200,165,90,0.16)' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: isActive ? '0 16px 36px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)' : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                textShadow: 'none',
              }}>
              <span
                className={`flex flex-shrink-0 items-center justify-center border border-white/6 ${collapsed ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-xl'}`}
                style={{ color: featureMeta.tint, background: featureMeta.bg }}
              >
                <Icon size={collapsed ? 14 : 16} />
              </span>
              {!collapsed && <span className="flex-1">{label}</span>}
              {!collapsed && isActive && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#c8a55a' }} />
              )}
            </HoverLink>
          )
        }

        return (
          <HoverLink key={f.view} href={href} onClick={onNavClick}
            className={`items-center rounded-[14px] text-sm ${collapsed ? 'h-11 w-11 justify-center px-0 py-0' : 'gap-2.5 px-3 py-2.5'}`}
            style={{
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.44)',
              background: isActive ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.01)',
              border: `1px solid ${isActive ? 'rgba(200,165,90,0.14)' : 'rgba(255,255,255,0.02)'}`,
              textShadow: 'none',
            }}>
            <span
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/5"
              style={{ color: featureMeta.tint, background: featureMeta.bg }}
            >
              <Icon size={14} />
            </span>
            {!collapsed && label}
          </HoverLink>
        )
      })}
    </nav>
  )
}

export default function CourseSidebar(props: {
  courseId: string
  course: Course | undefined
  collapsed: boolean
  onNavClick?: () => void
}) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <CourseSidebarInner {...props} />
    </Suspense>
  )
}
