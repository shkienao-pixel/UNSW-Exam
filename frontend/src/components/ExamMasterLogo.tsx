'use client'

import React from 'react'

interface ExamMasterLogoProps {
  /** Icon height in px — text scales proportionally */
  height?: number
  /** Show "Exam Master" text label (default true) */
  showText?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * Exam Master brand logo — simplified edition.
 *
 * Mark: small 4-pointed star · clean E (spine + 3 bars) · ascending M peaks
 * Checkmark overlay removed for cleaner look.
 * Gold shifted to warm amber-gold (#D4A843) — less harsh than pure #FFC107.
 */
export default function ExamMasterLogo({
  height = 36,
  showText = true,
  className,
  style,
}: ExamMasterLogoProps) {
  const gap = Math.round(height * 0.25)
  const textSize = Math.round(height * 0.44)
  const GOLD = '#D4A843'

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap,
        lineHeight: 1,
        userSelect: 'none',
        ...style,
      }}
    >
      {/* ── Geometric symbol ── */}
      <svg
        width={height}
        height={height}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        {/* 4-pointed diamond star — compact, top-center */}
        <path
          d="M16 3 L17.1 7.8 L22 9 L17.1 10.2 L16 15 L14.9 10.2 L10 9 L14.9 7.8 Z"
          fill={GOLD}
          opacity={0.95}
        />

        {/* ── E (left half) — spine + 3 clean bars, no checkmark ── */}
        <line x1="3.5" y1="18" x2="3.5" y2="30" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round" />
        <line x1="3.5" y1="18"   x2="11.5" y2="18"   stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" />
        <line x1="3.5" y1="24"   x2="9.5"  y2="24"   stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" />
        <line x1="3.5" y1="30"   x2="11.5" y2="30"   stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" />

        {/* ── Ascending M (right half) — 3 clean rising peaks ── */}
        <path
          d="M16 30 L19.5 21.5 L22.5 27 L26 18.5 L29 23.5"
          stroke={GOLD}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* ── Brand text ── */}
      {showText && (
        <span
          style={{
            color: '#e8e8f0',
            fontWeight: 600,
            fontSize: textSize,
            letterSpacing: '-0.01em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
        >
          Exam Master
        </span>
      )}
    </div>
  )
}
