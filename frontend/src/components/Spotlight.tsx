'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Cursor spotlight — 鼠标移动时产生柔和圆形高光
 * 在移动端和 prefers-reduced-motion 时自动关闭
 */
export default function Spotlight() {
  const [pos, setPos] = useState({ x: -1000, y: -1000 })
  const [visible, setVisible] = useState(false)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    // 移动端 or 降级运动偏好 → 不渲染
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const touch = window.matchMedia('(hover: none)')
    if (mq.matches || touch.matches) return

    function onMove(e: MouseEvent) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        setPos({ x: e.clientX, y: e.clientY })
        setVisible(true)
      })
    }
    function onLeave() { setVisible(false) }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{ mixBlendMode: 'normal' }}
    >
      <div
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          transform: 'translate(-50%, -50%)',
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,215,0,0.028) 0%, transparent 65%)',
          pointerEvents: 'none',
          willChange: 'left, top',
          transition: 'left 0.08s linear, top 0.08s linear',
        }}
      />
    </div>
  )
}
