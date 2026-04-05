'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { StoredMistake, FlashcardMistake } from '@/lib/types'

export type { StoredMistake, FlashcardMistake }

export interface MistakesStore {
  examMistakes: StoredMistake[]
  fcMistakes: FlashcardMistake[]
  loading: boolean
  refresh: () => void
  masterExam: (questionId: number) => void
  removeExam: (questionId: number) => void
  masterFlashcard: (mistakeId: number) => void
  removeFlashcard: (mistakeId: number) => void
}

export function useMistakesStore(courseId?: string): MistakesStore {
  const [examMistakes, setExamMistakes] = useState<StoredMistake[]>([])
  const [fcMistakes, setFcMistakes] = useState<FlashcardMistake[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [exam, fc] = await Promise.allSettled([
        courseId ? api.exam.listMistakes(courseId) : api.exam.listAllMistakes(),
        courseId ? api.flashcardMistakes.list(courseId) : Promise.resolve([]),
      ])
      if (exam.status === 'fulfilled') setExamMistakes(exam.value)
      if (fc.status === 'fulfilled') setFcMistakes(fc.value)
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => { refresh() }, [refresh])

  function masterExam(questionId: number) {
    setExamMistakes(prev => prev.map(m =>
      m.question_id === questionId
        ? { ...m, mistake_status: 'mastered' as const, mastered_at: new Date().toISOString() }
        : m
    ))
    api.exam.masterMistake(questionId).catch(() => refresh())
  }

  function removeExam(questionId: number) {
    setExamMistakes(prev => prev.filter(m => m.question_id !== questionId))
    api.exam.deleteMistake(questionId).catch(() => refresh())
  }

  function masterFlashcard(mistakeId: number) {
    setFcMistakes(prev => prev.map(m =>
      m.id === mistakeId ? { ...m, mistake_status: 'mastered' as const } : m
    ))
    if (courseId) api.flashcardMistakes.update(courseId, mistakeId, 'mastered').catch(() => refresh())
  }

  function removeFlashcard(mistakeId: number) {
    setFcMistakes(prev => prev.filter(m => m.id !== mistakeId))
    if (courseId) api.flashcardMistakes.delete(courseId, mistakeId).catch(() => refresh())
  }

  return {
    examMistakes, fcMistakes, loading, refresh,
    masterExam, removeExam, masterFlashcard, removeFlashcard,
  }
}
