'use client'

/**
 * InfiniteArcField — 无限延伸多曲线光轨
 *
 * 左右各 7 条正弦漂移曲线，从顶部无限向下延伸（Canvas vertically tiled）。
 * 每条曲线带 2-4 个流光粒子。
 * Hover 时能量共振：振幅 2.5×，粒子加速，径向高光叠加。
 * 仅在 lg 及以上屏幕显示（hidden lg:block）。
 * prefers-reduced-motion: 渲染静态曲线，无粒子动画。
 */

import { useEffect, useRef, ReactNode } from 'react'

// ── Curve definitions (per-side, mirrored on right) ───────────────────────────
// af   — amplitude fraction (of canvas width half)
// freq — vertical frequency (cycles per pixel)
// ph   — initial phase (radians)
// scrollSpeed — px/s the curve scrolls vertically (creates infinite motion feel)
// strokeW — stroke width
// opacity — base opacity
// nParticles — particles on this curve
// pSpeed  — particle travel speed (0..1 per second)
const CURVE_DEFS = [
  { af: 0.26, freq: 0.0068, ph: 0.00, scrollSpeed: 28, strokeW: 1.8, opacity: 0.54, nParticles: 3, pSpeed: 0.065 },
  { af: 0.16, freq: 0.0110, ph: 1.40, scrollSpeed: 18, strokeW: 0.9, opacity: 0.34, nParticles: 2, pSpeed: 0.095 },
  { af: 0.10, freq: 0.0155, ph: 2.80, scrollSpeed: 38, strokeW: 0.5, opacity: 0.20, nParticles: 2, pSpeed: 0.130 },
  { af: 0.32, freq: 0.0046, ph: 4.20, scrollSpeed: 14, strokeW: 2.4, opacity: 0.30, nParticles: 3, pSpeed: 0.050 },
  { af: 0.08, freq: 0.0200, ph: 0.80, scrollSpeed: 52, strokeW: 0.4, opacity: 0.15, nParticles: 2, pSpeed: 0.160 },
  { af: 0.20, freq: 0.0085, ph: 3.50, scrollSpeed: 22, strokeW: 1.1, opacity: 0.26, nParticles: 2, pSpeed: 0.082 },
  { af: 0.12, freq: 0.0130, ph: 5.80, scrollSpeed: 32, strokeW: 0.7, opacity: 0.18, nParticles: 2, pSpeed: 0.110 },
] as const

// ── Gold palette ──────────────────────────────────────────────────────────────
const COL_MAIN   = '#FFD400'
const COL_BRIGHT = '#FFF6C2'

