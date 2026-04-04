'use client'

import { useEffect, useRef, useState } from 'react'
import { useSpring, animated } from '@react-spring/web'
import { useDrag } from '@use-gesture/react'

// ── rope physics ──────────────────────────────────────────────────────────────

const SEG = 24          // number of rope segments
const SEG_LEN = 14      // px per segment
const GRAVITY = 0.6
const FRICTION = 0.98
const ITERATIONS = 12

type V2 = { x: number; y: number }
type Seg = { pos: V2; prev: V2 }

function makeRope(anchorX: number, anchorY: number): Seg[] {
  return Array.from({ length: SEG }, (_, i) => {
    const p = { x: anchorX, y: anchorY + i * SEG_LEN }
    return { pos: { ...p }, prev: { ...p } }
  })
}

function stepRope(segs: Seg[], anchor: V2, tip: V2) {
  // verlet
  for (const s of segs) {
    const vx = (s.pos.x - s.prev.x) * FRICTION
    const vy = (s.pos.y - s.prev.y) * FRICTION
    s.prev = { ...s.pos }
    s.pos.x += vx
    s.pos.y += vy + GRAVITY
  }
  segs[0].pos = { ...anchor }
  segs[segs.length - 1].pos = { ...tip }

  // constraints
  for (let it = 0; it < ITERATIONS; it++) {
    segs[0].pos = { ...anchor }
    segs[segs.length - 1].pos = { ...tip }
    for (let i = 0; i < segs.length - 1; i++) {
      const a = segs[i]
      const b = segs[i + 1]
      const dx = b.pos.x - a.pos.x
      const dy = b.pos.y - a.pos.y
      const dist = Math.hypot(dx, dy) || 0.001
      const diff = (dist - SEG_LEN) / dist
      const ox = dx * diff * 0.5
      const oy = dy * diff * 0.5
      if (i !== 0) { a.pos.x += ox; a.pos.y += oy }
      if (i !== segs.length - 2) { b.pos.x -= ox; b.pos.y -= oy }
    }
  }
}

