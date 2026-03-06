'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import { api } from '@/lib/api'
import type { Course } from '@/lib/types'
import { LangProvider, useLang } from '@/lib/i18n'
import { GenerationProvider } from '@/lib/generation-context'
import FloatingProgress from '@/components/FloatingProgress'
import ExamCountdown from '@/components/ExamCountdown'
import {
  LayoutDashboard, LogOut, ArrowLeft, Loader2, BookOpen, ChevronLeft, Menu, X, MessageSquarePlus, Send, CreditCard,
} from 'lucide-react'

// ── Feature navigation config ─────────────────────────────────────────────────

const FEATURES = [
  { view: 'resources',  emoji: '📚', zh: '课程资料',  en: 'Resources', featured: true  },
  { view: 'flashcards', emoji: '🃏', zh: '闪卡',    en: 'Flashcards', featured: true  },
  { view: 'mistakes',   emoji: '📝', zh: '错题集',   en: 'Mistakes',   featured: true  },
  { view: 'quiz',       emoji: '🎯', zh: '模拟题',   en: 'Quiz'                        },
  { view: 'summary',    emoji: '📄', zh: '摘要',     en: 'Summary'                     },
  { view: 'outline',    emoji: '📋', zh: '大纲',     en: 'Outline'                     },
  { view: 'ask',        emoji: '💬', zh: 'AI 问答',  en: 'AI Q&A'                      },
  { view: 'generate',   emoji: '⚡', zh: 'AI 生成',  en: 'AI Generate'                 },
  { view: 'scope',      emoji: '⚙️', zh: 'Scope',   en: 'Scope'                       },
]

// ── Hover-scale link wrapper ──────────────────────────────────────────────────

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

