import type { PeriodKind } from '@/types'

// All dates are local calendar dates as 'YYYY-MM-DD' strings; string
// comparison equals chronological comparison. Weeks start on Monday.

export function toISODate (d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO (): string {
  return toISODate(new Date())
}

export function parseISODate (iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

// A regex alone accepts impossible dates like '2026-13-40'; round-tripping
// through the Date constructor rejects them because it normalises overflow.
export function isValidISODate (iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && toISODate(parseISODate(iso)) === iso
}

export function addDays (d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export interface DateRange {
  start: string
  end: string // inclusive
}

export function periodRange (kind: PeriodKind, anchor: Date): DateRange {
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  switch (kind) {
    case 'day': {
      const iso = toISODate(a)
      return { start: iso, end: iso }
    }
    case 'week': {
      const monday = addDays(a, -((a.getDay() + 6) % 7))
      return { start: toISODate(monday), end: toISODate(addDays(monday, 6)) }
    }
    case 'month': {
      return {
        start: toISODate(new Date(a.getFullYear(), a.getMonth(), 1)),
        end: toISODate(new Date(a.getFullYear(), a.getMonth() + 1, 0)),
      }
    }
    case 'year': {
      return { start: `${a.getFullYear()}-01-01`, end: `${a.getFullYear()}-12-31` }
    }
  }
}

export function shiftAnchor (kind: PeriodKind, anchor: Date, delta: number): Date {
  switch (kind) {
    case 'day': {
      return addDays(anchor, delta)
    }
    case 'week': {
      return addDays(anchor, 7 * delta)
    }
    case 'month': {
      return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
    }
    case 'year': {
      return new Date(anchor.getFullYear() + delta, 0, 1)
    }
  }
}

export function periodLabel (kind: PeriodKind, anchor: Date): string {
  const { start, end } = periodRange(kind, anchor)
  const s = parseISODate(start)
  switch (kind) {
    case 'day': {
      return s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    }
    case 'week': {
      const e = parseISODate(end)
      const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
      const startLabel = s.toLocaleDateString(undefined, sameMonth
        ? { day: 'numeric' }
        : { day: 'numeric', month: 'short' })
      const endLabel = e.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      return `${startLabel} – ${endLabel}`
    }
    case 'month': {
      return s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    }
    case 'year': {
      return String(s.getFullYear())
    }
  }
}

export function dateGroupLabel (iso: string): string {
  const now = new Date()
  if (iso === toISODate(now)) {
    return 'Today'
  }
  if (iso === toISODate(addDays(now, -1))) {
    return 'Yesterday'
  }
  const d = parseISODate(iso)
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }
  if (d.getFullYear() !== now.getFullYear()) {
    opts.year = 'numeric'
  }
  return d.toLocaleDateString(undefined, opts)
}

export function relativeTime (ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
