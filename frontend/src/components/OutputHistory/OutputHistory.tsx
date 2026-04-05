'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import type { Output } from '@/lib/types'
import './OutputHistory.css'

interface Props {
  outputs: Output[]
  selectedId: number | null
  onSelect: (output: Output) => void
}

export default function OutputHistory({ outputs, selectedId, onSelect }: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const prevLenRef = useRef(0)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const items = Array.from(list.querySelectorAll<HTMLLIElement>('.oh-item'))
    if (items.length === 0) return

    const newCount = items.length - prevLenRef.current
    const toAnimate = newCount > 0 ? items.slice(0, newCount) : items

    gsap.fromTo(
      toAnimate,
      { y: 14, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.45,
        ease: 'power3.out',
        stagger: { each: 0.07, from: 'start' },
        clearProps: 'transform,opacity',
      }
    )

    prevLenRef.current = items.length
  }, [outputs])

  if (outputs.length <= 1) return null

  return (
    <div className="oh-wrapper">
      <ul ref={listRef} className="oh-list" role="list">
        {outputs.map((o) => {
          const isActive = o.id === selectedId
          const date = new Date(o.created_at)
          const label = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
          const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          return (
            <li key={o.id} className="oh-item">
              <button
                className={`oh-btn${isActive ? ' is-active' : ''}`}
                onClick={() => onSelect(o)}
                aria-pressed={isActive}
              >
                <span className="oh-date">{label}</span>
                <span className="oh-time">{time}</span>
                {isActive && <span className="oh-dot" aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
