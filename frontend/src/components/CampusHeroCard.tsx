'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookOpen, AlertCircle, Zap, FileText, ArrowRight } from 'lucide-react'

const NAV_PILLS = [
  { icon: <BookOpen size={13} />, label: '智能闪卡', sub: 'AI 提炼考点' },
  { icon: <AlertCircle size={13} />, label: '错题集', sub: '薄弱点精准打击' },
  { icon: <Zap size={13} />, label: 'AI 内容生成', sub: '一键生成题目与摘要' },
  { icon: <FileText size={13} />, label: '模拟考试', sub: '真题情景练习' },
]

// SVG tech decoration nodes
function TechNodes() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      {/* Corner dots */}
      <circle cx="30" cy="30" r="3" fill="rgba(255,215,0,0.25)" />
      <circle cx="30" cy="30" r="8" fill="none" stroke="rgba(255,215,0,0.1)" strokeWidth="1" />
      <circle cx="28" cy="56" r="1.5" fill="rgba(255,215,0,0.15)" />
      <circle cx="56" cy="28" r="1.5" fill="rgba(255,215,0,0.15)" />

      {/* Right-side nodes */}
      <circle cx="calc(100% - 30)" cy="30" r="3" fill="rgba(100,80,220,0.3)" />
      <circle cx="calc(100% - 30)" cy="30" r="8" fill="none" stroke="rgba(100,80,220,0.12)" strokeWidth="1" />

      {/* Bottom-right corner */}
      <circle cx="calc(100% - 22)" cy="calc(100% - 22)" r="2" fill="rgba(255,215,0,0.2)" />

      {/* Connecting lines (top) */}
      <line x1="38" y1="30" x2="85" y2="30" stroke="rgba(255,215,0,0.08)" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="30" y1="38" x2="30" y2="70" stroke="rgba(255,215,0,0.08)" strokeWidth="1" strokeDasharray="4 4" />

      {/* Center scan line */}
      <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,215,0,0.03)" strokeWidth="1" />
    </svg>
  )
}

interface Props {
  onGuestLogin?: () => void
  guestLoading?: boolean
}

