'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { api } from '@/lib/api'
import { MessageSquarePlus, Send, Loader2, X } from 'lucide-react'

export default function FeedbackWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSending(true)
    setSubmitError('')
    try {
      await api.feedback.submit(trimmed, pathname)
      setSent(true)
      setText('')
      setTimeout(() => { setSent(false); setOpen(false) }, 2000)
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : '提交失败，请稍后重试')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating trigger button — right side, vertically centered */}
      <button
        onClick={() => setOpen(o => !o)}
        title="意见反馈"
        className="fixed z-40 flex items-center justify-center transition-all"
        style={{
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 36,
          height: 80,
          background: 'rgba(255,215,0,0.12)',
          border: '1px solid rgba(200,165,90,0.25)',
          borderRight: 'none',
          borderRadius: '8px 0 0 8px',
          color: '#e6cf98',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}>
        <span style={{ writingMode: 'vertical-rl', fontSize: 11, letterSpacing: 2, fontWeight: 600 }}>
          反馈
        </span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end"
          style={{ paddingRight: 44, paddingBottom: '20vh' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-80 rounded-2xl p-5 space-y-4 shadow-2xl"
            style={{
              background: 'rgba(10,10,20,0.97)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
            }}>
            {/* Header */}
            <div className="flex items-center gap-2">
              <MessageSquarePlus size={16} style={{ color: '#c8a55a' }} />
              <span className="text-sm font-semibold text-white">意见反馈</span>
              <button onClick={() => setOpen(false)} className="ml-auto" style={{ color: '#555' }}>
                <X size={14} />
              </button>
            </div>

            {/* Page hint */}
            <p className="text-xs rounded-lg px-2 py-1 truncate" style={{ background: 'rgba(255,255,255,0.04)', color: '#555' }}>
              📍 {pathname}
            </p>

            {/* Text area */}
            {sent ? (
              <div className="text-center py-4 text-sm" style={{ color: '#4ade80' }}>
                ✅ 感谢反馈，已收到！
              </div>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="描述你遇到的问题或建议..."
                  rows={4}
                  maxLength={2000}
                  className="w-full text-sm rounded-xl px-3 py-2 outline-none resize-none"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                  }} />
                {submitError && (
                  <p className="text-xs px-2 py-1 rounded-lg" style={{ color: '#ff8080', background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.2)' }}>
                    ⚠️ {submitError}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: '#444' }}>{text.length}/2000</span>
                  <button
                    onClick={submit}
                    disabled={sending || !text.trim()}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-all"
                    style={{ background: 'rgba(200,165,90,0.12)', color: '#e6cf98', border: '1px solid rgba(200,165,90,0.2)' }}>
                    {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {sending ? '发送中…' : '提交'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
