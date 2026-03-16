'use client'

import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import type { ScopeSet, Artifact } from './types'
import { api } from './api'

// ── Types ────────────────────────────────────────────────────────────────────

type AskSource = { artifact_id: number; file_name: string; storage_url: string }

export type FloatingMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: AskSource[]
  imagePreview?: string        // data URL or object URL for user-uploaded image
  streaming?: boolean
  streamStatus?: 'filtering' | 'generating' | 'slow'
  pending?: boolean            // image VQA fetch in-flight
  failed?: boolean
}

interface FloatingAskContextValue {
  isOpen: boolean
  isMinimized: boolean
  messages: FloatingMessage[]
  courseId: string | null
  scopeSets: ScopeSet[]
  artifacts: Artifact[]
  unreadCount: number
  isLoading: boolean
  prefillText: string
  /** Called by course page whenever data is loaded / refreshed */
  setCourseContext: (courseId: string, scopeSets: ScopeSet[], artifacts: Artifact[]) => void
  /** Open and un-minimize the window */
  openWindow: () => void
  /** Open window with a pre-filled question */
  openWindowWithPrefill: (question: string) => void
  closeWindow: () => void
  minimizeWindow: () => void
  clearMessages: () => void
  clearPrefill: () => void
  sendMessage: (
    question: string,
    imageFile: File | null,
    scopeSetId: number | undefined,
    contextMode: 'all' | 'revision',
  ) => void
  stopGeneration: () => void
}

// ── Context ──────────────────────────────────────────────────────────────────

const Ctx = createContext<FloatingAskContextValue | null>(null)

export function useFloatingAsk(): FloatingAskContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFloatingAsk must be used within FloatingAskProvider')
  return ctx
}

// ── ID generator ─────────────────────────────────────────────────────────────

let _msgCounter = 0
function nextId(): string { return String(++_msgCounter) }

// ── localStorage helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = 'floating_ask_messages'
const MAX_STORED  = 60   // 最多保留 60 条，防止 localStorage 撑爆

function loadMessages(): FloatingMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: FloatingMessage[] = JSON.parse(raw)
    // 过滤掉 objectURL（刷新后失效）和进行中状态
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

