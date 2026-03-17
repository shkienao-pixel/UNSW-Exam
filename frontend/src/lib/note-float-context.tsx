'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface NoteFloatContextValue {
  isOpen: boolean
  courseId: string | null
  courseName: string
  openWindow: (courseId?: string, courseName?: string) => void
  closeWindow: () => void
}

const Ctx = createContext<NoteFloatContextValue | null>(null)

export function useNoteFloat(): NoteFloatContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNoteFloat must be used within NoteFloatProvider')
  return ctx
}

export function NoteFloatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [courseName, setCourseName] = useState('')

  function openWindow(cId?: string, cName?: string) {
    if (cId) setCourseId(cId)
    if (cName) setCourseName(cName)
    setIsOpen(true)
  }

  function closeWindow() {
    setIsOpen(false)
  }

  return (
    <Ctx.Provider value={{ isOpen, courseId, courseName, openWindow, closeWindow }}>
      {children}
    </Ctx.Provider>
  )
}
