'use client'

/**
 * ParticleText — 严格对齐字形轮廓的粒子动效
 *
 * 技术要点：
 * 1. 离屏 canvas + textBaseline='alphabetic' + measureText 精确定位
 * 2. 采样点坐标全程保持 CSS px 坐标系（÷dpr）
 * 3. 主 canvas：width=W*dpr, height=H*dpr; ctx.scale(dpr,dpr)
 * 4. 循环：Gather(42%) → Hold(12%) → Dissolve(46%) → Gather...
 *    Hold 阶段：噪声幅度 ±3.5px + 字符替换 18% 概率 → 明显流动感
 * 5. ResizeObserver 触发重采样+重分配
 */

import { useEffect, useRef } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────
const CHARS     = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const COLORS    = ['#FFD400', '#FFF6C2', '#A07800']
const PH_GATHER   = 0.42   // 42% gather
const PH_HOLD     = 0.12   // 12% hold  ← 缩短避免"冻住"感
const PH_DISSOLVE = 0.46   // 46% dissolve

// ── Value noise (smooth, no external deps) ────────────────────────────────────
function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerpN(a: number, b: number, t: number) { return a + (b - a) * t }
function hashN(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return s - Math.floor(s)
}
function noise2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi,        yf = y - yi
  const u  = fade(xf),      v  = fade(yf)
  const h  = (a: number, b: number) => hashN(a + b * 57)
  return (lerpN(lerpN(h(xi, yi), h(xi+1, yi), u), lerpN(h(xi, yi+1), h(xi+1, yi+1), u), v)) * 2 - 1
}

// ── Easing ────────────────────────────────────────────────────────────────────
function easeOutQuart(t: number) { return 1 - Math.pow(1 - t, 4) }
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ── Particle type ─────────────────────────────────────────────────────────────
interface P {
  x: number;  y: number
  vx: number; vy: number
  tx: number; ty: number
  driftAngle: number
  driftSpeed: number
  char: string
  charTimer: number
  charInterval: number
  size: number
  baseOpacity: number
  colorIdx: number
  seed: number
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ParticleTextProps {
  text: string
  className?: string
  cycleMs?: number
  fontFamily?: string
  fontWeight?: number
}

export default function ParticleText({
  text,
  className = '',
  cycleMs   = 13000,   // ← 缩短周期让循环更明显
  fontFamily = '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
  fontWeight = 600,
}: ParticleTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const dpr = window.devicePixelRatio || 1
    let W = 0, H = 0
    let particles: P[] = []
    let pts: { x: number; y: number }[] = []
    let rafId = 0
    let lastTs = performance.now()
    let totalTime = 0
    let lastCycleNum = -1

    // ── 1. 精确采样字形 ────────────────────────────────────────────────────────
    function sampleShape(): { x: number; y: number }[] {
      if (W === 0 || H === 0) return []

      const off  = document.createElement('canvas')
      const offW = Math.ceil(W * dpr)
      const offH = Math.ceil(H * dpr)
      off.width  = offW
      off.height = offH
      const ctx2 = off.getContext('2d')!

      let physFS = H * 0.86 * dpr
      ctx2.font         = `${fontWeight} ${physFS}px ${fontFamily}`
      ctx2.textBaseline = 'alphabetic'
      ctx2.textAlign    = 'left'

      let m = ctx2.measureText(text)
      if (m.width > offW * 0.95) {
        physFS = physFS * (offW * 0.95 / m.width)
        ctx2.font = `${fontWeight} ${physFS}px ${fontFamily}`
        m = ctx2.measureText(text)
      }

      const ascent  = m.actualBoundingBoxAscent
      const descent = m.actualBoundingBoxDescent
      const textH   = ascent + descent
      const textW   = m.width
      const drawX   = (offW - textW) / 2
      const drawY   = (offH - textH) / 2 + ascent

      ctx2.fillStyle = '#fff'
      ctx2.fillText(text, drawX, drawY)

      const data   = ctx2.getImageData(0, 0, offW, offH).data
      const step   = Math.max(2, Math.round(Math.sqrt((offW * offH) / 3000)))
      const result: { x: number; y: number }[] = []

      for (let py = 0; py < offH; py += step) {
        for (let px = 0; px < offW; px += step) {
          if (data[(py * offW + px) * 4 + 3] >= 60) {
            result.push({ x: px / dpr, y: py / dpr })
          }
        }
      }
      return result
    }

    // ── 2. 工具函数 ───────────────────────────────────────────────────────────
    function shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    }

    function assignTargets() {
      if (pts.length === 0) return
      const shuffled = shuffle([...pts])
      for (let i = 0; i < particles.length; i++) {
        const t = shuffled[i % shuffled.length]
        particles[i].tx = t.x
        particles[i].ty = t.y
      }
    }

    function resetScattered() {
      for (const p of particles) {
        const angle = Math.random() * Math.PI * 2
        const dist  = Math.random() * Math.max(W, H) * 0.52 + 40
        p.x = W / 2 + Math.cos(angle) * dist
        p.y = H / 2 + Math.sin(angle) * dist
        p.vx = 0; p.vy = 0
        p.driftAngle = angle
        p.driftSpeed = 0.5 + Math.random() * 0.9
      }
    }

