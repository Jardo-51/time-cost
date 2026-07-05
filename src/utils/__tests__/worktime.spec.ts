import type { IncomePeriod } from '../../types'
import { describe, expect, it } from 'vitest'
import { costToWorkSeconds, formatWorktime, incomePeriodFor } from '../worktime'

const cfg = { hoursPerDay: 8, daysPerWeek: 5 }

function period (overrides: Partial<IncomePeriod> = {}): IncomePeriod {
  return {
    id: 'p1',
    modifiedAt: 1,
    deleted: false,
    effectiveFrom: '2026-01-01',
    amount: 40,
    unit: 'hour',
    hoursPerDay: 8,
    daysPerWeek: 5,
    ...overrides,
  }
}

describe('formatWorktime', () => {
  it('formats seconds and minutes', () => {
    expect(formatWorktime(0, cfg)).toBe('0s')
    expect(formatWorktime(30, cfg)).toBe('30s')
    expect(formatWorktime(197, cfg)).toBe('3m 17s')
  })

  it('formats hours', () => {
    expect(formatWorktime(8040, cfg)).toBe('2h 14m')
  })

  it('rolls to workdays at hoursPerDay hours', () => {
    expect(formatWorktime(8 * 3600, cfg)).toBe('1d')
    expect(formatWorktime(39_600, cfg)).toBe('1d 3h')
  })

  it('rolls to weeks, months, years', () => {
    const day = 8 * 3600
    const week = 5 * day
    const month = 4 * week
    const year = 12 * month
    expect(formatWorktime(2 * week + 3 * day, cfg)).toBe('2w 3d')
    expect(formatWorktime(3 * month + 2 * week, cfg)).toBe('3mo 2w')
    expect(formatWorktime(year + 4 * month, cfg)).toBe('1y 4mo')
  })

  it('carries when the rounded secondary unit overflows', () => {
    expect(formatWorktime(3600 + 59 * 60 + 50, cfg)).toBe('2h')
  })

  it('promotes across unit boundaries after a carry', () => {
    const day = 8 * 3600
    const week = 5 * day
    const month = 4 * week
    expect(formatWorktime(11 * month + 3.9 * week, cfg)).toBe('1y')
  })

  it('rounds sub-minute values up into minutes', () => {
    expect(formatWorktime(59.7, cfg)).toBe('1m')
  })

  it('respects configurable work units', () => {
    const partTime = { hoursPerDay: 6, daysPerWeek: 4 }
    expect(formatWorktime(6 * 3600, partTime)).toBe('1d')
    expect(formatWorktime(8 * 3600, cfg)).toBe('1d')
  })

  it('returns em dash for missing or invalid values', () => {
    expect(formatWorktime(null, cfg)).toBe('—')
    expect(formatWorktime(-5, cfg)).toBe('—')
    expect(formatWorktime(Number.NaN, cfg)).toBe('—')
  })
})

describe('costToWorkSeconds', () => {
  it('converts using an hourly income', () => {
    expect(costToWorkSeconds(40, period())).toBe(3600)
    expect(costToWorkSeconds(40, period({ amount: 60 }))).toBe(2400)
  })

  it('derives the hourly rate from day/week/month units', () => {
    expect(costToWorkSeconds(320, period({ amount: 320, unit: 'day' }))).toBe(8 * 3600)
    expect(costToWorkSeconds(60, period({ amount: 4800, unit: 'month' }))).toBe(7200)
    expect(costToWorkSeconds(40, period({ amount: 1600, unit: 'week' }))).toBe(3600)
  })

  it('returns null without a usable period or amount', () => {
    expect(costToWorkSeconds(40, null)).toBeNull()
    expect(costToWorkSeconds(null, period())).toBeNull()
    expect(costToWorkSeconds(40, period({ amount: 0 }))).toBeNull()
  })
})

describe('incomePeriodFor', () => {
  const early = period({ id: 'a', effectiveFrom: '2026-01-01', amount: 40 })
  const late = period({ id: 'b', effectiveFrom: '2026-08-01', amount: 60 })

  it('picks the period valid on the given date', () => {
    expect(incomePeriodFor('2026-07-05', [early, late])?.id).toBe('a')
    expect(incomePeriodFor('2026-09-01', [early, late])?.id).toBe('b')
  })

  it('includes the effectiveFrom boundary date', () => {
    expect(incomePeriodFor('2026-08-01', [early, late])?.id).toBe('b')
  })

  it('returns null before the first period', () => {
    expect(incomePeriodFor('2025-12-31', [early, late])).toBeNull()
  })

  it('ignores tombstoned periods', () => {
    expect(incomePeriodFor('2026-09-01', [early, { ...late, deleted: true }])?.id).toBe('a')
  })

  it('breaks effectiveFrom ties by newest edit', () => {
    const older = period({ id: 'x', modifiedAt: 1 })
    const newer = period({ id: 'y', modifiedAt: 2 })
    expect(incomePeriodFor('2026-06-01', [older, newer])?.id).toBe('y')
  })
})
