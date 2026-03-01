'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoredMistake {
  id: string
  courseId: string
  source: 'quiz' | 'flashcard'
  /** Question text (front for vocab cards) */
  question: string
  /** MCQ options without letter prefix. Absent for vocab cards. */
  options?: string[]
  /** 'A'/'B'/... for MCQ; definition text for vocab */
  correctAnswer: string
  userAnswer?: string
  explanation?: string
  sourceFile?: string
  sourceUrl?: string
  status: 'active' | 'mastered'
  createdAt: string
  masteredAt?: string
}

// ── Storage key ────────────────────────────────────────────────────────────────

const KEY = 'exam_mistakes_v1'

// ── Pure storage functions ─────────────────────────────────────────────────────

export function loadAllMistakes(): StoredMistake[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') }
  catch { return [] }
}

function persist(list: StoredMistake[]): void {
  localStorage.setItem(KEY, JSON.stringify(list))
  // Notify same-tab listeners (custom event, not storage event)
  window.dispatchEvent(new CustomEvent('mistakes-updated'))
}

/**
 * Add a mistake. Deduplicates by (courseId + source + question).
 * If already exists and was mastered, re-activates it.
 */
export function addMistake(
  data: Omit<StoredMistake, 'id' | 'status' | 'createdAt' | 'masteredAt'>,
): void {
  const all = loadAllMistakes()
  const idx = all.findIndex(
    m =>
      m.courseId === data.courseId &&
      m.source === data.source &&
      m.question === data.question,
  )
  if (idx !== -1) {
    const updated = [...all]
    updated[idx] = {
      ...updated[idx],
      status: 'active',
      userAnswer: data.userAnswer,
      masteredAt: undefined,
    }
    persist(updated)
    return
  }
  const item: StoredMistake = {
    ...data,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: 'active',
    createdAt: new Date().toISOString(),
  }
  persist([item, ...all])
}

export function masterMistake(id: string): void {
  persist(
    loadAllMistakes().map(m =>
      m.id === id
        ? { ...m, status: 'mastered' as const, masteredAt: new Date().toISOString() }
        : m,
    ),
  )
}

export function deleteMistake(id: string): void {
  persist(loadAllMistakes().filter(m => m.id !== id))
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useMistakes() {
  const [all, setAll] = useState<StoredMistake[]>([])
  const refresh = useCallback(() => setAll(loadAllMistakes()), [])

  useEffect(() => {
    refresh()
    window.addEventListener('mistakes-updated', refresh)
    return () => window.removeEventListener('mistakes-updated', refresh)
  }, [refresh])

  return {
    all,
    active: all.filter(m => m.status === 'active'),
    mastered: all.filter(m => m.status === 'mastered'),
    master: (id: string) => { masterMistake(id); refresh() },
    remove: (id: string) => { deleteMistake(id); refresh() },
    refresh,
  }
}
