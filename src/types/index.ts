/**
 * Domain model. Every synced entity extends SyncFields: records are never
 * hard-deleted locally — they become tombstones (deleted: true) so deletions
 * propagate through Etebase sync.
 */

export interface SyncFields {
  id: string
  modifiedAt: number
  deleted: boolean
}

export interface Expense extends SyncFields {
  amount: number
  currency: string
  // Snapshot of the amount converted to the base currency at entry time,
  // so later FX rate changes never alter past expenses. Null when no rate
  // was available (e.g. entered offline) — backfilled once rates exist.
  baseAmount: number | null
  baseCurrency: string
  description: string
  categoryId: string
  tagIds: string[]
  date: string // 'YYYY-MM-DD', local calendar date
  createdAt: number
}

export interface Category extends SyncFields {
  name: string
  icon: string
  color: string
  isProtected?: boolean
}

// Free-form label; an expense can carry any number of tags, across categories.
export interface Tag extends SyncFields {
  name: string
  color: string
}

export interface ExpenseTemplate extends SyncFields {
  name: string
  amount: number
  currency: string
  categoryId: string
  sortOrder: number
}

export type IncomeUnit = 'hour' | 'day' | 'week' | 'month'

// Income is a dated history: the period applying to an expense is the one
// with the greatest effectiveFrom <= expense.date. This freezes each
// expense's worktime at what it cost when it was made.
export interface IncomePeriod extends SyncFields {
  effectiveFrom: string // 'YYYY-MM-DD'
  amount: number // in the base currency
  unit: IncomeUnit
  hoursPerDay: number
  daysPerWeek: number
}

// User-defined currency (or manual override of an auto-fetched one).
// id is deterministic: `fx-${code}` so devices merge cleanly under sync.
export interface CustomRate extends SyncFields {
  code: string
  name: string
  rateToEur: number // 1 unit of `code` = rateToEur EUR
}

export interface AppSettings {
  baseCurrency: string
  modifiedAt: number
}

// Cached frankfurter/ECB table, always EUR-based (local-only, not synced).
export interface FxRates {
  date: string // rate date reported by the API
  fetchedAt: number
  rates: Record<string, number> // 1 EUR = rates[code] units of code
}

export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'error'

// Mapping between a local record and its Etebase item.
export interface SyncItemMap {
  localId: string
  itemUid: string
  cachedItem: Uint8Array | null
  lastSyncedModifiedAt: number
}

export interface MetaEntry {
  key: string
  value: unknown
}

export type WorkUnitsConfig = Pick<IncomePeriod, 'hoursPerDay' | 'daysPerWeek'>

export type PeriodKind = 'day' | 'week' | 'month' | 'year'

// Per-category aggregate for the statistics page.
export interface CategoryStat {
  category: Category
  base: number
  seconds: number | null
  share: number
}
