'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import type { Course } from '@/lib/types'
import { LangProvider, useLang } from '@/lib/i18n'
import { GenerationProvider } from '@/lib/generation-context'
import FloatingProgress from '@/components/FloatingProgress'
import {
  LayoutDashboard, LogOut, ArrowLeft, Loader2, BookOpen, ChevronLeft,
} from 'lucide-react'

// ── Feature navigation config ─────────────────────────────────────────────────

const FEATURES = [
  { view: 'flashcards', emoji: '🃏', zh: '闪卡',    en: 'Flashcards', featured: true  },
  { view: 'mistakes',   emoji: '📝', zh: '错题集',   en: 'Mistakes',   featured: true  },
  { view: 'quiz',       emoji: '🎯', zh: '模拟题',   en: 'Quiz'                        },
  { view: 'summary',    emoji: '📄', zh: '摘要',     en: 'Summary'                     },
  { view: 'outline',    emoji: '📋', zh: '大纲',     en: 'Outline'                     },
  { view: 'ask',        emoji: '💬', zh: 'AI 问答',  en: 'AI Q&A'                      },
  { view: 'generate',   emoji: '⚡', zh: 'AI 生成',  en: 'AI Generate'                 },
  { view: 'files',      emoji: '📁', zh: '文件上传',  en: 'Files'                      },
  { view: 'scope',      emoji: '⚙️', zh: 'Scope',   en: 'Scope'                       },
]

// ── Hover-scale link wrapper ──────────────────────────────────────────────────

function HoverLink({
  href, children, style, className,
}: {
  href: string
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
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
    >
      {children}
    </Link>
  )
}

// ── Course sidebar (shown when inside a course) ───────────────────────────────

function CourseSidebar({
  courseId, course, collapsed,
}: {
  courseId: string
  course: Course | undefined
  collapsed: boolean
}) {
  const searchParams = useSearchParams()
  const { lang, t } = useLang()
  const currentView = searchParams.get('view') || 'flashcards'

  return (
    <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
      {/* Back */}
      <HoverLink
        href="/dashboard"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-2"
        style={{ color: '#555' }}
      >
        <ArrowLeft size={13} className="flex-shrink-0" />
        {!collapsed && <span>{t('all_courses')}</span>}
      </HoverLink>

      {/* Course badge */}
      {!collapsed && course && (
        <div className="px-3 py-2.5 mb-1 rounded-xl"
          style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.1)' }}>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>
            {course.code}
          </span>
          <p className="text-xs text-white font-medium mt-1.5 leading-tight">{course.name}</p>
        </div>
      )}
      {collapsed && course && (
        <div className="flex items-center justify-center px-1 py-2 mb-1">
          <span className="text-xs font-bold px-1.5 py-0.5 rounded text-center"
            style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', fontSize: 9 }}>
            {course.code}
          </span>
        </div>
      )}

      <div className="my-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} />

      {/* Feature links */}
      {FEATURES.map(f => {
        const isActive = currentView === f.view
        const href = `/courses/${courseId}?view=${f.view}`
        const label = lang === 'zh' ? f.zh : f.en

        if (f.featured) {
          return (
            <HoverLink key={f.view} href={href}
              className={`items-center gap-2.5 rounded-xl text-sm font-semibold ${collapsed ? 'justify-center px-2 py-3' : 'px-3 py-3'}`}
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,180,0,0.1))'
                  : 'rgba(255,215,0,0.07)',
                color: '#FFD700',
                border: `1px solid ${isActive ? 'rgba(255,215,0,0.45)' : 'rgba(255,215,0,0.18)'}`,
                boxShadow: isActive ? '0 0 12px rgba(255,215,0,0.12), inset 0 0 20px rgba(255,215,0,0.04)' : 'none',
                textShadow: isActive ? '0 0 12px rgba(255,215,0,0.55)' : 'none',
              }}>
              <span className="text-lg leading-none flex-shrink-0">{f.emoji}</span>
              {!collapsed && <span className="flex-1">{label}</span>}
              {!collapsed && isActive && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FFD700' }} />
              )}
            </HoverLink>
          )
        }

        return (
          <HoverLink key={f.view} href={href}
            className={`items-center gap-2.5 rounded-lg text-sm ${collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'}`}
            style={{
              color: isActive ? '#FFD700' : '#666',
              background: isActive ? 'rgba(255,215,0,0.08)' : 'transparent',
              borderLeft: collapsed ? 'none' : `2px solid ${isActive ? '#FFD700' : 'transparent'}`,
              textShadow: isActive ? '0 0 10px rgba(255,215,0,0.45)' : 'none',
            }}>
            <span className="text-sm leading-none flex-shrink-0">{f.emoji}</span>
            {!collapsed && label}
          </HoverLink>
        )
      })}
    </nav>
  )
}

