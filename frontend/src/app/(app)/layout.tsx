'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import { GenerationProvider } from '@/lib/generation-context'
import { useCredits } from '@/hooks/useCredits'
import { useCourseList } from '@/hooks/useCourseList'
import { FloatingAskProvider } from '@/lib/floating-ask-context'
import FloatingAskWindow from '@/components/FloatingAskWindow'
import { NoteFloatProvider } from '@/lib/note-float-context'
import NoteFloatWindow from '@/components/NoteFloatWindow'
import FloatingProgress from '@/components/FloatingProgress'
import ExamCountdown from '@/components/ExamCountdown'
import SidebarHeader from '@/components/SidebarHeader'
import CourseSidebar from '@/components/CourseSidebar'
import DefaultSidebar from '@/components/DefaultSidebar'
import SidebarFooter from '@/components/SidebarFooter'
import FeedbackWidget from '@/components/FeedbackWidget'
import { SIDEBAR_SHELL_BG } from '@/lib/navigation'
import type { Course } from '@/lib/types'
import { Loader2, ChevronLeft, Menu, X } from 'lucide-react'

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
  const [collapsed, setCollapsed] = useState(false)
  // Mobile drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { courses }                         = useCourseList(!!user)
  const { balance: credits, refresh: refreshCredits } = useCredits(!!user && role !== 'guest')

  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [user, loading, router])

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

      {/* Floating notes window */}
      <NoteFloatWindow />

      {/* Global feedback button */}
      <FeedbackWidget />
    </div>
  )
}

// ── Root layout export ────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <GenerationProvider>
      <FloatingAskProvider>
        <NoteFloatProvider>
          <AppLayoutInner>{children}</AppLayoutInner>
        </NoteFloatProvider>
      </FloatingAskProvider>
    </GenerationProvider>
  )
}
