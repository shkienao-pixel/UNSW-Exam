'use client'

/**
 * ArcGlow — 科技曲线光轨
 *
 * 左右两侧各一条优美三次贝塞尔 S 曲线，包含：
 *   A) 主光轨：金色渐变 stroke
 *   B) 外晕光：同路径宽 stroke + feGaussianBlur
 *   C) 流光粒子：沿路径移动的字符粒子（Canvas overlay）
 *
 * Hover：多倍频 spring 抖动，模拟"能量共振"
 * 鼠标 Y 位置：渐变高光跟随
 * prefers-reduced-motion：停止抖动与粒子，仅保留静态曲线
 */

import { useEffect, useRef, useId, ReactNode } from 'react'
import { motion, useReducedMotion, useSpring } from 'framer-motion'

// ── SVG paths (viewBox 0 0 110 300) ──────────────────────────────────────────
// 左侧：S 曲线从顶端右侧(95,0) 向左摆出再回来 → 产生优美弧度
const PATH_LEFT  = 'M 95 0 C 8 55, 106 142, 6 195 S 98 268, 95 300'
// 右侧：镜像
const PATH_RIGHT = 'M 15 0 C 102 55, 4 142, 104 195 S 12 268, 15 300'

const N_DESKTOP = 5   // desktop particles per side
const N_MOBILE  = 0   // mobile: no particles (perf)

// ── Multi-octave smooth oscillator ───────────────────────────────────────────
function osc(t: number, seed = 0) {
  return (
    Math.sin(t * 1.1 + seed)          * 0.54 +
    Math.sin(t * 2.9 + seed * 1.77)   * 0.30 +
    Math.sin(t * 5.3 + seed * 0.62)   * 0.16
  )
}

// ── Stable DOM-friendly ID ────────────────────────────────────────────────────
function useSvgId(prefix: string) {
  const raw = useId()
  return `${prefix}${raw.replace(/[^a-zA-Z0-9]/g, '')}`
}

// ── ArcSide ───────────────────────────────────────────────────────────────────
interface ArcSideProps {
  side: 'left' | 'right'
  hoveringRef: React.RefObject<boolean>
  mouseFracRef: React.RefObject<number>
  reduced: boolean
}

