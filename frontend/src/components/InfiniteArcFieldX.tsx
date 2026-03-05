'use client'

/**
 * InfiniteArcFieldX — 横向无限延伸多曲线能量场
 *
 * 方向：水平（x 为主轴），曲线在 y 方向起伏。
 * 从 Card 左右两侧向"左/右"方向无限延伸，粒子横向流动。
 *
 * 结构：
 *   左翼 Canvas：card 左侧，x=0(远端) → x=W(card贴边)，曲线向左延伸
 *   右翼 Canvas：card 右侧，x=0(card贴边) → x=W(远端)，曲线向右延伸
 *
 * y(x, t) = baseY + A * sin(freq*x + phase + t*speed)
 *         + A2 * sin(freq2*x + phase2 + t*speed2)   // 双层叠加更优美
 *
 * Hover：振幅 2~3×，流速 1.6×，辉光增强，平滑指数回落
 * 鼠标位置：canvas 上叠加径向高光
 */

import { useEffect, useRef, ReactNode } from 'react'

// ── 翼宽（横向延伸距离，px）────────────────────────────────────────────────────
const WING_W = 200

// ── 曲线定义 ─────────────────────────────────────────────────────────────────
interface CurveDef {
  yFrac:   number   // baseY 占 canvas 高度的比例 (0-1)
  amp:     number   // 主振幅 px
  freq:    number   // 主频 rad/px
  phase:   number   // 初始相位 rad
  speed:   number   // 波形动画速度 rad/s（相位随时间推进）
  amp2:    number   // 副振幅（叠加）
  freq2:   number
  phase2:  number
  speed2:  number
  strokeW: number
  opacity: number
  nPart:   number   // 粒子数量
  pSpeed:  number   // 粒子速度（fraction of WING_W / second）
}

const CURVE_DEFS: CurveDef[] = [
  { yFrac: 0.07, amp: 7,  freq: 0.022, phase: 0.00, speed:  1.2, amp2: 3,  freq2: 0.055, phase2: 0.80, speed2: 2.1,  strokeW: 1.8, opacity: 0.54, nPart: 3, pSpeed: 0.22 },
  { yFrac: 0.17, amp: 12, freq: 0.014, phase: 1.40, speed:  0.7, amp2: 4,  freq2: 0.038, phase2: 3.10, speed2: 1.4,  strokeW: 1.1, opacity: 0.38, nPart: 2, pSpeed: 0.30 },
  { yFrac: 0.28, amp: 5,  freq: 0.032, phase: 2.80, speed:  2.0, amp2: 2,  freq2: 0.080, phase2: 1.50, speed2: 3.2,  strokeW: 0.5, opacity: 0.20, nPart: 2, pSpeed: 0.40 },
  { yFrac: 0.40, amp: 15, freq: 0.010, phase: 4.20, speed:  0.5, amp2: 5,  freq2: 0.026, phase2: 5.00, speed2: 0.9,  strokeW: 2.2, opacity: 0.46, nPart: 3, pSpeed: 0.16 },
  { yFrac: 0.52, amp: 9,  freq: 0.019, phase: 0.80, speed:  1.5, amp2: 3,  freq2: 0.048, phase2: 2.30, speed2: 2.5,  strokeW: 0.9, opacity: 0.30, nPart: 2, pSpeed: 0.34 },
  { yFrac: 0.63, amp: 13, freq: 0.016, phase: 3.50, speed:  0.9, amp2: 4,  freq2: 0.042, phase2: 0.40, speed2: 1.7,  strokeW: 1.4, opacity: 0.42, nPart: 2, pSpeed: 0.24 },
  { yFrac: 0.75, amp: 6,  freq: 0.028, phase: 5.80, speed:  1.8, amp2: 2,  freq2: 0.070, phase2: 4.20, speed2: 3.0,  strokeW: 0.6, opacity: 0.22, nPart: 2, pSpeed: 0.38 },
  { yFrac: 0.87, amp: 11, freq: 0.012, phase: 2.10, speed:  0.8, amp2: 4,  freq2: 0.032, phase2: 1.80, speed2: 1.3,  strokeW: 1.3, opacity: 0.34, nPart: 2, pSpeed: 0.26 },
]

const COL_MAIN   = '#FFD400'
const COL_BRIGHT = '#FFF6C2'

