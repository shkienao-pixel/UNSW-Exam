'use client'

import { useState } from 'react'
import {
  Users, BookOpen, FileText, Ticket, Key, MessageSquare,
  Lock, Zap, Shield, CalendarDays,
} from 'lucide-react'
import ExamMasterLogo from '@/components/ExamMasterLogo'
import { useLang } from '@/lib/i18n'
import { API, Tab } from './_shared'
import { CoursesTab } from './CoursesTab'
import { ArtifactsTab } from './ArtifactsTab'
import { UsersTab } from './UsersTab'
import { InvitesTab } from './InvitesTab'
import { ApiKeysTab } from './ApiKeysTab'
import { FeedbackTab } from './FeedbackTab'
import { CourseContentTab } from './CourseContentTab'
import { PlannerBlueprintTab } from './PlannerBlueprintTab'

function getTabs(t: (key: any) => string): { id: Tab; label: string; icon: React.ReactNode }[] {
  return [
    { id: 'courses', label: t('admin_tab_courses'), icon: <BookOpen size={15} /> },
    { id: 'artifacts', label: t('admin_tab_artifacts'), icon: <FileText size={15} /> },
    { id: 'users', label: t('admin_tab_users'), icon: <Users size={15} /> },
    { id: 'invites', label: t('admin_tab_invites'), icon: <Ticket size={15} /> },
    { id: 'api-keys', label: t('admin_tab_api_keys'), icon: <Key size={15} /> },
    { id: 'feedback', label: t('admin_tab_feedback'), icon: <MessageSquare size={15} /> },
    { id: 'course-content', label: t('admin_tab_course_content'), icon: <BookOpen size={15} /> },
    { id: 'planner', label: '考试计划', icon: <CalendarDays size={15} /> },
  ]
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('courses')
  const [secretInput, setSecretInput] = useState('')
  const [secret, setSecret] = useState('')
  const [coursesVersion, setCoursesVersion] = useState(0)
  const { t, lang, setLang } = useLang()
  const tabs = getTabs(t)

  if (!secret) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8"
        style={{
          background:
            'radial-gradient(circle at top, rgba(20,28,42,0.72), transparent 28%), radial-gradient(circle at 85% 10%, rgba(200,165,90,0.08), transparent 18%), linear-gradient(180deg, #050608 0%, #080b12 50%, #050608 100%)',
        }}>
        <div className="w-full max-w-md rounded-[28px] p-8 space-y-6 fade-in-up"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}>
          <div>
            <div className="mb-4 flex items-center justify-between">
              <ExamMasterLogo height={28} />
              <button
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                className="rounded-full border border-white/12 px-3 py-1 text-xs text-white/62 transition hover:bg-white/[0.05]"
              >
                {lang === 'zh' ? 'English Version' : '中文'}
              </button>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.25)' }}>
                <Shield size={20} style={{ color: '#FFD700' }} />
              </div>
              <div className="text-xl font-bold" style={{ color: '#FFD700' }}>{t('admin_title')}</div>
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.52)' }}>{t('admin_enter_desc')}</p>
            <p className="text-xs mt-1 font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>API: {API}</p>
          </div>

          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,255,255,0.42)' }} />
            <input
              type="password"
              value={secretInput}
              onChange={e => setSecretInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setSecret(secretInput.trim())}
              placeholder={t('admin_secret_ph')}
              className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none transition-all duration-150"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e0e0e0',
              }}
              onFocus={e => {
                e.currentTarget.style.border = '1px solid rgba(255,215,0,0.5)'
                e.currentTarget.style.boxShadow = '0 0 12px rgba(255,215,0,0.08)'
              }}
              onBlur={e => {
                e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
          <button onClick={() => setSecret(secretInput.trim())}
            className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150"
            style={{
              background: 'linear-gradient(135deg, rgba(255,215,0,0.22), rgba(255,215,0,0.12))',
              color: '#FFD700',
              border: '1px solid rgba(255,215,0,0.35)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,215,0,0.32), rgba(255,215,0,0.18))')}
            onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,215,0,0.22), rgba(255,215,0,0.12))')}>
            <Zap size={15} />
            {t('admin_enter_btn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-[1240px] flex-col px-5 py-8 sm:px-6 lg:py-10"
      style={{
        background:
          'radial-gradient(circle at top, rgba(20,28,42,0.62), transparent 26%), radial-gradient(circle at 84% 12%, rgba(200,165,90,0.08), transparent 20%)',
      }}
    >
      <div className="mb-6 flex items-center justify-between rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.22)' }}>
            <Shield size={16} style={{ color: '#FFD700' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#FFD700' }}>{t('admin_title')}</h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.42)' }}>{t('admin_sub')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/62 transition hover:bg-white/[0.05]"
          >
            {lang === 'zh' ? 'English Version' : '中文'}
          </button>
          <button onClick={() => setSecret('')}
            className="text-xs px-3 py-1.5 rounded-lg transition-all duration-150"
            style={{ color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ff7070'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,112,112,0.3)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}>
            {t('admin_logout')}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 flex gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1 flex-wrap">
        {tabs.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 relative"
            style={{
              background: tab === item.id ? 'rgba(255,215,0,0.1)' : 'transparent',
              color: tab === item.id ? '#FFD700' : '#444',
              border: tab === item.id ? '1px solid rgba(255,215,0,0.25)' : '1px solid transparent',
              textShadow: tab === item.id ? '0 0 12px rgba(255,215,0,0.4)' : 'none',
            }}
            onMouseEnter={e => { if (tab !== item.id) { (e.currentTarget as HTMLElement).style.color = '#888' } }}
            onMouseLeave={e => { if (tab !== item.id) { (e.currentTarget as HTMLElement).style.color = '#444' } }}>
            {item.icon} {item.label}
            {tab === item.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                style={{ background: '#FFD700', boxShadow: '0 0 6px rgba(255,215,0,0.6)' }} />
            )}
          </button>
        ))}
      </div>

      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_20px_64px_rgba(0,0,0,0.26)]">
        <div style={{ display: tab === 'courses'        ? undefined : 'none' }}><CoursesTab        secret={secret} onCoursesChanged={() => setCoursesVersion(v => v + 1)} /></div>
        <div style={{ display: tab === 'artifacts'      ? undefined : 'none' }}><ArtifactsTab      secret={secret} coursesVersion={coursesVersion} /></div>
        <div style={{ display: tab === 'users'          ? undefined : 'none' }}><UsersTab          secret={secret} /></div>
        <div style={{ display: tab === 'invites'        ? undefined : 'none' }}><InvitesTab        secret={secret} /></div>
        <div style={{ display: tab === 'api-keys'       ? undefined : 'none' }}><ApiKeysTab        secret={secret} /></div>
        <div style={{ display: tab === 'feedback'       ? undefined : 'none' }}><FeedbackTab       secret={secret} /></div>
        <div style={{ display: tab === 'course-content' ? undefined : 'none' }}><CourseContentTab  secret={secret} /></div>
        <div style={{ display: tab === 'planner'        ? undefined : 'none' }}><PlannerBlueprintTab secret={secret} /></div>
      </div>
    </div>
  )
}