function saveMessages(msgs: FloatingMessage[]) {
  try {
    const toSave = msgs
      .filter(m => !m.streaming && !m.pending)
      .map(m => ({
        ...m,
        imagePreview: m.imagePreview?.startsWith('blob:') ? undefined : m.imagePreview,
      }))
      .slice(-MAX_STORED)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch { /* quota exceeded — silently skip */ }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function FloatingAskProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen]             = useState(false)
  const [isMinimized, setIsMinimized]   = useState(false)
  const [messages, setMessages]         = useState<FloatingMessage[]>(() => loadMessages())
  const [courseId, setCourseId]         = useState<string | null>(null)
  const [scopeSets, setScopeSets]       = useState<ScopeSet[]>([])
  const [artifacts, setArtifacts]       = useState<Artifact[]>([])
  const [unreadCount, setUnreadCount]   = useState(0)
  const [isLoading, setIsLoading]       = useState(false)
  const [prefillText, setPrefillText]   = useState('')
  const abortRef                        = useRef<AbortController | null>(null)

  // Persist messages to localStorage whenever they change (skip in-flight messages)
  useEffect(() => {
    const stable = messages.filter(m => !m.streaming && !m.pending)
    if (stable.length === messages.length) {
      saveMessages(messages)
    }
  }, [messages])

  const setCourseContext = useCallback((cid: string, ss: ScopeSet[], arts: Artifact[]) => {
    setCourseId(cid)
    setScopeSets(ss)
    setArtifacts(arts)
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
    abortRef.current?.abort()
    setIsOpen(false)
    setIsMinimized(false)
  }, [])

  const minimizeWindow = useCallback(() => {
    setIsMinimized(true)
  }, [])

  const clearMessages = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setIsLoading(false)
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  const clearPrefill = useCallback(() => {
    setPrefillText('')
  }, [])

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const sendMessage = useCallback((
    question: string,
    imageFile: File | null,
    scopeSetId: number | undefined,
    contextMode: 'all' | 'revision',
  ) => {
    if (!courseId || isLoading) return

    const asstMsgId = nextId()

    // Build conversation history (exclude in-flight / failed messages, keep last 5 turns = 10 msgs)
    const historySnapshot = messages
      .filter(m => !m.streaming && !m.pending && !m.failed && m.content)
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }))

    // Add user message immediately
    setMessages(prev => [...prev, {
      id: nextId(),
      role: 'user',
      content: question,
      imagePreview: imageFile ? URL.createObjectURL(imageFile) : undefined,
    }])
    setIsLoading(true)

    // ── Image VQA: regular async fetch ────────────────────────────────────────
    if (imageFile) {
      setMessages(prev => [...prev, {
        id: asstMsgId,
        role: 'assistant',
        content: '',
        pending: true,
      }])

      api.generate.ask(courseId, question, scopeSetId, imageFile, contextMode)
        .then(res => {
          setMessages(prev => prev.map(m => m.id === asstMsgId ? {
            ...m,
            content: res.answer,
            sources: res.sources,
            pending: false,
          } : m))
          // Increment unread badge if minimized
          setIsMinimized(min => {
            if (min) setUnreadCount(n => n + 1)
            return min
          })
        })
        .catch(err => {
          setMessages(prev => prev.map(m => m.id === asstMsgId ? {
            ...m,
            content: err instanceof Error ? err.message : '请求失败，请重试',
            pending: false,
            failed: true,
          } : m))
        })
        .finally(() => setIsLoading(false))
      return
    }

    // ── Text query: streaming SSE ─────────────────────────────────────────────
    const abort = new AbortController()
    abortRef.current = abort

    setMessages(prev => [...prev, {
      id: asstMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
      streamStatus: 'filtering',
    }])

    // Slow indicator after 1.5s
    const slowTimer = setTimeout(() => {
      setMessages(prev => prev.map(m =>
        m.id === asstMsgId && m.streaming ? { ...m, streamStatus: 'slow' } : m
      ))
    }, 1500)

    let gotFirstToken = false

    ;(async () => {
      try {
        for await (const event of api.generate.askStream(courseId, question, scopeSetId, contextMode, abort.signal, historySnapshot)) {
          if (abort.signal.aborted) break

          if (event.type === 'status') {
            setMessages(prev => prev.map(m =>
              m.id === asstMsgId && m.streaming ? { ...m, streamStatus: event.phase } : m
            ))
          } else if (event.type === 'token') {
            if (!gotFirstToken) { gotFirstToken = true; clearTimeout(slowTimer) }
            setMessages(prev => prev.map(m =>
              m.id === asstMsgId && m.streaming
                ? { ...m, content: m.content + event.text, streamStatus: 'generating' }
                : m
            ))
          } else if (event.type === 'done') {
            clearTimeout(slowTimer)
            setMessages(prev => prev.map(m =>
              m.id === asstMsgId ? {
                ...m,
                streaming: false,
                streamStatus: undefined,
                content: event.answer,
                sources: event.sources,
              } : m
            ))
            setIsMinimized(min => {
              if (min) setUnreadCount(n => n + 1)
              return min
            })
          } else if (event.type === 'error') {
            clearTimeout(slowTimer)
            setMessages(prev => prev.map(m =>
              m.id === asstMsgId ? {
                ...m,
                streaming: false,
                streamStatus: undefined,
                content: event.message,
                failed: event.code !== 'ABORT',
              } : m
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
  }, [courseId, isLoading])

  return (
    <Ctx.Provider value={{
      isOpen, isMinimized, messages, courseId, scopeSets, artifacts,
      unreadCount, isLoading, prefillText,
      setCourseContext, openWindow, openWindowWithPrefill,
      closeWindow, minimizeWindow, clearMessages, clearPrefill,
      sendMessage, stopGeneration,
    }}>
      {children}
    </Ctx.Provider>
  )
}
