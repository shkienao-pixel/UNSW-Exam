'use client'

import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { ReactNode, useRef } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  delay?: number
  /** 是否启用鼠标高光扫过效果 */
  spotlight?: boolean
}

export default function GlassCard({
  children,
  className = '',
  delay = 0,
  spotlight = true,
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const background = useMotionTemplate`
    radial-gradient(180px circle at ${mouseX}px ${mouseY}px,
      rgba(255,215,0,0.055) 0%,
      transparent 70%)
  `

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || !spotlight) return
    const rect = ref.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay }}
      whileHover={{ y: -3, transition: { type: 'spring', stiffness: 400, damping: 28 } }}
      whileTap={{ scale: 0.985 }}
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,215,0,0.08)',
        borderTopColor: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
        cursor: 'default',
      }}
    >
      {/* Hover spotlight */}
      {spotlight && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background }}
        />
      )}

      {/* Top edge highlight */}
      <div
        className="pointer-events-none absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.18) 50%, transparent 100%)',
        }}
      />

      <div className="relative z-10">{children}</div>
    </motion.div>
  )
}
