'use client'

import { useState, useCallback, useEffect } from 'react'
import { fetchCreditBalance } from '@/services/credits'

export function useCredits(enabled: boolean) {
  const [balance, setBalance] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      setBalance(await fetchCreditBalance())
    } catch { /* ignore */ }
  }, [enabled])

  // 优化扣减：不等接口返回，直接本地减
  const deduct = useCallback((amount: number) => {
    setBalance(prev => (prev !== null ? prev - amount : null))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { balance, refresh, deduct }
}
