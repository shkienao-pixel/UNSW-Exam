import { api } from '@/lib/api'

export async function fetchCreditBalance(): Promise<number> {
  const r = await api.credits.balance()
  return r.balance
}
