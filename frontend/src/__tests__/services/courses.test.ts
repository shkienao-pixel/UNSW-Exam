import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock must be declared before importing the module under test (Vitest hoists vi.mock)
vi.mock('@/lib/api', () => ({
  api: {
    courses: {
      get: vi.fn(),
      list: vi.fn(),
    },
    artifacts: {
      list: vi.fn(),
    },
    scopeSets: {
      list: vi.fn(),
    },
  },
}))

import { fetchCourse, fetchCourseList, fetchCourseContext } from '@/services/courses'
import { api } from '@/lib/api'

const mockCourse = {
  id: 'c1',
  code: 'COMP3311',
  name: 'Database Systems',
  exam_date: null,
  created_at: '2025-01-01T00:00:00Z',
}
const mockCourse2 = {
  id: 'c2',
  code: 'COMP2521',
  name: 'Data Structures',
  exam_date: '2025-06-15',
  created_at: '2025-01-01T00:00:00Z',
}
const mockArtifact = {
  id: 1,
  course_id: 'c1',
  file_name: 'lecture1.pdf',
  storage_url: 'https://storage.example.com/l1.pdf',
  status: 'approved',
  doc_type: 'lecture',
  week: 1,
  uploaded_by: 'user1',
  created_at: '2025-01-01T00:00:00Z',
}
const mockScopeSet = {
  id: 1,
  course_id: 'c1',
  name: 'All',
  artifact_ids: [1],
}

// ─────────────────────────────────────────────────────────────
// fetchCourse
// ─────────────────────────────────────────────────────────────
describe('fetchCourse', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the course returned by api', async () => {
    vi.mocked(api.courses.get).mockResolvedValue(mockCourse)
    const result = await fetchCourse('c1')
    expect(result).toEqual(mockCourse)
    expect(api.courses.get).toHaveBeenCalledOnce()
    expect(api.courses.get).toHaveBeenCalledWith('c1')
  })

  it('passes the courseId argument verbatim', async () => {
    vi.mocked(api.courses.get).mockResolvedValue(mockCourse2)
    await fetchCourse('abc-uuid-123')
    expect(api.courses.get).toHaveBeenCalledWith('abc-uuid-123')
  })

  it('propagates api network error', async () => {
    vi.mocked(api.courses.get).mockRejectedValue(new Error('Network error'))
    await expect(fetchCourse('c1')).rejects.toThrow('Network error')
  })

  it('propagates 404 api error', async () => {
    const err = Object.assign(new Error('Not found'), { status: 404 })
    vi.mocked(api.courses.get).mockRejectedValue(err)
    await expect(fetchCourse('nonexistent')).rejects.toThrow('Not found')
  })
})

// ─────────────────────────────────────────────────────────────
// fetchCourseList
// ─────────────────────────────────────────────────────────────
describe('fetchCourseList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all courses', async () => {
    vi.mocked(api.courses.list).mockResolvedValue([mockCourse, mockCourse2])
    const result = await fetchCourseList()
    expect(result).toHaveLength(2)
    expect(result[0].code).toBe('COMP3311')
    expect(result[1].code).toBe('COMP2521')
  })

  it('returns empty array when no courses exist', async () => {
    vi.mocked(api.courses.list).mockResolvedValue([])
    const result = await fetchCourseList()
    expect(result).toEqual([])
    expect(result).toHaveLength(0)
  })

  it('calls api.courses.list with no arguments', async () => {
    vi.mocked(api.courses.list).mockResolvedValue([])
    await fetchCourseList()
    expect(api.courses.list).toHaveBeenCalledOnce()
    expect(api.courses.list).toHaveBeenCalledWith()
  })

  it('propagates 401 unauthorized error', async () => {
    vi.mocked(api.courses.list).mockRejectedValue(new Error('Unauthorized'))
    await expect(fetchCourseList()).rejects.toThrow('Unauthorized')
  })

  it('propagates generic api error', async () => {
    vi.mocked(api.courses.list).mockRejectedValue(new Error('Internal server error'))
    await expect(fetchCourseList()).rejects.toThrow('Internal server error')
  })
})

