'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import './PillNav.css'

export interface PillNavItem {
  id: string
  label: string
  badge?: number
}

interface Props {
  items: PillNavItem[]
  activeId: string
  onSelect: (id: string) => void
  /** Nav bar background color */
  baseColor?: string
  /** Inactive pill background */
  pillColor?: string
  /** Inactive pill text color */
  pillTextColor?: string
  /** Text color after hover animation completes */
  hoveredPillTextColor?: string
  /** Active pill background (defaults to pillColor) */
  activePillColor?: string
  ease?: string
  className?: string
}

export default function PillNav({
  items,
  activeId,
  onSelect,
  baseColor = 'rgba(255,255,255,0.04)',
  pillColor = 'rgba(255,255,255,0.07)',
  pillTextColor = '#666',
  hoveredPillTextColor = '#fff',
  activePillColor,
  ease = 'power3.out',
  className = '',
}: Props) {
  const circleRefs = useRef<(HTMLSpanElement | null)[]>([])
  const tlRefs = useRef<gsap.core.Timeline[]>([])
  const activeTweenRefs = useRef<gsap.core.Tween[]>([])

  useEffect(() => {
    const layout = () => {
      circleRefs.current.forEach((circle, i) => {
        if (!circle?.parentElement) return

        const pill = circle.parentElement
        const rect = pill.getBoundingClientRect()
        const { width: w, height: h } = rect
        if (w === 0 || h === 0) return

        const R = ((w * w) / 4 + h * h) / (2 * h)
        const D = Math.ceil(2 * R) + 2
        const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1
        const originY = D - delta

        circle.style.width = `${D}px`
        circle.style.height = `${D}px`
        circle.style.bottom = `-${delta}px`

        gsap.set(circle, {
          xPercent: -50,
          scale: 0,
          transformOrigin: `50% ${originY}px`,
        })

        const label = pill.querySelector('.pill-label')
        const hoverLabel = pill.querySelector('.pill-label-hover')

        if (label) gsap.set(label, { y: 0 })
        if (hoverLabel) gsap.set(hoverLabel, { y: h + 12, opacity: 0 })

        tlRefs.current[i]?.kill()
        const tl = gsap.timeline({ paused: true })

        tl.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease, overwrite: 'auto' }, 0)
        if (label) tl.to(label, { y: -(h + 8), duration: 2, ease, overwrite: 'auto' }, 0)
        if (hoverLabel) {
          gsap.set(hoverLabel, { y: Math.ceil(h + 100), opacity: 0 })
          tl.to(hoverLabel, { y: 0, opacity: 1, duration: 2, ease, overwrite: 'auto' }, 0)
        }

        tlRefs.current[i] = tl
      })
    }

    layout()
    window.addEventListener('resize', layout)
    document.fonts?.ready.then(layout).catch(() => {})
    return () => window.removeEventListener('resize', layout)
  }, [items, ease])

  function handleEnter(i: number) {
    const tl = tlRefs.current[i]
    if (!tl) return
    activeTweenRefs.current[i]?.kill()
    activeTweenRefs.current[i] = tl.tweenTo(tl.duration(), {
      duration: 0.3,
      ease,
      overwrite: 'auto',
    }) as unknown as gsap.core.Tween
  }

  function handleLeave(i: number) {
    const tl = tlRefs.current[i]
    if (!tl) return
    activeTweenRefs.current[i]?.kill()
    activeTweenRefs.current[i] = tl.tweenTo(0, {
      duration: 0.2,
      ease,
      overwrite: 'auto',
    }) as unknown as gsap.core.Tween
  }

  const cssVars = {
    '--base': baseColor,
    '--pill-bg': pillColor,
    '--pill-text': pillTextColor,
    '--hover-text': hoveredPillTextColor,
    '--active-bg': activePillColor ?? pillColor,
  } as React.CSSProperties

  return (
    <div className="no-scrollbar overflow-x-auto">
    <div className={`pill-tabs ${className}`} style={cssVars}>
      <ul className="pill-tabs-list" role="tablist">
        {items.map((item, i) => {
          const isActive = item.id === activeId
          return (
            <li key={item.id} role="none">
              <button
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(item.id)}
                onMouseEnter={() => handleEnter(i)}
                onMouseLeave={() => handleLeave(i)}
                className={`pill-tab${isActive ? ' is-active' : ''}`}
              >
                <span
                  className="hover-circle"
                  aria-hidden="true"
                  ref={el => { circleRefs.current[i] = el }}
                />
                <span className="label-stack">
                  <span className="pill-label">{item.label}</span>
                  <span className="pill-label-hover" aria-hidden="true">{item.label}</span>
                </span>
                {item.badge != null && item.badge > 0 && (
                  <span
                    className="pill-badge text-[9px] font-bold px-1.5 py-px rounded-full flex-shrink-0"
                    style={{ background: 'rgba(255,68,68,0.85)', color: '#fff' }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
    </div>
  )
}
