'use client'

/**
 * KnowledgeSummaryRenderer
 *
 * 能容忍管理员粘贴的任意 JSON 结构，统一规范化到内部格式后用项目设计系统渲染。
 *
 * 已知格式（优先匹配）：
 *   - weekly_structured_summary_bilingual  →  { weeks: [...] }
 *
 * 通用兜底（按键名猜结构）：
 *   - { sections/chapters/modules/units/topics: [...] }
 *   - 扁平对象 / 字符串数组
 *
 * 设计语言与 SummarySchemaRenderer 保持一致：
 *   - rounded-2xl 卡片 + border rgba(200,165,90,...)
 *   - 左侧色条 accent bar
 *   - ChevronDown/Right icon
 *   - 颜色：#c8a55a / #e6cf98 金色主色；白 = 标题；#BBB / #888 正文
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, BookOpen, AlertTriangle } from 'lucide-react'

// ── Unified internal types ─────────────────────────────────────────────────────

interface NormalizedItem {
  title: string
  points: string[]
}

interface NormalizedGroup {
  label: string        // 左侧短标签：W1 / Ch.1 / S1
  title: string
  overview?: string
  items: NormalizedItem[]
  mustKnow: string[]
  commonMistakes: string[]
}

interface NormalizedSummary {
  title: string
  overview: string
  groups: NormalizedGroup[]
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function toStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
}

function pickLang(zhVal: unknown, enVal: unknown, lang: 'zh' | 'en', fallback = ''): string {
  if (lang === 'zh') return str(zhVal) || str(enVal) || fallback
  return str(enVal) || str(zhVal) || fallback
}

// ── Normalizer: weekly_structured_summary_bilingual ───────────────────────────

function normalizeWeekly(
  data: Record<string, unknown>,
  lang: 'zh' | 'en',
): NormalizedSummary | null {
  if (!Array.isArray(data.weeks)) return null

  const course = (data.course ?? {}) as Record<string, unknown>
  const title = pickLang(course.name_zh ?? course.name, course.name_en ?? course.name, lang, '知识摘要')
  const overview = pickLang(course.description_zh, course.description_en, lang)

  const groups: NormalizedGroup[] = (data.weeks as unknown[]).map((w) => {
    const week = (w ?? {}) as Record<string, unknown>
    const num = week.week as number ?? ''
    const ov = (week.week_overview ?? {}) as Record<string, unknown>

    const groupTitle = pickLang(ov.title_zh, ov.title_en, lang, `Week ${num}`)
    const groupOverview = pickLang(ov.summary_zh, ov.summary_en, lang)

    const modules = Array.isArray(week.knowledge_modules) ? week.knowledge_modules : []
    const items: NormalizedItem[] = modules.map((m) => {
      const mod = (m ?? {}) as Record<string, unknown>
      return {
        title: pickLang(mod.title_zh, mod.title_en, lang),
        points: toStrArr(lang === 'zh' ? mod.key_points_zh : mod.key_points_en),
      }
    })

    const rf = (week.revision_focus ?? {}) as Record<string, unknown>
    return {
      label: `W${num}`,
      title: groupTitle,
      overview: groupOverview || undefined,
      items,
      mustKnow: toStrArr(lang === 'zh' ? rf.must_know_zh : rf.must_know_en),
      commonMistakes: toStrArr(lang === 'zh' ? rf.common_mistakes_zh : rf.common_mistakes_en),
    }
  })

  return { title, overview, groups }
}

// ── Normalizer: generic JSON ───────────────────────────────────────────────────

const GROUP_ARRAY_KEYS = ['weeks', 'chapters', 'modules', 'sections', 'units', 'topics'] as const
const ITEM_ARRAY_KEYS  = ['modules', 'topics', 'items', 'key_points', 'points', 'concepts', 'content'] as const
const GROUP_NUM_KEYS   = ['week', 'chapter', 'module', 'unit', 'number', 'index'] as const
const LABEL_PREFIX: Record<string, string> = {
  weeks: 'W', chapters: 'Ch.', modules: 'M', sections: 'S', units: 'U', topics: 'T',
}

function normalizeGeneric(
  data: Record<string, unknown>,
  lang: 'zh' | 'en',
): NormalizedSummary {
  const title = pickLang(
    data.title_zh ?? data.name_zh ?? data.title ?? data.name ?? data.course_name,
    data.title_en ?? data.name_en ?? data.title ?? data.name ?? data.course_name,
    lang, '知识摘要',
  )
  const overview = pickLang(
    data.overview_zh ?? data.description_zh ?? data.summary_zh ?? data.overview ?? data.description ?? data.summary,
    data.overview_en ?? data.description_en ?? data.summary_en ?? data.overview ?? data.description ?? data.summary,
    lang,
  )

  const arrayKey = GROUP_ARRAY_KEYS.find(k => Array.isArray(data[k]))
  const groups: NormalizedGroup[] = []

  if (arrayKey) {
    const prefix = LABEL_PREFIX[arrayKey] ?? 'S'
    ;(data[arrayKey] as unknown[]).forEach((item, idx) => {
      if (!item || typeof item !== 'object') return
      const obj = item as Record<string, unknown>

      const groupTitle = pickLang(
        obj.title_zh ?? obj.name_zh ?? obj.heading_zh ?? obj.title ?? obj.name ?? obj.heading,
        obj.title_en ?? obj.name_en ?? obj.heading_en ?? obj.title ?? obj.name ?? obj.heading,
        lang, `Section ${idx + 1}`,
      )
      const num = GROUP_NUM_KEYS.map(k => obj[k]).find(v => v !== undefined) ?? (idx + 1)
      const label = `${prefix}${num}`

      const groupOverview = pickLang(
        obj.overview_zh ?? obj.summary_zh ?? obj.description_zh ?? obj.overview ?? obj.summary ?? obj.description,
        obj.overview_en ?? obj.summary_en ?? obj.description_en ?? obj.overview ?? obj.summary ?? obj.description,
        lang,
      )

      const subKey = ITEM_ARRAY_KEYS.find(k => Array.isArray(obj[k]))
      const items: NormalizedItem[] = []

      if (subKey) {
        ;(obj[subKey] as unknown[]).forEach((sub) => {
          if (typeof sub === 'string') {
            // 字符串数组 → 聚合为一个匿名条目
            const last = items[items.length - 1]
            if (last && !last.title) last.points.push(sub)
            else items.push({ title: '', points: [sub] })
          } else if (sub && typeof sub === 'object') {
            const s = sub as Record<string, unknown>
            items.push({
              title: pickLang(s.title_zh ?? s.name_zh ?? s.title ?? s.name, s.title_en ?? s.name_en ?? s.title ?? s.name, lang),
              points: toStrArr(
                lang === 'zh'
                  ? (s.key_points_zh ?? s.points_zh ?? s.points ?? s.items ?? s.content)
                  : (s.key_points_en ?? s.points_en ?? s.points ?? s.items ?? s.content),
              ),
            })
          }
        })
      } else if (groupOverview) {
        // 没有子数组但有正文 → 把正文当单条目
        items.push({ title: '', points: [] })
      }

      groups.push({
        label,
        title: groupTitle,
        overview: groupOverview || undefined,
        items,
        mustKnow: [],
        commonMistakes: [],
      })
    })
  } else {
    // 最后兜底：把所有顶层字符串数组展开为一个 group
    const points: string[] = []
    Object.values(data).forEach(v => {
      if (Array.isArray(v)) v.forEach(x => { if (typeof x === 'string') points.push(x) })
    })
    if (points.length) {
      groups.push({ label: '内容', title, overview: overview || undefined, items: [{ title: '', points }], mustKnow: [], commonMistakes: [] })
    }
  }

  return { title, overview, groups }
}

// ── Master normalizer ──────────────────────────────────────────────────────────

function normalize(raw: unknown, lang: 'zh' | 'en'): NormalizedSummary {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { title: '知识摘要', overview: '', groups: [] }
  }
  const data = raw as Record<string, unknown>
  return normalizeWeekly(data, lang) ?? normalizeGeneric(data, lang)
}

// ── GroupCard ──────────────────────────────────────────────────────────────────

function GroupCard({ group, open, onToggle }: {
  group: NormalizedGroup
  open: boolean
  onToggle: () => void
}) {
  const hasRevision = group.mustKnow.length > 0 || group.commonMistakes.length > 0

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(200,165,90,0.18)', background: 'rgba(255,255,255,0.02)' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-all hover:bg-white/[0.02]"
      >
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: '#c8a55a' }} />
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-md flex-shrink-0"
          style={{ background: 'rgba(200,165,90,0.12)', color: '#e6cf98' }}
        >
          {group.label}
        </span>
        <span className="flex-1 text-sm font-semibold text-white leading-snug">{group.title}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {group.items.length > 0 && (
            <span className="text-xs" style={{ color: '#555' }}>
              {group.items.filter(it => it.title).length > 0
                ? `${group.items.length} 模块`
                : `${group.items.reduce((n, it) => n + it.points.length, 0)} 条`}
            </span>
          )}
          {open
            ? <ChevronDown size={14} style={{ color: '#555' }} />
            : <ChevronRight size={14} style={{ color: '#555' }} />}
        </div>
      </button>

      {open && (
        <div
          className="px-5 pb-5 pt-4 space-y-3"
          style={{ borderTop: '1px solid rgba(200,165,90,0.12)' }}
        >
          {group.overview && (
            <p className="text-sm leading-relaxed" style={{ color: '#AAA' }}>{group.overview}</p>
          )}

          {group.items.map((item, i) => (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {item.title && (
                <p className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#e6cf98' }}>
                  <BookOpen size={12} style={{ color: '#c8a55a', flexShrink: 0 }} />
                  {item.title}
                </p>
              )}
              {item.points.length > 0 && (
                <ul className="space-y-1.5">
                  {item.points.map((pt, pi) => (
                    <li key={pi} className="flex items-start gap-2 text-sm" style={{ color: '#BBB' }}>
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                        style={{ background: 'rgba(200,165,90,0.6)' }}
                      />
                      <span className="leading-relaxed">{pt}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {hasRevision && (
            <div
              className="rounded-xl px-4 py-3 space-y-2"
              style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.15)' }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle size={12} style={{ color: '#FFD700' }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#FFD700' }}>备考重点</span>
              </div>
              {group.mustKnow.map((pt, i) => (
                <p key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: '#CCC' }}>
                  <span style={{ color: '#c8a55a', flexShrink: 0, marginTop: 2 }}>✓</span>
                  <span>{pt}</span>
                </p>
              ))}
              {group.commonMistakes.length > 0 && (
                <>
                  <p className="text-xs font-semibold mt-3 mb-1" style={{ color: '#666' }}>常见误区</p>
                  {group.commonMistakes.map((pt, i) => (
                    <p key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: '#888' }}>
                      <span style={{ color: '#555', flexShrink: 0, marginTop: 2 }}>✗</span>
                      <span>{pt}</span>
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function KnowledgeSummaryRenderer({ rawJson }: { rawJson: unknown }) {
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [openGroups, setOpenGroups] = useState<Set<number>>(() => new Set([0]))
  const [activeGroup, setActiveGroup] = useState(0)

  const data = normalize(rawJson, lang)

  function toggleGroup(i: number) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
    setActiveGroup(i)
  }

  function navTo(i: number) {
    setActiveGroup(i)
    setOpenGroups(prev => new Set([...prev, i]))
    setTimeout(() => {
      document.querySelector(`[data-group-index="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const hasToc = data.groups.length > 2

  const LangToggle = ({ block = false }: { block?: boolean }) => (
    <div className={`flex gap-1 ${block ? 'mb-4' : 'mb-3'}`}>
      {(['zh', 'en'] as const).map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className="px-3 py-1 text-xs rounded-lg transition-all"
          style={{
            background: lang === l ? 'rgba(200,165,90,0.15)' : 'rgba(255,255,255,0.03)',
            color: lang === l ? '#e6cf98' : '#555',
            border: `1px solid ${lang === l ? 'rgba(200,165,90,0.3)' : 'rgba(255,255,255,0.05)'}`,
          }}
        >
          {l === 'zh' ? '中文' : 'English'}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex gap-0 min-h-[60vh]">

      {/* ── Left TOC (only when ≥ 3 groups) ── */}
      {hasToc && (
        <>
          <div className="w-44 flex-shrink-0 pr-4">
            <div className="sticky top-4 max-h-[calc(100vh-140px)] overflow-y-auto">
              <LangToggle />
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider px-1" style={{ color: '#444' }}>目录</p>
              {data.groups.map((g, i) => (
                <button
                  key={i}
                  onClick={() => navTo(i)}
                  className="w-full text-left py-1.5 px-2 rounded-lg transition-all hover:bg-white/5 flex items-center gap-1.5"
                  style={{
                    color: activeGroup === i ? '#e6cf98' : '#555',
                    background: activeGroup === i ? 'rgba(200,165,90,0.07)' : 'transparent',
                  }}
                >
                  <span
                    className="text-xs font-mono flex-shrink-0"
                    style={{ color: activeGroup === i ? '#c8a55a' : '#444', minWidth: 24 }}
                  >
                    {g.label}
                  </span>
                  <span className="text-xs truncate leading-snug">{g.title}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="w-px flex-shrink-0 mr-6" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 space-y-3">

        {/* Lang toggle when no sidebar */}
        {!hasToc && <LangToggle block />}

        {/* Overview card */}
        {(data.title || data.overview) && (
          <div
            className="rounded-2xl px-5 py-4 mb-2"
            style={{ background: 'rgba(255,215,0,0.03)', border: '1px solid rgba(255,215,0,0.12)' }}
          >
            {data.title && <h2 className="text-base font-bold text-white mb-1">{data.title}</h2>}
            {data.overview && <p className="text-sm leading-relaxed" style={{ color: '#AAA' }}>{data.overview}</p>}
          </div>
        )}

        {/* Groups */}
        {data.groups.map((group, i) => (
          <div key={i} data-group-index={i}>
            <GroupCard
              group={group}
              open={openGroups.has(i)}
              onToggle={() => toggleGroup(i)}
            />
          </div>
        ))}

        {data.groups.length === 0 && (
          <div
            className="rounded-2xl text-center py-16"
            style={{ border: '1px solid rgba(255,255,255,0.06)', color: '#444' }}
          >
            <p className="text-sm">内容结构暂时无法识别，请联系管理员检查 JSON 格式</p>
          </div>
        )}
      </div>
    </div>
  )
}
