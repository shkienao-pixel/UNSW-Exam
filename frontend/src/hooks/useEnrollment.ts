'use client'

import { useState, useCallback, useEffect } from 'react'
import { fetchEnrollmentInfo } from '@/services/enrollment'

export function useEnrollment(courseId: string, role?: string | null) {
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null)
  const [term, setTerm]             = useState('T1')
  const [cost, setCost]             = useState(100)

  const check = useCallback(async () => {
    // guest 跳过选课检查，视为已选
    if (role === 'guest') { setIsEnrolled(true); return }
    try {
      const info = await fetchEnrollmentInfo(courseId)
      setIsEnrolled(info.enrolled)
      setTerm(info.term)
      setCost(info.cost)
    } catch {
      setIsEnrolled(null)
    }
  }, [courseId, role])

  useEffect(() => { check() }, [check])

  return { isEnrolled, setIsEnrolled, term, cost }
}
