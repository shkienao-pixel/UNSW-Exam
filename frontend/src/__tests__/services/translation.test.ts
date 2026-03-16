import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: {
    generate: {
      translate: vi.fn(),
    },
  },
}))

import { translateTexts } from '@/services/translation'
import { api } from '@/lib/api'

describe('translateTexts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns translations array from api response', async () => {
    vi.mocked(api.generate.translate).mockResolvedValue({ translations: ['你好', '世界'] })
    const result = await translateTexts('c1', ['Hello', 'World'])
    expect(result).toEqual(['你好', '世界'])
  })

  it('defaults targetLang to zh when not specified', async () => {
    vi.mocked(api.generate.translate).mockResolvedValue({ translations: ['你好'] })
    await translateTexts('c1', ['Hello'])
    expect(api.generate.translate).toHaveBeenCalledWith('c1', ['Hello'], 'zh')
  })

  it('passes explicit targetLang=en', async () => {
    vi.mocked(api.generate.translate).mockResolvedValue({ translations: ['Hello'] })
    await translateTexts('c1', ['你好'], 'en')
    expect(api.generate.translate).toHaveBeenCalledWith('c1', ['你好'], 'en')
  })

  it('passes explicit targetLang=zh', async () => {
    vi.mocked(api.generate.translate).mockResolvedValue({ translations: ['你好'] })
    await translateTexts('c1', ['Hello'], 'zh')
    expect(api.generate.translate).toHaveBeenCalledWith('c1', ['Hello'], 'zh')
  })

  it('returns empty array when input is empty', async () => {
    vi.mocked(api.generate.translate).mockResolvedValue({ translations: [] })
    const result = await translateTexts('c1', [])
    expect(result).toEqual([])
    expect(result).toHaveLength(0)
  })

  it('passes courseId correctly', async () => {
    vi.mocked(api.generate.translate).mockResolvedValue({ translations: [] })
    await translateTexts('course-abc-123', ['text'])
    expect(api.generate.translate).toHaveBeenCalledWith('course-abc-123', ['text'], 'zh')
  })

  it('calls api.generate.translate exactly once', async () => {
    vi.mocked(api.generate.translate).mockResolvedValue({ translations: ['x'] })
    await translateTexts('c1', ['input'])
    expect(api.generate.translate).toHaveBeenCalledOnce()
  })

  it('returns multiple translations preserving order', async () => {
    const input = ['first', 'second', 'third']
    const output = ['第一', '第二', '第三']
    vi.mocked(api.generate.translate).mockResolvedValue({ translations: output })
    const result = await translateTexts('c1', input)
    expect(result[0]).toBe('第一')
    expect(result[1]).toBe('第二')
    expect(result[2]).toBe('第三')
  })

  it('propagates network error', async () => {
    vi.mocked(api.generate.translate).mockRejectedValue(new Error('Network error'))
    await expect(translateTexts('c1', ['hello'])).rejects.toThrow('Network error')
  })

  it('propagates api 500 error', async () => {
    vi.mocked(api.generate.translate).mockRejectedValue(new Error('Internal server error'))
    await expect(translateTexts('c1', ['hello'])).rejects.toThrow('Internal server error')
  })

  it('propagates 401 unauthorized error', async () => {
    vi.mocked(api.generate.translate).mockRejectedValue(new Error('Unauthorized'))
    await expect(translateTexts('c1', ['hello'])).rejects.toThrow('Unauthorized')
  })
})
