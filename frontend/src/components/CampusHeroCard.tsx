'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  BookOpen, AlertCircle, Zap, FileText, ArrowRight,
  Brain, MessageSquare, Sparkles, Upload, Cpu, LayoutGrid,
} from 'lucide-react'

const NAV_PILLS = [
  { icon: <BookOpen size={14} />, label: 'Flashcards',       labelCn: '闪卡' },
  { icon: <AlertCircle size={14} />, label: 'Wrong Answer Sets', labelCn: '错题集' },
  { icon: <Zap size={14} />, label: 'AI Generation',      labelCn: 'AI 生成' },
  { icon: <FileText size={14} />, label: 'Practice Exams',    labelCn: '模拟题' },
]

interface NodeDef {
  Icon: React.ElementType
  label: string
  /** 0-100, vertical position percentage */
  pct: number
  delay: string
}

const LEFT_NODES: NodeDef[] = [
  { Icon: Upload,     label: 'Upload', pct: 20, delay: '0s'   },
  { Icon: Cpu,        label: 'AI',     pct: 50, delay: '0.4s' },
  { Icon: LayoutGrid, label: 'Index',  pct: 80, delay: '0.8s' },
]
const RIGHT_NODES: NodeDef[] = [
  { Icon: Brain,         label: 'Learn', pct: 20, delay: '0.2s' },
  { Icon: MessageSquare, label: 'Ask',   pct: 50, delay: '0.6s' },
  { Icon: Sparkles,      label: 'Magic', pct: 80, delay: '1.0s' },
]

