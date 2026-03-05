'use client'

/**
 * LiquidGlass — 三层结构液态玻璃卡片
 *
 * Layer A  glass base     backdrop-blur + semi-transparent bg
 * Layer B  refraction     radial/linear gradient, mix-blend-screen
 * Layer C  rim light      顶部边缘高光 + 内阴影（提供玻璃厚度感）
 * Layer D  caustics       慢速流动光纹（可选，默认开启）
 * Layer E  cursor spot    鼠标跟随内部高光
 */

import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { ReactNode, useRef } from 'react'

interface LiquidGlassProps {
  children: ReactNode
  className?: string
  /** 外部 padding，默认 p-7 */
  padding?: string
  /** 圆角，默认 20px */
  radius?: number
  /** 滚动入场延迟（s） */
  delay?: number
  /** 是否显示 caustics 流动光纹 */
  caustics?: boolean
  /** 是否启用鼠标高光跟随 */
  spotlight?: boolean
  /** 自定义 whileHover — 传 false 禁用 */
  hover?: boolean
}

export default function LiquidGlass({
  children,
  className = '',
  padding = 'p-7',
  radius = 20,
  delay = 0,
  caustics = true,
  spotlight = true,
  hover = true,
}: LiquidGlassProps) {
  const ref = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  /* 鼠标位置 → 动态 spotlight 渐变 */
  const spotBg = useMotionTemplate`radial-gradient(
    160px circle at ${mouseX}px ${mouseY}px,
    rgba(255,212,0,0.07) 0%,
    transparent 68%
  )`

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || !spotlight) return
    const r = ref.current.getBoundingClientRect()
    mouseX.set(e.clientX - r.left)
    mouseY.set(e.clientY - r.top)
  }

  const br = `${radius}px`

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay }}
      whileHover={hover ? { y: -4, transition: { type: 'spring', stiffness: 380, damping: 28 } } : undefined}
      whileTap={hover ? { scale: 0.984 } : undefined}
      className={`relative overflow-hidden ${padding} ${className}`}
      style={{
        borderRadius: br,
        /* border 放在 wrapper 上，会渲染在所有 absolute 层之上 */
        border: '1px solid var(--accent-border)',
        /* 大范围柔阴影（环境阴影，不硬） */
        boxShadow: `
          0 1px 0 rgba(255,255,255,0.06) inset,
          0 20px 60px rgba(0,0,0,0.48),
          0  4px 16px rgba(0,0,0,0.32)
        `,
      }}
    >

      {/* ── Layer A: glass base ── */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, borderRadius: br,
          background: 'rgba(255,255,255,0.038)',
          backdropFilter: 'blur(22px) saturate(180%)',
          WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        }}
      />

      {/* ── Layer B: refraction overlay ── */}
      {/* 模拟玻璃内部折射：顶部亮、底部略暗、斜向渐变 */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, borderRadius: br, pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 90% 55% at 50% -5%,  rgba(255,255,255,0.07) 0%, transparent 62%),
            linear-gradient(175deg, rgba(255,255,255,0.05) 0%, rgba(255,212,0,0.015) 40%, transparent 65%)
          `,
          mixBlendMode: 'screen',
        }}
      />

      {/* ── Layer C: rim light (top edge + inner shadow) ── */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          borderRadius: `${br} ${br} 0 0`,
          background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.11) 28%, rgba(255,212,0,0.20) 50%, rgba(255,255,255,0.11) 72%, transparent 95%)',
          pointerEvents: 'none',
        }}
      />
      {/* Inner shadow on left/bottom edge for glass depth */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, borderRadius: br, pointerEvents: 'none',
          boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.14)',
        }}
      />

      {/* ── Layer D: caustics (flowing light, optional) ── */}
      {caustics && (
        <div
          aria-hidden
          className="caustics-layer"
          style={{
            position: 'absolute', inset: 0, borderRadius: br,
            pointerEvents: 'none', opacity: 0.08,
          }}
        />
      )}

      {/* ── Layer E: cursor spotlight ── */}
      {spotlight && (
        <motion.div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, borderRadius: br,
            background: spotBg,
            pointerEvents: 'none',
            mixBlendMode: 'screen',
          }}
        />
      )}

      {/* ── Content ── */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        {children}
      </div>
    </motion.div>
  )
}
