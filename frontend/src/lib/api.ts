import type {
  TokenResponse, User, Course, Artifact, ScopeSet, Output, Flashcard, Mistake,
  GenerateBody, AskResponse, ExplainImageResponse,
  ReviewSettings, ReviewNodeProgress, ReviewNodeUpdate, TodayPlanResult,
  KnowledgeOutline, KnowledgeGraph, KnowledgeOutlineNode, KnowledgeResult,
  DocType, Feedback, FeedbackStatus, CourseContentStatus,
} from './types'

export type StreamEvent =
  | { type: 'status'; phase: 'filtering' | 'generating' }
  | { type: 'token';  text: string }
  | { type: 'done';   answer: string; sources: AskResponse['sources']; image_url: string | null; model_used: string }
  | { type: 'error';  message: string; code?: string }

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token')
}

function humanizeError(raw: string, status?: number): string {
  const s = raw.toLowerCase()
  if (s.includes('invalid login credentials'))
    return '邮箱或密码错误，请重新输入'
  if (s.includes('email not confirmed') || s.includes('email not verified'))
    return '邮箱尚未验证，请先完成验证码验证'
  if (s.includes('invalid invite code'))
    return '邀请码无效，请检查后重试'
  if (s.includes('invite code has already been used'))
    return '邀请码已被使用完，请联系管理员获取新邀请码'
  if (s.includes('invite code has expired'))
    return '邀请码已过期，请联系管理员获取新邀请码'
  if (s.includes('server disconnected') || s.includes('network') || s.includes('disconnected'))
    return '网络连接中断，请检查网络后重试'
  if (s.includes('token expired') || s.includes('expired'))
    return '登录已过期，请重新登录'
  if (s.includes('token validation failed') || s.includes('invalid token') || s.includes('invalid or expired') || s.includes('missing authorization'))
    return '身份验证失败，请重新登录'
  if (s.includes('storage upload failed') || s.includes('bucket'))
    return '文件上传失败，请检查存储配置或文件格式'
  if (s.includes('timeout') || s.includes('timed out'))
    return 'AI 处理超时，请稍后重试（内容较多时正常）'
  if (status === 500 || s.includes('internal server error'))
    return '服务器内部错误，请稍后重试'
  if (status === 503)
    return '服务暂时不可用，请稍后重试'
  return raw || `请求失败 (HTTP ${status ?? '?'})`
}

/** 共用 fetch 逻辑。handle401=true 时遇到 401 自动清除 token 并跳转登录页。 */
async function _fetch<T>(url: string, options: RequestInit = {}, handle401 = false): Promise<T> {
  const token = getToken()
  const isFormData = options.body instanceof FormData

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }

  let res: Response
  try {
    res = await fetch(url, { ...options, headers })
  } catch (networkErr) {
    console.error('[api] network error:', networkErr)
    throw new Error('网络连接失败，请检查后端服务是否运行')
  }

  if (!res.ok) {
    if (handle401 && res.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/login'
      throw new Error('登录已过期，请重新登录')
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const raw = err.detail || err.error || err.message || `HTTP ${res.status}`
    if (res.status === 402) {
      const creditsErr = new Error(raw) as Error & { code: string; balance?: number; required?: number }
      creditsErr.code = 'INSUFFICIENT_CREDITS'
      creditsErr.balance = err.balance
      creditsErr.required = err.required
      throw creditsErr
    }
    throw new Error(humanizeError(raw, res.status))
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** 调用后端 FastAPI（自动附加 API_URL 前缀，401 时跳转登录）。 */
function req<T>(path: string, options: RequestInit = {}, autoRedirect401 = true): Promise<T> {
  return _fetch<T>(API_URL + path, options, autoRedirect401)
}

/** 调用 Next.js 内部 API route（相对路径，不处理 401 跳转）。 */
function nextReq<T>(path: string, options: RequestInit = {}): Promise<T> {
  return _fetch<T>(path, options, false)
}

/** 轮询异步生成 job，直到 done / failed / 超时。返回 Output 对象。 */
async function _pollJob(courseId: string, jobId: string, timeoutMs = 180_000): Promise<Output> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000))
    const job = await req<{ status: string; output_id: number | null; error_msg: string | null }>(
      `/courses/${courseId}/jobs/${jobId}`
    )
    if (job.status === 'done' && job.output_id != null)
      return req<Output>(`/courses/${courseId}/outputs/${job.output_id}`)
    if (job.status === 'failed')
      throw Object.assign(new Error(job.error_msg ?? '生成失败'), { code: 'GEN_FAILED' })
    // pending / processing → continue polling
  }
  throw new Error('生成超时（3分钟），请稍后在历史记录中查看结果')
}

