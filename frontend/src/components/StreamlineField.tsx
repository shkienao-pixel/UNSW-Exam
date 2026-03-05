'use client'

/**
 * StreamlineField — 横向无限延伸多条流线能量场
 *
 * 每条线从 -OVERSCAN 到 W+OVERSCAN 横向绘制，y 由：
 *   y(x,t) = baseY + bend(x) + A₁·sin(k₁x+φ₁+t·ω₁) + A₂·sin(k₂x+φ₂+t·ω₂)
 *
 * bend(x) = convergence × (centerY – baseY) × gauss(x, focusX, σ)
 *   → 在 focusX（卡片边缘侧）曲线向垂直中心聚拢，远端自然散开
 *
 * props:
 *   side        'left' | 'right' | 'both'
 *   isHoverRef  父容器 hover 状态 ref（不触发 re-render）
 *   mousePosRef 归一化鼠标坐标 {x,y}∈[0,1] ref，可选
 *   accent      主色  默认 #FFD400
 *   density     线条数量  默认 14
 *   speed       基础速度  默认 0.8
 */

import { useEffect, useRef } from 'react'

const OVERSCAN = 120   // px beyond canvas edges

// ── 确定性 LCG RNG ─────────────────────────────────────────────────────────────
function makeLCG(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// ── 十六进制 → "R,G,B" ────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ].join(',')
}

// ── 线条定义 ───────────────────────────────────────────────────────────────────
interface LineDef {
  baseYFrac: number          // 基准 Y（画布高度的 0-1 fraction）
  amp1: number; k1: number; ph1: number; w1: number   // 主正弦
  amp2: number; k2: number; ph2: number; w2: number   // 副正弦
  opacity: number
  strokeW: number
  // 粒子（每条线2-4个）
  nP: number
  pU: Float64Array           // 粒子 u 参数 [0,1]（横向位置）
  pSpd: Float64Array         // 粒子速度（u/s）
  pSz: Float64Array          // 粒子半径
}

// ── Props（与 CampusHeroCard 接口保持一致）────────────────────────────────────
export interface StreamlineFieldProps {
  side: 'left' | 'right' | 'both'
  isHoverRef: React.RefObject<boolean>
  mousePosRef?: React.RefObject<{ x: number; y: number } | undefined>
  accent?: string
  density?: number
  speed?: number
  className?: string
}

