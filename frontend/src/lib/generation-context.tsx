'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Output } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type GenJobStatus = 'generating' | 'done' | 'error'

export interface GenJob {
  id: string
  label: string        // e.g. "知识摘要"
  viewLink: string     // e.g. "/courses/xxx?view=summary"
  status: GenJobStatus
  error?: string
}

interface GenCtxValue {
  jobs: GenJob[]
  /** Start tracking a generation promise. Returns the job id. */
  trackGeneration: (params: {
    label: string
    viewLink: string
    promise: Promise<Output>
    onSuccess?: (result: Output) => void
    onError?: (err: Error) => void
  }) => string
  dismissJob: (id: string) => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const GenCtx = createContext<GenCtxValue>({
  jobs: [],
  trackGeneration: () => '',
  dismissJob: () => {},
})

let _counter = 0
function nextId() { return `gen-${++_counter}` }

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<GenJob[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismissJob = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setJobs(prev => prev.filter(j => j.id !== id))
  }, [])

  const trackGeneration = useCallback((params: {
    label: string
    viewLink: string
    promise: Promise<Output>
    onSuccess?: (result: Output) => void
    onError?: (err: Error) => void
  }) => {
    const id = nextId()
    const job: GenJob = { id, label: params.label, viewLink: params.viewLink, status: 'generating' }
    setJobs(prev => [...prev, job])

    params.promise
      .then(result => {
        setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'done' } : j))
        params.onSuccess?.(result)
        // Auto-dismiss after 8 seconds
        const t = setTimeout(() => dismissJob(id), 8000)
        timers.current.set(id, t)
      })
      .catch((err: Error) => {
        setJobs(prev => prev.map(j => j.id === id
          ? { ...j, status: 'error', error: err?.message || '生成失败' }
          : j,
        ))
        params.onError?.(err)
        // Auto-dismiss errors after 12 seconds
        const t = setTimeout(() => dismissJob(id), 12000)
        timers.current.set(id, t)
      })

    return id
  }, [dismissJob])

  return (
    <GenCtx.Provider value={{ jobs, trackGeneration, dismissJob }}>
      {children}
    </GenCtx.Provider>
  )
}

export function useGeneration() {
  return useContext(GenCtx)
}
