'use client'

import { Sparkles } from 'lucide-react'

export default function ClassroomTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(249,168,212,0.1)', border: '1px solid rgba(249,168,212,0.2)' }}>
        <Sparkles size={28} style={{ color: '#F9A8D4' }} />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-white font-semibold text-lg">AI 互动课堂</h2>
        <p className="text-sm" style={{ color: '#555' }}>功能正在开发中，敬请期待</p>
      </div>
    </div>
  )
}