    // ── 3. 初始化粒子 ──────────────────────────────────────────────────────────
    function init() {
      pts = sampleShape()
      if (pts.length === 0) return

      const isMob = window.matchMedia('(max-width: 768px)').matches
      const count = isMob ? Math.round(pts.length * 0.55) : pts.length

      particles = Array.from({ length: count }, (_, i) => {
        const t     = pts[i % pts.length]
        const angle = Math.random() * Math.PI * 2
        const dist  = Math.random() * Math.max(W, H) * 0.52 + 40
        return {
          x:  W / 2 + Math.cos(angle) * dist,
          y:  H / 2 + Math.sin(angle) * dist,
          vx: 0, vy: 0,
          tx: t.x, ty: t.y,
          driftAngle:  angle,
          driftSpeed:  0.45 + Math.random() * 0.9,
          char:        CHARS[Math.floor(Math.random() * CHARS.length)],
          charTimer:   Math.random() * 600,
          charInterval:360 + Math.random() * 780,
          size:        6.5 + Math.random() * 5.5,
          baseOpacity: 0.28 + Math.random() * 0.65,
          colorIdx:    Math.random() < 0.68 ? 0 : Math.random() < 0.7 ? 1 : 2,
          seed:        i * 2.39 + 17,
        }
      })

      totalTime    = 0
      lastCycleNum = -1
    }

    // ── 4. 主 canvas resize ────────────────────────────────────────────────────
    function resize() {
      const parent = canvas!.parentElement
      if (!parent) return
      W = parent.clientWidth
      H = parent.clientHeight
      if (W === 0 || H === 0) return
      canvas!.width        = Math.round(W * dpr)
      canvas!.height       = Math.round(H * dpr)
      canvas!.style.width  = `${W}px`
      canvas!.style.height = `${H}px`
      init()
    }

    // ── 5. 渲染循环 ────────────────────────────────────────────────────────────
    function frame(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs = ts
      totalTime += dt

      const cycleS   = cycleMs / 1000
      const cycleNum = Math.floor(totalTime / cycleS)
      const phFrac   = (totalTime % cycleS) / cycleS   // 0..1

      // 新周期：重新分配目标
      if (cycleNum !== lastCycleNum) {
        if (lastCycleNum !== -1) {
          resetScattered()
          assignTargets()
        }
        lastCycleNum = cycleNum
      }

      // 子阶段
      let gatherFrac = 0, holdFrac = 0, dissolveFrac = 0
      if (phFrac < PH_GATHER) {
        gatherFrac = phFrac / PH_GATHER
      } else if (phFrac < PH_GATHER + PH_HOLD) {
        gatherFrac = 1
        holdFrac   = (phFrac - PH_GATHER) / PH_HOLD
      } else {
        gatherFrac   = 1
        holdFrac     = 1
        dissolveFrac = (phFrac - PH_GATHER - PH_HOLD) / PH_DISSOLVE
      }

      const ctx = canvas!.getContext('2d')!
      ctx.clearRect(0, 0, W * dpr, H * dpr)
      ctx.save()
      ctx.scale(dpr, dpr)

      for (const p of particles) {
        // ── 位置更新 ──────────────────────────────────────────────────────────
        if (dissolveFrac > 0) {
          // Dissolve：向外漂散 + 噪声扰动
          const ease = easeInOutCubic(dissolveFrac)
          const spd  = (0.5 + ease * 3.5) * p.driftSpeed
          p.x += Math.cos(p.driftAngle) * spd * dt * 60
          p.y += Math.sin(p.driftAngle) * spd * dt * 60

        } else if (gatherFrac < 1) {
          // Gather：弹簧吸附到 target
          const ease = easeOutQuart(gatherFrac)
          const k    = 2.5 + ease * 14
          p.vx = (p.vx + (p.tx - p.x) * k * dt) * 0.86
          p.vy = (p.vy + (p.ty - p.y) * k * dt) * 0.86
          p.x += p.vx
          p.y += p.vy

        } else {
          // Hold：噪声微漂（±3.5px）+ 明显流动感 ← 关键修复
          const nt = totalTime * 1.1   // ← 加速噪声场（原 0.38）
          const nx = noise2(p.seed * 0.017 + nt,        p.seed * 0.023      ) * 3.5   // ← 扩大振幅
          const ny = noise2(p.seed * 0.019 + nt + 50.7, p.seed * 0.013 + 80) * 3.5   // ← 扩大振幅
          const k  = 12
          p.vx = (p.vx + (p.tx + nx - p.x) * k * dt) * 0.78
          p.vy = (p.vy + (p.ty + ny - p.y) * k * dt) * 0.78
          p.x += p.vx
          p.y += p.vy
        }

        // ── 字符随机替换（Hold 阶段 18% → 明显数据流感）─────────────────────
        p.charTimer += dt * 1000
        if (p.charTimer > p.charInterval) {
          p.charTimer = 0
          const replaceProb = dissolveFrac > 0 ? 0.35
                            : holdFrac    > 0 ? 0.18   // ← 提高（原 0.06）
                            :                   0.04
          if (Math.random() < replaceProb) {
            p.char = CHARS[Math.floor(Math.random() * CHARS.length)]
          }
        }

        // ── Alpha ─────────────────────────────────────────────────────────────
        let alpha: number
        if (dissolveFrac > 0) {
          alpha = p.baseOpacity * (1 - easeInOutCubic(Math.min(1, dissolveFrac * 1.1)))
        } else {
          alpha = p.baseOpacity * Math.min(1, gatherFrac * 3.2)
        }
        if (alpha < 0.015) continue

        // ── 绘制 ──────────────────────────────────────────────────────────────
        const col = COLORS[p.colorIdx]
        ctx.save()
        ctx.globalAlpha  = alpha
        ctx.fillStyle    = col
        ctx.shadowColor  = col
        ctx.shadowBlur   = dissolveFrac > 0.2 ? 0 : 3 + gatherFrac * 7
        ctx.font         = `500 ${p.size}px ${fontFamily}`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.char, p.x, p.y)
        ctx.restore()
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
  }, [text, cycleMs, fontFamily, fontWeight])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      aria-hidden
      style={{ display: 'block' }}
    />
  )
}
