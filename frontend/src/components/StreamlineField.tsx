'use client'

/**
 * StreamlineField — 横向流线（streamlines）能量场
 *
 * 每条线从画布一侧无限延伸，在靠近卡片侧（focusX）发生
 * "汇聚弯折"（Lorentzian 收敛函数 + 双层正弦扰动）。
 *
 * y(x,t) = baseY
 *         + bend(x)                              ← 势场弯折
 *         + A₁·sin(x·k₁ + φ₁ + t·ω₁)            ← 主正弦扰动
 *         + A₂·sin(x·k₂ + φ₂ + t·ω₂)            ← 副正弦扰动
 *
 * bend(x) = -(baseY - centerY) · convergence / (1 + ((x-focusX)/falloff)²)
 * → 线条在 focusX 处向画布垂直中心汇聚，远端自然散开
 *
 * props:
 *   side         — 'left' | 'right' | 'both'
 *   isHover      — 父容器 hover 状态（ref驱动，不触发re-render）
 *   mousePosRef  — 可选；指向 {x,y}(0-1) 的 ref，ref更新不触发re-render
 *   accent       — 主色，默认 #FFD400
 *   density      — 线条数量，默认 14
 *   speed        — 基础速度倍率，默认 0.8
 */

import { useEffect, useRef } from 'react'

const OVERSCAN = 80   // px beyond canvas edges

// ── Line definition (immutable after creation) ────────────────────────────────
interface LineDef {
  baseYFrac: number            // 0-1, fraction of canvas height
  amp1: number; k1: number; ph1: number; w1: number   // primary sine
  amp2: number; k2: number; ph2: number; w2: number   // secondary sine
  opacity: number
  strokeW: number
}

// ── Deterministic LCG RNG (stable per density value) ─────────────────────────
function makeLCG(seed: number) {
  let s = seed
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── Parsed accent RGB ─────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(',')
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface StreamlineFieldProps {
  side:         'left' | 'right' | 'both'
  isHoverRef:   React.RefObject<boolean>
  mousePosRef?: React.RefObject<{ x: number; y: number } | undefined>
  accent?:      string
  density?:     number
  speed?:       number
  className?:   string
}

export default function StreamlineField({
  side,
  isHoverRef,
  mousePosRef,
  accent    = '#FFD400',
  density   = 14,
  speed     = 0.8,
  className = '',
}: StreamlineFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr     = window.devicePixelRatio || 1
    const rgb     = hexToRgb(accent)
    const isMob   = () => window.matchMedia('(max-width: 640px)').matches

    let W      = 0
    let H      = 0
    let rafId  = 0
    let lastTs = performance.now()
    let time   = 0
    let hoverE = 0
    let lines: LineDef[] = []

    // ── Build lines (deterministic per density) ───────────────────────────────
    function buildLines() {
      const n   = density
      const rng = makeLCG(42 + n * 31)

      lines = Array.from({ length: n }, (_, i) => {
        const t       = i / Math.max(n - 1, 1)
        const yJitter = (rng() - 0.5) * 0.04
        return {
          baseYFrac: Math.max(0.03, Math.min(0.97, 0.04 + t * 0.92 + yJitter)),
          amp1: 3   + rng() * 8,
          k1:   0.006 + rng() * 0.010,
          ph1:  rng() * Math.PI * 2,
          w1:   speed * (0.55 + rng() * 0.50),
          amp2: 1.5 + rng() * 4.5,
          k2:   0.016 + rng() * 0.018,
          ph2:  rng() * Math.PI * 2,
          w2:   speed * (0.30 + rng() * 0.35),
          opacity: 0.20 + rng() * 0.24,
          strokeW: 0.30 + rng() * 0.50,
        }
      })
    }

    // ── y(x, t) ───────────────────────────────────────────────────────────────
    function getY(line: LineDef, px: number, t: number, hE: number): number {
      const baseY   = line.baseYFrac * H
      const centerY = H * 0.5

      // focusX: where lines converge (card-adjacent edge of this canvas)
      const focusX = side === 'right' ? 0 : side === 'left' ? W : W * 0.5
      const falloff = W * 0.52
      const dx      = (px - focusX) / falloff
      const conv    = 0.62 * (1 + hE * 0.65)
      const bend    = -(baseY - centerY) * conv / (1 + dx * dx)

      // Sine perturbation — amplitude increases with hover
      const hAmp = 1 + hE * 1.85
      const s1   = line.amp1 * hAmp * Math.sin(line.k1 * px + line.ph1 + t * line.w1)
      const s2   = line.amp2 * hAmp * Math.sin(line.k2 * px + line.ph2 + t * line.w2)

      return baseY + bend + s1 + s2
    }

    // ── Resize ────────────────────────────────────────────────────────────────
    function resize() {
      const parent = canvas!.parentElement!
      W = parent.clientWidth
      H = parent.clientHeight
      if (!W || !H) return
      canvas!.width        = Math.round(W * dpr)
      canvas!.height       = Math.round(H * dpr)
      canvas!.style.width  = `${W}px`
      canvas!.style.height = `${H}px`
    }

    // ── Render loop ───────────────────────────────────────────────────────────
    function frame(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs  = ts
      time   += dt

      const isHov = isHoverRef.current ?? false
      hoverE += ((isHov ? 1 : 0) - hoverE) * (1 - Math.exp(-dt * (isHov ? 5.5 : 2.5)))

      if (!W || !H) { rafId = requestAnimationFrame(frame); return }

      const mob = isMob()
      const ctx = canvas!.getContext('2d')!
      const mp  = mousePosRef?.current

      ctx.clearRect(0, 0, canvas!.width, canvas!.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      // 粒子间距：桌面 9px，移动 16px
      const dotStep = mob ? 16 : 9

      for (const line of lines) {
        // Alpha boost for lines near mouse Y
        let boost = 1
        if (mp && !mob) {
          const ly = line.baseYFrac * H
          const my = mp.y * H
          const dY = Math.abs(ly - my) / H
          boost    = 1 + Math.max(0, 1 - dY * 5) * 0.45
        }
        const baseAlpha = line.opacity * (1 + hoverE * 0.55) * boost

        // ── 沿曲线绘制粒子点 ────────────────────────────────────────────────
        for (let px = -OVERSCAN; px <= W + OVERSCAN; px += dotStep) {
          const py = getY(line, px, time, hoverE)

          // 两个正弦相乘：非均匀、有机感的尺寸/透明度噪声
          const n = Math.sin(px * 0.09 + time * 0.28 + line.ph1)
                  * Math.sin(px * 0.053 + time * 0.17 + line.ph2 + 1.7)
          const t = n * 0.5 + 0.5   // 0..1

          const dotR = Math.max(0.22, line.strokeW * (0.35 + t * 1.0) * (1 + hoverE * 0.3))
          const dotA = baseAlpha * (0.25 + t * 0.75)

          ctx.beginPath()
          ctx.arc(px, py, dotR, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${rgb},${dotA.toFixed(3)})`
          ctx.fill()
        }
      }

      ctx.restore()
      rafId = requestAnimationFrame(frame)
    }

    buildLines()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement!)
    resize()
    rafId = requestAnimationFrame(frame)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, density, speed, accent])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ display: 'block' }}
    />
  )
}
