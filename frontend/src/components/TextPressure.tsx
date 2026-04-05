'use client'

import { useRef, useEffect, useState } from 'react'

interface TextPressureProps {
  text?: string
  fontFamily?: string
  fontUrl?: string
  width?: boolean
  weight?: boolean
  italic?: boolean
  alpha?: boolean
  flex?: boolean
  stroke?: boolean
  scale?: boolean
  textColor?: string
  strokeColor?: string
  className?: string
  minFontSize?: number
}

export default function TextPressure({
  text = 'Compressa',
  fontFamily = 'Compressa VF',
  fontUrl = 'https://res.cloudinary.com/dr6lvwubh/raw/upload/v1529908256/CompressaPRO-GX.woff2',
  width = true,
  weight = true,
  italic = true,
  alpha = false,
  flex = true,
  stroke = false,
  scale = false,
  textColor = '#FFFFFF',
  strokeColor = '#FF0000',
  className = '',
  minFontSize = 24,
}: TextPressureProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const spansRef = useRef<(HTMLSpanElement | null)[]>([])

  const mouseRef = useRef({ x: 0, y: 0 })
  const cursorRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)

  const [fontSize, setFontSize] = useState(minFontSize)
  const [scaleY, setScaleY] = useState(1)
  const [lineHeight, setLineHeight] = useState(1)

  const chars = text.split('')

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    const setSize = () => {
      if (!containerRef.current || !titleRef.current) return
      const { width: containerW, height: containerH } =
        containerRef.current.getBoundingClientRect()
      let fs = containerW / (text.length * 0.52)
      fs = Math.max(fs, minFontSize)
      setFontSize(fs)

      if (scale) {
        const titleH = titleRef.current.getBoundingClientRect().height
        if (titleH > 0) {
          setScaleY(containerH / titleH)
          setLineHeight(containerH / titleH)
        }
      }
    }

    const ro = new ResizeObserver(setSize)
    if (containerRef.current) ro.observe(containerRef.current)
    setSize()
    return () => ro.disconnect()
  }, [text, scale, minFontSize])

  useEffect(() => {
    const animate = () => {
      // ease cursor toward mouse
      cursorRef.current.x += (mouseRef.current.x - cursorRef.current.x) * 0.15
      cursorRef.current.y += (mouseRef.current.y - cursorRef.current.y) * 0.15

      spansRef.current.forEach((span) => {
        if (!span) return
        const rect = span.getBoundingClientRect()
        const charCenter = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        }
        const d = dist(cursorRef.current, charCenter)
        const maxDist = 400
        const ratio = Math.max(0, 1 - d / maxDist)

        const wdth = width ? Math.round(ratio * 200) : 100
        const wght = weight ? Math.round(100 + ratio * 800) : 400
        const italicVal = italic ? ratio * 1 : 0
        const alphaVal = alpha ? 0.3 + ratio * 0.7 : 1

        span.style.fontVariationSettings = `'wdth' ${wdth}, 'wght' ${wght}, 'ital' ${italicVal}`
        span.style.opacity = String(alphaVal)

        if (stroke) {
          span.style.webkitTextStrokeColor = strokeColor
          span.style.webkitTextStrokeWidth = `${ratio * 3}px`
        }
      })

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [width, weight, italic, alpha, stroke, strokeColor])

  return (
    <>
      <style>{`
        @font-face {
          font-family: '${fontFamily}';
          src: url('${fontUrl}');
          font-style: normal;
        }
      `}</style>
      <div
        ref={containerRef}
        className={`flex items-center justify-start ${flex ? 'w-full' : ''} ${className}`}
        style={{ overflow: 'hidden' }}
      >
        <h1
          ref={titleRef}
          style={{
            fontFamily: `'${fontFamily}', sans-serif`,
            fontSize: `${fontSize}px`,
            lineHeight: scale ? lineHeight : 1,
            transform: scale ? `scaleY(${scaleY})` : 'none',
            transformOrigin: 'top left',
            color: textColor,
            margin: 0,
            padding: 0,
            display: 'flex',
            userSelect: 'none',
          }}
        >
          {chars.map((char, i) => (
            <span
              key={i}
              ref={(el) => { spansRef.current[i] = el }}
              style={{
                display: 'inline-block',
                fontVariationSettings: `'wdth' 0, 'wght' 100, 'ital' 0`,
              }}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          ))}
        </h1>
      </div>
    </>
  )
}
