'use client'

import { useEffect, useState } from 'react'
import { Loader2, XCircle, Trash2, Plus, CheckCircle } from 'lucide-react'

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'

// ── Doc type constants (mirrored from types.ts) ────────────────────────────────
export type DocType = 'lecture' | 'tutorial' | 'revision' | 'past_exam' | 'assignment' | 'other'

export type UiLang = 'zh' | 'en'

export const DOC_TYPE_LABELS_BY_LANG: Record<UiLang, Record<DocType, string>> = {
  zh: {
    lecture: '讲义',
    tutorial: '辅导/Lab',
    revision: '复习总结',
    past_exam: '往年考题',
    assignment: '作业/Project',
    other: '其他',
  },
  en: {
    lecture: 'Lecture Notes',
    tutorial: 'Tutorial / Lab',
    revision: 'Revision Summary',
    past_exam: 'Past Exam',
    assignment: 'Assignment / Project',
    other: 'Other',
  },
}
export const DOC_TYPE_COLORS: Record<DocType, string> = {
  lecture: '#60a5fa', tutorial: '#a78bfa', revision: '#4ade80',
  past_exam: '#f97316', assignment: '#facc15', other: '#6b7280',
}

export function tx(lang: UiLang, zh: string, en: string) {
  return lang === 'zh' ? zh : en
}

export function localeByLang(lang: UiLang) {
  return lang === 'zh' ? 'zh-CN' : 'en-US'
}

export function getDocTypeLabel(docType: DocType, lang: UiLang) {
  return DOC_TYPE_LABELS_BY_LANG[lang][docType]
}

export function getDocTypeOptions(lang: UiLang) {
  return (Object.keys(DOC_TYPE_LABELS_BY_LANG[lang]) as DocType[]).map(value => ({
    value,
    label: DOC_TYPE_LABELS_BY_LANG[lang][value],
  }))
}

export async function adminReq<T>(secret: string, path: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(API + path, {
      ...options,
      headers: {
        'X-Admin-Secret': secret,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      },
    })
  } catch {
    throw new Error('网络连接失败，请检查后端服务是否运行')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Course { id: string; code: string; name: string; exam_date?: string | null; created_at: string }
export interface Artifact {
  id: number; course_id: string; file_name: string; file_type: string
  status: string; created_at: string; reject_reason: string | null; uploaded_by: string | null
  storage_url?: string; doc_type?: DocType; week?: number | null
}
export interface User {
  id: string; email: string; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean
  credits?: number
}
export interface Invite { id: string; code: string; note: string | null; max_uses: number; use_count: number; created_at: string }
export interface ApiKey { id: number; provider: 'openai' | 'gemini' | 'deepseek'; label: string; is_active: boolean; created_at: string; updated_at: string }
export interface AdminUploadItem { id: number; file: File; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string }

export type Tab = 'courses' | 'artifacts' | 'users' | 'invites' | 'api-keys' | 'feedback' | 'course-content' | 'planner'

// ── Shared styles ──────────────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e0e0e0',
}

export const rowStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.07)',
}

export const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
}

// ── Shared UI primitives ───────────────────────────────────────────────────────

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} />
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className="text-center py-8 text-sm" style={{ color: '#444' }}>{text}</p>
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="p-3 rounded-xl text-sm flex items-center gap-2" style={{ background: 'rgba(255,80,80,0.08)', color: '#ff8080', border: '1px solid rgba(255,80,80,0.2)' }}>
      <XCircle size={14} /> {msg}
    </div>
  )
}

export function ActionBtn({ onClick, loading = false, disabled = false, icon, children }: {
  onClick: () => void; loading?: boolean; disabled?: boolean; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
      style={{
        background: loading || disabled ? 'rgba(255,215,0,0.08)' : 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.1))',
        color: '#FFD700',
        border: '1px solid rgba(255,215,0,0.35)',
        opacity: loading || disabled ? 0.5 : 1,
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => { if (!loading && !disabled) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.28), rgba(255,215,0,0.16))' }}
      onMouseLeave={e => { if (!loading && !disabled) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.1))' }}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function DeleteBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      className="p-1.5 rounded-lg flex-shrink-0 transition-all duration-150"
      style={{
        color: hov ? '#ff6b6b' : '#444',
        background: hov ? 'rgba(255,107,107,0.1)' : 'transparent',
      }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <Trash2 size={14} />
    </button>
  )
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm font-medium flex items-center gap-2 shadow-2xl"
      style={{ background: 'rgba(20,20,36,0.97)', border: '1px solid rgba(74,222,128,0.4)', color: '#4ade80', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
      <CheckCircle size={15} /> {message}
    </div>
  )
}
