'use client'

/**
 * FluidSpotlight — 双层液态鼠标跟随高光
 *
 * 内核（100px）：快速跟随，定位精确
 * 外晕（480px）：慢速跟随，产生液体拖拽感
 *
 * 两层 spring 参数不同 → 外层永远"滞后"内层 → 液态流动感
 *
 * 自动关闭：prefers-reduced-motion / touch device
 */

import { useEffect, useRef, useState } from 'react'
import { useMotionValue, useSpring, motion } from 'framer-motion'

export default function FluidSpotlight() {
  const [active, setActive] = useState(false)
  const rawX = useMotionValue(-9999)
  const rawY = useMotionValue(-9999)

  /* 内核：快速响应 */
  const innerX = useSpring(rawX, { stiffness: 280, damping: 24, mass: 0.7 })
  const innerY = useSpring(rawY, { stiffness: 280, damping: 24, mass: 0.7 })

  /* 外晕：慢速跟随，产生流体滞后感 */
  const outerX = useSpring(rawX, { stiffness: 88,  damping: 18, mass: 1.2 })
  const outerY = useSpring(rawY, { stiffness: 88,  damping: 18, mass: 1.2 })

  const rafRef = useRef<number>(0)

  useEffect(() => {
    const mq    = window.matchMedia('(prefers-reduced-motion: reduce)')
    const touch = window.matchMedia('(hover: none)')
    if (mq.matches || touch.matches) return

    function onMove(e: MouseEvent) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rawX.set(e.clientX)
        rawY.set(e.clientY)
        if (!active) setActive(true)
      })
    }
    function onLeave() { setActive(false) }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(rafRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!active) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 1, isolation: 'isolate' }}
    >
      {/* 外晕 — 大范围柔光，慢速跟随 */}
      <motion.div
        style={{
          position: 'absolute',
          x: outerX,
          y: outerY,
          translateX: '-50%',
          translateY: '-50%',
          width:  520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,212,0,0.030) 0%, rgba(255,212,0,0.008) 45%, transparent 72%)',
          willChange: 'transform',
          mixBlendMode: 'screen',
        }}
      />

      {/* 内核 — 小范围精确高光，快速跟随 */}
      <motion.div
        style={{
          position: 'absolute',
          x: innerX,
          y: innerY,
          translateX: '-50%',
          translateY: '-50%',
          width:  110,
          height: 110,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,220,60,0.055) 0%, rgba(255,212,0,0.018) 55%, transparent 80%)',
          willChange: 'transform',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  )
}
