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
 * Exam Master brand logo.
 *
 * Geometric mark:
 *   – 4-pointed diamond star (top-center)
 *   – Stylised E with checkmark (left half)
 *   – Ascending M — rising zigzag peaks (right half)
 *
 * All drawn in gold (#FFC107) on transparent background.
 * Text "Exam Master" is rendered in bold white to the right.
 */
export default function ExamMasterLogo({
  height = 36,
  showText = true,
  className,
  style,
}: ExamMasterLogoProps) {
  const gap = Math.round(height * 0.27)
  const textSize = Math.round(height * 0.46)

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
      {/* ── Geometric symbol ────────────────────────────────────────────── */}
      <svg
        width={height}
        height={height}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        {/* 4-pointed diamond star — top center */}
        <path
          d="M16 2 L17.3 7.6 L23 9 L17.3 10.4 L16 16 L14.7 10.4 L9 9 L14.7 7.6 Z"
          fill="#FFC107"
        />

        {/* ── E (left half) ── */}
        {/* Vertical spine */}
        <line x1="3" y1="17.5" x2="3" y2="30" stroke="#FFC107" strokeWidth="2.4" strokeLinecap="round" />
        {/* Top bar */}
        <line x1="3" y1="17.5" x2="11.5" y2="17.5" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" />
        {/* Middle bar (slightly shorter) */}
        <line x1="3" y1="23.8" x2="10" y2="23.8" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" />
        {/* Bottom bar */}
        <line x1="3" y1="30" x2="11.5" y2="30" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" />

        {/* Checkmark overlaid on E (对勾特征) */}
        <path
          d="M8 21.5 L10.5 25.5 L16 18"
          stroke="#FFC107"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* ── Ascending M (right half) ── */}
        {/* Peaks rise from left to right — represents improvement / mastery */}
        <path
          d="M16 30 L19.5 21 L22.5 26.5 L26 18 L29.5 23"
          stroke="#FFC107"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* ── Brand text ──────────────────────────────────────────────────── */}
      {showText && (
        <span
          style={{
            color: '#ffffff',
            fontWeight: 700,
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
