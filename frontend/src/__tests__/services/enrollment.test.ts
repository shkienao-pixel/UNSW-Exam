import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: {
    enrollments: {
      check: vi.fn(),
      status: vi.fn(),
    },
  },
}))

import { fetchEnrollmentInfo } from '@/services/enrollment'
import { api } from '@/lib/api'

const mockCheckEnrolled = { enrolled: true }
const mockCheckNotEnrolled = { enrolled: false }
const mockStatus = { current_term: 'T2', enrollment_cost: 50 }

describe('fetchEnrollmentInfo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns enrolled=true and term/cost when both apis succeed', async () => {
    vi.mocked(api.enrollments.check).mockResolvedValue(mockCheckEnrolled)
    vi.mocked(api.enrollments.status).mockResolvedValue(mockStatus)

    const result = await fetchEnrollmentInfo('c1')

    expect(result.enrolled).toBe(true)
    expect(result.term).toBe('T2')
    expect(result.cost).toBe(50)
  })

  it('returns enrolled=false when enrolled is false', async () => {
    vi.mocked(api.enrollments.check).mockResolvedValue(mockCheckNotEnrolled)
    vi.mocked(api.enrollments.status).mockResolvedValue(mockStatus)

    const result = await fetchEnrollmentInfo('c1')

    expect(result.enrolled).toBe(false)
  })

  it('returns enrolled=false (default) when check api fails', async () => {
    vi.mocked(api.enrollments.check).mockRejectedValue(new Error('Network error'))
    vi.mocked(api.enrollments.status).mockResolvedValue(mockStatus)

    const result = await fetchEnrollmentInfo('c1')

    expect(result.enrolled).toBe(false)
    expect(result.term).toBe('T2')
    expect(result.cost).toBe(50)
  })

  it('returns term=T1 and cost=100 (defaults) when status api fails', async () => {
    vi.mocked(api.enrollments.check).mockResolvedValue(mockCheckEnrolled)
    vi.mocked(api.enrollments.status).mockRejectedValue(new Error('Timeout'))

    const result = await fetchEnrollmentInfo('c1')

    expect(result.enrolled).toBe(true)
    expect(result.term).toBe('T1')
    expect(result.cost).toBe(100)
  })

  it('returns all defaults when both apis fail', async () => {
    vi.mocked(api.enrollments.check).mockRejectedValue(new Error('Service unavailable'))
    vi.mocked(api.enrollments.status).mockRejectedValue(new Error('Service unavailable'))

    const result = await fetchEnrollmentInfo('c1')

    expect(result).toEqual({ enrolled: false, term: 'T1', cost: 100 })
  })

  it('passes courseId to check api', async () => {
    vi.mocked(api.enrollments.check).mockResolvedValue(mockCheckEnrolled)
    vi.mocked(api.enrollments.status).mockResolvedValue(mockStatus)

    await fetchEnrollmentInfo('course-uuid-789')

    expect(api.enrollments.check).toHaveBeenCalledWith('course-uuid-789')
  })

  it('calls status api with no arguments', async () => {
    vi.mocked(api.enrollments.check).mockResolvedValue(mockCheckEnrolled)
    vi.mocked(api.enrollments.status).mockResolvedValue(mockStatus)

    await fetchEnrollmentInfo('c1')

    expect(api.enrollments.status).toHaveBeenCalledWith()
  })

  it('calls both apis exactly once (in parallel)', async () => {
    vi.mocked(api.enrollments.check).mockResolvedValue(mockCheckEnrolled)
    vi.mocked(api.enrollments.status).mockResolvedValue(mockStatus)

    await fetchEnrollmentInfo('c1')

    expect(api.enrollments.check).toHaveBeenCalledOnce()
    expect(api.enrollments.status).toHaveBeenCalledOnce()
  })

  it('does not throw even when both apis fail (graceful degradation)', async () => {
    vi.mocked(api.enrollments.check).mockRejectedValue(new Error('fail'))
    vi.mocked(api.enrollments.status).mockRejectedValue(new Error('fail'))

    await expect(fetchEnrollmentInfo('c1')).resolves.not.toThrow()
  })
})