// ── Default sidebar (dashboard / non-course pages) ────────────────────────────

function DefaultSidebar({
  courses, pathname, collapsed,
}: {
  courses: Course[]
  pathname: string
  collapsed: boolean
}) {
  const [coursesOpen, setCoursesOpen] = useState(true)
  const { t } = useLang()

  function navItem(href: string, icon: React.ReactNode, label: string) {
    const active = pathname === href
    return (
      <HoverLink href={href}
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

      {!collapsed && (
        <div>
          <button onClick={() => setCoursesOpen(v => !v)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ color: '#777' }}>
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
                  <HoverLink key={c.id} href={href}
                    className="items-center gap-2 px-3 py-1.5 rounded-lg text-xs truncate"
                    style={{
                      color: active ? '#FFD700' : '#666',
                      background: active ? 'rgba(255,215,0,0.06)' : 'transparent',
                      textShadow: active ? '0 0 8px rgba(255,215,0,0.35)' : 'none',
                    }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: active ? '#FFD700' : '#444' }} />
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
          <BookOpen size={16} style={{ color: '#555' }} />
        </div>
      )}
    </nav>
  )
}

// ── Sidebar footer with language toggle ───────────────────────────────────────

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
          style={{ color: '#666', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          🌐
        </button>
        <button onClick={logout}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          title={t('logout')}
          style={{ color: '#555' }}>
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
        style={{ color: '#666', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
        🌐 {lang === 'zh' ? 'Switch to English' : '切换为中文'}
      </button>
      <button onClick={logout}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors"
        style={{ color: '#555' }}>
        <LogOut size={16} /> {t('logout')}
      </button>
    </div>
  )
}

// ── Root layout (inner — inside LangProvider) ─────────────────────────────────

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading, logout } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (user) api.courses.list().then(setCourses).catch(() => {})
  }, [user])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#08080f' }}>
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={32} />
    </div>
  )
  if (!user) return null

  // Detect course context
  const courseMatch = pathname.match(/^\/courses\/([^/]+)/)
  const courseId = courseMatch?.[1] ?? null
  const currentCourse = courseId ? courses.find(c => c.id === courseId) : undefined

  const sidebarWidth = collapsed ? 56 : 240

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#08080f' }}>
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid rgba(255,215,0,0.06)',
          background: 'rgba(6,6,14,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          position: 'relative',
        }}>

        {/* Logo + collapse toggle */}
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
              <div className="text-lg font-bold" style={{ color: '#FFD700' }}>✦ Exam Master</div>
              <div className="text-xs mt-0.5 truncate" style={{ color: '#555', maxWidth: 150 }}>{user.email}</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            className="flex items-center justify-center rounded-lg transition-all"
            style={{
              width: 28, height: 28, flexShrink: 0,
              color: '#555',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <ChevronLeft size={14} style={{
              transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s ease',
            }} />
          </button>
        </div>

        {courseId ? (
          <Suspense fallback={<div className="flex-1" />}>
            <CourseSidebar courseId={courseId} course={currentCourse} collapsed={collapsed} />
          </Suspense>
        ) : (
          <DefaultSidebar courses={courses} pathname={pathname} collapsed={collapsed} />
        )}

        <SidebarFooter logout={logout} collapsed={collapsed} />
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ transition: 'margin 0.25s ease' }}>
        {children}
      </main>

      {/* Floating generation progress — always on top */}
      <FloatingProgress />
    </div>
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
