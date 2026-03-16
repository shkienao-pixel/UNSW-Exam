'use client'

import { useState, useCallback, useEffect } from 'react'
import { fetchCourse, fetchCourseContext } from '@/services/courses'
import type { Artifact, Course, ScopeSet } from '@/lib/types'

export function useCourseData(courseId: string) {
  const [course, setCourse]       = useState<Course | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [scopeSets, setScopeSets] = useState<ScopeSet[]>([])
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const c = await fetchCourse(courseId)
      setCourse(c)
      const ctx = await fetchCourseContext(courseId)
      setArtifacts(ctx.artifacts)
      setScopeSets(ctx.scopeSets)
    } catch (e) {
      console.warn('[useCourseData] failed to load:', e)
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => { load() }, [load])

  return { course, artifacts, setArtifacts, scopeSets, setScopeSets, loading, reload: load }
}
