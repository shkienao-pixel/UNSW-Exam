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
  LayoutDashboard, LogOut, ArrowLeft, Loader2, BookOpen,
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

// ── Course sidebar (shown when inside a course) ───────────────────────────────

function CourseSidebar({ courseId, course }: { courseId: string; course: Course | undefined }) {
  const searchParams = useSearchParams()
  const { lang, t } = useLang()
  const currentView = searchParams.get('view') || 'flashcards'

  return (
    <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
      {/* Back */}
      <Link href="/dashboard"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors mb-2"
        style={{ color: '#555' }}>
        <ArrowLeft size={13} /> {t('all_courses')}
      </Link>

      {/* Course badge */}
      {course && (
        <div className="px-3 py-2.5 mb-1 rounded-xl"
          style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.1)' }}>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>
            {course.code}
          </span>
          <p className="text-xs text-white font-medium mt-1.5 leading-tight">{course.name}</p>
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
            <Link key={f.view} href={href}
              className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,180,0,0.1))'
                  : 'rgba(255,215,0,0.07)',
                color: '#FFD700',
                border: `1px solid ${isActive ? 'rgba(255,215,0,0.45)' : 'rgba(255,215,0,0.18)'}`,
                boxShadow: isActive ? '0 0 12px rgba(255,215,0,0.12), inset 0 0 20px rgba(255,215,0,0.04)' : 'none',
                textShadow: isActive ? '0 0 12px rgba(255,215,0,0.55)' : 'none',
              }}>
              <span className="text-lg leading-none">{f.emoji}</span>
              <span className="flex-1">{label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FFD700' }} />
              )}
            </Link>
          )
        }

        return (
          <Link key={f.view} href={href}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all"
            style={{
              color: isActive ? '#FFD700' : '#666',
              background: isActive ? 'rgba(255,215,0,0.08)' : 'transparent',
              borderLeft: `2px solid ${isActive ? '#FFD700' : 'transparent'}`,
              textShadow: isActive ? '0 0 10px rgba(255,215,0,0.45)' : 'none',
              boxShadow: isActive ? 'inset 0 0 18px rgba(255,215,0,0.04)' : 'none',
            }}>
            <span className="text-sm leading-none">{f.emoji}</span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

// ── Default sidebar (dashboard / non-course pages) ────────────────────────────

function DefaultSidebar({ courses, pathname }: { courses: Course[]; pathname: string }) {
  const [coursesOpen, setCoursesOpen] = useState(true)
  const { t } = useLang()

  function navItem(href: string, icon: React.ReactNode, label: string) {
    const active = pathname === href
    return (
      <Link href={href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all"
        style={{
          color: active ? '#FFD700' : '#999',
          background: active ? 'rgba(255,215,0,0.08)' : 'transparent',
          borderLeft: `2px solid ${active ? '#FFD700' : 'transparent'}`,
          textShadow: active ? '0 0 10px rgba(255,215,0,0.45)' : 'none',
          boxShadow: active ? 'inset 0 0 18px rgba(255,215,0,0.04)' : 'none',
        }}>
        {icon}{label}
      </Link>
    )
  }

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {navItem('/dashboard', <LayoutDashboard size={16} />, t('dashboard'))}


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
                <Link key={c.id} href={href}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all truncate"
                  style={{
                    color: active ? '#FFD700' : '#666',
                    background: active ? 'rgba(255,215,0,0.06)' : 'transparent',
                    textShadow: active ? '0 0 8px rgba(255,215,0,0.35)' : 'none',
                  }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: active ? '#FFD700' : '#444' }} />
                  {c.code} {c.name}
                </Link>
              )
            })}
            {courses.length === 0 && (
              <p className="px-3 py-1.5 text-xs" style={{ color: '#444' }}>{t('no_courses')}</p>
            )}
          </div>
        )}
      </div>

    </nav>
  )
}

// ── Sidebar footer with language toggle ───────────────────────────────────────

function SidebarFooter({ logout }: { logout: () => void }) {
  const { lang, setLang, t } = useLang()

  return (
    <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: 'rgba(255,215,0,0.08)' }}>
      {/* Language toggle */}
      <button
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-colors"
        style={{ color: '#666', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
        🌐 {lang === 'zh' ? 'Switch to English' : '切换为中文'}
      </button>
      {/* Logout */}
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

  return (
    <div className="flex min-h-screen" style={{ background: '#08080f' }}>
      {/* ── Sidebar ── */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r"
        style={{
          borderColor: 'rgba(255,215,0,0.06)',
          background: 'rgba(6,6,14,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}>

        {/* Logo */}
        <div className="px-4 py-5 border-b" style={{ borderColor: 'rgba(255,215,0,0.06)' }}>
          <div className="text-lg font-bold" style={{ color: '#FFD700' }}>✦ Exam Master</div>
          <div className="text-xs mt-0.5 truncate" style={{ color: '#555' }}>{user.email}</div>
        </div>

        {courseId ? (
          <Suspense fallback={<div className="flex-1" />}>
            <CourseSidebar courseId={courseId} course={currentCourse} />
          </Suspense>
        ) : (
          <DefaultSidebar courses={courses} pathname={pathname} />
        )}

        <SidebarFooter logout={logout} />
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
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
