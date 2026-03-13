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
  exam_date?: string | null   // ISO 8601，管理员设置的考试日期
  created_at: string
  updated_at: string
}

// Semantic document category — drives RAG routing at query time.
export type DocType = 'lecture' | 'tutorial' | 'revision' | 'past_exam' | 'assignment' | 'other'

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  lecture:    '讲义',
  tutorial:   '辅导/Lab',
  revision:   '复习总结',
  past_exam:  '往年考题',
  assignment: '作业/Project',
  other:      '其他',
}

export const DOC_TYPE_COLORS: Record<DocType, string> = {
  lecture:    '#60a5fa',  // blue
  tutorial:   '#a78bfa',  // purple
  revision:   '#4ade80',  // green  ← most important
  past_exam:  '#f97316',  // orange ← second most important
  assignment: '#facc15',  // yellow
  other:      '#6b7280',  // gray
}

export interface Artifact {
  id: number
  course_id: string
  file_name: string
  file_hash: string
  file_path: string
  file_type: string
  doc_type: DocType
  status: 'pending' | 'approved' | 'rejected'
  storage_url?: string
  is_locked?: boolean
  uploaded_by?: string
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


// ── User Feedback ──────────────────────────────────────────────────────────────

export type FeedbackStatus = 'pending' | 'in_progress' | 'resolved'

export interface Feedback {
  id: string
  user_id: string | null
  content: string
  page_url: string
  status: FeedbackStatus
  created_at: string
}

// ── Course Content ─────────────────────────────────────────────────────────────

export type CourseContentStatus = 'not_published' | 'locked' | 'unlocked'

export interface CourseContentWeek {
  week: number
  title: string
  key_points: string[]
  content: string
}

export interface CourseContentSummary {
  weeks: CourseContentWeek[]
}

export interface CourseContentOutlineNode {
  id: string
  title: string
  level: number
}

export interface CourseContentOutlineWeek {
  week: number
  title: string
  nodes: CourseContentOutlineNode[]
}

export interface CourseContentOutline {
  weeks: CourseContentOutlineWeek[]
}

// ── Summary Schema V1 ─────────────────────────────────────────────────────────

export type ExamWeight = 'high' | 'medium' | 'low'

export interface SummaryKeyTerm {
  term: string
  definition: string
}

export interface SummarySection {
  heading: string
  content: string
  exam_weight: ExamWeight
  key_terms: SummaryKeyTerm[]
  exam_tips: string[]
  formulas?: string[]
}

export interface SummarySchemaV1 {
  format: 'summary_v1'
  title: string
  overview: string
  sections: SummarySection[]
  quick_recap: string
  likely_exam_questions: string[]
}

// ── Enrollment ────────────────────────────────────────────────────────────────

export type Term = 'T1' | 'T2' | 'T3'

export interface EnrollmentStatus {
  current_term: Term
  current_year: number
  enrollment_cost: number
  max_per_term: number
  enrolled_course_ids: string[]
  slots_used: number
  slots_remaining: number
}

// ── Planner ───────────────────────────────────────────────────────────────────

export interface PlannerKP {
  id: string
  title: string
  topic?: string
  done: boolean
}

export interface PlannerPaper {
  id: string
  title: string
  done: boolean
}

export interface PlannerDay {
  day_number: number
  date: string          // ISO date
  is_today: boolean
  is_past: boolean
  knowledge_points: PlannerKP[]
  papers: PlannerPaper[]
}

export interface PlannerStats {
  total_kp: number
  done_kp: number
  total_paper: number
  done_paper: number
}

export interface PlannerPlan {
  blueprint_exists: boolean
  exam_date: string | null
  today: string
  total_days: number
  remaining_days: number
  elapsed_days: number
  stats: PlannerStats
  days: PlannerDay[]
}

