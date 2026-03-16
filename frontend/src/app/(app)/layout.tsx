'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import { api } from '@/lib/api'
import type { Course } from '@/lib/types'
import { useLang } from '@/lib/i18n'
import { GenerationProvider } from '@/lib/generation-context'
import { FloatingAskProvider, useFloatingAsk } from '@/lib/floating-ask-context'
import FloatingAskWindow from '@/components/FloatingAskWindow'
import FloatingProgress from '@/components/FloatingProgress'
import ExamCountdown from '@/components/ExamCountdown'
import {
  LayoutDashboard, LogOut, ArrowLeft, Loader2, BookOpen, ChevronLeft, Menu, X, MessageSquarePlus, Send, CreditCard,
  LibraryBig, Layers3, FileWarning, Target, FileText, MessageCircleMore, Sparkles, Globe, RefreshCw, CalendarDays,
} from 'lucide-react'

// ── Feature navigation config ─────────────────────────────────────────────────

// 'ask' view removed — AI 问答 now lives in the floating window
const FEATURES = [
  { view: 'resources', labelKey: 'files', featured: true },
  { view: 'flashcards', labelKey: 'flashcards', featured: true },
  { view: 'mistakes', labelKey: 'mistakes', featured: true },
  { view: 'planner', labelKey: 'planner' },
  { view: 'quiz', labelKey: 'quiz' },
  { view: 'course-summary', labelKey: 'knowledge_summary' },
]

// ── Hover-scale link wrapper ──────────────────────────────────────────────────

const FEATURE_ICON_MAP = {
  resources: { icon: LibraryBig, tint: '#9FD3C7', bg: 'rgba(159,211,199,0.1)' },
  flashcards: { icon: Layers3, tint: '#E7D08A', bg: 'rgba(200,165,90,0.12)' },
  mistakes: { icon: FileWarning, tint: '#F4A261', bg: 'rgba(244,162,97,0.12)' },
  planner: { icon: CalendarDays, tint: '#7DD3C8', bg: 'rgba(125,211,200,0.12)' },
  quiz: { icon: Target, tint: '#87B6FF', bg: 'rgba(135,182,255,0.12)' },
  'course-summary': { icon: BookOpen, tint: '#A8D8B0', bg: 'rgba(168,216,176,0.12)' },
} as const

const SIDEBAR_SHELL_BG =
  'radial-gradient(circle at top, rgba(22,30,44,0.56), transparent 26%), radial-gradient(circle at 78% 10%, rgba(200,165,90,0.08), transparent 18%), linear-gradient(180deg, rgba(10,12,18,0.96) 0%, rgba(7,9,14,0.98) 100%)'

const SIDEBAR_CARD =
  'rounded-[22px] border border-white/8 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'

