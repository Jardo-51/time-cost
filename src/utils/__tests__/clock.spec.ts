import { afterEach, describe, expect, it, vi } from 'vitest'

// `last` is module-level and only ever moves forward, so each test needs a
// fresh module instance to start from a known zero. `vi.resetModules()` +
// dynamic import gives that isolation; fake timers pin `Date.now()`.
async function freshClock () {
  vi.resetModules()
  return import('@/utils/clock')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('nextModifiedAt', () => {
  it('returns the wall clock while it moves normally forward', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const { nextModifiedAt } = await freshClock()
    expect(nextModifiedAt()).toBe(1000)
    vi.setSystemTime(2000)
    expect(nextModifiedAt()).toBe(2000)
  })

  it('strictly increases across writes in the same millisecond', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(5000)
    const { nextModifiedAt } = await freshClock()
    // The wall clock never advances between these calls; the clamp must still
    // hand out three distinct, ordered stamps.
    expect(nextModifiedAt()).toBe(5000)
    expect(nextModifiedAt()).toBe(5001)
    expect(nextModifiedAt()).toBe(5002)
  })

  it('keeps advancing when the wall clock steps backwards', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const { nextModifiedAt } = await freshClock()
    const before = nextModifiedAt()
    // NTP correction / manual clock change moves time backwards. A newer edit
    // must not be stamped older than the one it supersedes.
    vi.setSystemTime(3000)
    const after = nextModifiedAt()
    expect(after).toBe(before + 1)
    expect(after).toBeGreaterThan(before)
  })
})

describe('observeModifiedAt', () => {
  it('pulls the clock forward so the next stamp beats an observed value', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const { nextModifiedAt, observeModifiedAt } = await freshClock()
    // A remote revision (or a record replayed at hydrate) minted far ahead of
    // this device's clock: the next local edit must sort after it or LWW drops it.
    observeModifiedAt(50_000)
    expect(nextModifiedAt()).toBe(50_001)
  })

  it('ignores values at or below the current high-water mark', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const { nextModifiedAt, observeModifiedAt } = await freshClock()
    expect(nextModifiedAt()).toBe(10_000)
    observeModifiedAt(5000)
    expect(nextModifiedAt()).toBe(10_001)
  })

  it('ignores non-finite values', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const { nextModifiedAt, observeModifiedAt } = await freshClock()
    observeModifiedAt(Number.NaN)
    observeModifiedAt(Number.POSITIVE_INFINITY)
    expect(nextModifiedAt()).toBe(1000)
  })
})
