import type { IncomePeriod, WorkUnitsConfig } from '@/types'

const MINUTE = 60
const HOUR = 3600

// The income period valid on a given date: greatest effectiveFrom <= date.
// Ties (same effectiveFrom on two devices) resolve to the newest edit.
export function incomePeriodFor (date: string, periods: IncomePeriod[]): IncomePeriod | null {
  let best: IncomePeriod | null = null
  for (const p of periods) {
    if (p.deleted || p.effectiveFrom > date) {
      continue
    }
    if (
      !best
      || p.effectiveFrom > best.effectiveFrom
      || (p.effectiveFrom === best.effectiveFrom && p.modifiedAt > best.modifiedAt)
    ) {
      best = p
    }
  }
  return best
}

export function hourlyRate (period: IncomePeriod): number {
  const unitHours = {
    hour: 1,
    day: period.hoursPerDay,
    week: period.hoursPerDay * period.daysPerWeek,
    month: period.hoursPerDay * period.daysPerWeek * 4,
  }[period.unit]
  return period.amount / unitHours
}

export function costToWorkSeconds (
  baseAmount: number | null | undefined,
  period: IncomePeriod | null,
): number | null {
  if (baseAmount == null || !period || period.amount <= 0) {
    return null
  }
  return (baseAmount / hourlyRate(period)) * HOUR
}

interface LadderUnit {
  label: string
  size: number
}

// Descending unit ladder derived from the work config:
// 1 workday = hoursPerDay hours, 1 workweek = daysPerWeek workdays,
// 1 workmonth = 4 workweeks, 1 workyear = 12 workmonths.
export function unitLadder (cfg: WorkUnitsConfig): LadderUnit[] {
  const day = cfg.hoursPerDay * HOUR
  const week = cfg.daysPerWeek * day
  const month = 4 * week
  const year = 12 * month
  return [
    { label: 'y', size: year },
    { label: 'mo', size: month },
    { label: 'w', size: week },
    { label: 'd', size: day },
    { label: 'h', size: HOUR },
    { label: 'm', size: MINUTE },
    { label: 's', size: 1 },
  ]
}

// Formats work-seconds as the two largest non-zero units ("3m 17s",
// "2h 14m", "1d 3h", "1y 4mo"), rounding the smaller unit with carry
// normalization so "1h 59m 50s" becomes "2h", never "1h 60m".
export function formatWorktime (seconds: number | null | undefined, cfg: WorkUnitsConfig): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '—'
  }
  const total = Math.round(seconds)
  if (total === 0) {
    return '0s'
  }

  const units = unitLadder(cfg)
  const i = units.findIndex(u => total >= u.size)
  if (i === units.length - 1) {
    return `${total}s`
  }

  const unit = units[i]!
  const next = units[i + 1]!
  let primary = Math.floor(total / unit.size)
  let secondary = Math.round((total - primary * unit.size) / next.size)
  if (secondary * next.size >= unit.size) {
    primary += 1
    secondary = 0
  }
  // The carry can push the value across the next boundary ("12mo" → "1y").
  if (secondary === 0 && i > 0 && primary * unit.size >= units[i - 1]!.size) {
    return formatWorktime(primary * unit.size, cfg)
  }
  return secondary > 0
    ? `${primary}${unit.label} ${secondary}${next.label}`
    : `${primary}${unit.label}`
}
