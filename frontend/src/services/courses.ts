import { api } from '@/lib/api'
import type { Artifact, Course, ScopeSet } from '@/lib/types'

export async function fetchCourse(courseId: string): Promise<Course> {
  return api.courses.get(courseId)
}

export async function fetchCourseList(): Promise<Course[]> {
  return api.courses.list()
}

export interface CourseContext {
  artifacts: Artifact[]
  scopeSets: ScopeSet[]
}

export async function fetchCourseContext(courseId: string): Promise<CourseContext> {
  const [arts, scopes] = await Promise.allSettled([
    api.artifacts.list(courseId),
    api.scopeSets.list(courseId),
  ])
  return {
    artifacts: arts.status === 'fulfilled' ? arts.value : [],
    scopeSets: scopes.status === 'fulfilled' ? scopes.value : [],
  }
}
