'use client'

export const NOTES_CHANGED_EVENT = 'notes:changed'
export const FLASHCARD_MISTAKES_CHANGED_EVENT = 'flashcard-mistakes:changed'

type CourseScopedDetail = {
  courseId?: string | null
}

function emitEvent<TDetail>(name: string, detail: TDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

function subscribeEvent<TDetail>(
  name: string,
  handler: (detail: TDetail) => void,
) {
  if (typeof window === 'undefined') return () => {}

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<TDetail>
    handler(customEvent.detail)
  }

  window.addEventListener(name, listener as EventListener)
  return () => window.removeEventListener(name, listener as EventListener)
}

export function emitNotesChanged(detail: CourseScopedDetail = {}) {
  emitEvent(NOTES_CHANGED_EVENT, detail)
}

export function subscribeNotesChanged(handler: (detail: CourseScopedDetail) => void) {
  return subscribeEvent<CourseScopedDetail>(NOTES_CHANGED_EVENT, handler)
}

export function emitFlashcardMistakesChanged(detail: CourseScopedDetail) {
  emitEvent(FLASHCARD_MISTAKES_CHANGED_EVENT, detail)
}

export function subscribeFlashcardMistakesChanged(handler: (detail: CourseScopedDetail) => void) {
  return subscribeEvent<CourseScopedDetail>(FLASHCARD_MISTAKES_CHANGED_EVENT, handler)
}