// ── Easing ────────────────────────────────────────────────────────────────────
function easeInOutSine(t: number) {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

// ── ArcCanvas (one side) ─────────────────────────────────────────────────────
function drawSide(
  ctx: CanvasRenderingContext2D,
  side: 'left' | 'right',
  canvasW: number,
  canvasH: number,
  time: number,
  hoverE: number,           // 0..1 smoothed hover energy
  mouseY: number,           // 0..1 fraction of canvas height
  reduced: boolean,
) {
  const isLeft  = side === 'left'
  // The curve's "center X" — a narrow strip at either edge
  const baseX   = isLeft ? canvasW * 0.12 : canvasW * 0.88
  const halfW   = canvasW * 0.10   // max lateral amplitude space

  // Hover amplifier
  const hAmp = 1 + hoverE * 1.55   // 1x → 2.55x

  for (const def of CURVE_DEFS) {
    const amp      = halfW * def.af * hAmp
    const scrollY  = time * def.scrollSpeed

    // Build path: sample Y from 0..canvasH, computing X each row
    ctx.beginPath()
    const step = 4   // px per sample — good balance perf/smoothness
    for (let py = 0; py <= canvasH; py += step) {
      const wx = amp * Math.sin(def.freq * (py + scrollY) + def.ph)
      const cx = isLeft ? baseX - wx : baseX + wx
      if (py === 0) ctx.moveTo(cx, py)
      else          ctx.lineTo(cx, py)
    }

    // Glow pass (wide, blurred)
    ctx.save()
    ctx.shadowColor  = COL_MAIN
    ctx.shadowBlur   = 8 + hoverE * 12
    ctx.strokeStyle  = COL_MAIN
    ctx.lineWidth    = def.strokeW * 6
    ctx.globalAlpha  = def.opacity * 0.18 * (1 + hoverE * 0.6)
    ctx.stroke()
    ctx.restore()

    // Main stroke
    // Gold gradient: brighter near mouse Y
    const gradMidY = mouseY * canvasH
    const grad     = ctx.createLinearGradient(0, 0, 0, canvasH)
    grad.addColorStop(0,    'rgba(106,74,0,0.28)')
    grad.addColorStop(Math.max(0.01, Math.min(0.99, (gradMidY - canvasH * 0.25) / canvasH)), 'rgba(106,74,0,0.28)')
    grad.addColorStop(Math.max(0.01, Math.min(0.99, gradMidY / canvasH)),  '#FFD400')
    grad.addColorStop(Math.max(0.01, Math.min(0.99, (gradMidY + canvasH * 0.25) / canvasH)), 'rgba(106,74,0,0.28)')
    grad.addColorStop(1,    'rgba(106,74,0,0.28)')

    ctx.save()
    ctx.strokeStyle = grad
    ctx.lineWidth   = def.strokeW
    ctx.globalAlpha = def.opacity * (0.55 + hoverE * 0.35)
    ctx.stroke()
    ctx.restore()

    // Thin bright center wire
    ctx.save()
    ctx.strokeStyle = 'rgba(255,250,190,0.35)'
    ctx.lineWidth   = def.strokeW * 0.40
    ctx.globalAlpha = def.opacity * 0.45
    ctx.stroke()
    ctx.restore()

    // ── Particles ────────────────────────────────────────────────────────────
    if (reduced) continue

    const baseSpeed = def.pSpeed * (1 + hoverE * 1.8)

    for (let pi = 0; pi < def.nParticles; pi++) {
      // Each particle has a stable offset phase
      const seedOffset = pi / def.nParticles
      // Current position 0..1 along the curve (using time as driver)
      const tPos = ((time * baseSpeed * (0.7 + pi * 0.18) + seedOffset) % 1 + 1) % 1
      const py   = tPos * canvasH
      const wx   = amp * Math.sin(def.freq * (py + scrollY) + def.ph)
      const px   = isLeft ? baseX - wx : baseX + wx

      const r    = (1.4 + def.strokeW * 0.8) * (1 + hoverE * 0.7)
      const glow = 6 + hoverE * 14
      const col  = pi === 0 ? COL_BRIGHT : COL_MAIN

      ctx.save()
      ctx.globalAlpha = (0.60 + hoverE * 0.35) * def.opacity * 1.6
      ctx.shadowColor = col
      ctx.shadowBlur  = glow
      ctx.fillStyle   = col
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // ── Radial mouse-Y highlight overlay ─────────────────────────────────────
  if (hoverE > 0.05) {
    const my = mouseY * canvasH
    const rad = ctx.createRadialGradient(baseX, my, 0, baseX, my, canvasH * 0.55)
    rad.addColorStop(0,   `rgba(255,212,0,${0.06 * hoverE})`)
    rad.addColorStop(0.4, `rgba(255,212,0,${0.02 * hoverE})`)
    rad.addColorStop(1,   'rgba(255,212,0,0)')
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = rad
    ctx.fillRect(0, 0, canvasW, canvasH)
    ctx.restore()
  }
}

// ── InfiniteArcSide component (canvas per side) ───────────────────────────────
interface SideProps {
  side: 'left' | 'right'
  hoveringRef: React.RefObject<boolean>
  mouseFracRef: React.RefObject<number>
  reduced: boolean
}

function InfiniteArcSide({ side, hoveringRef, mouseFracRef, reduced }: SideProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafId = 0
    let lastTs = performance.now()
    let time = 0
    let hoverE = 0            // smoothed hover energy

    function resize() {
      const parent = canvas!.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      const w   = parent.clientWidth
      const h   = parent.clientHeight
      canvas!.width  = Math.round(w * dpr)
      canvas!.height = Math.round(h * dpr)
      canvas!.style.width  = `${w}px`
      canvas!.style.height = `${h}px`
    }

    function frame(ts: number) {
      const dt  = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs    = ts
      time     += dt

      const isHov = hoveringRef.current ?? false
      // Exponential smoothing for hover energy
      const target = isHov ? 1 : 0
      hoverE += (target - hoverE) * (1 - Math.exp(-dt * (isHov ? 5 : 2.8)))

      const dpr  = window.devicePixelRatio || 1
      const cw   = canvas!.width  / dpr
      const ch   = canvas!.height / dpr
      const ctx  = canvas!.getContext('2d')!
      ctx.clearRect(0, 0, canvas!.width, canvas!.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      drawSide(ctx, side, cw, ch, time, hoverE, mouseFracRef.current ?? 0.5, reduced)

      ctx.restore()
      rafId = requestAnimationFrame(frame)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement!)
    resize()
    rafId = requestAnimationFrame(frame)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, reduced])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{ display: 'block' }}
    />
  )
}

// ── InfiniteArcField (public API) ─────────────────────────────────────────────

interface InfiniteArcFieldProps {
  children?: ReactNode
  className?: string
  style?: React.CSSProperties
}

export default function InfiniteArcField({ children, className = '', style }: InfiniteArcFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hoveringRef  = useRef(false)
  const mouseFracRef = useRef(0.5)

  // prefers-reduced-motion
  const reduced = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

  function onEnter() { hoveringRef.current = true  }
  function onLeave() { hoveringRef.current = false }
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
      {/* Left side */}
      <div className="absolute hidden lg:block pointer-events-none"
        style={{ left: -90, top: 0, bottom: 0, width: 180, zIndex: 0 }}>
        <InfiniteArcSide
          side="left"
          hoveringRef={hoveringRef as React.RefObject<boolean>}
          mouseFracRef={mouseFracRef as React.RefObject<number>}
          reduced={reduced}
        />
      </div>

      {/* Right side */}
      <div className="absolute hidden lg:block pointer-events-none"
        style={{ right: -90, top: 0, bottom: 0, width: 180, zIndex: 0 }}>
        <InfiniteArcSide
          side="right"
          hoveringRef={hoveringRef as React.RefObject<boolean>}
          mouseFracRef={mouseFracRef as React.RefObject<number>}
          reduced={reduced}
        />
      </div>

      {children}
    </div>
  )
}
