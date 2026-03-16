import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: {
    credits: {
      balance: vi.fn(),
    },
  },
}))

import { fetchCreditBalance } from '@/services/credits'
import { api } from '@/lib/api'

describe('fetchCreditBalance', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the balance number from api response', async () => {
    vi.mocked(api.credits.balance).mockResolvedValue({ balance: 42 })
    const result = await fetchCreditBalance()
    expect(result).toBe(42)
  })

  it('returns zero balance', async () => {
    vi.mocked(api.credits.balance).mockResolvedValue({ balance: 0 })
    const result = await fetchCreditBalance()
    expect(result).toBe(0)
  })

  it('returns large balance correctly', async () => {
    vi.mocked(api.credits.balance).mockResolvedValue({ balance: 9999 })
    const result = await fetchCreditBalance()
    expect(result).toBe(9999)
  })

  it('calls api.credits.balance with no arguments', async () => {
    vi.mocked(api.credits.balance).mockResolvedValue({ balance: 10 })
    await fetchCreditBalance()
    expect(api.credits.balance).toHaveBeenCalledOnce()
    expect(api.credits.balance).toHaveBeenCalledWith()
  })

  it('propagates network error', async () => {
    vi.mocked(api.credits.balance).mockRejectedValue(new Error('Network error'))
    await expect(fetchCreditBalance()).rejects.toThrow('Network error')
  })

  it('propagates 401 unauthorized error', async () => {
    vi.mocked(api.credits.balance).mockRejectedValue(new Error('Unauthorized'))
    await expect(fetchCreditBalance()).rejects.toThrow('Unauthorized')
  })

  it('propagates 500 server error', async () => {
    vi.mocked(api.credits.balance).mockRejectedValue(new Error('Internal server error'))
    await expect(fetchCreditBalance()).rejects.toThrow('Internal server error')
  })
})
