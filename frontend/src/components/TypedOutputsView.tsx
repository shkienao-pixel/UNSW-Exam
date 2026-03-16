'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { Output } from '@/lib/types'
import { BookOpen, Loader2 } from 'lucide-react'

export interface TypedOutputsViewProps {
  courseId: string
  outputType: string
  icon: React.ReactNode
  title: string
  subtitle: string
  emptyTitle: string
  emptyLinkLabel: string
  headerExtra?: React.ReactNode
  renderContent: (output: Output) => React.ReactNode
}

export default function TypedOutputsView({
  courseId, outputType, icon, title, subtitle,
  emptyTitle, emptyLinkLabel, headerExtra, renderContent,
}: TypedOutputsViewProps) {
  const [outputs, setOutputs] = useState<Output[]>([])
  const [selected, setSelected] = useState<Output | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.outputs.list(courseId, outputType)
      .then(data => { setOutputs(data); if (data.length > 0) setSelected(data[0]) })
      .finally(() => setLoading(false))
  }, [courseId, outputType])

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} />
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">{icon} {title}</h2>
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-1">
          {headerExtra}
          {outputs.length > 1 && (
            <select className="input-glass text-xs py-1"
              value={selected?.id ?? ''}
              onChange={e => setSelected(outputs.find(o => o.id === Number(e.target.value)) ?? null)}>
              {outputs.map(o => (
                <option key={o.id} value={o.id}>
                  {new Date(o.created_at).toLocaleDateString('zh-CN')}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {outputs.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
          <BookOpen size={52} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-white mb-4">{emptyTitle}</p>
        </div>
      ) : selected ? renderContent(selected) : null}
    </div>
  )
}
