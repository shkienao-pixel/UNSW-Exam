'use client'

import Link from 'next/link'
import { X, Zap } from 'lucide-react'

interface Props {
  balance: number
  required: number
  onClose: () => void
}

export default function InsufficientCreditsModal({ balance, required, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-5 shadow-2xl"
        style={{
          background: 'rgba(10,10,20,0.98)',
          border: '1px solid rgba(255,215,0,0.2)',
        }}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={18} style={{ color: '#FFD700' }} />
            <span className="font-semibold text-white">积分不足</span>
          </div>
          <button onClick={onClose} style={{ color: '#555' }}>
            <X size={16} />
          </button>
        </div>

        {/* Balance info */}
        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.12)' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#666' }}>当前余额</span>
            <span className="font-bold" style={{ color: '#FFD700' }}>{balance} ✦</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#666' }}>此操作需要</span>
            <span className="font-bold text-white">{required} ✦</span>
          </div>
          <div className="pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: '#666' }}>还差</span>
              <span className="font-bold" style={{ color: '#ff8080' }}>{required - balance} ✦</span>
            </div>
          </div>
        </div>

        {/* How to earn */}
        <div>
          <p className="text-xs mb-2" style={{ color: '#555' }}>如何获得积分：</p>
          <ul className="space-y-1.5 text-xs" style={{ color: '#777' }}>
            <li className="flex items-center gap-2">
              <span style={{ color: '#FFD700' }}>+1</span> 上传文件并等待审核通过
            </li>
            <li className="flex items-center gap-2">
              <span style={{ color: '#FFD700' }}>+1</span> 提交反馈被管理员采纳
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            href="?view=resources"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,180,0,0.1))',
              color: '#FFD700',
              border: '1px solid rgba(255,215,0,0.35)',
            }}>
            去上传文件
          </Link>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ color: '#555', border: '1px solid rgba(255,255,255,0.08)' }}>
            稍后再说
          </button>
        </div>
      </div>
    </div>
  )
}