export default function StreamlineField({
  side,
  isHoverRef,
  mousePosRef,
  accent = '#FFD400',
  density = 14,
  speed = 0.8,
  className = '',
}: StreamlineFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx     = canvas.getContext('2d')!
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr     = Math.min(window.devicePixelRatio || 1, 2)
    const rgb     = hexToRgb(accent)

    let W = 0, H = 0, mob = false
    let rafId = 0, lastTs = performance.now(), time = 0, hoverE = 0
    let lines: LineDef[] = []

    // ── 构建线条（确定性，resize 时重建）──────────────────────────────────────
    function buildLines() {
      const rng = makeLCG(side === 'right' ? 199 : 42)
      const n   = density

      lines = Array.from({ length: n }, (_, i) => {
        const frac = n > 1 ? i / (n - 1) : 0.5
        const nP   = reduced ? 0 : (2 + Math.floor(rng() * 3))
        return {
          baseYFrac: Math.max(0.04, Math.min(0.96, 0.04 + frac * 0.92 + (rng() - 0.5) * 0.03)),
          amp1: 18 + rng() * 30,
          k1:   0.004 + rng() * 0.005,
          ph1:  rng() * Math.PI * 2,
          w1:   speed * (0.45 + rng() * 0.55),
          amp2: 8 + rng() * 15,
          k2:   0.010 + rng() * 0.012,
          ph2:  rng() * Math.PI * 2,
          w2:   speed * (0.25 + rng() * 0.35),
          opacity: 0.28 + rng() * 0.32,
          strokeW: 0.55 + rng() * 0.85,
          nP,
          pU:   Float64Array.from({ length: nP }, () => rng()),
          pSpd: Float64Array.from({ length: nP }, () => 0.028 + rng() * 0.048),
          pSz:  Float64Array.from({ length: nP }, () => 1.8 + rng() * 2.4),
        }
      })
    }

    // ── y(x, t) ───────────────────────────────────────────────────────────────
    function getY(line: LineDef, px: number, t: number, hE: number): number {
      const baseY   = line.baseYFrac * H
      const centerY = H * 0.5

      // Gaussian 聚拢：在卡片边缘侧（focusX）线条向中心汇聚
      const focusX  = side === 'right' ? 0 : W
      const sigma   = W * 0.50
      const dx      = (px - focusX) / sigma
      const gauss   = Math.exp(-dx * dx * 0.5)
      const bend    = 0.60 * (1 + hE * 0.65) * (centerY - baseY) * gauss

      // 正弦扰动（hover 时振幅提升 2.5x）
      const hAmp = 1 + hE * 2.5
      const s1   = line.amp1 * hAmp * Math.sin(line.k1 * px + line.ph1 + t * line.w1)
      const s2   = line.amp2 * hAmp * Math.sin(line.k2 * px + line.ph2 + t * line.w2)

      return baseY + bend + s1 + s2
    }

    // ── Resize ────────────────────────────────────────────────────────────────
    function resize() {
      const parent = canvas!.parentElement!
      W   = parent.clientWidth
      H   = parent.clientHeight
      mob = W < 640
      if (!W || !H) return
      canvas!.width        = Math.round(W * dpr)
      canvas!.height       = Math.round(H * dpr)
      canvas!.style.width  = `${W}px`
      canvas!.style.height = `${H}px`
      buildLines()
    }

    // ── 主渲染循环 ─────────────────────────────────────────────────────────────
    function frame(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs = ts
      time  += dt

      const isHov = isHoverRef.current ?? false
      hoverE += ((isHov ? 1 : 0) - hoverE) * (1 - Math.exp(-dt * (isHov ? 6.0 : 2.8)))

      if (!W || !H) { rafId = requestAnimationFrame(frame); return }

      const t   = time
      const hE  = hoverE
      const mp  = mousePosRef?.current

      ctx.clearRect(0, 0, canvas!.width, canvas!.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      const xStep = mob ? 12 : 6

      for (const line of lines) {
        // 鼠标临近亮度提升（按鼠标 Y 对应该线 Y 的距离）
        let boost = 1
        if (mp && !mob) {
          const mxCSS  = mp.x * W
          const myCSS  = mp.y * H
          const lineYM = getY(line, mxCSS, t, hE)
          const d      = Math.abs(lineYM - myCSS)
          boost = 1 + Math.max(0, 1 - d / 90) * 0.85
        }
        const alpha = line.opacity * (1 + hE * 0.70) * boost

        // ── 构建路径（一次性，复用两次）──────────────────────────────────────
        const buildPath = () => {
          ctx.beginPath()
          let first = true
          for (let px = -OVERSCAN; px <= W + OVERSCAN; px += xStep) {
            const py = getY(line, px, t, hE)
            if (first) { ctx.moveTo(px, py); first = false }
            else        ctx.lineTo(px, py)
          }
        }

        // 外晕层（宽线 + shadowBlur）
        ctx.save()
        ctx.shadowBlur  = 10 + hE * 18
        ctx.shadowColor = `rgba(${rgb},${0.45 + hE * 0.35})`
        buildPath()
        ctx.strokeStyle = `rgba(${rgb},${(alpha * 0.14).toFixed(3)})`
        ctx.lineWidth   = (line.strokeW + 5.5) * (1 + hE * 0.55)
        ctx.stroke()
        ctx.restore()

        // 主线
        buildPath()
        ctx.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`
        ctx.lineWidth   = line.strokeW * (1 + hE * 0.35)
        ctx.stroke()

        // ── 粒子沿线流动 ──────────────────────────────────────────────────────
        if (!reduced) {
          const spMul = 1 + hE * 1.9
          for (let pi = 0; pi < line.nP; pi++) {
            line.pU[pi] += line.pSpd[pi] * spMul * dt
            if (line.pU[pi] > 1) line.pU[pi] -= 1

            const px = -OVERSCAN + line.pU[pi] * (W + 2 * OVERSCAN)
            const py = getY(line, px, t, hE)
            const sz = line.pSz[pi]

            // 拖尾（方向：left 翼粒子向右流，right 翼粒子向左流）
            const dir = side === 'right' ? -1 : 1
            const TRAIL = 10
            for (let ti = 1; ti <= TRAIL; ti++) {
              const tf  = ti / TRAIL
              const tpx = px - dir * ti * 3.2
              const tpy = getY(line, tpx, t, hE)
              const ta  = (1 - tf) * alpha * 3.2 * (1 + hE * 0.75)
              ctx.beginPath()
              ctx.arc(tpx, tpy, sz * (1 - tf * 0.65) * (1 + hE * 0.45), 0, Math.PI * 2)
              ctx.fillStyle = `rgba(${rgb},${Math.min(ta, 0.88).toFixed(3)})`
              ctx.fill()
            }

            // 粒子头（发光）
            ctx.save()
            ctx.shadowBlur  = 10 + hE * 18
            ctx.shadowColor = `rgba(${rgb},0.95)`
            ctx.beginPath()
            ctx.arc(px, py, sz * (1 + hE * 0.60), 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${rgb},${Math.min(alpha * 3.8, 1).toFixed(3)})`
            ctx.fill()
            ctx.restore()
          }
        }
      }

      // 鼠标 radial highlight 叠加
      if (mp && !mob && hE > 0.05) {
        const mx   = mp.x * W
        const my   = mp.y * H
        const grad = ctx.createRadialGradient(mx, my, 0, mx, my, 170)
        grad.addColorStop(0, `rgba(${rgb},${(0.07 * hE).toFixed(3)})`)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }

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
