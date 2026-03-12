'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error'

interface ToastProps {
  message: string
  type: ToastType
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 入场动画
    const show = setTimeout(() => setVisible(true), 10)
    // 自动关闭
    const hide = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, duration)

    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [duration, onClose])

  const isSuccess = type === 'success'

  return (
    <div
      className="fixed inset-x-0 top-6 z-50 flex justify-center px-4 pointer-events-none"
    >
      <div
        className={[
          'pointer-events-auto flex items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300',
          visible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
          isSuccess
            ? 'border-[#c8a55a]/25 bg-[#c8a55a]/10 text-[#e8cc8a]'
            : 'border-red-400/20 bg-red-500/10 text-red-200',
        ].join(' ')}
      >
        {isSuccess
          ? <CheckCircle2 size={17} className="shrink-0" />
          : <XCircle size={17} className="shrink-0" />
        }
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={() => { setVisible(false); setTimeout(onClose, 300) }}
          className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