export const api = {
  auth: {
    register: (email: string, password: string, invite_code: string) =>
      req<{ status: string; email?: string; access_token?: string; refresh_token?: string; expires_in?: number }>(
        '/auth/register',
        { method: 'POST', body: JSON.stringify({ email, password, invite_code }) },
        false,
      ),
    verifyOtp: (email: string, token: string) =>
      req<TokenResponse>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, token }) }, false),
    resendOtp: (email: string) =>
      req<{ ok: boolean }>('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }, false),
    requestReset: (email: string) =>
      req<{ message: string }>('/auth/request-reset', { method: 'POST', body: JSON.stringify({ email }) }, false),
    resetPassword: (access_token: string, new_password: string) =>
      req<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ access_token, new_password }) }, false),
    login: (email: string, password: string) =>
      req<TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false),
    refresh: (refresh_token: string) =>
      req<TokenResponse>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token }) }, false),
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
    upload: async (courseId: string, file: File, docType: DocType = 'lecture'): Promise<Artifact> => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('doc_type', docType)
      return req<Artifact>(`/courses/${courseId}/artifacts`, { method: 'POST', body: fd })
    },
    delete: (courseId: string, artifactId: number) =>
      req<{ ok: boolean }>(`/courses/${courseId}/artifacts/${artifactId}`, { method: 'DELETE' }),
    unlock: (courseId: string, artifactId: number) =>
      req<{ ok: boolean; already_unlocked: boolean; storage_url: string | null }>(
        `/courses/${courseId}/artifacts/${artifactId}/unlock`, { method: 'POST' }
      ),
    unlockAll: (courseId: string) =>
      req<{ ok: boolean; locked_count: number; unlocked_count: number; credits_spent: number }>(
        `/courses/${courseId}/artifacts/unlock-all`, { method: 'POST' }
      ),
    updateDocType: (courseId: string, artifactId: number, docType: string) =>
      req<Artifact>(
        `/courses/${courseId}/artifacts/${artifactId}/doc-type`,
        { method: 'PATCH', body: JSON.stringify({ doc_type: docType }) }
      ),
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
    summary: async (courseId: string, body: GenerateBody): Promise<Output> => {
      const { job_id } = await req<{ job_id: string }>(`/courses/${courseId}/generate/summary`, { method: 'POST', body: JSON.stringify(body) })
      return _pollJob(courseId, job_id)
    },
    quiz: async (courseId: string, body: GenerateBody): Promise<Output> => {
      const { job_id } = await req<{ job_id: string }>(`/courses/${courseId}/generate/quiz`, { method: 'POST', body: JSON.stringify(body) })
      return _pollJob(courseId, job_id)
    },
    outline: async (courseId: string, body: GenerateBody): Promise<Output> => {
      const { job_id } = await req<{ job_id: string }>(`/courses/${courseId}/generate/outline`, { method: 'POST', body: JSON.stringify(body) })
      return _pollJob(courseId, job_id)
    },
    flashcards: async (courseId: string, body: GenerateBody): Promise<Output> => {
      const { job_id } = await req<{ job_id: string }>(`/courses/${courseId}/generate/flashcards`, { method: 'POST', body: JSON.stringify(body) })
      return _pollJob(courseId, job_id)
    },
    ask: (
      courseId: string,
      question: string,
      scope_set_id?: number,
      imageFile?: File,
      contextMode: 'all' | 'revision' = 'all',
    ) => {
      if (imageFile) {
        const fd = new FormData()
        fd.append('query_text', question)
        fd.append('course_id', courseId)
        fd.append('image_file', imageFile)
        if (scope_set_id != null) fd.append('scope_set_id', String(scope_set_id))
        fd.append('context_mode', contextMode)
        return nextReq<AskResponse>('/api/generate/ask', { method: 'POST', body: fd })
      }
      return req<AskResponse>(
        `/courses/${courseId}/generate/ask`,
        { method: 'POST', body: JSON.stringify({ question, scope_set_id, context_mode: contextMode }) },
      )
    },
    askStream: async function* (
      courseId: string,
      question: string,
      scope_set_id?: number,
      contextMode: 'all' | 'revision' = 'all',
      signal?: AbortSignal,
    ): AsyncGenerator<StreamEvent> {
      const token = getToken()
      const res = await fetch(`${API_URL}/courses/${courseId}/generate/ask/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question, scope_set_id, context_mode: contextMode }),
        signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        const raw = (err as Record<string, string>).detail || (err as Record<string, string>).error || `HTTP ${res.status}`
        if (res.status === 402) {
          const e = new Error(raw) as Error & { code: string; balance?: number; required?: number }
          e.code = 'INSUFFICIENT_CREDITS'
          throw e
        }
        throw new Error(humanizeError(raw, res.status))
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data) {
              try { yield JSON.parse(data) as StreamEvent } catch { /* skip */ }
            }
          }
        }
      }
    },

    explainWithImage: (question: string, answer: string) =>
      nextReq<ExplainImageResponse>('/api/explain-with-image', {
        method: 'POST',
        body: JSON.stringify({ question, answer }),
      }),
    translate: (courseId: string, texts: string[], target_lang: 'en' | 'zh' = 'en') =>
      req<{ translations: string[] }>(
        `/courses/${courseId}/generate/translate`,
        { method: 'POST', body: JSON.stringify({ texts, target_lang }) },
      ),
  },

  review: {
    getSettings: (courseId: string) =>
      nextReq<ReviewSettings>(`/api/review/settings?courseId=${courseId}`),
    saveSettings: (courseId: string, reviewStartAt: string | null, examAt: string | null) =>
      nextReq<ReviewSettings>('/api/review/settings', {
        method: 'POST',
        body: JSON.stringify({ course_id: courseId, review_start_at: reviewStartAt, exam_at: examAt }),
      }),
    getProgress: (courseId: string) =>
      nextReq<ReviewNodeProgress[]>(`/api/review/progress?courseId=${courseId}`),
    saveProgress: (courseId: string, updates: ReviewNodeUpdate[]) =>
      nextReq<{ ok: boolean; updated: number }>('/api/review/progress', {
        method: 'POST',
        body: JSON.stringify({ course_id: courseId, updates }),
      }),
    getTodayPlan: (
      courseId: string,
      outlineNodes: Array<{
        node_id: string; title: string; level: number
        done: boolean; priority?: string | null; estimate_minutes?: number | null; status?: string | null
      }>,
      budgetMinutes = 60,
      allowSpacing = true,
    ) =>
      nextReq<TodayPlanResult>('/api/review/today-plan', {
        method: 'POST',
        body: JSON.stringify({
          course_id: courseId,
          outline_nodes: outlineNodes,
          budget_minutes: budgetMinutes,
          allow_spacing: allowSpacing,
        }),
      }),
  },

  knowledge: {
    build: (courseId: string, allowAiFill: boolean, scopeSetId?: number) =>
      nextReq<KnowledgeResult>('/api/knowledge/build', {
        method: 'POST',
        body: JSON.stringify({ course_id: courseId, allow_ai_fill: allowAiFill, scope_set_id: scopeSetId }),
      }),
    getOutline: (courseId: string) =>
      nextReq<KnowledgeOutline>(`/api/knowledge/outline?courseId=${courseId}`),
    getGraph: (courseId: string) =>
      nextReq<KnowledgeGraph>(`/api/knowledge/graph?courseId=${courseId}`),
    getNode: (courseId: string, nodeId: string) =>
      nextReq<KnowledgeOutlineNode>(`/api/knowledge/node?courseId=${courseId}&nodeId=${nodeId}`),
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

  feedback: {
    submit: (content: string, page_url: string) =>
      req<{ ok: boolean; id: string }>('/feedback', {
        method: 'POST',
        body: JSON.stringify({ content, page_url }),
      }),
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

  credits: {
    balance: () => req<{ balance: number }>('/credits/balance'),
    transactions: () => req<{ id: string; amount: number; type: string; note: string | null; created_at: string }[]>('/credits/transactions'),
    checkout: (successUrl: string, cancelUrl: string, pkg: '1000' | '3000' | '7000' = '1000') =>
      req<{ checkout_url: string; session_id: string }>('/credits/checkout', {
        method: 'POST',
        body: JSON.stringify({ package: pkg, success_url: successUrl, cancel_url: cancelUrl }),
      }),
  },

  courseContent: {
    status: (courseId: string, contentType: 'summary' | 'outline') =>
      req<{ status: CourseContentStatus; credits_required: number }>(
        `/courses/${courseId}/course-content/${contentType}/status`
      ),
    unlock: (courseId: string, contentType: 'summary' | 'outline') =>
      req<{ ok: boolean; already_unlocked: boolean; credits_spent?: number }>(
        `/courses/${courseId}/course-content/${contentType}/unlock`,
        { method: 'POST' }
      ),
    get: (courseId: string, contentType: 'summary' | 'outline') =>
      req<{ content_json: Record<string, unknown> }>(
        `/courses/${courseId}/course-content/${contentType}`
      ),
  },
}
