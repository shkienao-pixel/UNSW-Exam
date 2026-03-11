'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Flame, Zap, Minus, BookOpen, AlertTriangle, HelpCircle, Hash } from 'lucide-react'
import type { SummarySchemaV1, SummarySection, SummaryKeyTerm, ExamWeight } from '@/lib/types'

// ── Exam weight badge ─────────────────────────────────────────────────────────

const WEIGHT_CONFIG: Record<ExamWeight, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  high:   { label: '高考率', color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.25)', icon: <Flame  size={11} /> },
  medium: { label: '中考率', color: '#FFD700', bg: 'rgba(255,215,0,0.1)',   border: 'rgba(255,215,0,0.25)',   icon: <Zap    size={11} /> },
  low:    { label: '低考率', color: '#888',    bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', icon: <Minus  size={11} /> },
}

function ExamWeightBadge({ weight }: { weight: ExamWeight }) {
  const c = WEIGHT_CONFIG[weight] ?? WEIGHT_CONFIG.medium
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {c.icon}{c.label}
    </span>
  )
}

// ── Key term chip with tooltip ────────────────────────────────────────────────

function KeyTermChip({ term, definition }: SummaryKeyTerm) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
        style={{
          background: open ? 'rgba(99,179,237,0.18)' : 'rgba(99,179,237,0.08)',
          color: '#63B3ED',
          border: '1px solid rgba(99,179,237,0.25)',
        }}>
        <Hash size={9} />{term}
      </button>
      {open && (
        <div
          className="absolute z-20 bottom-full left-0 mb-1.5 w-64 rounded-xl p-3 text-xs leading-relaxed shadow-2xl"
          style={{
            background: 'rgba(10,15,30,0.97)',
            border: '1px solid rgba(99,179,237,0.3)',
            color: '#CCC',
            backdropFilter: 'blur(12px)',
          }}>
          <span className="font-semibold" style={{ color: '#63B3ED' }}>{term}：</span>
          {definition}
        </div>
      )}
    </div>
  )
}

// ── Exam tips callout ─────────────────────────────────────────────────────────

function ExamTipsBox({ tips }: { tips: string[] }) {
  if (!tips.length) return null
  return (
    <div className="rounded-xl px-4 py-3 mt-4"
      style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.18)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <AlertTriangle size={12} style={{ color: '#FFD700' }} />
        <span className="text-xs font-semibold" style={{ color: '#FFD700' }}>考试提示</span>
      </div>
      <ul className="space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#CCC' }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: '#FFD700' }} />
            {tip}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Formula box ───────────────────────────────────────────────────────────────

function FormulasBox({ formulas }: { formulas?: string[] }) {
  if (!formulas?.length) return null
  return (
    <div className="rounded-xl px-4 py-3 mt-3"
      style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.18)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs font-semibold" style={{ color: '#A78BFA' }}>公式 / 关键表达式</span>
      </div>
      <ul className="space-y-1">
        {formulas.map((f, i) => (
          <li key={i} className="font-mono text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(0,0,0,0.3)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.12)' }}>
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ section, index, isOpen, onToggle }: {
  section: SummarySection
  index: number
  isOpen: boolean
  onToggle: () => void
}) {
  const w = section.exam_weight ?? 'medium'
  const borderColor = w === 'high' ? 'rgba(255,107,107,0.3)' : w === 'medium' ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.07)'
  const leftBar = w === 'high' ? '#FF6B6B' : w === 'medium' ? '#FFD700' : '#444'

  return (
    <div className="rounded-2xl overflow-hidden transition-all"
      style={{ border: `1px solid ${borderColor}`, background: 'rgba(255,255,255,0.02)' }}>

      {/* Header — always visible, clickable to collapse */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-all hover:bg-white/[0.02]">
        {/* Left bar accent */}
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: leftBar }} />
        {/* Index */}
        <span className="text-xs font-mono flex-shrink-0" style={{ color: '#555' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        {/* Heading */}
        <span className="flex-1 text-sm font-semibold text-white">{section.heading}</span>
        {/* Badge + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ExamWeightBadge weight={w} />
          {isOpen
            ? <ChevronDown size={14} style={{ color: '#555' }} />
            : <ChevronRight size={14} style={{ color: '#555' }} />}
        </div>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="px-5 pb-5" style={{ borderTop: `1px solid ${borderColor}` }}>
          {/* Content */}
          <div className="pt-4 space-y-3">
            {section.content.split('\n\n').filter(Boolean).map((para, i) => (
              <p key={i} className="text-sm leading-relaxed" style={{ color: '#CCC' }}>{para}</p>
            ))}
          </div>

          {/* Key Terms */}
          {section.key_terms?.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen size={11} style={{ color: '#63B3ED' }} />
                <span className="text-xs font-semibold" style={{ color: '#63B3ED' }}>核心术语</span>
                <span className="text-xs" style={{ color: '#555' }}>（点击查看定义）</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {section.key_terms.map((kt, i) => (
                  <KeyTermChip key={i} term={kt.term} definition={kt.definition} />
                ))}
              </div>
            </div>
          )}

          <ExamTipsBox tips={section.exam_tips ?? []} />
          <FormulasBox formulas={section.formulas} />
        </div>
      )}
    </div>
  )
}

