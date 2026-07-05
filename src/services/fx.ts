import type { FxRates } from '@/types'

const API_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR'

// Fetches the daily ECB table, always EUR-based. Any→any conversion happens
// via cross rates, so a base-currency change never needs a refetch.
export async function fetchEurRates (): Promise<FxRates> {
  const res = await fetch(API_URL)
  if (!res.ok) {
    throw new Error(`FX API responded ${res.status}`)
  }
  const body = await res.json() as { date: string, rates: Record<string, number> }
  return {
    date: body.date,
    fetchedAt: Date.now(),
    rates: { ...body.rates, EUR: 1 },
  }
}
