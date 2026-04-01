'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Trash2, Undo2, PencilLine, Eraser } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Point { x: number; y: number }
interface Stroke { color: string; width: number; eraser: boolean; points: Point[] }

interface Props { isOpen: boolean; onClose: () => void }

// ── Constants ──────────────────────────────────────────────────────────────────

const COLORS = ['#ffffff', '#A78BFA', '#F9A8D4', '#34D399', '#FCD34D', '#F87171', '#60A5FA', '#000000']
const WIDTHS = [2, 5, 10, 18]

// ── Component ──────────────────────────────────────────────────────────────────

export default function SimpleWhiteboard({ isOpen, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [color, setColor] = useState('#ffffff')
  const [width, setWidth] = useState(5)
  const [eraser, setEraser] = useState(false)
  const drawing = useRef(false)
  const currentStroke = useRef<Stroke | null>(null)

  // ── Draw all strokes onto canvas ─────────────────────────────────────────────

  const redraw = useCallback((allStrokes: Stroke[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue
      ctx.save()
      ctx.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over'
      ctx.strokeStyle = stroke.eraser ? 'rgba(0,0,0,1)' : stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]
        const curr = stroke.points[i]
        ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2)
      }
      ctx.stroke()
      ctx.restore()
    }
  }, [])

  useEffect(() => { redraw(strokes) }, [strokes, redraw])

  // ── Resize canvas to match container ─────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect()
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        redraw(strokes)
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [isOpen, strokes, redraw])

  // ── Pointer events ────────────────────────────────────────────────────────────

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    currentStroke.current = { color, width, eraser, points: [getPoint(e)] }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !currentStroke.current) return
    currentStroke.current.points.push(getPoint(e))
    // Draw live stroke on canvas directly (without full redraw for performance)
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const pts = currentStroke.current.points
    if (pts.length < 2) return
    ctx.save()
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
    ctx.strokeStyle = eraser ? 'rgba(0,0,0,1)' : color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    const prev = pts[pts.length - 2]
    const curr = pts[pts.length - 1]
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(curr.x, curr.y)
    ctx.stroke()
    ctx.restore()
  }

  function onPointerUp() {
    if (!drawing.current || !currentStroke.current) return
    drawing.current = false
    const stroke = currentStroke.current
    currentStroke.current = null
    if (stroke.points.length > 0) {
      setStrokes(prev => [...prev, stroke])
    }
  }

  const undo = () => setStrokes(prev => prev.slice(0, -1))
  const clear = () => setStrokes([])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6 pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 pointer-events-auto" style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose} />

      {/* Window */}
      <div className="relative pointer-events-auto w-full sm:w-auto sm:min-w-[680px] sm:max-w-[900px] sm:h-[560px] h-[85dvh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
        style={{
          background: 'rgba(7,8,15,0.97)',
          border: '1px solid rgba(167,139,250,0.3)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(167,139,250,0.1)',
          backdropFilter: 'blur(24px)',
        }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 shrink-0"
          style={{ height: 52, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(167,139,250,0.15)' }}>
              <PencilLine size={14} style={{ color: '#A78BFA' }} />
            </div>
            <span className="text-sm font-semibold text-white">白板</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={undo} disabled={strokes.length === 0}
              className="p-2 rounded-lg transition-all disabled:opacity-25"
              style={{ color: '#666' }}
              title="撤销">
              <Undo2 size={15} />
            </button>
            <button onClick={clear} disabled={strokes.length === 0}
              className="p-2 rounded-lg transition-all disabled:opacity-25"
              style={{ color: '#666' }}
              title="清空">
              <Trash2 size={15} />
            </button>
            <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <button onClick={onClose} className="p-2 rounded-lg transition-all"
              style={{ color: 'rgba(255,255,255,0.4)' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-5 py-3 shrink-0 flex-wrap"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>

          {/* Colors */}
          <div className="flex items-center gap-1.5">
            {COLORS.map(c => (
              <button key={c} onClick={() => { setColor(c); setEraser(false) }}
                className="rounded-full transition-all"
                style={{
                  width: 18, height: 18,
                  background: c,
                  border: color === c && !eraser ? '2px solid #A78BFA' : '2px solid rgba(255,255,255,0.15)',
                  boxShadow: color === c && !eraser ? '0 0 0 2px rgba(167,139,250,0.4)' : 'none',
                }} />
            ))}
          </div>

          <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.1)' }} />

          {/* Widths */}
          <div className="flex items-center gap-2">
            {WIDTHS.map(w => (
              <button key={w} onClick={() => { setWidth(w); setEraser(false) }}
                className="flex items-center justify-center rounded-full transition-all"
                style={{
                  width: 28, height: 28,
                  background: width === w && !eraser ? 'rgba(167,139,250,0.2)' : 'transparent',
                  border: `1px solid ${width === w && !eraser ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
                }}>
                <div className="rounded-full" style={{ width: Math.min(w, 14), height: Math.min(w, 14), background: '#888' }} />
              </button>
            ))}
          </div>

          <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.1)' }} />

          {/* Eraser */}
          <button onClick={() => setEraser(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: eraser ? 'rgba(249,168,212,0.15)' : 'rgba(255,255,255,0.03)',
              color: eraser ? '#F9A8D4' : '#666',
              border: `1px solid ${eraser ? 'rgba(249,168,212,0.35)' : 'rgba(255,255,255,0.08)'}`,
            }}>
            <Eraser size={13} /> 橡皮
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden"
          style={{ background: 'radial-gradient(circle at 50% 50%, rgba(167,139,250,0.03) 0%, transparent 70%)' }}>
          {/* Dot grid */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }} />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ cursor: eraser ? 'cell' : 'crosshair', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          {strokes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.12)' }}>在此处手绘笔记</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
