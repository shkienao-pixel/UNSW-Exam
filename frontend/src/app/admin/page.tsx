'use client'

import { useState } from 'react'
import {
  Users, BookOpen, FileText, Ticket, Key, MessageSquare,
  Lock, Zap, Shield, CreditCard,
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
import { CreditOrdersTab } from './CreditOrdersTab'

function getTabs(t: (key: any) => string): { id: Tab; label: string; icon: React.ReactNode }[] {
  return [
    { id: 'courses',        label: t('admin_tab_courses'),        icon: <BookOpen size={14} /> },
    { id: 'artifacts',      label: t('admin_tab_artifacts'),      icon: <FileText size={14} /> },
    { id: 'users',          label: t('admin_tab_users'),          icon: <Users size={14} /> },
    { id: 'invites',        label: t('admin_tab_invites'),        icon: <Ticket size={14} /> },
    { id: 'api-keys',       label: t('admin_tab_api_keys'),       icon: <Key size={14} /> },
    { id: 'feedback',       label: t('admin_tab_feedback'),       icon: <MessageSquare size={14} /> },
    { id: 'course-content', label: t('admin_tab_course_content'), icon: <BookOpen size={14} /> },
    { id: 'credit-orders',  label: '充值管理',                    icon: <CreditCard size={14} /> },
  ]
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('courses')
  const [secretInput, setSecretInput] = useState('')
  const [secret, setSecret] = useState('')
  const [coursesVersion, setCoursesVersion] = useState(0)
  const { t, lang, setLang } = useLang()
  const tabs = getTabs(t)

  // ── Login screen ────────────────────────────────────────────────────────────
  if (!secret) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050608] p-6">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(20,28,42,0.78),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(200,165,90,0.07),transparent_18%)]" />

        <div className="relative w-full max-w-sm space-y-6 rounded-[28px] border border-white/8 bg-[rgba(11,13,18,0.92)] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <ExamMasterLogo height={26} />
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/42 transition hover:border-white/16 hover:text-white/70"
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#c8a55a]/25 bg-[#c8a55a]/10">
              <Shield size={18} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">{t('admin_title')}</p>
              <p className="text-xs text-white/38">{t('admin_enter_desc')}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="password"
                value={secretInput}
                onChange={e => setSecretInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setSecret(secretInput.trim())}
                placeholder={t('admin_secret_ph')}
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2.5 pl-9 pr-4 text-sm text-white/88 outline-none placeholder:text-white/24 focus:border-[#c8a55a]/40"
              />
            </div>
            <button
              onClick={() => setSecret(secretInput.trim())}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#c8a55a]/25 bg-[#c8a55a]/10 py-2.5 text-sm font-medium text-[#e6cf98] transition hover:bg-[#c8a55a]/16"
            >
              <Zap size={14} />
              {t('admin_enter_btn')}
            </button>
          </div>

          <p className="text-center font-mono text-[10px] text-white/18">{API}</p>
        </div>
      </div>
    )
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050608]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(20,28,42,0.62),transparent_26%),radial-gradient(circle_at_84%_12%,rgba(200,165,90,0.07),transparent_20%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1280px] flex-col px-5 py-8 sm:px-6">
        {/* Top bar */}
        <div className="mb-5 flex items-center justify-between rounded-[20px] border border-white/8 bg-white/[0.03] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#c8a55a]/22 bg-[#c8a55a]/10">
              <Shield size={15} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{t('admin_title')}</p>
              <p className="text-[11px] text-white/34">{t('admin_sub')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/42 transition hover:border-white/16 hover:text-white/70"
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <button
              onClick={() => setSecret('')}
              className="rounded-lg border border-white/8 px-3 py-1.5 text-xs text-white/30 transition hover:border-red-500/30 hover:text-red-400"
            >
              {t('admin_logout')}
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <div className="mb-5 flex flex-wrap gap-1 rounded-[18px] border border-white/8 bg-white/[0.02] p-1.5">
          {tabs.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                tab === item.id
                  ? 'border border-[#c8a55a]/22 bg-[#c8a55a]/10 text-[#e6cf98]'
                  : 'border border-transparent text-white/36 hover:text-white/62'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 rounded-[24px] border border-white/8 bg-white/[0.025] p-5 shadow-[0_20px_64px_rgba(0,0,0,0.22)]">
          <div style={{ display: tab === 'courses'        ? undefined : 'none' }}><CoursesTab        secret={secret} onCoursesChanged={() => setCoursesVersion(v => v + 1)} /></div>
          <div style={{ display: tab === 'artifacts'      ? undefined : 'none' }}><ArtifactsTab      secret={secret} coursesVersion={coursesVersion} /></div>
          <div style={{ display: tab === 'users'          ? undefined : 'none' }}><UsersTab          secret={secret} /></div>
          <div style={{ display: tab === 'invites'        ? undefined : 'none' }}><InvitesTab        secret={secret} /></div>
          <div style={{ display: tab === 'api-keys'       ? undefined : 'none' }}><ApiKeysTab        secret={secret} /></div>
          <div style={{ display: tab === 'feedback'       ? undefined : 'none' }}><FeedbackTab       secret={secret} /></div>
          <div style={{ display: tab === 'course-content' ? undefined : 'none' }}><CourseContentTab  secret={secret} /></div>
          <div style={{ display: tab === 'credit-orders'  ? undefined : 'none' }}><CreditOrdersTab   secret={secret} /></div>
        </div>
      </div>
    </div>
  )
}
