'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BookOpen, AlertCircle, Zap, FileText, ArrowRight } from 'lucide-react'

const NAV_PILLS = [
  { icon: <BookOpen size={14} />,    label: 'Flashcards',         labelCn: '闪卡' },
  { icon: <AlertCircle size={14} />, label: 'Wrong Answer Sets',  labelCn: '错题集' },
  { icon: <Zap size={14} />,         label: 'AI Generation',      labelCn: 'AI 生成' },
  { icon: <FileText size={14} />,    label: 'Practice Exams',     labelCn: '模拟题' },
]

// ── Horizontal scan rails (extend left/right from card) ──────────────────────
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
      style={{ [isLeft ? 'left' : 'right']: 0, width: 80, overflow: 'visible' }}>
      {H_LINES.map((ln, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: `${ln.pct}%`,
          [isLeft ? 'right' : 'left']: 0,
          width: 80,
          height: 1,
          transform: 'translateY(-50%)',
          background: `rgba(255,215,0,${ln.op * 0.15})`,
          overflow: 'visible',
        }}>
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

// ── AI Knowledge Nodes ────────────────────────────────────────────────────────

// Source point in SVG viewBox "0 0 100 100" coords (near the button)
const SX = 50, SY = 60

const AI_NODES = [
  {
    id: 0, text: 'Explain Backprop?',
    // SVG path endpoint (%) — matches CSS left/top
    cx: 22, cy: 14,
    // Quadratic bezier control point
    cpx: 22, cpy: 38,
    floatDur: '3.2s', floatDelay: '0s', floatY: -8,
    enterDelay: '0.35s',
  },
  {
    id: 1, text: 'COMP9517 历年考点',
    cx: 72, cy: 10,
    cpx: 68, cpy: 36,
    floatDur: '3.8s', floatDelay: '0.7s', floatY: -10,
    enterDelay: '0.50s',
  },
  {
    id: 2, text: 'How to optimize RAG?',
    cx: 18, cy: 76,
    cpx: 20, cpy: 62,
    floatDur: '2.9s', floatDelay: '1.4s', floatY: -7,
    enterDelay: '0.65s',
  },
  {
    id: 3, text: 'Attention Mechanism?',
    cx: 72, cy: 82,
    cpx: 68, cpy: 64,
    floatDur: '3.5s', floatDelay: '0.35s', floatY: -9,
    enterDelay: '0.80s',
  },
]

function AIKnowledgeNodes() {
  const [hov, setHov] = useState<number | null>(null)

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 4 }}>

      {/* ── SVG Bezier lines + energy particles ── */}
      <svg
        width="100%" height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      >
        <defs>
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {AI_NODES.map((n, i) => {
          const isHov = hov === i
          const d = `M ${SX} ${SY} Q ${n.cpx} ${n.cpy} ${n.cx} ${n.cy}`
          return (
            <g key={i}>
              {/* Base line */}
              <path
                d={d}
                fill="none"
                stroke={isHov ? 'rgba(255,215,0,0.72)' : 'rgba(255,193,7,0.22)'}
                strokeWidth={isHov ? 0.75 : 0.38}
                strokeLinecap="round"
                style={{
                  transition: 'stroke 0.3s ease, stroke-width 0.3s ease',
                  strokeDasharray: 160,
                  strokeDashoffset: 160,
                  animation: `aiLineGrow 0.85s ease-out ${0.2 + i * 0.12}s forwards`,
                }}
              />

              {/* Energy particle */}
              <circle r="0.85" fill="rgba(255,230,80,0.95)" filter="url(#nodeGlow)">
                <animateMotion
                  path={d}
                  dur={`${2.0 + i * 0.55}s`}
                  begin={`${0.9 + i * 0.3}s`}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines="0.4 0 0.6 1"
                />
              </circle>
            </g>
          )
        })}
      </svg>

      {/* ── Question Bubbles ── */}
      {AI_NODES.map((n, i) => (
        <div
          key={i}
          className="pointer-events-auto absolute"
          style={{
            left: `${n.cx}%`,
            top: `${n.cy}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 8,
          }}
          onMouseEnter={() => setHov(i)}
          onMouseLeave={() => setHov(null)}
        >
          {/* Float wrapper — pauses on hover */}
          <div style={{
            animation: `aiFloat${i} ${n.floatDur} ease-in-out ${n.floatDelay} infinite`,
            animationPlayState: hov === i ? 'paused' : 'running',
          }}>
            {/* Bubble content — entrance animation */}
            <div style={{
              padding: '4px 10px',
              borderRadius: 8,
              background: hov === i
                ? 'rgba(255,215,0,0.13)'
                : 'rgba(6,5,16,0.60)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: `1px solid ${hov === i ? 'rgba(255,215,0,0.58)' : 'rgba(255,193,7,0.22)'}`,
              color: hov === i ? '#FFD700' : 'rgba(190,190,210,0.88)',
              fontSize: '0.67rem',
              fontWeight: hov === i ? 600 : 400,
              whiteSpace: 'nowrap',
              boxShadow: hov === i
                ? '0 0 16px rgba(255,215,0,0.22), 0 4px 14px rgba(0,0,0,0.5)'
                : '0 3px 10px rgba(0,0,0,0.45)',
              transform: hov === i ? 'scale(1.06)' : 'scale(1)',
              transition: 'background 0.25s ease, border-color 0.25s ease, color 0.2s ease, transform 0.2s ease, box-shadow 0.25s ease, font-weight 0s',
              animation: `aiBubbleIn 0.55s cubic-bezier(0.34,1.56,0.64,1) ${n.enterDelay} both`,
            }}>
              {n.text}
            </div>
          </div>
        </div>
      ))}

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes aiLineGrow {
          from { stroke-dashoffset: 160; }
          to   { stroke-dashoffset: 0; }
        }

        @keyframes aiBubbleIn {
          from { opacity: 0; transform: scale(0.25) translateY(8px); filter: blur(4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   filter: blur(0); }
        }

        /* Per-bubble float — staggered so they move independently */
        @keyframes aiFloat0 {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes aiFloat1 {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes aiFloat2 {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-7px); }
        }
        @keyframes aiFloat3 {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-9px); }
        }

        /* Source dot pulse */
        @keyframes aiSourcePulse {
          0%, 100% { opacity: 0.6; transform: translate(-50%,-50%) scale(1); }
          50%       { opacity: 1;   transform: translate(-50%,-50%) scale(1.5); }
        }
      `}</style>

      {/* Source point dot */}
      <div style={{
        position: 'absolute',
        left: `${SX}%`,
        top: `${SY}%`,
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'rgba(255,215,0,0.85)',
        boxShadow: '0 0 8px rgba(255,215,0,0.6)',
        animation: 'aiSourcePulse 2s ease-in-out infinite',
        zIndex: 5,
      }} />
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

        {/* Right panel: campus photo + AI nodes */}
        <div className="relative sm:w-64 flex-shrink-0 overflow-hidden" style={{ minHeight: 240 }}>
          <Image src="/campus.jpg" alt="UNSW Campus" fill
            className="object-cover object-center"
            style={{ filter: 'brightness(0.45) saturate(0.8)' }}
            priority />

          {/* Dark gradient overlay */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(to right, rgba(6,5,16,0.85) 0%, rgba(6,5,16,0.1) 40%, transparent 100%)',
          }} />
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 40%, rgba(0,0,0,0.4) 100%)',
          }} />

          {/* ── AI Knowledge Nodes overlay ── */}
          <AIKnowledgeNodes />

          {/* UNSW Badge */}
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-lg text-xs font-bold"
            style={{
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,215,0,0.25)',
              color: '#FFD700',
              backdropFilter: 'blur(8px)',
              zIndex: 10,
              position: 'relative',
            }}>
            UNSW
          </div>

          {/* Visit button */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full px-5 flex justify-center"
            style={{ zIndex: 10 }}>
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
        @keyframes hRailL {
          0%   { right: -36px; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { right: 80px; opacity: 0; }
        }
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
