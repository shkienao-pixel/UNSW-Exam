'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Cubes from '@/components/Cubes'

interface Props {
  label: string
  timeHint?: string
  progress?: number
  message?: string
}

/**
 * Full-viewport loading overlay for long-running AI generation tasks.
 * Rendered via portal to document.body so position:fixed works on iOS/iPad Safari
 * even when parent containers have overflow:auto.
 */
export default function GeneratingState({ label, timeHint, progress, message }: Props) {
  const isIndeterminate = progress === undefined
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const content = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        zIndex: 9999,
        background: 'rgba(6, 0, 16, 0.88)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        userSelect: 'none',
      }}
    >
      {/* Cubes animation — cellGap=0 prevents grid overflow beyond container */}
      <div style={{ width: 220, height: 220, flexShrink: 0, overflow: 'hidden' }}>
        <Cubes
          gridSize={8}
          cubeSize={27.5}
          maxAngle={180}
          radius={5}
          autoAnimate
          rippleOnClick
          cellGap={0}
        />
      </div>

      {/* Title */}
      <div className="text-center space-y-2">
        <p className="text-base font-semibold text-white">AI 正在生成{label}</p>
        {message && (
          <p className="text-sm" style={{ color: '#888' }}>{message}</p>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs space-y-2 px-4">
        {!isIndeterminate && (
          <div className="flex justify-between text-[11px]" style={{ color: '#555' }}>
            <span>{message ?? '生成中...'}</span>
            <span className="font-mono tabular-nums">{progress}%</span>
          </div>
        )}
        <div
          className="h-1.5 w-full rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {isIndeterminate ? (
            <div
              className="h-full w-[45%] rounded-full"
              style={{
                background: 'linear-gradient(90deg, #A78BFA, #F9A8D4)',
                animation: 'genSweep 1.8s ease-in-out infinite',
              }}
            />
          ) : (
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #A78BFA, #F9A8D4)' }}
            />
          )}
        </div>
        {timeHint && (
          <p className="text-[11px] text-center" style={{ color: '#555' }}>{timeHint}</p>
        )}
      </div>

      {/* Navigate-away tip */}
      <div
        className="rounded-xl px-4 py-2.5 text-[11px] text-center leading-relaxed max-w-xs"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          color: '#555',
        }}
      >
        💡 可以先去其他页面，生成完成后右下角会通知你
      </div>

      <style>{`
        @keyframes genSweep {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(340%); }
        }
      `}</style>
    </div>
  )

  if (!mounted) return null
  return createPortal(content, document.body)
}
