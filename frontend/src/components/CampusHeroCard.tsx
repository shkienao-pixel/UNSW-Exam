'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BookOpen, AlertCircle, Zap, FileText, ArrowRight } from 'lucide-react'

const NAV_PILLS = [
  { icon: <BookOpen size={14} />, label: 'Flashcards',       labelCn: '闪卡' },
  { icon: <AlertCircle size={14} />, label: 'Wrong Answer Sets', labelCn: '错题集' },
  { icon: <Zap size={14} />, label: 'AI Generation',      labelCn: 'AI 生成' },
  { icon: <FileText size={14} />, label: 'Practice Exams',    labelCn: '模拟题' },
]


// ── Horizontal scan rails (extend left/right from card) ──────────────────────
// Each "rail" is a horizontal line at a given % of the card height,
// with a glowing particle sweeping from outside toward the card edge.
const H_LINES = [
  { pct: 18,  dur: '2.6s', delay: '0s',   op: 0.55 },
  { pct: 36,  dur: '3.4s', delay: '0.8s', op: 0.35 },
  { pct: 54,  dur: '2.2s', delay: '1.5s', op: 0.50 },
  { pct: 72,  dur: '4.0s', delay: '0.4s', op: 0.30 },
  { pct: 88,  dur: '3.0s', delay: '2.0s', op: 0.40 },
]

function HRails({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left'
  return (
    <div
      className="absolute top-0 bottom-0 hidden lg:block pointer-events-none"
      style={{
        [isLeft ? 'left' : 'right']: 0,
        width: 80,
        overflow: 'visible',
      }}>
      {H_LINES.map((ln, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: `${ln.pct}%`,
          [isLeft ? 'right' : 'left']: 0,
          // extend 80px outward from the card edge
          width: 80,
          height: 1,
          transform: 'translateY(-50%)',
          background: `rgba(255,215,0,${ln.op * 0.15})`,
          overflow: 'visible',
        }}>
          {/* Traveling glow — sweeps from outer edge toward the card */}
          <div style={{
            position: 'absolute',
            top: '-2px',
            height: 5,
            width: 36,
            borderRadius: 3,
            background: `linear-gradient(to ${isLeft ? 'right' : 'left'},
              transparent,
              rgba(255,215,0,${ln.op * 0.9}),
              rgba(255,255,200,${ln.op}),
              rgba(255,215,0,${ln.op * 0.9}),
              transparent)`,
            animation: `hRail${isLeft ? 'L' : 'R'} ${ln.dur} ease-in-out ${ln.delay} infinite`,
            boxShadow: `0 0 8px 2px rgba(255,215,0,${ln.op * 0.4})`,
          }} />
          {/* Node dot at card edge */}
          <div style={{
            position: 'absolute',
            top: '50%',
            [isLeft ? 'right' : 'left']: 0,
            transform: 'translate(50%,-50%)',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: `rgba(255,215,0,${ln.op * 0.5})`,
            border: `1px solid rgba(255,215,0,${ln.op * 0.8})`,
            boxShadow: `0 0 6px rgba(255,215,0,${ln.op * 0.4})`,
          }} />
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

      <HRails side="left"  />
      <HRails side="right" />

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
        /* Horizontal rail particles: left side sweeps right→left (toward card from outside) */
        @keyframes hRailL {
          0%   { right: -36px; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { right: 80px; opacity: 0; }
        }
        /* Right side sweeps left→right (toward card from outside) */
        @keyframes hRailR {
          0%   { left: -36px; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { left: 80px; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
