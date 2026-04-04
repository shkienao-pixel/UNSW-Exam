'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Vec2 {
  x: number
  y: number
}

interface Segment {
  pos: Vec2
  prev: Vec2
}

const SEGMENT_COUNT = 18
const GRAVITY = 0.45
const FRICTION = 0.98
const STIFFNESS = 0.82
const SEGMENT_LENGTH = 22

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function distance(a: Vec2, b: Vec2) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

export default function Lanyard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const anchorRef = useRef<Vec2>({ x: 0, y: 0 })
  const rafRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef<Vec2>({ x: 0, y: 0 })
  const [badgePos, setBadgePos] = useState<Vec2>({ x: 0, y: 0 })
  const badgePosRef = useRef<Vec2>({ x: 0, y: 0 })
  const [initialized, setInitialized] = useState(false)

  const initRope = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = rect.width / 2
    anchorRef.current = { x: cx, y: 0 }

    const startX = cx
    const startY = 60
    segmentsRef.current = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
      const y = startY + i * SEGMENT_LENGTH
      return {
        pos: { x: startX, y },
        prev: { x: startX, y },
      }
    })
    const endY = startY + SEGMENT_COUNT * SEGMENT_LENGTH
    badgePosRef.current = { x: startX - 60, y: endY }
    setBadgePos({ x: startX - 60, y: endY })
    setInitialized(true)
  }, [])

  const simulate = useCallback(() => {
    const segs = segmentsRef.current
    if (segs.length === 0) return

    // Verlet integration
    for (const seg of segs) {
      const vx = (seg.pos.x - seg.prev.x) * FRICTION
      const vy = (seg.pos.y - seg.prev.y) * FRICTION
      seg.prev = { ...seg.pos }
      seg.pos.x += vx
      seg.pos.y += vy + GRAVITY
    }

    // Pin first segment to anchor
    segs[0].pos = { ...anchorRef.current }

    // Constrain last segment toward badge center
    const badgeCenter = {
      x: badgePosRef.current.x + 60,
      y: badgePosRef.current.y + 14,
    }
    segs[segs.length - 1].pos = { ...badgeCenter }

    // Solve distance constraints
    for (let iter = 0; iter < 8; iter++) {
      segs[0].pos = { ...anchorRef.current }
      segs[segs.length - 1].pos = { ...badgeCenter }

      for (let i = 0; i < segs.length - 1; i++) {
        const a = segs[i]
        const b = segs[i + 1]
        const dist = distance(a.pos, b.pos)
        const diff = (dist - SEGMENT_LENGTH) / dist
        const ox = (b.pos.x - a.pos.x) * diff * 0.5 * STIFFNESS
        const oy = (b.pos.y - a.pos.y) * diff * 0.5 * STIFFNESS
        if (i !== 0) {
          a.pos.x += ox
          a.pos.y += oy
        }
        if (i !== segs.length - 2) {
          b.pos.x -= ox
          b.pos.y -= oy
        }
      }
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = container.offsetWidth
    const h = container.offsetHeight

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.scale(dpr, dpr)
    }

    ctx.clearRect(0, 0, w, h)

    const segs = segmentsRef.current
    if (segs.length < 2) return

    // Draw rope shadow
    ctx.beginPath()
    ctx.moveTo(segs[0].pos.x, segs[0].pos.y)
    for (let i = 1; i < segs.length; i++) {
      const xc = (segs[i].pos.x + segs[i - 1].pos.x) / 2
      const yc = (segs[i].pos.y + segs[i - 1].pos.y) / 2
      ctx.quadraticCurveTo(segs[i - 1].pos.x, segs[i - 1].pos.y, xc, yc)
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Draw rope
    ctx.beginPath()
    ctx.moveTo(segs[0].pos.x, segs[0].pos.y)
    for (let i = 1; i < segs.length; i++) {
      const xc = (segs[i].pos.x + segs[i - 1].pos.x) / 2
      const yc = (segs[i].pos.y + segs[i - 1].pos.y) / 2
      ctx.quadraticCurveTo(segs[i - 1].pos.x, segs[i - 1].pos.y, xc, yc)
    }

    // Gradient rope color
    const grad = ctx.createLinearGradient(
      segs[0].pos.x,
      segs[0].pos.y,
      segs[segs.length - 1].pos.x,
      segs[segs.length - 1].pos.y,
    )
    grad.addColorStop(0, 'rgba(200,165,90,0.92)')
    grad.addColorStop(0.5, 'rgba(230,207,152,0.88)')
    grad.addColorStop(1, 'rgba(200,165,90,0.72)')
    ctx.strokeStyle = grad
    ctx.lineWidth = 3
    ctx.stroke()

    // Anchor pin dot
    ctx.beginPath()
    ctx.arc(anchorRef.current.x, anchorRef.current.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(200,165,90,0.7)'
    ctx.fill()
  }, [])

  const loop = useCallback(() => {
    simulate()
    draw()
    rafRef.current = requestAnimationFrame(loop)
  }, [simulate, draw])

  useEffect(() => {
    initRope()
    const observer = new ResizeObserver(() => initRope())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [initRope])

  useEffect(() => {
    if (!initialized) return
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [initialized, loop])

  // Drag handlers
  const getEventPos = (e: MouseEvent | TouchEvent): Vec2 => {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }
    const rect = container.getBoundingClientRect()
    const raw = 'touches' in e ? e.touches[0] : e
    return {
      x: raw.clientX - rect.left,
      y: raw.clientY - rect.top,
    }
  }

  const onPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isDraggingRef.current = true
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const raw = 'touches' in e ? e.touches[0] : e
    dragOffsetRef.current = {
      x: raw.clientX - rect.left - badgePosRef.current.x,
      y: raw.clientY - rect.top - badgePosRef.current.y,
    }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return
      const pos = getEventPos(e)
      const newPos = {
        x: pos.x - dragOffsetRef.current.x,
        y: pos.y - dragOffsetRef.current.y,
      }
      badgePosRef.current = newPos
      setBadgePos({ ...newPos })
    }

    const onUp = () => {
      isDraggingRef.current = false
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative h-[420px] w-full select-none overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />

      {/* Anchor bracket */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2"
        style={{ zIndex: 2 }}
      >
        <div className="h-3 w-8 rounded-b-md border-x border-b border-[#c8a55a]/50 bg-[rgba(200,165,90,0.12)]" />
      </div>

      {/* Badge */}
      {initialized && (
        <div
          ref={badgeRef}
          onMouseDown={onPointerDown}
          onTouchStart={onPointerDown}
          className="absolute cursor-grab active:cursor-grabbing"
          style={{
            left: badgePos.x,
            top: badgePos.y,
            zIndex: 10,
            userSelect: 'none',
          }}
        >
          <div
            className="relative w-[120px] overflow-hidden rounded-2xl border border-[#c8a55a]/22 shadow-[0_8px_40px_rgba(0,0,0,0.52),0_0_0_1px_rgba(200,165,90,0.08)]"
            style={{
              background: 'linear-gradient(160deg, rgba(18,21,30,0.97) 0%, rgba(12,14,20,0.99) 100%)',
            }}
          >
            {/* Top stripe */}
            <div
              className="h-2 w-full"
              style={{
                background: 'linear-gradient(90deg, #c8a55a 0%, #e6cf98 50%, #c8a55a 100%)',
              }}
            />

            <div className="px-3 pb-3 pt-2.5">
              {/* Logo area */}
              <div className="mb-2 flex items-center gap-1.5">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-[9px] font-bold"
                  style={{
                    background: 'linear-gradient(135deg, rgba(200,165,90,0.2) 0%, rgba(200,165,90,0.08) 100%)',
                    border: '1px solid rgba(200,165,90,0.3)',
                    color: '#e6cf98',
                  }}
                >
                  EM
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#c8a55a]">Exam</p>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#c8a55a]">Master</p>
                </div>
              </div>

              {/* Divider */}
              <div className="mb-2 h-px bg-gradient-to-r from-transparent via-[#c8a55a]/20 to-transparent" />

              {/* Name */}
              <p className="text-[11px] font-semibold leading-tight tracking-tight text-white/90">UNSW</p>
              <p className="text-[10px] font-medium text-[#c8a55a]">留学生备考助手</p>

              {/* Info rows */}
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] uppercase tracking-[0.1em] text-white/30">课程</span>
                  <span className="text-[8px] font-medium text-white/60">COMP9517</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] uppercase tracking-[0.1em] text-white/30">引擎</span>
                  <span className="text-[8px] font-medium text-white/60">GPT+Gemini</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] uppercase tracking-[0.1em] text-white/30">状态</span>
                  <span className="inline-flex items-center gap-1 text-[8px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    在线
                  </span>
                </div>
              </div>

              {/* Bottom barcode-style strip */}
              <div className="mt-2.5 flex gap-px overflow-hidden rounded-sm">
                {Array.from({ length: 28 }, (_, i) => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{
                      height: i % 3 === 0 ? '10px' : i % 5 === 0 ? '6px' : '8px',
                      background:
                        i % 7 === 0
                          ? 'rgba(200,165,90,0.5)'
                          : i % 4 === 0
                            ? 'rgba(200,165,90,0.2)'
                            : 'rgba(255,255,255,0.08)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