// ── 曲线 y(x) ────────────────────────────────────────────────────────────────
function curveY(def: CurveDef, H: number, px: number, time: number, hAmp: number): number {
  const baseY = def.yFrac * H
  const a1    = def.amp  * hAmp
  const a2    = def.amp2 * hAmp
  return baseY
    + a1 * Math.sin(def.freq  * px + def.phase  + time * def.speed)
    + a2 * Math.sin(def.freq2 * px + def.phase2 + time * def.speed2)
}

// ── 绘制单侧翼 ────────────────────────────────────────────────────────────────
// side='left' : x=0 远端(暗), x=W card贴边(亮)；粒子从 x=W→0（向左流出）
// side='right': x=0 card贴边(亮), x=W 远端(暗)；粒子从 x=0→W（向右流出）
function renderWing(
  ctx:        CanvasRenderingContext2D,
  side:       'left' | 'right',
  W:          number,
  H:          number,
  time:       number,
  hoverE:     number,
  mouseXFrac: number,   // 0..1 within this canvas
  mouseYFrac: number,
) {
  const isLeft = side === 'left'
  const hAmp   = 1 + hoverE * 2.0    // hover 时振幅最高 3×

  for (const def of CURVE_DEFS) {
    // 构建曲线路径
    ctx.beginPath()
    for (let px = 0; px <= W; px += 3) {
      const py = curveY(def, H, px, time, hAmp)
      if (px === 0) ctx.moveTo(px, py)
      else          ctx.lineTo(px, py)
    }

    // 横向渐变：card侧亮，远端暗
    const bright = def.opacity * (1 + hoverE * 0.45)
    const grad   = ctx.createLinearGradient(0, 0, W, 0)
    if (isLeft) {
      grad.addColorStop(0,   `rgba(255,212,0,0)`)
      grad.addColorStop(0.3, `rgba(255,212,0,${def.opacity * 0.22 * (1 + hoverE * 0.5)})`)
      grad.addColorStop(1,   `rgba(255,212,0,${bright})`)
    } else {
      grad.addColorStop(0,   `rgba(255,212,0,${bright})`)
      grad.addColorStop(0.7, `rgba(255,212,0,${def.opacity * 0.22 * (1 + hoverE * 0.5)})`)
      grad.addColorStop(1,   `rgba(255,212,0,0)`)
    }

    // 外晕光（宽线 + shadowBlur）
    ctx.save()
    ctx.strokeStyle = COL_MAIN
    ctx.lineWidth   = def.strokeW * 6
    ctx.globalAlpha = def.opacity * 0.13 * (1 + hoverE * 1.1)
    ctx.shadowColor = COL_MAIN
    ctx.shadowBlur  = 10 + hoverE * 20
    ctx.stroke()
    ctx.restore()

    // 主线
    ctx.save()
    ctx.strokeStyle = grad
    ctx.lineWidth   = def.strokeW * (1 + hoverE * 0.35)
    ctx.stroke()
    ctx.restore()

    // 细高光中线（金属丝质感）
    ctx.save()
    ctx.strokeStyle = `rgba(255,250,190,0.30)`
    ctx.lineWidth   = def.strokeW * 0.38
    ctx.globalAlpha = def.opacity * (0.45 + hoverE * 0.3)
    ctx.stroke()
    ctx.restore()

    // ── 粒子（沿曲线横向流动）──────────────────────────────────────────────
    const pSpeedPx = def.pSpeed * W * (1 + hoverE * 1.6)   // px/s

    for (let pi = 0; pi < def.nPart; pi++) {
      const seedOff  = pi / def.nPart
      const progress = ((time * pSpeedPx / W + seedOff) % 1 + 1) % 1

      // 从 card 侧向远端流动
      const px = isLeft
        ? W * (1 - progress)          // left: W→0（向左）
        : W * progress                // right: 0→W（向右）

      const py = curveY(def, H, px, time, hAmp)

      // 距 card 侧越近越亮
      const distFrac = isLeft ? 1 - px / W : px / W
      const pAlpha   = Math.min(1, (1 - distFrac * 0.85) * (0.7 + hoverE * 0.3) * def.opacity * 1.8)
      const r        = (1.3 + def.strokeW * 0.8) * (1 + hoverE * 0.7)
      const col      = pi === 0 ? COL_BRIGHT : COL_MAIN

      ctx.save()
      ctx.globalAlpha = pAlpha
      ctx.shadowColor = col
      ctx.shadowBlur  = 5 + hoverE * 16
      ctx.fillStyle   = col
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // ── 鼠标位置径向高光 ─────────────────────────────────────────────────────
  if (hoverE > 0.04) {
    const mx  = mouseXFrac * W
    const my  = mouseYFrac * H
    const rad = ctx.createRadialGradient(mx, my, 0, mx, my, W * 0.85)
    rad.addColorStop(0,   `rgba(255,212,0,${0.10 * hoverE})`)
    rad.addColorStop(0.45, `rgba(255,212,0,${0.04 * hoverE})`)
    rad.addColorStop(1,   'rgba(255,212,0,0)')
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = rad
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }
}

// ── Wing canvas 子组件 ────────────────────────────────────────────────────────
interface WingProps {
  side:         'left' | 'right'
  hoveringRef:  React.RefObject<boolean>
  mousePosRef:  React.RefObject<{ x: number; y: number }>
  reduced:      boolean
}

function Wing({ side, hoveringRef, mousePosRef, reduced }: WingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr    = window.devicePixelRatio || 1
    let rafId    = 0
    let lastTs   = performance.now()
    let time     = 0
    let hoverE   = 0

    function resize() {
      const parent = canvas!.parentElement!
      const W      = parent.clientWidth
      const H      = parent.clientHeight
      if (W === 0 || H === 0) return
      canvas!.width        = Math.round(W * dpr)
      canvas!.height       = Math.round(H * dpr)
      canvas!.style.width  = `${W}px`
      canvas!.style.height = `${H}px`
    }

    function frame(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs   = ts
      time    += dt

      const isHov  = hoveringRef.current ?? false
      hoverE += ((isHov ? 1 : 0) - hoverE) * (1 - Math.exp(-dt * (isHov ? 5 : 2.5)))

      const cw  = canvas!.width  / dpr
      const ch  = canvas!.height / dpr
      if (cw === 0 || ch === 0) { rafId = requestAnimationFrame(frame); return }

      const ctx = canvas!.getContext('2d')!
      ctx.clearRect(0, 0, canvas!.width, canvas!.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      if (!reduced) {
        // 鼠标 x 在左翼 canvas 里是镜像的（card 在右侧）
        const mp     = mousePosRef.current ?? { x: 0.5, y: 0.5 }
        const mxFrac = side === 'left' ? 1 - mp.x : mp.x
        renderWing(ctx, side, cw, ch, time, hoverE, mxFrac, mp.y)
      } else {
        // prefers-reduced-motion：仅绘静态曲线，无粒子
        renderWing(ctx, side, cw, ch, 0, 0, 0.5, 0.5)
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

// ── 公开 API ─────────────────────────────────────────────────────────────────
interface InfiniteArcFieldXProps {
  children?:  ReactNode
  className?: string
  style?:     React.CSSProperties
}

export default function InfiniteArcFieldX({
  children,
  className = '',
  style,
}: InfiniteArcFieldXProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hoveringRef  = useRef(false)
  const mousePosRef  = useRef({ x: 0.5, y: 0.5 })

  const reduced =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={style}
      onMouseEnter={() => { hoveringRef.current = true  }}
      onMouseLeave={() => { hoveringRef.current = false }}
      onMouseMove={(e) => {
        if (!containerRef.current) return
        const r = containerRef.current.getBoundingClientRect()
        mousePosRef.current = {
          x: Math.max(0, Math.min(1, (e.clientX - r.left)  / r.width)),
          y: Math.max(0, Math.min(1, (e.clientY - r.top)   / r.height)),
        }
      }}
    >
      {/* 左翼：right:100% 使右边贴住容器左边缘，向左延伸 WING_W */}
      <div
        className="absolute hidden lg:block pointer-events-none"
        style={{ right: '100%', top: 0, bottom: 0, width: WING_W, zIndex: 0, overflow: 'visible' }}
      >
        <Wing
          side="left"
          hoveringRef={hoveringRef as React.RefObject<boolean>}
          mousePosRef={mousePosRef as React.RefObject<{ x: number; y: number }>}
          reduced={reduced}
        />
      </div>

      {/* 右翼：left:100% 使左边贴住容器右边缘，向右延伸 WING_W */}
      <div
        className="absolute hidden lg:block pointer-events-none"
        style={{ left: '100%', top: 0, bottom: 0, width: WING_W, zIndex: 0, overflow: 'visible' }}
      >
        <Wing
          side="right"
          hoveringRef={hoveringRef as React.RefObject<boolean>}
          mousePosRef={mousePosRef as React.RefObject<{ x: number; y: number }>}
          reduced={reduced}
        />
      </div>

      {children}
    </div>
  )
}
