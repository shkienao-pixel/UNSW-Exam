'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

interface CubesProps {
  /** number of columns/rows in the grid */
  gridSize?: number
  /** max rotation angle in degrees */
  maxAngle?: number
  /** ripple spread radius (in grid cells) */
  radius?: number
  /** auto-animate continuously */
  autoAnimate?: boolean
  /** trigger ripple on click */
  rippleOnClick?: boolean
  /** border color of each cube */
  borderColor?: string
  /** face color of each cube */
  faceColor?: string
  /** size of the entire grid container in px */
  size?: number
  className?: string
}

interface CubeState {
  angle: number
  target: number
}

export default function Cubes({
  gridSize = 8,
  maxAngle = 180,
  radius = 5,
  autoAnimate = true,
  rippleOnClick = true,
  borderColor = 'rgba(200,165,90,0.45)',
  faceColor = 'rgba(200,165,90,0.08)',
  size = 120,
  className = '',
}: CubesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<CubeState[][]>([])
  const rafRef = useRef<number>(0)
  const timeRef = useRef(0)
  const [, forceRender] = useState(0)

  // initialise grid state
  useEffect(() => {
    stateRef.current = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => ({ angle: 0, target: 0 })),
    )
    forceRender(n => n + 1)
  }, [gridSize])

  // ripple helper
  const triggerRipple = useCallback(
    (originRow: number, originCol: number) => {
      const grid = stateRef.current
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          const dist = Math.hypot(r - originRow, c - originCol)
          if (dist <= radius) {
            const delay = dist * 60
            const cell = grid[r][c]
            setTimeout(() => {
              cell.target = maxAngle * (1 - dist / radius)
              setTimeout(() => {
                cell.target = 0
              }, 400)
            }, delay)
          }
        }
      }
    },
    [gridSize, radius, maxAngle],
  )

  // auto-animate: random ripple every ~2s
  useEffect(() => {
    if (!autoAnimate) return
    const interval = setInterval(() => {
      const r = Math.floor(Math.random() * gridSize)
      const c = Math.floor(Math.random() * gridSize)
      triggerRipple(r, c)
    }, 1800)
    return () => clearInterval(interval)
  }, [autoAnimate, gridSize, triggerRipple])

  // animation loop — lerp angle toward target
  useEffect(() => {
    const grid = stateRef.current
    function tick() {
      let dirty = false
      for (const row of grid) {
        for (const cell of row) {
          const diff = cell.target - cell.angle
          if (Math.abs(diff) > 0.05) {
            cell.angle += diff * 0.12
            dirty = true
          } else {
            cell.angle = cell.target
          }
        }
      }
      if (dirty) forceRender(n => n + 1)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!rippleOnClick || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const cellSize = size / gridSize
      const col = Math.floor((e.clientX - rect.left) / cellSize)
      const row = Math.floor((e.clientY - rect.top) / cellSize)
      triggerRipple(
        Math.max(0, Math.min(gridSize - 1, row)),
        Math.max(0, Math.min(gridSize - 1, col)),
      )
    },
    [rippleOnClick, size, gridSize, triggerRipple],
  )

  const cellSize = size / gridSize
  const grid = stateRef.current

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`${className} ${rippleOnClick ? 'cursor-pointer' : ''}`}
      style={{ width: size, height: size, position: 'relative' }}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const angle = cell.angle
          return (
            <div
              key={`${r}-${c}`}
              style={{
                position: 'absolute',
                left: c * cellSize,
                top: r * cellSize,
                width: cellSize,
                height: cellSize,
                perspective: cellSize * 4,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  transformStyle: 'preserve-3d',
                  transform: `rotateX(${angle}deg) rotateY(${angle * 0.6}deg)`,
                  transition: 'none',
                }}
              >
                {/* front face */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 1,
                    borderRadius: Math.min(2, cellSize * 0.15),
                    background: faceColor,
                    border: `1px solid ${borderColor}`,
                    backfaceVisibility: 'hidden',
                  }}
                />
                {/* back face */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 1,
                    borderRadius: Math.min(2, cellSize * 0.15),
                    background: faceColor,
                    border: `1px solid ${borderColor}`,
                    transform: 'rotateX(180deg) translateZ(0px)',
                    backfaceVisibility: 'hidden',
                  }}
                />
              </div>
            </div>
          )
        }),
      )}
    </div>
  )
}

// ── Convenience wrapper: centered full-screen/section loader ──────────────────

export function CubesLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Cubes
        gridSize={8}
        maxAngle={180}
        radius={5}
        autoAnimate
        rippleOnClick
        size={120}
      />
    </div>
  )
}
