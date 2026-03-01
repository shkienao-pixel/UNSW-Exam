import type {
  TokenResponse, User, Course, Artifact, ScopeSet, Output, Flashcard, Mistake, GenerateBody
} from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token')
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const isFormData = options.body instanceof FormData

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }

  const res = await fetch(API_URL + path, { ...options, headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  auth: {
    register: (email: string, password: string, invite_code: string) =>
      req<TokenResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, invite_code }) }),
    login: (email: string, password: string) =>
      req<TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    refresh: (refresh_token: string) =>
      req<TokenResponse>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token }) }),
    logout: () =>
      req('/auth/logout', { method: 'POST' }),
    me: () =>
      req<User>('/auth/me'),
  },

  courses: {
    list: () => req<Course[]>('/courses'),
    get: (id: string) => req<Course>(`/courses/${id}`),
    create: (code: string, name: string) =>
      req<Course>('/courses', { method: 'POST', body: JSON.stringify({ code, name }) }),
    delete: (id: string) =>
      req<{ ok: boolean }>(`/courses/${id}`, { method: 'DELETE' }),
  },

  artifacts: {
    list: (courseId: string) => req<Artifact[]>(`/courses/${courseId}/artifacts`),
    upload: async (courseId: string, file: File): Promise<Artifact> => {
      const fd = new FormData()
      fd.append('file', file)
      return req<Artifact>(`/courses/${courseId}/artifacts`, { method: 'POST', body: fd })
    },
    delete: (courseId: string, artifactId: number) =>
      req<{ ok: boolean }>(`/courses/${courseId}/artifacts/${artifactId}`, { method: 'DELETE' }),
  },

  scopeSets: {
    list: (courseId: string) => req<ScopeSet[]>(`/courses/${courseId}/scope-sets`),
    create: (courseId: string, name: string) =>
      req<ScopeSet>(`/courses/${courseId}/scope-sets`, { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (courseId: string, scopeSetId: number) =>
      req<{ ok: boolean }>(`/courses/${courseId}/scope-sets/${scopeSetId}`, { method: 'DELETE' }),
    updateItems: (courseId: string, scopeSetId: number, artifact_ids: number[]) =>
      req<ScopeSet>(`/courses/${courseId}/scope-sets/${scopeSetId}/items`, {
        method: 'PUT', body: JSON.stringify({ artifact_ids }),
      }),
  },

  outputs: {
    list: (courseId: string, outputType?: string) =>
      req<Output[]>(`/courses/${courseId}/outputs${outputType ? `?output_type=${outputType}` : ''}`),
    get: (courseId: string, outputId: number) =>
      req<Output>(`/courses/${courseId}/outputs/${outputId}`),
    delete: (courseId: string, outputId: number) =>
      req<{ ok: boolean }>(`/courses/${courseId}/outputs/${outputId}`, { method: 'DELETE' }),
  },

  generate: {
    summary:    (courseId: string, body: GenerateBody) =>
      req<Output>(`/courses/${courseId}/generate/summary`, { method: 'POST', body: JSON.stringify(body) }),
    quiz:       (courseId: string, body: GenerateBody) =>
      req<Output>(`/courses/${courseId}/generate/quiz`, { method: 'POST', body: JSON.stringify(body) }),
    outline:    (courseId: string, body: GenerateBody) =>
      req<Output>(`/courses/${courseId}/generate/outline`, { method: 'POST', body: JSON.stringify(body) }),
    flashcards: (courseId: string, body: GenerateBody) =>
      req<Output>(`/courses/${courseId}/generate/flashcards`, { method: 'POST', body: JSON.stringify(body) }),
    ask:        (courseId: string, question: string, scope_set_id?: number) =>
      req<{ question: string; answer: string; sources: { artifact_id: number; file_name: string; storage_url: string }[] }>(
        `/courses/${courseId}/generate/ask`,
        { method: 'POST', body: JSON.stringify({ question, scope_set_id }) },
      ),
    translate:  (courseId: string, texts: string[], target_lang: 'en' | 'zh' = 'en') =>
      req<{ translations: string[] }>(
        `/courses/${courseId}/generate/translate`,
        { method: 'POST', body: JSON.stringify({ texts, target_lang }) },
      ),
  },

  flashcards: {
    list: (deckId: string) => req<Flashcard[]>(`/flashcards?deck_id=${deckId}`),
    review: (cardId: string, action: 'show' | 'again' | 'good' | 'easy') =>
      req(`/flashcards/${cardId}/review`, { method: 'POST', body: JSON.stringify({ action }) }),
    submit: (cardId: string, selected_option: string) =>
      req<{ correct: boolean; answer: string; explanation?: string }>(
        `/flashcards/${cardId}/submit`,
        { method: 'POST', body: JSON.stringify({ selected_option }) }
      ),
  },

  mistakes: {
    list: (status?: string, card_type?: string) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (card_type) params.set('card_type', card_type)
      const qs = params.toString()
      return req<Mistake[]>(`/mistakes${qs ? `?${qs}` : ''}`)
    },
    master: (id: number) =>
      req<{ ok: boolean; status: string }>(`/mistakes/${id}/master`, { method: 'PATCH' }),
    archive: (id: number) =>
      req<{ ok: boolean }>(`/mistakes/${id}`, { method: 'DELETE' }),
  },
}
