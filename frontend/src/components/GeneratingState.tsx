'use client'

import { Sparkles } from 'lucide-react'
import { CubesLoader } from '@/components/Cubes'

interface Props {
  label: string
  timeHint?: string    // e.g. "通常需要 30-60 秒"
  progress?: number    // 0-100, undefined = indeterminate
  message?: string     // current step description
}

/**
 * Full-page loading state for long-running AI generation tasks.
 * Shows animated icon, progress bar, and a "navigate away" tip.
 */
export default function GeneratingState({ label, timeHint, progress, message }: Props) {
  const isIndeterminate = progress === undefined

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-7 max-w-sm mx-auto select-none">

      {/* Cubes animation */}
      <CubesLoader className="w-full" />

      {/* Title + step message */}
      <div className="text-center space-y-1.5">
        <p className="text-sm font-semibold text-white">AI 正在生成{label}</p>
        {message && (
          <p className="text-xs" style={{ color: '#555' }}>{message}</p>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full space-y-2">
        {!isIndeterminate && (
          <div className="flex justify-between text-[11px]" style={{ color: '#444' }}>
            <span>{message ?? '生成中...'}</span>
            <span className="font-mono tabular-nums">{progress}%</span>
          </div>
        )}
        <div className="h-1.5 w-full rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          {isIndeterminate ? (
            <div className="h-full w-[45%] rounded-full"
              style={{
                background: 'linear-gradient(90deg, #A78BFA, #F9A8D4)',
                animation: 'genSweep 1.8s ease-in-out infinite',
              }} />
          ) : (
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #A78BFA, #F9A8D4)' }} />
          )}
        </div>
        {timeHint && (
          <p className="text-[11px]" style={{ color: '#333' }}>{timeHint}</p>
        )}
      </div>

      {/* Navigate-away tip */}
      <div className="rounded-xl px-4 py-2.5 text-[11px] text-center leading-relaxed"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', color: '#444' }}>
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
}
