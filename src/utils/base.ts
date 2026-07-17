import type { Expense } from '@/types'

export type ConvertFn = (amount: number, from: string, to: string) => number | null

/**
 * An expense's amount expressed in `base`.
 *
 * The snapshot taken at entry time is authoritative, but only while it is
 * still denominated in `base`: a base-currency change or a sync race (a device
 * creating an expense before it learns the base changed elsewhere) leaves
 * snapshots in an older currency, and those numbers must be converted rather
 * than read as if they were already in `base`. Falls back to a fresh
 * conversion of the original amount, then to a cross-rate conversion of the
 * stale snapshot, and finally to null when no rate reaches `base` at all.
 */
export function resolveBaseAmount (expense: Expense, base: string, convert: ConvertFn): number | null {
  if (expense.baseAmount !== null && expense.baseCurrency === base) {
    return expense.baseAmount
  }
  const live = convert(expense.amount, expense.currency, base)
  if (live !== null) {
    return live
  }
  return expense.baseAmount === null
    ? null
    : convert(expense.baseAmount, expense.baseCurrency, base)
}
