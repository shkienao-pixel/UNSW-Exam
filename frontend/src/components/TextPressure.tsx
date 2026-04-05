'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

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

const getAttr = (distance: number, maxDist: number, minVal: number, maxVal: number) => {
  const val = maxVal - Math.abs((maxVal * distance) / maxDist)
  return Math.max(minVal, val + minVal)
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

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursorRef.current.x = e.clientX
      cursorRef.current.y = e.clientY
    }
    const onTouch = (e: TouchEvent) => {
      cursorRef.current.x = e.touches[0].clientX
      cursorRef.current.y = e.touches[0].clientY
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onTouch, { passive: true })

    if (containerRef.current) {
      const { left, top, width: w, height: h } = containerRef.current.getBoundingClientRect()
      mouseRef.current = { x: left + w / 2, y: top + h / 2 }
      cursorRef.current = { ...mouseRef.current }
    }
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onTouch)
    }
  }, [])

  const setSize = useCallback(() => {
    if (!containerRef.current || !titleRef.current) return
    const { width: cw, height: ch } = containerRef.current.getBoundingClientRect()
    let fs = cw / (chars.length / 2)
    fs = Math.max(fs, minFontSize)
    setFontSize(fs)
    setScaleY(1)
    setLineHeight(1)
    requestAnimationFrame(() => {
      if (!titleRef.current) return
      const th = titleRef.current.getBoundingClientRect().height
      if (scale && th > 0) {
        setScaleY(ch / th)
        setLineHeight(ch / th)
      }
    })
  }, [chars.length, minFontSize, scale])

  useEffect(() => {
    setSize()
    window.addEventListener('resize', setSize)
    return () => window.removeEventListener('resize', setSize)
  }, [setSize])

  useEffect(() => {
    const animate = () => {
      mouseRef.current.x += (cursorRef.current.x - mouseRef.current.x) / 15
      mouseRef.current.y += (cursorRef.current.y - mouseRef.current.y) / 15

      if (titleRef.current) {
        const maxDist = titleRef.current.getBoundingClientRect().width / 2
        spansRef.current.forEach(span => {
          if (!span) return
          const r = span.getBoundingClientRect()
          const cx = r.x + r.width / 2
          const cy = r.y + r.height / 2
          const dx = mouseRef.current.x - cx
          const dy = mouseRef.current.y - cy
          const d = Math.sqrt(dx * dx + dy * dy)

          const wdth = width ? Math.floor(getAttr(d, maxDist, 5, 200)) : 100
          const wght = weight ? Math.floor(getAttr(d, maxDist, 100, 900)) : 400
          const italVal = italic ? getAttr(d, maxDist, 0, 1).toFixed(2) : '0'
          const alphaVal = alpha ? getAttr(d, maxDist, 0, 1).toFixed(2) : '1'

          span.style.fontVariationSettings = `'wght' ${wght}, 'wdth' ${wdth}, 'ital' ${italVal}`
          if (alpha) span.style.opacity = alphaVal
        })
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [width, weight, italic, alpha])

  const dynClass = [className, flex ? 'flex' : '', stroke ? 'stroke' : ''].filter(Boolean).join(' ')

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', background: 'transparent' }}>
      <style>{`
        @font-face {
          font-family: '${fontFamily}';
          src: url('${fontUrl}');
          font-style: normal;
        }
        .text-pressure-flex { display: flex; justify-content: space-between; }
        .text-pressure-stroke span { position: relative; color: ${textColor}; }
        .text-pressure-stroke span::after {
          content: attr(data-char); position: absolute; left: 0; top: 0;
          color: transparent; z-index: -1;
          -webkit-text-stroke-width: 3px; -webkit-text-stroke-color: ${strokeColor};
        }
      `}</style>
      <h1
        ref={titleRef}
        className={[
          flex ? 'text-pressure-flex' : '',
          stroke ? 'text-pressure-stroke' : '',
          dynClass,
        ].filter(Boolean).join(' ')}
        style={{
          fontFamily,
          fontSize,
          lineHeight,
          transform: `scale(1, ${scaleY})`,
          transformOrigin: 'center top',
          margin: 0,
          userSelect: 'none',
          whiteSpace: 'nowrap',
          fontWeight: 100,
          width: '100%',
          color: textColor,
        }}
      >
        {chars.map((char, i) => (
          <span
            key={i}
            ref={el => { spansRef.current[i] = el }}
            data-char={char}
            style={{ display: 'inline-block' }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </h1>
    </div>
  )
}
