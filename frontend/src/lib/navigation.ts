import { LibraryBig, Layers3, BookMarked, CalendarDays, Target, BookOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const FEATURES = [
  { view: 'resources',          labelKey: 'files',              featured: true },
  { view: 'flashcards',         labelKey: 'flashcards',         featured: true },
  { view: 'notes-and-mistakes', labelKey: 'notes_and_mistakes', featured: true },
  { view: 'planner',            labelKey: 'planner' },
  { view: 'quiz',               labelKey: 'quiz' },
  { view: 'course-summary',     labelKey: 'knowledge_summary' },
] as const

export type FeatureView = typeof FEATURES[number]['view']

export interface FeatureMeta {
  icon: LucideIcon
  tint: string
  bg: string
}

export const FEATURE_ICON_MAP: Record<FeatureView, FeatureMeta> = {
  resources:            { icon: LibraryBig,   tint: '#9FD3C7', bg: 'rgba(159,211,199,0.1)'  },
  flashcards:           { icon: Layers3,      tint: '#E7D08A', bg: 'rgba(200,165,90,0.12)'  },
  'notes-and-mistakes': { icon: BookMarked,   tint: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  planner:              { icon: CalendarDays, tint: '#7DD3C8', bg: 'rgba(125,211,200,0.12)' },
  quiz:                 { icon: Target,       tint: '#87B6FF', bg: 'rgba(135,182,255,0.12)' },
  'course-summary':     { icon: BookOpen,     tint: '#A8D8B0', bg: 'rgba(168,216,176,0.12)' },
}

export const SIDEBAR_SHELL_BG =
  'radial-gradient(circle at top, rgba(22,30,44,0.56), transparent 26%), radial-gradient(circle at 78% 10%, rgba(200,165,90,0.08), transparent 18%), linear-gradient(180deg, rgba(10,12,18,0.96) 0%, rgba(7,9,14,0.98) 100%)'

export const SIDEBAR_CARD =
  'rounded-[22px] border border-white/8 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
