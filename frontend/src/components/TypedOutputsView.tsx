'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { Output } from '@/lib/types'
import { BookOpen } from 'lucide-react'
import { CubesLoader } from '@/components/Cubes'
import OutputHistory from '@/components/OutputHistory/OutputHistory'

export interface TypedOutputsViewProps {
  courseId: string
  outputType: string
  icon: React.ReactNode
  title: string
  subtitle: string
  emptyTitle: string
  emptyLinkLabel: string
  headerExtra?: React.ReactNode
  /** Shown instead of empty state when generation is in progress */
  generatingSlot?: React.ReactNode
  renderContent: (output: Output) => React.ReactNode
}

export default function TypedOutputsView({
  courseId, outputType, icon, title, subtitle,
  emptyTitle, emptyLinkLabel, headerExtra, generatingSlot, renderContent,
}: TypedOutputsViewProps) {
  const [outputs, setOutputs] = useState<Output[]>([])
  const [selected, setSelected] = useState<Output | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.outputs.list(courseId, outputType)
      .then(data => { setOutputs(data); if (data.length > 0) setSelected(data[0]) })
      .finally(() => setLoading(false))
  }, [courseId, outputType])

  if (loading) return <CubesLoader className="py-16" />

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">{icon} {title}</h2>
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-1">
          {headerExtra}
        </div>
      </div>

      <OutputHistory
        outputs={outputs}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />

      {outputs.length === 0 ? (
        generatingSlot ?? (
          <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
            <BookOpen size={52} className="mx-auto mb-4 opacity-20" />
            <p className="text-base font-medium text-white mb-4">{emptyTitle}</p>
          </div>
        )
      ) : selected ? renderContent(selected) : null}
    </div>
  )
}
