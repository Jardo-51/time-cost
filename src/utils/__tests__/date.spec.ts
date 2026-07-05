import { describe, expect, it } from 'vitest'
import { parseISODate, periodRange, shiftAnchor, toISODate } from '../date'

describe('periodRange', () => {
  it('returns a single day', () => {
    expect(periodRange('day', parseISODate('2026-07-05'))).toEqual({
      start: '2026-07-05',
      end: '2026-07-05',
    })
  })

  it('returns Monday-based weeks', () => {
    // 2026-07-01 is a Wednesday
    expect(periodRange('week', parseISODate('2026-07-01'))).toEqual({
      start: '2026-06-29',
      end: '2026-07-05',
    })
    // Anchoring on a Monday keeps the same week
    expect(periodRange('week', parseISODate('2026-06-29')).start).toBe('2026-06-29')
  })

  it('handles month lengths including leap February', () => {
    expect(periodRange('month', parseISODate('2024-02-10'))).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    })
    expect(periodRange('month', parseISODate('2026-07-05')).end).toBe('2026-07-31')
  })

  it('returns calendar years', () => {
    expect(periodRange('year', parseISODate('2026-03-01'))).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    })
  })
})

describe('shiftAnchor', () => {
  it('shifts days and weeks', () => {
    expect(toISODate(shiftAnchor('day', parseISODate('2026-01-01'), -1))).toBe('2025-12-31')
    expect(toISODate(shiftAnchor('week', parseISODate('2026-07-01'), 1))).toBe('2026-07-08')
  })

  it('shifts months across year boundaries without day overflow', () => {
    expect(toISODate(shiftAnchor('month', parseISODate('2026-12-15'), 1))).toBe('2027-01-01')
    expect(toISODate(shiftAnchor('month', parseISODate('2026-01-31'), 1))).toBe('2026-02-01')
  })

  it('shifts years', () => {
    expect(toISODate(shiftAnchor('year', parseISODate('2026-06-15'), -1))).toBe('2025-01-01')
  })
})

describe('toISODate / parseISODate', () => {
  it('round-trips local dates', () => {
    expect(toISODate(parseISODate('2026-07-05'))).toBe('2026-07-05')
    expect(toISODate(parseISODate('2024-02-29'))).toBe('2024-02-29')
  })
})
