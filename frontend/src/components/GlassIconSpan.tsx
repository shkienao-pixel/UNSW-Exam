'use client'

import { useState } from 'react'

/**
 * GlassIconSpan — react-bits GlassIcons 风格的图标容器
 * 悬停时：玻璃态放大 + 彩色辉光 + 内部高光反射
 */
export default function GlassIconSpan({
  children,
  tint,
  bg,
  size = 'md',
  className = '',
}: {
  children: React.ReactNode
  tint: string
  bg: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const [hovered, setHovered] = useState(false)

  const dim = size === 'sm' ? { w: 28, h: 28, r: 10 } : { w: 32, h: 32, r: 12 }

  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex flex-shrink-0 items-center justify-center ${className}`}
      style={{
        width: dim.w,
        height: dim.h,
        borderRadius: dim.r,
        color: tint,
        background: hovered
          ? bg.replace(/[\d.]+\)$/, '0.22)')
          : bg,
        border: hovered
          ? `1px solid ${tint}55`
          : '1px solid rgba(255,255,255,0.07)',
        boxShadow: hovered
          ? `0 0 18px ${tint}44, 0 4px 14px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18)`
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
        transform: hovered ? 'scale(1.13) translateY(-1px)' : 'scale(1)',
        backdropFilter: hovered ? 'blur(8px)' : 'none',
        WebkitBackdropFilter: hovered ? 'blur(8px)' : 'none',
        transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        willChange: 'transform',
        cursor: 'pointer',
      }}
    >
      {children}
    </span>
  )
}