function drawRope(ctx: CanvasRenderingContext2D, segs: Seg[], dpr: number) {
  if (segs.length < 2) return
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  ctx.save()
  ctx.scale(dpr, dpr)

  // shadow
  ctx.beginPath()
  ctx.moveTo(segs[0].pos.x, segs[0].pos.y)
  for (let i = 1; i < segs.length; i++) {
    const mx = (segs[i].pos.x + segs[i - 1].pos.x) / 2
    const my = (segs[i].pos.y + segs[i - 1].pos.y) / 2
    ctx.quadraticCurveTo(segs[i - 1].pos.x, segs[i - 1].pos.y, mx, my)
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()

  // rope
  const grad = ctx.createLinearGradient(
    segs[0].pos.x, segs[0].pos.y,
    segs[segs.length - 1].pos.x, segs[segs.length - 1].pos.y,
  )
  grad.addColorStop(0, '#c8a55a')
  grad.addColorStop(0.5, '#e6cf98')
  grad.addColorStop(1, '#c8a55a')

  ctx.beginPath()
  ctx.moveTo(segs[0].pos.x, segs[0].pos.y)
  for (let i = 1; i < segs.length; i++) {
    const mx = (segs[i].pos.x + segs[i - 1].pos.x) / 2
    const my = (segs[i].pos.y + segs[i - 1].pos.y) / 2
    ctx.quadraticCurveTo(segs[i - 1].pos.x, segs[i - 1].pos.y, mx, my)
  }
  ctx.strokeStyle = grad
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.restore()
}

// ── component ─────────────────────────────────────────────────────────────────

const CARD_W = 200
const CARD_H = 280

export default function Lanyard({ maxAngle = 20 }: { maxAngle?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const segsRef = useRef<Seg[]>([])
  const anchorRef = useRef<V2>({ x: 0, y: 0 })
  const rafRef = useRef<number>(0)

  // card position (spring)
  const [spring, api] = useSpring(() => ({
    x: 0,
    y: 0,
    rotateX: 0,
    rotateZ: 0,
    config: { mass: 1.2, tension: 200, friction: 26 },
  }))

  const [ready, setReady] = useState(false)

  // init
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const { width } = wrap.getBoundingClientRect()
    const ax = width / 2
    const ay = 0
    anchorRef.current = { x: ax, y: ay }
    const startX = ax - CARD_W / 2
    const startY = SEG * SEG_LEN + 10
    segsRef.current = makeRope(ax, ay)
    api.set({ x: startX, y: startY })
    setReady(true)
  }, [api])

  // animation loop
  useEffect(() => {
    if (!ready) return
    const canvas = canvasRef.current!
    const dpr = window.devicePixelRatio || 1

    function resize() {
      const wrap = wrapRef.current
      if (!wrap || !canvas) return
      const { width, height } = wrap.getBoundingClientRect()
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (wrapRef.current) ro.observe(wrapRef.current)

    function tick() {
      const ctx = canvas.getContext('2d')!
      const { x, y } = spring
      const cx = (x.get() as number) + CARD_W / 2
      const cy = (y.get() as number)
      stepRope(segsRef.current, anchorRef.current, { x: cx, y: cy })
      drawRope(ctx, segsRef.current, dpr)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [ready, spring])

  // drag
  const bind = useDrag(
    ({ offset: [ox, oy], velocity: [vx, vy], last }) => {
      const clampedRot = Math.max(-maxAngle, Math.min(maxAngle, ox * 0.08))
      api.start({
        x: ox,
        y: oy,
        rotateZ: last ? 0 : clampedRot,
        rotateX: last ? 0 : -vy * 4,
        config: last
          ? { tension: 200, friction: 26 }
          : { tension: 800, friction: 40 },
      })
    },
    {
      from: () => [spring.x.get() as number, spring.y.get() as number],
      filterTaps: true,
      bounds: wrapRef,
    },
  )

  return (
    <div ref={wrapRef} className="relative h-[480px] w-full select-none" style={{ touchAction: 'none' }}>
      {/* anchor pin */}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
        <div className="h-3.5 w-10 rounded-b-lg border-x border-b border-[#c8a55a]/60 bg-[rgba(200,165,90,0.15)]" />
      </div>

      {/* rope canvas */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-0" />

      {/* card */}
      {ready && (
        <animated.div
          {...bind()}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            x: spring.x,
            y: spring.y,
            rotateX: spring.rotateX,
            rotateZ: spring.rotateZ,
            width: CARD_W,
            cursor: 'grab',
            zIndex: 20,
            transformStyle: 'preserve-3d',
            perspective: 800,
          }}
          className="active:cursor-grabbing"
        >
          {/* lanyard strap (short bit above card) */}
          <div className="mx-auto mb-0 w-10 overflow-hidden">
            <div
              className="h-8 w-full"
              style={{
                background: 'linear-gradient(180deg, rgba(200,165,90,0.0) 0%, rgba(200,165,90,0.18) 100%)',
                borderLeft: '1px solid rgba(200,165,90,0.25)',
                borderRight: '1px solid rgba(200,165,90,0.25)',
              }}
            />
          </div>

          {/* badge card */}
          <div
            className="overflow-hidden rounded-2xl border border-[#c8a55a]/20"
            style={{
              background: 'linear-gradient(165deg, #12151e 0%, #0b0d14 100%)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,165,90,0.06)',
            }}
          >
            {/* top gold bar */}
            <div
              className="h-2.5 w-full"
              style={{ background: 'linear-gradient(90deg, #b8903e 0%, #e6cf98 50%, #b8903e 100%)' }}
            />

            <div className="px-4 pb-5 pt-4">
              {/* university logo row */}
              <div className="flex items-center gap-2">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-[10px] font-black tracking-tight text-[#e6cf98]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(200,165,90,0.22) 0%, rgba(200,165,90,0.06) 100%)',
                    border: '1px solid rgba(200,165,90,0.35)',
                  }}
                >
                  UNSW
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c8a55a]">University of</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c8a55a]">New South Wales</p>
                </div>
              </div>

              {/* divider */}
              <div className="my-3 h-px bg-gradient-to-r from-transparent via-[#c8a55a]/25 to-transparent" />

              {/* avatar placeholder */}
              <div
                className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(200,165,90,0.14) 0%, rgba(200,165,90,0.04) 100%)',
                  border: '1px solid rgba(200,165,90,0.2)',
                }}
              >
                <span className="text-2xl font-bold text-[#c8a55a]/60">EM</span>
              </div>

              {/* name */}
              <p className="text-center text-[15px] font-semibold tracking-tight text-white/92">Exam Master</p>
              <p className="mt-0.5 text-center text-[11px] font-medium text-[#c8a55a]">AI 备考助手</p>

              {/* divider */}
              <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

              {/* info rows */}
              <div className="space-y-1.5">
                {[
                  { label: 'SCHOOL', value: 'CSE / EE / Commerce' },
                  { label: 'ENGINE', value: 'GPT-4o + Gemini' },
                  { label: 'STATUS', value: '● Online', green: true },
                ].map(({ label, value, green }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[9px] uppercase tracking-[0.14em] text-white/28">{label}</span>
                    <span className={`text-[10px] font-medium ${green ? 'text-emerald-400' : 'text-white/55'}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* barcode */}
              <div className="mt-3.5 flex h-6 gap-px overflow-hidden rounded-sm">
                {Array.from({ length: 34 }, (_, i) => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{
                      background:
                        i % 7 === 0 ? 'rgba(200,165,90,0.55)' :
                        i % 4 === 0 ? 'rgba(200,165,90,0.22)' :
                        'rgba(255,255,255,0.07)',
                      height: i % 3 === 0 ? '100%' : i % 5 === 0 ? '70%' : '85%',
                      alignSelf: 'flex-end',
                    }}
                  />
                ))}
              </div>
              <p className="mt-1 text-center text-[8px] tracking-[0.22em] text-white/20">
                EXAMMASTER · UNSW · 2025
              </p>
            </div>

            {/* bottom gold bar */}
            <div
              className="h-1.5 w-full"
              style={{ background: 'linear-gradient(90deg, #b8903e 0%, #e6cf98 50%, #b8903e 100%)' }}
            />
          </div>
        </animated.div>
      )}
    </div>
  )
}
