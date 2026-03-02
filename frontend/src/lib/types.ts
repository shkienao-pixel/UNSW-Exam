export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface User {
  id: string
  email: string
}

export interface Course {
  id: string
  code: string
  name: string
  created_at: string
  updated_at: string
}

export interface Artifact {
  id: number
  course_id: string
  file_name: string
  file_hash: string
  file_path: string
  file_type: string
  status: 'pending' | 'approved' | 'rejected'
  storage_url?: string
  created_at: string
}

export interface ScopeSetItem {
  artifact_id: number
}

export interface ScopeSet {
  id: number
  course_id: string
  name: string
  is_default: boolean
  artifact_ids: number[]
  created_at: string
  updated_at: string
}

export interface Output {
  id: number
  course_id: string
  output_type: 'summary' | 'graph' | 'outline' | 'quiz' | 'flashcards'
  scope: string
  model_used: string
  status: string
  content: string | null
  created_at: string
}

export interface QuizQuestion {
  question: string
  options: string[]
  answer: string
  explanation?: string
}

export interface Flashcard {
  id: string
  deck_id: string
  card_type: 'mcq' | 'knowledge'
  front: { text?: string; question?: string }
  back: { text?: string; answer?: string; explanation?: string }
  stats: { reviews?: number; correct?: number }
}

export interface Mistake {
  id: number
  flashcard_id: string
  status: 'active' | 'mastered' | 'archived'
  wrong_count: number
  last_wrong_at: string
  added_at: string
}

export interface GenerateBody {
  scope_set_id?: number
  artifact_ids?: number[]
  prompt_extras?: string
}

export interface MetricsSummary {
  total_operations: number
  by_operation: Record<string, number>
  avg_elapsed_s: number
}

export interface AskSource {
  artifact_id: number
  file_name: string
  storage_url: string
}

export interface AskResponse {
  question: string
  answer: string
  sources: AskSource[]
  image_url: string | null
  model_used: string
}

export interface ExplainImageResponse {
  image_data_url: string | null
}

// ── Review Plan ───────────────────────────────────────────────────────────────

export interface ReviewSettings {
  id: string | null
  user_id: string
  course_id: string
  review_start_at: string | null   // ISO datetime
  exam_at: string | null           // ISO datetime
}

export type ReviewPriority = 'high' | 'medium' | 'low'
export type ReviewStatus = 'not_started' | 'learned' | 'review_due' | 'mastered'

export interface ReviewNodeProgress {
  id?: string
  user_id?: string
  course_id: string
  node_id: string
  done: boolean
  priority: ReviewPriority | null
  estimate_minutes: number | null
  status: ReviewStatus
  last_reviewed_at: string | null
  next_review_at: string | null
  updated_at?: string
}

export interface ReviewNodeUpdate {
  node_id: string
  done?: boolean
  priority?: ReviewPriority | null
  estimate_minutes?: number | null
  status?: ReviewStatus
  last_reviewed_at?: string | null
  next_review_at?: string | null
}

export interface OutlineNodeData {
  id: string
  title: string
  level: number
  parent_id: string | null
  children: OutlineNodeData[]
}

export interface TodayPlanResult {
  node_ids: string[]
  target_count: number
  remaining_days: number
  total_undone: number
}