function HoverLink({
  href, children, style, className, onClick,
}: {
  href: string
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link
      href={href}
      className={className}
      style={{
        ...style,
        transform: hovered ? 'scale(1.025)' : 'scale(1)',
        transition: 'transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, color 0.18s ease',
        display: 'flex',
        willChange: 'transform',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}

// ── Course sidebar nav ────────────────────────────────────────────────────────

function SidebarHeader({
  collapsed,
  user,
  role,
  credits,
  onToggleCollapse,
  onRefreshCredits,
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

function CourseSidebar({
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
  const { openWindow } = useFloatingAsk()

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

        if (f.featured) {
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

      {/* AI 问答 — opens floating window */}
      <button
        onClick={() => { openWindow(); onNavClick?.() }}
        className={`flex items-center rounded-[14px] text-sm transition-all hover:bg-white/[0.04] ${collapsed ? 'h-11 w-11 justify-center px-0 py-0' : 'gap-2.5 px-3 py-2.5'}`}
        style={{
          color: 'rgba(255,255,255,0.44)',
          background: 'rgba(255,255,255,0.01)',
          border: '1px solid rgba(255,255,255,0.02)',
          textShadow: 'none',
          width: collapsed ? 44 : '100%',
        }}
        title={t('ask' as any)}
      >
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/5"
          style={{ color: '#9BC5B6', background: 'rgba(155,197,182,0.12)' }}
        >
          <MessageCircleMore size={14} />
        </span>
        {!collapsed && t('ask' as any)}
      </button>
    </nav>
  )
}

// ── Default sidebar (dashboard) ───────────────────────────────────────────────

function DefaultSidebar({
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

// ── Sidebar footer ────────────────────────────────────────────────────────────

function SidebarFooter({
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

// Sidebar shell (shared by mobile drawer and desktop)

function SidebarShell({
  courseId, currentCourse, courses, pathname, collapsed, user, logout, role, credits, onNavClick, onRefreshCredits,
}: {
  courseId: string | null
  currentCourse: Course | undefined
  courses: Course[]
  pathname: string
  collapsed: boolean
  user: { email: string } | null
  logout: () => void
  role?: string | null
  credits?: number | null
  onNavClick?: () => void
  onRefreshCredits?: () => void
}) {
  return (
    <>
      <SidebarHeader collapsed={collapsed} user={user} role={role} credits={credits} onRefreshCredits={onRefreshCredits} />

      {courseId
        ? (
          <Suspense fallback={<div className="flex-1" />}>
            <CourseSidebar courseId={courseId} course={currentCourse} collapsed={collapsed} onNavClick={onNavClick} />
          </Suspense>
        )
        : <DefaultSidebar courses={courses} pathname={pathname} collapsed={collapsed} onNavClick={onNavClick} />
      }

      <SidebarFooter logout={logout} collapsed={collapsed} />
    </>
  )
}

// ── Root layout (inner app shell) ─────────────────────────────────────────────

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading, logout, role } = useAuth()
  const [courses, setCourses]   = useState<Course[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  // Mobile drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [user, loading, router])

  const refreshCredits = useCallback(async () => {
    if (role === 'guest') return
    try {
      const r = await api.credits.balance()
      setCredits(r.balance)
    } catch {}
  }, [role])

  useEffect(() => {
    if (user) {
      api.courses.list().then(setCourses).catch(() => {})
      if (role !== 'guest') {
        api.credits.balance().then(r => setCredits(r.balance)).catch(() => {})
      }
    }
  }, [user, role])

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#08080f' }}>
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={32} />
    </div>
  )
  if (!user) return null

  const courseMatch = pathname.match(/^\/courses\/([^/]+)/)
  const courseId = courseMatch?.[1] ?? null
  const currentCourse = courseId ? courses.find(c => c.id === courseId) : undefined

  const sidebarWidth = collapsed ? 80 : 240

  const sidebarProps = {
    courseId, currentCourse, courses, pathname, collapsed, user, logout, role, credits, onRefreshCredits: refreshCredits,
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at top, rgba(20,28,42,0.72), transparent 28%), radial-gradient(circle at 85% 10%, rgba(200,165,90,0.08), transparent 18%), linear-gradient(180deg, #050608 0%, #080b12 50%, #050608 100%)',
      }}
    >

      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="no-scrollbar hidden md:flex flex-col flex-shrink-0"
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: SIDEBAR_SHELL_BG,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          position: 'relative',
        }}>

        <SidebarHeader
          collapsed={collapsed}
          user={user}
          role={role}
          credits={credits}
          onToggleCollapse={() => setCollapsed(v => !v)}
          onRefreshCredits={refreshCredits}
        />

        {/* Logo + collapse toggle (desktop only) */}
        <div className="hidden border-b items-center"
          style={{
            borderColor: 'rgba(255,215,0,0.06)',
            padding: collapsed ? '16px 0' : '16px',
            justifyContent: collapsed ? 'center' : 'space-between',
            minHeight: 64,
            transition: 'padding 0.25s ease',
          }}>
          {!collapsed && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <ExamMasterLogo height={34} />
              <div className="text-xs mt-0.5 truncate" style={{ color: '#555', maxWidth: 150 }}>{user.email}</div>
              {role !== 'guest' && credits !== null && (
                <div className="flex items-center gap-1 mt-1 text-xs font-semibold"
                  style={{ color: '#FFD700' }}>
                  <span>✦</span>
                  <span>{credits} 积分</span>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            className="flex items-center justify-center rounded-lg transition-all"
            style={{
              width: 28, height: 28, flexShrink: 0,
              color: 'rgba(255,255,255,0.48)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <ChevronLeft size={14} style={{
              transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s ease',
            }} />
          </button>
        </div>

        {courseId
          ? (
            <Suspense fallback={<div className="flex-1" />}>
              <CourseSidebar courseId={courseId} course={currentCourse} collapsed={collapsed} />
            </Suspense>
          )
          : <DefaultSidebar courses={courses} pathname={pathname} collapsed={collapsed} />
        }
        <SidebarFooter logout={logout} collapsed={collapsed} />
      </aside>

      {/* ── Mobile Drawer Overlay ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile Drawer ── */}
      <aside
        className="fixed inset-y-0 left-0 z-50 flex flex-col md:hidden"
        style={{
          width: 260,
          background: SIDEBAR_SHELL_BG,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}>
        <SidebarShell
          {...sidebarProps}
          collapsed={false}
          onNavClick={() => setDrawerOpen(false)}
        />
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ transition: 'margin 0.25s ease' }}>

        {/* Mobile top header (hidden on md+) */}
        {/* Bug 1 fix: paddingTop=env(safe-area-inset-top) prevents overlap with WeChat/iOS status bar */}
        <header
          className="flex md:hidden items-center px-4 shrink-0"
          style={{
            minHeight: 60,
            paddingTop: 'env(safe-area-inset-top, 0px)',
            borderBottom: '1px solid rgba(255,215,0,0.06)',
            background: 'rgba(9,11,16,0.88)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}>
          {/* Hamburger */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            className="flex items-center justify-center rounded-lg mr-3"
            style={{
              width: 36, height: 36,
              color: '#fff',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              flexShrink: 0,
            }}
            aria-label="打开菜单">
            {drawerOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Logo */}
          <ExamMasterLogo height={28} />

          {/* Course code badge (if in a course) */}
          {currentCourse && (
            <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded"
              style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700' }}>
              {currentCourse.code}
            </span>
          )}
        </header>

        {/* 考试倒计时横幅（仅在课程页且有 exam_date 时显示） */}
        {currentCourse?.exam_date && (
          <div className="px-4 pt-3 pb-0 shrink-0">
            <ExamCountdown examDate={currentCourse.exam_date} size="lg" />
          </div>
        )}

        {/* Page content — with iOS safe-area bottom padding */}
        <div className="flex-1 flex flex-col overflow-hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {children}
        </div>
      </main>

      {/* Floating generation progress — always on top */}
      <FloatingProgress />

      {/* Floating AI Q&A window */}
      <FloatingAskWindow />

      {/* Global feedback button */}
      <FeedbackWidget />
    </div>
  )
}

// ── Floating Feedback Widget ───────────────────────────────────────────────────

function FeedbackWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSending(true)
    setSubmitError('')
    try {
      await api.feedback.submit(trimmed, pathname)
      setSent(true)
      setText('')
      setTimeout(() => { setSent(false); setOpen(false) }, 2000)
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : '提交失败，请稍后重试')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating trigger button — right side, vertically centered */}
      <button
        onClick={() => setOpen(o => !o)}
        title="意见反馈"
        className="fixed z-40 flex items-center justify-center transition-all"
        style={{
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 36,
          height: 80,
          background: 'rgba(255,215,0,0.12)',
          border: '1px solid rgba(200,165,90,0.25)',
          borderRight: 'none',
          borderRadius: '8px 0 0 8px',
          color: '#e6cf98',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}>
        <span style={{ writingMode: 'vertical-rl', fontSize: 11, letterSpacing: 2, fontWeight: 600 }}>
          反馈
        </span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end"
          style={{ paddingRight: 44, paddingBottom: '20vh' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-80 rounded-2xl p-5 space-y-4 shadow-2xl"
            style={{
              background: 'rgba(10,10,20,0.97)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
            }}>
            {/* Header */}
            <div className="flex items-center gap-2">
              <MessageSquarePlus size={16} style={{ color: '#c8a55a' }} />
              <span className="text-sm font-semibold text-white">意见反馈</span>
              <button onClick={() => setOpen(false)} className="ml-auto" style={{ color: '#555' }}>
                <X size={14} />
              </button>
            </div>

            {/* Page hint */}
            <p className="text-xs rounded-lg px-2 py-1 truncate" style={{ background: 'rgba(255,255,255,0.04)', color: '#555' }}>
              📍 {pathname}
            </p>

            {/* Text area */}
            {sent ? (
              <div className="text-center py-4 text-sm" style={{ color: '#4ade80' }}>
                ✅ 感谢反馈，已收到！
              </div>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="描述你遇到的问题或建议..."
                  rows={4}
                  maxLength={2000}
                  className="w-full text-sm rounded-xl px-3 py-2 outline-none resize-none"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                  }} />
                {submitError && (
                  <p className="text-xs px-2 py-1 rounded-lg" style={{ color: '#ff8080', background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.2)' }}>
                    ⚠️ {submitError}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: '#444' }}>{text.length}/2000</span>
                  <button
                    onClick={submit}
                    disabled={sending || !text.trim()}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-all"
                    style={{ background: 'rgba(200,165,90,0.12)', color: '#e6cf98', border: '1px solid rgba(200,165,90,0.2)' }}>
                    {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {sending ? '发送中…' : '提交'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Root layout export ────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <GenerationProvider>
      <FloatingAskProvider>
        <AppLayoutInner>{children}</AppLayoutInner>
      </FloatingAskProvider>
    </GenerationProvider>
  )
}