// ── Side rail with S-curve animation ──────────────────────────────────────────
function SideRail({ side, nodes }: { side: 'left' | 'right'; nodes: NodeDef[] }) {
  const isLeft = side === 'left'
  // ViewBox: 64 wide × 360 tall — stretched to actual height via preserveAspectRatio
  const W = 64
  const cx = W / 2     // 32
  const amp = 18       // horizontal oscillation amplitude

  // S-curve: two full sine periods traversing the height
  // Left rail oscillates: center → right → center → left → center → right → center → left → center
  // Right rail is the mirror
  const s = isLeft ? 1 : -1
  const curve =
    `M ${cx} 0 ` +
    `C ${cx + s*amp} 45, ${cx - s*amp} 90,  ${cx} 135 ` +
    `S ${cx + s*amp} 180, ${cx} 225 ` +
    `S ${cx - s*amp} 270, ${cx} 315 ` +
    `S ${cx + s*amp} 360, ${cx} 360`

  const pid  = `p-${side}`
  const gid  = `g-${side}`

  return (
    <div
      className="absolute top-0 bottom-0 hidden lg:block pointer-events-none"
      style={{ [isLeft ? 'left' : 'right']: 0, width: W, overflow: 'visible' }}>

      {/* ── SVG curve + travelling particles ── */}
      <svg width={W} height="100%"
        viewBox={`0 0 ${W} 360`}
        preserveAspectRatio="none"
        style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <path id={pid} d={curve} />
          {/* Glow filter */}
          <filter id={gid} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Ghost base curve */}
        <use href={`#${pid}`} fill="none"
          stroke="rgba(255,215,0,0.08)" strokeWidth="1.2" />

        {/* Flowing bright segment — fast, prominent */}
        <use href={`#${pid}`} fill="none"
          stroke="#FFD700" strokeWidth="1.5"
          strokeDasharray="38 322"
          strokeLinecap="round"
          filter={`url(#${gid})`}
          opacity="0.75">
          <animate attributeName="stroke-dashoffset"
            from="360" to="-360" dur="2.8s" repeatCount="indefinite" />
        </use>

        {/* Second segment, half-phase offset */}
        <use href={`#${pid}`} fill="none"
          stroke="rgba(255,215,0,0.45)" strokeWidth="1"
          strokeDasharray="22 338"
          strokeLinecap="round">
          <animate attributeName="stroke-dashoffset"
            from="360" to="-360" dur="2.8s" begin="1.4s" repeatCount="indefinite" />
        </use>

        {/* ── Glowing dot 1 ── */}
        <circle r="3.5" fill="#FFD700" filter={`url(#${gid})`}>
          <animateMotion dur="2.8s" repeatCount="indefinite"
            calcMode="spline" keySplines="0.42 0 0.58 1">
            <mpath href={`#${pid}`} />
          </animateMotion>
          <animate attributeName="opacity"
            values="0;1;1;0" keyTimes="0;0.06;0.94;1"
            dur="2.8s" repeatCount="indefinite" />
        </circle>

        {/* ── Glowing dot 2 — half-phase ── */}
        <circle r="2.5" fill="rgba(255,215,0,0.6)" filter={`url(#${gid})`}>
          <animateMotion dur="2.8s" begin="1.4s" repeatCount="indefinite"
            calcMode="spline" keySplines="0.42 0 0.58 1">
            <mpath href={`#${pid}`} />
          </animateMotion>
          <animate attributeName="opacity"
            values="0;0.7;0.7;0" keyTimes="0;0.06;0.94;1"
            dur="2.8s" begin="1.4s" repeatCount="indefinite" />
        </circle>

        {/* ── Node ring at each icon position ── */}
        {nodes.map((n) => {
          const y = (n.pct / 100) * 360
          return (
            <g key={n.label}>
              <circle cx={cx} cy={y} r="5"
                fill="rgba(8,6,20,0.95)"
                stroke="rgba(255,215,0,0.35)" strokeWidth="1"
                style={{ filter: 'drop-shadow(0 0 5px rgba(255,215,0,0.25))' }} />
              <circle cx={cx} cy={y} r="2"
                fill="rgba(255,215,0,0.5)" />
            </g>
          )
        })}
      </svg>

      {/* ── Floating icon chips ── */}
      {nodes.map((n) => (
        <div key={n.label}
          style={{
            position: 'absolute',
            top: `${n.pct}%`,
            // chips face inward toward the card
            [isLeft ? 'right' : 'left']: 2,
            transform: 'translateY(-50%)',
            animation: `chipFloat${isLeft ? 'L' : 'R'} 3.5s ease-in-out ${n.delay} infinite`,
          }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 8,
            background: 'rgba(6,5,18,0.88)',
            border: '1px solid rgba(255,215,0,0.18)',
            backdropFilter: 'blur(10px)',
            color: '#FFD700',
            fontSize: '0.6rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 14px rgba(0,0,0,0.5), 0 0 8px rgba(255,215,0,0.06)',
            letterSpacing: '0.04em',
          }}>
            <n.Icon size={10} />
            {n.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  onGuestLogin?: () => void
  guestLoading?: boolean
}

export default function CampusHeroCard({ onGuestLogin, guestLoading }: Props) {
  const [active, setActive] = useState(0)

  return (
    <div className="relative w-full max-w-4xl mx-auto mt-8 mb-4 fade-in-up px-4 lg:px-20"
      style={{ animationDelay: '0.15s' }}>

      <SideRail side="left"  nodes={LEFT_NODES}  />
      <SideRail side="right" nodes={RIGHT_NODES} />

      {/* ── Card ── */}
      <div className="relative rounded-3xl overflow-hidden flex flex-col sm:flex-row"
        style={{
          minHeight: 280,
          border: '1px solid rgba(255,215,0,0.18)',
          boxShadow: '0 8px 48px rgba(0,0,0,0.65), 0 0 60px rgba(255,215,0,0.04)',
        }}>

        {/* Left panel */}
        <div className="relative flex-1 flex flex-col justify-between p-6 sm:p-7"
          style={{ background: 'rgba(6,5,16,0.97)', minWidth: 0 }}>

          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: `
              linear-gradient(rgba(255,215,0,0.015) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,215,0,0.015) 1px, transparent 1px)`,
            backgroundSize: '36px 36px',
          }} />
          <div className="absolute top-0 left-0 pointer-events-none" style={{
            width: 200, height: 200,
            background: 'radial-gradient(circle at 0% 0%, rgba(255,215,0,0.06) 0%, transparent 70%)',
          }} />

          <div className="relative z-10">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#33334a' }}>
                Explore Campus Smart Navigation
              </p>
              <h3 className="text-sm font-bold" style={{ color: '#666' }}>
                探索校园智能导航
              </h3>
            </div>

            <div className="flex flex-col gap-2">
              {NAV_PILLS.map((pill, i) => (
                <button key={pill.label} onClick={() => setActive(i)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all duration-200"
                  style={{
                    background: active === i ? 'rgba(255,215,0,0.10)' : 'rgba(255,255,255,0.03)',
                    border: active === i ? '1px solid rgba(255,215,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    color: active === i ? '#FFD700' : '#3a3a52',
                    transform: active === i ? 'translateX(3px)' : 'none',
                  }}>
                  <span style={{ color: active === i ? '#FFD700' : '#2a2a3a', flexShrink: 0 }}>
                    {pill.icon}
                  </span>
                  <span className="text-xs font-semibold">
                    {pill.label}
                    <span className="ml-1.5" style={{
                      color: active === i ? 'rgba(255,215,0,0.6)' : '#222233',
                      fontSize: '0.7rem',
                    }}>
                      {pill.labelCn}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel: campus photo */}
        <div className="relative sm:w-64 flex-shrink-0 overflow-hidden" style={{ minHeight: 240 }}>
          <Image src="/campus.jpg" alt="UNSW Campus" fill
            className="object-cover object-center"
            style={{ filter: 'brightness(0.55) saturate(0.9)' }}
            priority />
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(to right, rgba(6,5,16,0.85) 0%, rgba(6,5,16,0.1) 40%, transparent 100%)',
          }} />
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 40%, rgba(0,0,0,0.4) 100%)',
          }} />
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-lg text-xs font-bold"
            style={{
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,215,0,0.25)',
              color: '#FFD700',
              backdropFilter: 'blur(8px)',
            }}>
            UNSW
          </div>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full px-5 flex justify-center">
            <Link href="/register"
              className="btn-gold flex items-center justify-center gap-2 text-xs w-full"
              style={{ padding: '11px 16px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Visit Campus AI Tutors
              <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>访问校园 AI 导师</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Bottom floating tooltip */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center" style={{ zIndex: 20 }}>
          <button onClick={onGuestLogin} disabled={guestLoading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-40"
            style={{
              background: 'rgba(8,8,18,0.90)',
              border: '1px solid rgba(255,215,0,0.2)',
              backdropFilter: 'blur(14px)',
              color: '#55556a',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              animation: 'floatBounce 3s ease-in-out infinite',
              cursor: 'pointer',
            }}>
            <span className="pulse-dot" style={{ background: '#22c55e' }} />
            {guestLoading
              ? '进入中…'
              : <>New! Click the rainbow steps to explore resources. <span style={{ color: '#333344' }}>（点击彩虹阶梯探索资源）</span></>
            }
          </button>
        </div>
        <div style={{ height: 44 }} />
      </div>

      <style>{`
        @keyframes floatBounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-5px); }
        }
        /* Chips on the left rail nudge left */
        @keyframes chipFloatL {
          0%, 100% { transform: translateY(-50%) translateX(0px); }
          50%       { transform: translateY(-50%) translateX(-4px); }
        }
        /* Chips on the right rail nudge right */
        @keyframes chipFloatR {
          0%, 100% { transform: translateY(-50%) translateX(0px); }
          50%       { transform: translateY(-50%) translateX(4px); }
        }
      `}</style>
    </div>
  )
}