export default function CampusHeroCard({ onGuestLogin, guestLoading }: Props) {
  const [active, setActive] = useState(0)

  return (
    <div className="relative w-full max-w-3xl mx-auto mt-10 mb-4 fade-in-up px-4 sm:px-0"
      style={{ animationDelay: '0.15s' }}>

      {/* Card */}
      <div className="relative rounded-3xl overflow-hidden"
        style={{
          minHeight: 300,
          background: `
            linear-gradient(135deg,
              rgba(8,6,20,0.98) 0%,
              rgba(16,12,35,0.96) 35%,
              rgba(6,8,22,0.98) 65%,
              rgba(12,8,28,0.97) 100%
            )
          `,
          border: '1px solid rgba(255,215,0,0.13)',
          boxShadow: '0 8px 48px rgba(0,0,0,0.65), 0 0 60px rgba(255,215,0,0.035)',
        }}>

        {/* Background glow blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{
            position: 'absolute', top: '-20%', left: '10%',
            width: 320, height: 320, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,215,0,0.07) 0%, transparent 65%)',
          }} />
          <div style={{
            position: 'absolute', bottom: '-10%', right: '5%',
            width: 260, height: 260, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(80,60,180,0.10) 0%, transparent 65%)',
          }} />
        </div>

        {/* Grid overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `
            linear-gradient(rgba(255,215,0,0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,215,0,0.018) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }} />

        {/* SVG tech nodes */}
        <TechNodes />

        {/* Content */}
        <div className="relative z-10 flex flex-col sm:flex-row items-stretch gap-6 p-7"
          style={{ minHeight: 300 }}>

          {/* ── Left: Nav pills ── */}
          <div className="flex flex-col gap-2 sm:w-48 flex-shrink-0">
            <p className="text-xs mb-1 uppercase tracking-widest" style={{ color: '#333344', letterSpacing: '0.1em' }}>
              功能模块
            </p>
            {NAV_PILLS.map((pill, i) => (
              <button
                key={pill.label}
                onClick={() => setActive(i)}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left transition-all duration-200"
                style={{
                  background: active === i ? 'rgba(255,215,0,0.10)' : 'rgba(255,255,255,0.03)',
                  border: active === i
                    ? '1px solid rgba(255,215,0,0.28)'
                    : '1px solid rgba(255,255,255,0.05)',
                  color: active === i ? '#FFD700' : '#444455',
                  backdropFilter: 'blur(8px)',
                  transform: active === i ? 'translateX(2px)' : 'none',
                }}>
                <span style={{ color: active === i ? '#FFD700' : '#333344', flexShrink: 0 }}>
                  {pill.icon}
                </span>
                <div>
                  <div className="text-xs font-semibold leading-tight">{pill.label}</div>
                  <div style={{ fontSize: '0.62rem', color: active === i ? 'rgba(255,215,0,0.5)' : '#2a2a3a', lineHeight: 1.3 }}>
                    {pill.sub}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* ── Center: visual text ── */}
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            {/* Animated feature title */}
            <div className="text-xs uppercase tracking-widest mb-3" style={{ color: '#333344' }}>
              {['FLASHCARDS', 'MISTAKE SETS', 'AI GENERATE', 'MOCK EXAM'][active]}
            </div>
            <h3 className="text-2xl font-black mb-2 text-shimmer leading-tight">
              {NAV_PILLS[active].label}
            </h3>
            <p className="text-xs leading-relaxed max-w-48" style={{ color: '#33334a' }}>
              {[
                '上传课件后 AI 自动提炼关键考点，生成双面闪卡，间隔重复记忆法加速掌握。',
                '答题后自动收录错误，针对薄弱知识点重复练习，考前集中攻克。',
                '一键生成选择题、填空题、简答题，覆盖全部章节考点，支持批量导出。',
                '模拟真实考试环境，计时作答、自动评分，还原 UNSW Final Exam 节奏。',
              ][active]}
            </p>

            {/* Progress dots */}
            <div className="flex items-center gap-2 mt-4">
              {NAV_PILLS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className="transition-all duration-200"
                  style={{
                    width: active === i ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: active === i ? '#FFD700' : 'rgba(255,255,255,0.08)',
                  }} />
              ))}
            </div>
          </div>

          {/* ── Right: CTA ── */}
          <div className="flex flex-col items-center justify-center gap-4 sm:w-36 flex-shrink-0">
            <div className="text-center">
              <div className="text-xs font-bold" style={{ color: '#FFD700' }}>立即体验</div>
              <div style={{ fontSize: '0.62rem', color: '#2a2a3a' }}>5 积分 · 随时使用</div>
            </div>

            <Link href="/register"
              className="btn-gold flex items-center gap-2 text-sm w-full justify-center"
              style={{ padding: '12px 20px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              开始复习 <ArrowRight size={14} />
            </Link>

            <button
              onClick={onGuestLogin}
              disabled={guestLoading}
              className="w-full text-xs py-2 rounded-lg transition-all disabled:opacity-40"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: '#444455',
              }}>
              {guestLoading ? '进入中…' : '先试试 →'}
            </button>

            {/* Mini stat */}
            <div className="text-center" style={{ fontSize: '0.6rem', color: '#222233' }}>
              <div style={{ color: '#FFD700', fontSize: '0.75rem', fontWeight: 700 }}>800+</div>
              UNSW 学生在用
            </div>
          </div>
        </div>

        {/* ── Bottom floating tooltip ── */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-3 pointer-events-none">
          <div
            className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: 'rgba(8,8,18,0.88)',
              border: '1px solid rgba(255,215,0,0.18)',
              backdropFilter: 'blur(14px)',
              color: '#666677',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              animation: 'floatBounce 3s ease-in-out infinite',
            }}>
            <span className="pulse-dot" />
            <span>实时更新 · 支持 COMP9517 / COMP9311 / COMP6841 等热门课程</span>
          </div>
        </div>

        {/* Extra bottom padding for tooltip */}
        <div style={{ height: 44 }} />
      </div>

      {/* Placeholder hint */}
      <p className="text-center mt-2" style={{ fontSize: '0.6rem', color: '#1a1a2a' }}>
        可将 /public/campus.jpg（UNSW 彩虹阶梯图）替换为真实校园背景
      </p>

      <style>{`
        @keyframes floatBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}
