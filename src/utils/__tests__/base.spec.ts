import type { Expense } from '@/types'
import { describe, expect, it } from 'vitest'
import { resolveBaseAmount } from '@/utils/base'

// 1 EUR = 1.25 USD, 1 EUR = 0.5 GBP.
const RATES: Record<string, number> = { EUR: 1, USD: 1.25, GBP: 0.5 }

function convert (amount: number, from: string, to: string): number | null {
  if (from === to) {
    return amount
  }
  const fromRate = RATES[from]
  const toRate = RATES[to]
  return fromRate && toRate ? (amount / fromRate) * toRate : null
}

function expense (fields: Partial<Expense>): Expense {
  return {
    id: 'e1',
    amount: 10,
    currency: 'USD',
    baseAmount: 8,
    baseCurrency: 'EUR',
    description: 'test',
    categoryId: 'default-other',
    tagIds: [],
    date: '2026-07-01',
    createdAt: 0,
    modifiedAt: 0,
    deleted: false,
    ...fields,
  }
}

describe('resolveBaseAmount', () => {
  it('trusts a snapshot already in the base currency', () => {
    // Even though live rates would say otherwise: the snapshot is the frozen
    // entry-time value and must not drift with today's rates.
    const stale = expense({ baseAmount: 99 })
    expect(resolveBaseAmount(stale, 'EUR', convert)).toBe(99)
  })

  it('recomputes when the snapshot is in a superseded base', () => {
    // 8 is EUR; reading it as USD would understate the expense by 20%.
    expect(resolveBaseAmount(expense({}), 'USD', convert)).toBe(10)
  })

  it('recomputes when no snapshot was taken', () => {
    expect(resolveBaseAmount(expense({ baseAmount: null }), 'EUR', convert)).toBe(8)
  })

  it('falls back to cross-converting a stale snapshot when the original currency has no rate', () => {
    const custom = expense({ currency: 'XYZ', baseAmount: 8, baseCurrency: 'EUR' })
    expect(resolveBaseAmount(custom, 'GBP', convert)).toBe(4)
  })

  it('returns null when nothing reaches the base currency', () => {
    const orphan = expense({ currency: 'XYZ', baseAmount: null })
    expect(resolveBaseAmount(orphan, 'EUR', convert)).toBeNull()
  })
})
