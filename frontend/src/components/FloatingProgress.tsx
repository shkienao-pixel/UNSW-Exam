'use client'

import { useGeneration } from '@/lib/generation-context'
import { useLang } from '@/lib/i18n'
import { Loader2, CheckCircle, XCircle, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'

/**
 * Floating generation status panel — fixed bottom-right.
 * Shows active generation jobs with animated progress bar,
 * and a toast when each job completes or fails.
 */
export default function FloatingProgress() {
  const { jobs, dismissJob } = useGeneration()
  const { lang } = useLang()

  if (jobs.length === 0) return null

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2"
      style={{ maxWidth: 320, pointerEvents: 'none' }}>
      {jobs.map(job => (
        <div key={job.id}
          className="flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl transition-all"
          style={{
            background: 'rgba(18,18,18,0.97)',
            border: job.status === 'done'
              ? '1px solid rgba(34,197,94,0.4)'
              : job.status === 'error'
              ? '1px solid rgba(255,68,68,0.4)'
              : '1px solid rgba(167,139,250,0.3)',
            backdropFilter: 'blur(16px)',
            pointerEvents: 'auto',
            minWidth: 260,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>

          {/* Status icon */}
          <div className="mt-0.5 flex-shrink-0">
            {job.status === 'generating' && (
              <Loader2 size={16} className="animate-spin" style={{ color: '#A78BFA' }} />
            )}
            {job.status === 'done' && (
              <CheckCircle size={16} style={{ color: '#22C55E' }} />
            )}
            {job.status === 'error' && (
              <XCircle size={16} style={{ color: '#FF4444' }} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {job.status === 'generating' && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-white leading-tight truncate">
                    {lang === 'zh' ? `AI 正在生成${job.label}` : `Generating ${job.label}...`}
                  </p>
                  {job.progress !== undefined && (
                    <span className="text-[10px] font-mono flex-shrink-0"
                      style={{ color: '#A78BFA' }}>
                      {job.progress}%
                    </span>
                  )}
                </div>
                {job.message && (
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: '#555' }}>{job.message}</p>
                )}
                {/* Progress bar */}
                <div className="mt-2 h-0.5 rounded-full overflow-hidden"
                  style={{ background: 'rgba(167,139,250,0.1)' }}>
                  {job.progress !== undefined ? (
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${job.progress}%`, background: 'linear-gradient(90deg, #A78BFA, #F9A8D4)' }} />
                  ) : (
                    <div className="h-full rounded-full w-[45%]"
                      style={{
                        background: 'linear-gradient(90deg, #A78BFA, #F9A8D4)',
                        animation: 'fpSweep 1.8s ease-in-out infinite',
                      }} />
                  )}
                </div>
                {job.timeHint && (
                  <p className="text-[10px] mt-1.5" style={{ color: '#333' }}>{job.timeHint}</p>
                )}
              </>
            )}
            {job.status === 'done' && (
              <>
                <p className="text-xs font-medium" style={{ color: '#22C55E' }}>
                  {lang === 'zh' ? `${job.label} 生成完成！` : `${job.label} done!`}
                </p>
                <Link href={job.viewLink}
                  className="inline-flex items-center gap-1 mt-1 text-xs transition-opacity hover:opacity-80"
                  style={{ color: '#FFD700', opacity: 0.85 }}>
                  <ExternalLink size={11} />
                  {lang === 'zh' ? '前往查看' : 'View →'}
                </Link>
              </>
            )}
            {job.status === 'error' && (
              <p className="text-xs" style={{ color: '#FF6666' }}>
                {lang === 'zh'
                  ? `生成失败：${job.error || '未知错误'}`
                  : `Failed: ${job.error || 'Unknown error'}`}
              </p>
            )}
          </div>

          {/* Dismiss button */}
          {(job.status === 'done' || job.status === 'error') && (
            <button onClick={() => dismissJob(job.id)}
              className="flex-shrink-0 transition-opacity hover:opacity-100"
              style={{ color: '#555', opacity: 0.7 }}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}

      <style>{`
        @keyframes fpSweep {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(340%); }
        }
      `}</style>
    </div>
  )
}
