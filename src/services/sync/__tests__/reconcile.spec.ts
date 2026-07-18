// Unit coverage for the split-brain convergence logic in `etebase.ts`:
// `reconcileCachedCollection` decides, on every fresh app start, whether the
// cached collection is still the global winner and resets sync bookkeeping when
// it isn't. Driven with a stubbed CollectionManager so no server is needed.
import type { SyncItemMap } from '@/types'
import type * as Etebase from 'etebase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, setMeta } from '@/db'
import { reconcileCachedCollection } from '@/services/sync/etebase'

const STOKEN_KEY = 'etebase.stoken'

function collection (uid: string, isDeleted = false): Etebase.Collection {
  return { uid, isDeleted } as unknown as Etebase.Collection
}

// A CollectionManager whose only exercised method is `list`. Pass an array to
// return it as the listing, or an Error to make the list reject (offline).
function stubManager (result: Etebase.Collection[] | Error): Etebase.CollectionManager {
  return {
    list: vi.fn(async () => {
      if (result instanceof Error) {
        throw result
      }
      return { data: result }
    }),
  } as unknown as Etebase.CollectionManager
}

function syncItem (localId: string): SyncItemMap {
  return { localId, itemUid: `uid-${localId}`, cachedItem: null, lastSyncedModifiedAt: 1 }
}

// Seeds the bookkeeping that a switch away from a losing collection must clear.
async function seedBookkeeping () {
  await db.syncItems.bulkPut([syncItem('a'), syncItem('b')])
  await setMeta(STOKEN_KEY, 'stoken-of-cached-collection')
}

beforeEach(async () => {
  await db.syncItems.clear()
  await db.meta.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reconcileCachedCollection', () => {
  it('keeps the cache and bookkeeping when the cached collection is still the winner', async () => {
    await seedBookkeeping()
    // Lowest uid overall is the cached one, so nothing switches.
    const manager = stubManager([collection('col-a'), collection('col-b')])

    const result = await reconcileCachedCollection(manager, collection('col-a'))

    expect(result.uid).toBe('col-a')
    expect(await db.syncItems.count()).toBe(2)
    expect(await getMeta(STOKEN_KEY)).toBe('stoken-of-cached-collection')
  })

  it('switches to the global winner and clears bookkeeping when the cache points at a loser', async () => {
    await seedBookkeeping()
    // A concurrent device created `col-a`, which sorts below the cached `col-b`.
    const manager = stubManager([collection('col-a'), collection('col-b')])

    const result = await reconcileCachedCollection(manager, collection('col-b'))

    expect(result.uid).toBe('col-a')
    // Mappings and stoken belonged to the losing collection — both are dropped
    // so every local record re-syncs against the winner on the same run.
    expect(await db.syncItems.count()).toBe(0)
    expect(await getMeta(STOKEN_KEY)).toBeUndefined()
  })

  it('ignores deleted collections when choosing the winner', async () => {
    await seedBookkeeping()
    // `col-0` sorts lowest but is deleted; the cached `col-b` remains the winner.
    const manager = stubManager([collection('col-0', true), collection('col-b')])

    const result = await reconcileCachedCollection(manager, collection('col-b'))

    expect(result.uid).toBe('col-b')
    expect(await db.syncItems.count()).toBe(2)
    expect(await getMeta(STOKEN_KEY)).toBe('stoken-of-cached-collection')
  })

  it('keeps the cached collection when the list fails (offline)', async () => {
    await seedBookkeeping()
    const manager = stubManager(new Error('network down'))

    const result = await reconcileCachedCollection(manager, collection('col-b'))

    // A list failure must not switch collections or discard bookkeeping; the
    // next successful start reconciles instead.
    expect(result.uid).toBe('col-b')
    expect(await db.syncItems.count()).toBe(2)
    expect(await getMeta(STOKEN_KEY)).toBe('stoken-of-cached-collection')
  })
})
