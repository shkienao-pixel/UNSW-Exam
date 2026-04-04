'use client'

import { useRef, useCallback } from 'react'
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import type { LinkProps } from 'next/link'
import './GlowRing.css'

// ── glow color CSS vars ───────────────────────────────────────────────────
function buildGlowVars(hsl: string, intensity = 1): Record<string, string> {
  const m = hsl.match(/([\d.]+)\s+([\d.]+)%?\s+([\d.]+)%?/)
  const [h, s, l] = m ? [+m[1], +m[2], +m[3]] : [38, 70, 72]
  const base = `${h}deg ${s}% ${l}%`
  const ops  = [100, 60, 50, 40, 30, 20, 10]
  const sfx  = ['', '-60', '-50', '-40', '-30', '-20', '-10']
  const v: Record<string, string> = {}
  ops.forEach((op, i) => {
    v[`--glow-color${sfx[i]}`] = `hsl(${base} / ${Math.min(op * intensity, 100)}%)`
  })
  return v
}

// ── pointer tracking hook ─────────────────────────────────────────────────
function useGlowTracking(ref: React.RefObject<HTMLElement | null>) {
  return useCallback((e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r  = el.getBoundingClientRect()
    const x  = e.clientX - r.left, y = e.clientY - r.top
    const cx = r.width / 2,       cy = r.height / 2
    const dx = x - cx,            dy = y - cy
    const kx = dx ? cx / Math.abs(dx) : Infinity
    const ky = dy ? cy / Math.abs(dy) : Infinity
    const prox = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1)
    let   angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
    if (angle < 0) angle += 360
    el.style.setProperty('--edge-proximity', (prox * 100).toFixed(2))
    el.style.setProperty('--cursor-angle',   `${angle.toFixed(2)}deg`)
  }, [ref])
}

// ── shared glow style builder ─────────────────────────────────────────────
interface GlowProps {
  glowColor?:       string   // HSL: "h s l" e.g. "38 70 72"
  glowRadius?:      number   // outer glow spread px (default 20)
  glowIntensity?:   number   // 0-2 (default 1)
  edgeSensitivity?: number   // lower = glow appears sooner (default 12)
}

function glowStyle(p: GlowProps): CSSProperties {
  return {
    '--glow-padding':      `${p.glowRadius ?? 20}px`,
    '--edge-sensitivity':  p.edgeSensitivity ?? 12,
    ...buildGlowVars(p.glowColor ?? '38 70 72', p.glowIntensity ?? 1),
  } as CSSProperties
}

// ── GlowButton ────────────────────────────────────────────────────────────
export type GlowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & GlowProps & {
  children: ReactNode
}

export function GlowButton({
  children, className = '', style,
  glowColor, glowRadius, glowIntensity, edgeSensitivity,
  ...rest
}: GlowButtonProps) {
  const ref          = useRef<HTMLButtonElement>(null)
  const onPointerMove = useGlowTracking(ref as React.RefObject<HTMLElement>)

  return (
    <button
      ref={ref}
      onPointerMove={onPointerMove}
      className={`glow-ring ${className}`}
      style={{ ...glowStyle({ glowColor, glowRadius, glowIntensity, edgeSensitivity }), ...style }}
      {...rest}
    >
      <span className="glow-ring-light" aria-hidden="true" />
      {children}
    </button>
  )
}

// ── GlowLink ──────────────────────────────────────────────────────────────
export type GlowLinkProps = Omit<LinkProps, 'className' | 'style'> &
  Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'style'> &
  GlowProps & {
    children:   ReactNode
    className?: string
    style?:     CSSProperties
  }

export function GlowLink({
  children, className = '', style, href,
  glowColor, glowRadius, glowIntensity, edgeSensitivity,
  ...rest
}: GlowLinkProps) {
  const ref          = useRef<HTMLAnchorElement>(null)
  const onPointerMove = useGlowTracking(ref as React.RefObject<HTMLElement>)

  return (
    <Link
      ref={ref}
      href={href}
      onPointerMove={onPointerMove}
      className={`glow-ring ${className}`}
      style={{ ...glowStyle({ glowColor, glowRadius, glowIntensity, edgeSensitivity }), ...style }}
      {...rest}
    >
      <span className="glow-ring-light" aria-hidden="true" />
      {children}
    </Link>
  )
}