// ─────────────────────────────────────────────────────────────
// fetchCourseContext
// ─────────────────────────────────────────────────────────────
describe('fetchCourseContext', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns both artifacts and scopeSets when both apis succeed', async () => {
    vi.mocked(api.artifacts.list).mockResolvedValue([mockArtifact])
    vi.mocked(api.scopeSets.list).mockResolvedValue([mockScopeSet])

    const result = await fetchCourseContext('c1')

    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts[0]).toEqual(mockArtifact)
    expect(result.scopeSets).toHaveLength(1)
    expect(result.scopeSets[0]).toEqual(mockScopeSet)
  })

  it('returns empty artifacts when artifacts api fails', async () => {
    vi.mocked(api.artifacts.list).mockRejectedValue(new Error('Network error'))
    vi.mocked(api.scopeSets.list).mockResolvedValue([mockScopeSet])

    const result = await fetchCourseContext('c1')

    expect(result.artifacts).toEqual([])
    expect(result.scopeSets).toHaveLength(1)
  })

  it('returns empty scopeSets when scopeSets api fails', async () => {
    vi.mocked(api.artifacts.list).mockResolvedValue([mockArtifact])
    vi.mocked(api.scopeSets.list).mockRejectedValue(new Error('Timeout'))

    const result = await fetchCourseContext('c1')

    expect(result.artifacts).toHaveLength(1)
    expect(result.scopeSets).toEqual([])
  })

  it('returns empty arrays when both apis fail (graceful degradation)', async () => {
    vi.mocked(api.artifacts.list).mockRejectedValue(new Error('Service unavailable'))
    vi.mocked(api.scopeSets.list).mockRejectedValue(new Error('Service unavailable'))

    const result = await fetchCourseContext('c1')

    expect(result.artifacts).toEqual([])
    expect(result.scopeSets).toEqual([])
  })

  it('passes courseId to both apis', async () => {
    vi.mocked(api.artifacts.list).mockResolvedValue([])
    vi.mocked(api.scopeSets.list).mockResolvedValue([])

    await fetchCourseContext('course-uuid-456')

    expect(api.artifacts.list).toHaveBeenCalledWith('course-uuid-456')
    expect(api.scopeSets.list).toHaveBeenCalledWith('course-uuid-456')
  })

  it('calls both apis in parallel (both called exactly once)', async () => {
    vi.mocked(api.artifacts.list).mockResolvedValue([])
    vi.mocked(api.scopeSets.list).mockResolvedValue([])

    await fetchCourseContext('c1')

    expect(api.artifacts.list).toHaveBeenCalledOnce()
    expect(api.scopeSets.list).toHaveBeenCalledOnce()
  })

  it('returns empty arrays for a course with no data', async () => {
    vi.mocked(api.artifacts.list).mockResolvedValue([])
    vi.mocked(api.scopeSets.list).mockResolvedValue([])

    const result = await fetchCourseContext('empty-course')

    expect(result).toEqual({ artifacts: [], scopeSets: [] })
  })

  it('returns multiple artifacts and scopeSets correctly', async () => {
    const artifacts = [mockArtifact, { ...mockArtifact, id: 2, file_name: 'lecture2.pdf' }]
    const scopeSets = [mockScopeSet, { ...mockScopeSet, id: 2, name: 'Week 1-5' }]
    vi.mocked(api.artifacts.list).mockResolvedValue(artifacts)
    vi.mocked(api.scopeSets.list).mockResolvedValue(scopeSets)

    const result = await fetchCourseContext('c1')

    expect(result.artifacts).toHaveLength(2)
    expect(result.scopeSets).toHaveLength(2)
  })
})
