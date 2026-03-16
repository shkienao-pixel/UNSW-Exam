'use client'

import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { api } from './api'

// ── Types ─────────────────────────────────────────────────────────────────────

type AskSource = { artifact_id: number; file_name: string; storage_url: string }

export type FloatingMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: AskSource[]
  imagePreview?: string
  streaming?: boolean
  streamStatus?: 'generating' | 'slow'
  pending?: boolean
  failed?: boolean
}

interface FloatingAskContextValue {
  isOpen: boolean
  isMinimized: boolean
  messages: FloatingMessage[]
  courseId: string | null
  courseName: string
  credits: number | null
  unreadCount: number
  isLoading: boolean
  prefillText: string
  setCourseContext: (courseId: string, courseName: string) => void
  openWindow: () => void
  openWindowWithPrefill: (question: string) => void
  closeWindow: () => void
  minimizeWindow: () => void
  clearMessages: () => void
  clearPrefill: () => void
  sendMessage: (question: string, imageFile: File | null) => void
  stopGeneration: () => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<FloatingAskContextValue | null>(null)

export function useFloatingAsk(): FloatingAskContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFloatingAsk must be used within FloatingAskProvider')
  return ctx
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _msgCounter = 0
function nextId(): string { return String(++_msgCounter) }

// ── Per-course localStorage helpers ──────────────────────────────────────────

const MAX_STORED = 60

function storageKey(courseId: string) {
  return `floating_ask_messages_${courseId}`
}

function loadMessages(courseId: string): FloatingMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(courseId))
    if (!raw) return []
    const parsed: FloatingMessage[] = JSON.parse(raw)
    return parsed
      .filter(m => !m.streaming && !m.pending)
      .map(m => ({
        ...m,
        imagePreview: m.imagePreview?.startsWith('blob:') ? undefined : m.imagePreview,
      }))
      .slice(-MAX_STORED)
  } catch {
    return []
  }
}

