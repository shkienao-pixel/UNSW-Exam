'use client'

import { useState, useEffect } from 'react'
import { fetchCourseList } from '@/services/courses'
import type { Course } from '@/lib/types'

export function useCourseList(enabled: boolean) {
  const [courses, setCourses] = useState<Course[]>([])

  useEffect(() => {
    if (!enabled) return
    fetchCourseList().then(setCourses).catch(() => {})
  }, [enabled])

  return { courses }
}
