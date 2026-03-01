/**
 * Shared helpers for AI generation API routes.
 * All routes: validate JWT → fetch course content from FastAPI → call OpenAI → return result.
 */

import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export interface ContentArtifact {
  id: number
  name: string
  type: string
  text: string
}

export interface CourseContent {
  course_id: string
  artifacts: ContentArtifact[]
  total_chars: number
  artifact_count: number
}

/** Fetch extracted text from FastAPI /courses/{id}/content */
export async function fetchCourseContent(
  courseId: string,
  accessToken: string,
  scopeSetId?: number,
): Promise<CourseContent> {
  const url = new URL(`${BACKEND}/courses/${courseId}/content`)
  if (scopeSetId) url.searchParams.set('scope_set_id', String(scopeSetId))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Content fetch failed: ${res.status}`)
  }
  return res.json()
}

/** Build a single prompt string from extracted artifacts */
export function buildContextText(content: CourseContent): string {
  return content.artifacts
    .map(a => `=== ${a.name} (${a.type}) ===\n${a.text}`)
    .join('\n\n')
}

export { openai }
