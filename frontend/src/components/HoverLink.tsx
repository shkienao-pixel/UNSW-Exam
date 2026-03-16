'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function HoverLink({
  href, children, style, className, onClick,
}: {
  href: string
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link
      href={href}
      className={className}
      style={{
        ...style,
        transform: hovered ? 'scale(1.025)' : 'scale(1)',
        transition: 'transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, color 0.18s ease',
        display: 'flex',
        willChange: 'transform',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}
