'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { StoredMistake } from '@/lib/types'

export type { StoredMistake }

// ── React hook ────────────────────────────────────────────────────────────────

export function useMistakes(courseId?: string) {
  const [all, setAll] = useState<StoredMistake[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = courseId
        ? await api.exam.listMistakes(courseId)
        : await api.exam.listAllMistakes()
      setAll(data)
    } catch {
      // keep existing state on error
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function master(questionId: number) {
    // Optimistic update
    setAll(prev => prev.map(m =>
      m.question_id === questionId
        ? { ...m, mistake_status: 'mastered' as const, mastered_at: new Date().toISOString() }
        : m,
    ))
    try {
      await api.exam.masterMistake(questionId)
    } catch {
      await refresh()
    }
  }

  async function remove(questionId: number) {
    // Optimistic update
    setAll(prev => prev.filter(m => m.question_id !== questionId))
    try {
      await api.exam.deleteMistake(questionId)
    } catch {
      await refresh()
    }
  }

  return {
    all,
    active: all.filter(m => m.mistake_status === 'active'),
    mastered: all.filter(m => m.mistake_status === 'mastered'),
    loading,
    master,
    remove,
    refresh,
  }
}