function saveMessages(courseId: string, msgs: FloatingMessage[]) {
  try {
    const toSave = msgs
      .filter(m => !m.streaming && !m.pending)
      .map(m => ({
        ...m,
        imagePreview: m.imagePreview?.startsWith('blob:') ? undefined : m.imagePreview,
      }))
      .slice(-MAX_STORED)
    localStorage.setItem(storageKey(courseId), JSON.stringify(toSave))
  } catch { /* quota exceeded */ }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function FloatingAskProvider({ children }: { children: ReactNode }) {
  const [isOpen,       setIsOpen]       = useState(false)
  const [isMinimized,  setIsMinimized]  = useState(false)
  const [messages,     setMessages]     = useState<FloatingMessage[]>([])
  const [courseId,     setCourseId]     = useState<string | null>(null)
  const [courseName,   setCourseName]   = useState('')
  const [credits,      setCredits]      = useState<number | null>(null)
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [isLoading,    setIsLoading]    = useState(false)
  const [prefillText,  setPrefillText]  = useState('')
  const abortRef      = useRef<AbortController | null>(null)
  const messagesRef   = useRef<FloatingMessage[]>([])
  const courseIdRef   = useRef<string | null>(null)
  const courseNameRef = useRef<string>('')

  // Keep refs in sync
  useEffect(() => { messagesRef.current   = messages   }, [messages])
  useEffect(() => { courseIdRef.current   = courseId   }, [courseId])
  useEffect(() => { courseNameRef.current = courseName }, [courseName])

  // Load per-course messages when courseId changes
  useEffect(() => {
    if (!courseId) return
    setMessages(loadMessages(courseId))
  }, [courseId])

  // Persist stable messages to localStorage
  useEffect(() => {
    if (!courseId) return
    const stable = messages.filter(m => !m.streaming && !m.pending)
    if (stable.length === messages.length) saveMessages(courseId, messages)
  }, [messages, courseId])

  // Fetch credit balance on course entry and after messages settle
  const refreshCredits = useCallback(async () => {
    try {
      const res = await api.credits.balance()
      setCredits(res.balance)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (courseId) refreshCredits()
  }, [courseId, refreshCredits])

  const setCourseContext = useCallback((cid: string, name: string) => {
    setCourseId(cid)
    setCourseName(name)
  }, [])

  const openWindow = useCallback(() => {
    setIsOpen(true)
    setIsMinimized(false)
    setUnreadCount(0)
  }, [])

  const openWindowWithPrefill = useCallback((question: string) => {
    setIsOpen(true)
    setIsMinimized(false)
    setUnreadCount(0)
    setPrefillText(question)
  }, [])

  const closeWindow = useCallback(() => {
    setIsOpen(false)
    setIsMinimized(false)
  }, [])

  const minimizeWindow = useCallback(() => setIsMinimized(true), [])

  const clearMessages = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setIsLoading(false)
    if (courseIdRef.current) {
      try { localStorage.removeItem(storageKey(courseIdRef.current)) } catch { /* ignore */ }
    }
  }, [])

  const clearPrefill = useCallback(() => setPrefillText(''), [])

  const stopGeneration = useCallback(() => { abortRef.current?.abort() }, [])

  const sendMessage = useCallback((question: string, imageFile: File | null) => {
    const cid = courseIdRef.current
    if (!cid || isLoading) return

    const asstMsgId = nextId()

    // Build history from ref (always fresh, no stale closure)
    const historySnapshot = messagesRef.current
      .filter(m => !m.streaming && !m.pending && !m.failed && m.content)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, {
      id: nextId(),
      role: 'user',
      content: question,
      imagePreview: imageFile ? URL.createObjectURL(imageFile) : undefined,
    }])
    setIsLoading(true)

    // ── Image VQA ─────────────────────────────────────────────────────────────
    if (imageFile) {
      setMessages(prev => [...prev, { id: asstMsgId, role: 'assistant', content: '', pending: true }])

      api.generate.ask(cid, question, undefined, imageFile, 'all')
        .then(res => {
          setMessages(prev => prev.map(m => m.id === asstMsgId
            ? { ...m, content: res.answer, sources: res.sources, pending: false }
            : m
          ))
          setIsMinimized(min => { if (min) setUnreadCount(n => n + 1); return min })
          refreshCredits()
        })
        .catch(err => {
          setMessages(prev => prev.map(m => m.id === asstMsgId
            ? { ...m, content: err instanceof Error ? err.message : '请求失败，请重试', pending: false, failed: true }
            : m
          ))
        })
        .finally(() => setIsLoading(false))
      return
    }

    // ── Text streaming ────────────────────────────────────────────────────────
    const abort = new AbortController()
    abortRef.current = abort

    setMessages(prev => [...prev, {
      id: asstMsgId, role: 'assistant', content: '', streaming: true, streamStatus: 'generating',
    }])

    // Slow indicator after 4s
    const slowTimer = setTimeout(() => {
      setMessages(prev => prev.map(m =>
        m.id === asstMsgId && m.streaming ? { ...m, streamStatus: 'slow' } : m
      ))
    }, 4000)

    let gotFirstToken = false

    ;(async () => {
      try {
        for await (const event of api.generate.askStream(
          cid, question, undefined, 'all', abort.signal, historySnapshot, courseNameRef.current,
        )) {
          if (abort.signal.aborted) break

          if (event.type === 'token') {
            if (!gotFirstToken) { gotFirstToken = true; clearTimeout(slowTimer) }
            setMessages(prev => prev.map(m =>
              m.id === asstMsgId && m.streaming
                ? { ...m, content: m.content + event.text, streamStatus: 'generating' }
                : m
            ))
          } else if (event.type === 'done') {
            clearTimeout(slowTimer)
            setMessages(prev => prev.map(m =>
              m.id === asstMsgId
                ? { ...m, streaming: false, streamStatus: undefined, content: event.answer, sources: event.sources }
                : m
            ))
            setIsMinimized(min => { if (min) setUnreadCount(n => n + 1); return min })
            refreshCredits()
          } else if (event.type === 'error') {
            clearTimeout(slowTimer)
            setMessages(prev => prev.map(m =>
              m.id === asstMsgId
                ? { ...m, streaming: false, streamStatus: undefined, content: event.message, failed: event.code !== 'ABORT' }
                : m
            ))
          }
        }
      } catch (err: unknown) {
        clearTimeout(slowTimer)
        const isAbort = err instanceof DOMException && err.name === 'AbortError'
        setMessages(prev => prev.map(m =>
          m.id === asstMsgId && m.streaming ? {
            ...m,
            streaming: false,
            streamStatus: undefined,
            content: isAbort ? (m.content || '（已停止生成）') : (err instanceof Error ? err.message : '请求失败'),
          } : m
        ))
      } finally {
        clearTimeout(slowTimer)
        abortRef.current = null
        setIsLoading(false)
      }
    })()
  }, [isLoading, refreshCredits])

  return (
    <Ctx.Provider value={{
      isOpen, isMinimized, messages, courseId, courseName, credits,
      unreadCount, isLoading, prefillText,
      setCourseContext, openWindow, openWindowWithPrefill,
      closeWindow, minimizeWindow, clearMessages, clearPrefill,
      sendMessage, stopGeneration,
    }}>
      {children}
    </Ctx.Provider>
  )
}
