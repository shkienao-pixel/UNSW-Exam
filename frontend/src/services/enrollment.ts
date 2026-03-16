import { api } from '@/lib/api'

export interface EnrollmentInfo {
  enrolled: boolean
  term: string
  cost: number
}

export async function fetchEnrollmentInfo(courseId: string): Promise<EnrollmentInfo> {
  const [enrollCheck, enrollStatus] = await Promise.allSettled([
    api.enrollments.check(courseId),
    api.enrollments.status(),
  ])
  return {
    enrolled: enrollCheck.status === 'fulfilled' ? enrollCheck.value.enrolled : false,
    term: enrollStatus.status === 'fulfilled' ? enrollStatus.value.current_term : 'T1',
    cost: enrollStatus.status === 'fulfilled' ? enrollStatus.value.enrollment_cost : 100,
  }
}
