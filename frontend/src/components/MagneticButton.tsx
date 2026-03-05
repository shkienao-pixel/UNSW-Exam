'use client'

import { motion, useMotionValue, useSpring } from 'framer-motion'
import { ReactNode, useRef } from 'react'

interface MagneticButtonProps {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  disabled?: boolean
  /** 磁吸强度 0-1，默认 0.3 */
  strength?: number
  as?: 'button' | 'a'
  href?: string
}

export default function MagneticButton({
  children,
  className = '',
  style,
  onClick,
  disabled,
  strength = 0.28,
  as = 'button',
  href,
}: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null)

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)

  const x = useSpring(rawX, { stiffness: 320, damping: 22, mass: 0.6 })
  const y = useSpring(rawY, { stiffness: 320, damping: 22, mass: 0.6 })

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || disabled) return
    const rect = ref.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    rawX.set((e.clientX - cx) * strength)
    rawY.set((e.clientY - cy) * strength)
  }

  function handleMouseLeave() {
    rawX.set(0)
    rawY.set(0)
  }

  const tapScale = disabled ? 1 : 0.955
  const tapTransition = { type: 'spring' as const, stiffness: 380, damping: 24 }

  return (
    <div ref={ref} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} className="inline-block">
      {as === 'a' ? (
        <motion.a
          href={href ?? '#'}
          onClick={onClick}
          className={className}
          style={{ ...style, x, y }}
          whileTap={{ scale: tapScale }}
          transition={tapTransition}
        >
          {children}
        </motion.a>
      ) : (
        <motion.button
          onClick={onClick}
          disabled={disabled}
          className={className}
          style={{ ...style, x, y }}
          whileTap={{ scale: tapScale }}
          transition={tapTransition}
        >
          {children}
        </motion.button>
      )}
    </div>
  )
}