function ArcSide({ side, hoveringRef, mouseFracRef, reduced }: ArcSideProps) {
  const uid        = useSvgId(`ag${side}`)
  const isLeft     = side === 'left'
  const pathD      = isLeft ? PATH_LEFT : PATH_RIGHT

  /* DOM refs (direct manipulation, no re-render) */
  const pathRef      = useRef<SVGPathElement>(null)
  const glowRef      = useRef<SVGPathElement>(null)
  const midStopRef   = useRef<SVGStopElement>(null)
  const circleRefs   = useRef<(SVGCircleElement | null)[]>([])

  /* Per-particle progress (0-1) */
  const tArr   = useRef<number[]>([])
  const clock  = useRef(0)
  const raf    = useRef(0)

  /* Spring-driven shake — framer-motion MotionValues */
  const shakeX = useSpring(0, { stiffness: 155, damping: 13, mass: 0.85 })
  const shakeY = useSpring(0, { stiffness: 195, damping: 19, mass: 0.75 })
  const shakeR = useSpring(0, { stiffness: 138, damping: 11, mass: 0.92 })

  /* Detect mobile */
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  const N = isMobile ? N_MOBILE : N_DESKTOP

  useEffect(() => {
    /* Initialise particle progress values */
    tArr.current = Array.from({ length: N }, (_, i) => i / Math.max(N, 1))
    circleRefs.current = Array(N).fill(null)
  }, [N])

  useEffect(() => {
    if (reduced) return

    let last = performance.now()

    const frame = (now: number) => {
      const dt  = Math.min((now - last) / 1000, 0.05)
      last  = now
      clock.current += dt

      const isHov = hoveringRef.current ?? false
      const t     = clock.current

      /* ── Shake targets ── */
      const sp   = isHov ? 1.85 : 0.32
      shakeX.set(osc(t * sp, 0.0) * (isHov ? 7  : 1.8))
      shakeY.set(osc(t * sp, 4.3) * (isHov ? 9  : 3.5))
      shakeR.set(osc(t * sp, 8.6) * (isHov ? 1.3 : 0.38))

      /* ── Gradient mid-stop follows mouse Y ── */
      midStopRef.current?.setAttribute('offset', `${Math.round((mouseFracRef.current ?? 0.5) * 100)}%`)

      /* ── Glow opacity ── */
      if (glowRef.current) {
        glowRef.current.style.opacity = isHov ? '0.26' : '0.12'
      }

      /* ── Particles ── */
      const path = pathRef.current
      if (path && N > 0) {
        const len       = path.getTotalLength()
        const baseSpeed = isHov ? 0.095 : 0.038

        tArr.current = tArr.current.map((tv, i) => {
          const next = (tv + baseSpeed * (0.65 + i * 0.13) * dt) % 1
          const pt   = path.getPointAtLength(next * len)
          const el   = circleRefs.current[i]
          if (el) {
            el.setAttribute('cx', String(pt.x.toFixed(2)))
            el.setAttribute('cy', String(pt.y.toFixed(2)))
            const r = isHov ? 2.9 + Math.sin(t * 4 + i * 1.6) * 0.45 : 2.1
            el.setAttribute('r', r.toFixed(2))
            el.style.opacity = isHov ? '0.90' : '0.58'
          }
          return next
        })
      }

      raf.current = requestAnimationFrame(frame)
    }

    raf.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, N])

  return (
    /* Outer: absolute position */
    <div
      className="absolute hidden lg:block pointer-events-none"
      style={{
        [isLeft ? 'left' : 'right']: -10,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 110,
        height: 300,
        overflow: 'visible',
      }}
    >
      {/* Inner: spring shake */}
      <motion.div
        style={{
          width: '100%',
          height: '100%',
          x: shakeX,
          y: shakeY,
          rotate: shakeR,
          originX: isLeft ? 1 : 0,
          originY: 0.5,
        }}
      >
        <svg
          width="110" height="300"
          viewBox="0 0 110 300"
          style={{ overflow: 'visible' }}
          aria-hidden
        >
          <defs>
            {/* Gold gradient: dark-amber → bright-accent → dark-amber */}
            {/* Mid-stop offset shifts with mouse Y */}
            <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#6A4A00" stopOpacity="0.30" />
              <stop ref={midStopRef} offset="50%" stopColor="#FFD400" stopOpacity="0.94" />
              <stop offset="100%" stopColor="#6A4A00" stopOpacity="0.30" />
            </linearGradient>

            {/* Outer glow blur */}
            <filter id={`bl${uid}`} x="-120%" y="-40%" width="340%" height="180%">
              <feGaussianBlur stdDeviation="8" />
            </filter>

            {/* Particle glow */}
            <filter id={`pg${uid}`} x="-400%" y="-400%" width="900%" height="900%">
              <feGaussianBlur stdDeviation="2.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ── B) Outer glow (wide + blurred) ── */}
          <path
            ref={glowRef}
            d={pathD}
            fill="none"
            stroke={`url(#g${uid})`}
            strokeWidth={18}
            opacity={0.12}
            filter={`url(#bl${uid})`}
            style={{ transition: 'opacity 0.55s ease', willChange: 'opacity' }}
          />

          {/* ── A) Main arc ── */}
          <path
            ref={pathRef}
            d={pathD}
            fill="none"
            stroke={`url(#g${uid})`}
            strokeWidth={2.2}
            opacity={0.56}
            strokeLinecap="round"
          />

          {/* Thin bright center line (gives "metal wire" feel) */}
          <path
            d={pathD}
            fill="none"
            stroke="rgba(255,250,190,0.38)"
            strokeWidth={0.7}
            opacity={0.48}
            strokeLinecap="round"
          />

          {/* ── C) Particles ── */}
          {Array.from({ length: N }, (_, i) => (
            <circle
              key={i}
              ref={el => { circleRefs.current[i] = el }}
              cx="-200" cy="-200" r="2"
              fill={i === 0 ? '#FFFACC' : '#FFD400'}
              filter={`url(#pg${uid})`}
            />
          ))}
        </svg>
      </motion.div>
    </div>
  )
}

// ── ArcGlow (public API) ──────────────────────────────────────────────────────

interface ArcGlowProps {
  children?: ReactNode
  className?: string
  style?: React.CSSProperties
}

export default function ArcGlow({ children, className = '', style }: ArcGlowProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const hoveringRef   = useRef(false)
  const mouseFracRef  = useRef(0.5)
  const reduced       = useReducedMotion() ?? false

  function onEnter()  { hoveringRef.current = true  }
  function onLeave()  { hoveringRef.current = false }
  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!containerRef.current) return
    const r = containerRef.current.getBoundingClientRect()
    mouseFracRef.current = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseMove={onMove}
    >
      <ArcSide
        side="left"
        hoveringRef={hoveringRef as React.RefObject<boolean>}
        mouseFracRef={mouseFracRef as React.RefObject<number>}
        reduced={reduced}
      />
      <ArcSide
        side="right"
        hoveringRef={hoveringRef as React.RefObject<boolean>}
        mouseFracRef={mouseFracRef as React.RefObject<number>}
        reduced={reduced}
      />
      {children}
    </div>
  )
}