function CourseSidebar({
  courseId, course, collapsed, onNavClick,
}: {
  courseId: string
  course: Course | undefined
  collapsed: boolean
  onNavClick?: () => void
}) {
  const searchParams = useSearchParams()
  const { lang, t } = useLang()
  const { role } = useAuth()
  const currentView = searchParams.get('view') || 'flashcards'

  return (
    <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
      {/* Back */}
      <HoverLink
        href="/dashboard"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-2"
        style={{ color: 'rgba(255,255,255,0.42)' }}
        onClick={onNavClick}
      >
        <ArrowLeft size={13} className="flex-shrink-0" />
        {!collapsed && <span>{t('all_courses')}</span>}
      </HoverLink>

      {/* Course badge */}
      {!collapsed && course && (
        <div className="px-3 py-2.5 mb-1 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(200,165,90,0.14)', color: '#e6cf98' }}>
            {course.code}
          </span>
          <p className="text-xs text-white font-medium mt-1.5 leading-tight">{course.name}</p>
        </div>
      )}
      {collapsed && course && (
        <div className="flex items-center justify-center px-1 py-2 mb-1">
          <span className="text-xs font-bold px-1.5 py-0.5 rounded text-center"
            style={{ background: 'rgba(200,165,90,0.14)', color: '#e6cf98', fontSize: 9 }}>
            {course.code}
          </span>
        </div>
      )}

        <div className="my-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} />

      {/* Feature links */}
      {FEATURES.filter(f => !(f.view === 'resources' && role === 'guest')).map(f => {
        const isActive = currentView === f.view
        const href = `/courses/${courseId}?view=${f.view}`
        const label = lang === 'zh' ? f.zh : f.en

        if (f.featured) {
          return (
            <HoverLink key={f.view} href={href} onClick={onNavClick}
              className={`items-center gap-2.5 rounded-xl text-sm font-semibold ${collapsed ? 'justify-center px-2 py-3' : 'px-3 py-3'}`}
              style={{
                background: isActive
                  ? 'rgba(255,255,255,0.075)'
                  : 'rgba(255,255,255,0.03)',
                color: isActive ? '#ffffff' : '#e6cf98',
                border: `1px solid ${isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}`,
                boxShadow: isActive ? '0 14px 32px rgba(0,0,0,0.18)' : 'none',
                textShadow: 'none',
              }}>
              <span className="text-lg leading-none flex-shrink-0">{f.emoji}</span>
              {!collapsed && <span className="flex-1">{label}</span>}
              {!collapsed && isActive && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#c8a55a' }} />
              )}
            </HoverLink>
          )
        }

        return (
          <HoverLink key={f.view} href={href} onClick={onNavClick}
            className={`items-center gap-2.5 rounded-lg text-sm ${collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'}`}
            style={{
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.42)',
              background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
              borderLeft: collapsed ? 'none' : `2px solid ${isActive ? 'rgba(200,165,90,0.9)' : 'transparent'}`,
              textShadow: 'none',
            }}>
            <span className="text-sm leading-none flex-shrink-0">{f.emoji}</span>
            {!collapsed && label}
          </HoverLink>
        )
      })}
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
        className={`items-center rounded-lg text-sm ${collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'}`}
        style={{
          color: active ? '#FFD700' : '#999',
          background: active ? 'rgba(255,215,0,0.08)' : 'transparent',
          borderLeft: collapsed ? 'none' : `2px solid ${active ? '#FFD700' : 'transparent'}`,
          textShadow: active ? '0 0 10px rgba(255,215,0,0.45)' : 'none',
        }}>
        <span className="flex-shrink-0">{icon}</span>
        {!collapsed && label}
      </HoverLink>
    )
  }

  return (
    <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
      {navItem('/dashboard', <LayoutDashboard size={16} />, t('dashboard'))}
      {role !== 'guest' && navItem('/credits', <CreditCard size={16} />, '积分 & 充值')}

      {!collapsed && (
        <div>
          <button onClick={() => setCoursesOpen(v => !v)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ color: 'rgba(255,255,255,0.48)' }}>
            <BookOpen size={16} />
            <span className="flex-1 text-left">{t('my_courses')}</span>
            <span style={{ fontSize: 10, color: '#555' }}>{coursesOpen ? '▲' : '▼'}</span>
          </button>
          {coursesOpen && (
            <div className="ml-4 mt-1 space-y-0.5">
              {courses.map(c => {
                const href = `/courses/${c.id}?view=flashcards`
                const active = pathname.startsWith(`/courses/${c.id}`)
                return (
                  <HoverLink key={c.id} href={href} onClick={onNavClick}
                    className="items-center gap-2 px-3 py-1.5 rounded-lg text-xs truncate"
                    style={{
                      color: active ? '#fff' : 'rgba(255,255,255,0.42)',
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
      <div className="px-2 py-4 border-t flex flex-col items-center gap-2"
        style={{ borderColor: 'rgba(255,215,0,0.08)' }}>
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-xs transition-colors"
          title={lang === 'zh' ? 'Switch to English' : '切换中文'}
          style={{ color: 'rgba(255,255,255,0.58)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          🌐
        </button>
        <button onClick={logout}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          title={t('logout')}
          style={{ color: 'rgba(255,255,255,0.42)' }}>
          <LogOut size={15} />
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: 'rgba(255,215,0,0.08)' }}>
      <button
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-colors"
        style={{ color: 'rgba(255,255,255,0.58)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        🌐 {lang === 'zh' ? 'Switch to English' : '切换为中文'}
      </button>
      <button onClick={logout}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors"
        style={{ color: 'rgba(255,255,255,0.42)' }}>
        <LogOut size={16} /> {t('logout')}
      </button>
    </div>
  )
}

// ── Sidebar shell (shared by mobile drawer and desktop) ───────────────────────

function SidebarShell({
  courseId, currentCourse, courses, pathname, collapsed, user, logout, onNavClick,
}: {
  courseId: string | null
  currentCourse: Course | undefined
  courses: Course[]
  pathname: string
  collapsed: boolean
  user: { email: string } | null
  logout: () => void
  onNavClick?: () => void
}) {
  return (
    <>
      {/* Logo strip */}
      <div className="border-b flex items-center"
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
            <div className="text-xs mt-0.5 truncate" style={{ color: '#555', maxWidth: 150 }}>{user?.email}</div>
          </div>
        )}
      </div>

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

// ── Root layout (inner — inside LangProvider) ─────────────────────────────────

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
    if (!sessionStorage.getItem('intro_visited')) {
      router.replace('/home')
    }
  }, [])

  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [user, loading, router])

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

  const sidebarWidth = collapsed ? 56 : 240

  const sidebarProps = {
    courseId, currentCourse, courses, pathname, collapsed, user, logout,
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
      <aside className="hidden md:flex flex-col flex-shrink-0"
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(9,11,16,0.86)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          position: 'relative',
        }}>

        {/* Logo + collapse toggle (desktop only) */}
        <div className="border-b flex items-center"
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
          background: 'rgba(9,11,16,0.96)',
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
    <LangProvider>
      <GenerationProvider>
        <AppLayoutInner>{children}</AppLayoutInner>
      </GenerationProvider>
    </LangProvider>
  )
}