// ── Likely exam questions ─────────────────────────────────────────────────────

function ExamQuestionsPanel({ questions }: { questions: string[] }) {
  const [open, setOpen] = useState(false)
  if (!questions.length) return null
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(255,107,107,0.2)', background: 'rgba(255,107,107,0.03)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-all">
        <HelpCircle size={16} style={{ color: '#FF6B6B' }} />
        <span className="flex-1 text-sm font-semibold" style={{ color: '#FF6B6B' }}>可能考题</span>
        <span className="text-xs mr-2" style={{ color: '#555' }}>{questions.length} 题</span>
        {open ? <ChevronDown size={14} style={{ color: '#555' }} /> : <ChevronRight size={14} style={{ color: '#555' }} />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-2" style={{ borderTop: '1px solid rgba(255,107,107,0.15)' }}>
          {questions.map((q, i) => (
            <div key={i} className="flex items-start gap-3 pt-3">
              <span className="text-xs font-mono flex-shrink-0 mt-0.5" style={{ color: '#FF6B6B' }}>Q{i + 1}</span>
              <p className="text-sm" style={{ color: '#CCC' }}>{q}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export default function SummarySchemaRenderer({
  schema,
  onTocClick,
}: {
  schema: SummarySchemaV1
  /** Optional external TOC scroll handler — if provided, caller manages scroll */
  onTocClick?: (index: number) => void
}) {
  const [openSections, setOpenSections] = useState<Set<number>>(
    () => new Set(schema.sections.map((_, i) => i))   // all open by default
  )

  function toggle(i: number) {
    setOpenSections(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const highCount   = schema.sections.filter(s => s.exam_weight === 'high').length
  const mediumCount = schema.sections.filter(s => s.exam_weight === 'medium').length

  return (
    <div className="space-y-6">

      {/* ── Overview card ── */}
      <div className="rounded-2xl p-6"
        style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.15)' }}>
        <h1 className="text-xl font-bold text-white mb-3">{schema.title}</h1>
        <p className="text-sm leading-relaxed" style={{ color: '#BBB' }}>{schema.overview}</p>

        {/* Stats strip */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#888' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: '#FF6B6B' }} />
            {highCount} 高考率章节
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#888' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: '#FFD700' }} />
            {mediumCount} 中考率章节
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#888' }}>
            <HelpCircle size={11} />
            {schema.likely_exam_questions.length} 道预测考题
          </div>
        </div>
      </div>

      {/* ── Sections ── */}
      <div className="space-y-3">
        {schema.sections.map((section, i) => (
          <div key={i} data-section-index={i}>
            <SectionCard
              section={section}
              index={i}
              isOpen={openSections.has(i)}
              onToggle={() => { toggle(i); onTocClick?.(i) }}
            />
          </div>
        ))}
      </div>

      {/* ── Quick recap ── */}
      {schema.quick_recap && (
        <div className="rounded-2xl p-5"
          style={{ background: 'rgba(99,179,237,0.05)', border: '1px solid rgba(99,179,237,0.2)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} style={{ color: '#63B3ED' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#63B3ED' }}>TL;DR — 考前速记</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: '#CCC' }}>{schema.quick_recap}</p>
        </div>
      )}

      {/* ── Likely exam questions ── */}
      <ExamQuestionsPanel questions={schema.likely_exam_questions} />

    </div>
  )
}
