import type { SyncFields } from '@/types'
import type { Table } from 'dexie'
import type { Ref } from 'vue'
import { toPlain } from '@/db/plain'
import { useSyncStore } from '@/stores/sync'
import { nextModifiedAt, observeModifiedAt } from '@/utils/clock'

// Every data store repeated the same tombstone-CRUD boilerplate: hydrate as
// "load, drop tombstones", add as "stamp id/modifiedAt/deleted, put, append,
// scheduleSync", update as "merge, re-stamp, put, replace", remove as
// "tombstone, put, filter". createSyncedTable owns that shape once so a change
// to the discipline (monotonic modifiedAt, a future transactional tweak) lands
// in one place. Stores compose it and layer their bespoke methods — expense
// snapshots, template reordering, custom-rate upsert — on top of `write`.

export type SyncedInput<T extends SyncFields> = Omit<T, keyof SyncFields>

export interface SyncedTable<T extends SyncFields, Input> {
  hydrate: () => Promise<void>
  add: (input: Input) => Promise<T>
  update: (id: string, patch: Partial<Input>) => Promise<T | null>
  remove: (id: string) => Promise<T | null>
  // Persist an already-built record (carrying its own modifiedAt), updating the
  // reactive list in place and scheduling a sync. For store methods that need
  // to construct the record themselves before it is written.
  write: (record: T) => Promise<void>
}

export function createSyncedTable<T extends SyncFields, Input = SyncedInput<T>> (options: {
  table: Table<T, string>
  list: Ref<T[]>
  // Builds a brand-new record from input; the helper stamps modifiedAt/deleted.
  // Optional: a store with upsert-shaped writes (custom rates) skips `add` and
  // uses `write` directly instead.
  build?: (input: Input) => Omit<T, 'modifiedAt' | 'deleted'>
  // Normalizes a stored record on hydrate (e.g. defaulting a missing tagIds).
  fromStored?: (record: T) => T
  // Orders the in-memory list after every change; defaults to insertion order.
  sort?: (records: T[]) => T[]
}): SyncedTable<T, Input> {
  const { table, list } = options
  const fromStored = options.fromStored ?? ((record: T) => record)
  const sort = options.sort ?? ((records: T[]) => records)

  async function hydrate (): Promise<void> {
    const stored = await table.toArray()
    // Seed the monotonic clock with every stored modifiedAt — tombstones
    // included, so observe before filtering `deleted` — so the first edit after
    // a page reload can't be minted behind a value already persisted. Without
    // this the clock resets to `Date.now()` on each load, and a backwards clock
    // step would let an edit look older than the record it supersedes.
    for (const record of stored) {
      observeModifiedAt(record.modifiedAt)
    }
    const records = stored.filter(record => !record.deleted).map(record => fromStored(record))
    list.value = sort(records)
  }

  async function write (record: T): Promise<void> {
    await table.put(toPlain(record))
    const next = list.value.some(existing => existing.id === record.id)
      ? list.value.map(existing => (existing.id === record.id ? record : existing))
      : [...list.value, record]
    list.value = sort(next)
    useSyncStore().scheduleSync()
  }

  async function add (input: Input): Promise<T> {
    if (!options.build) {
      throw new Error('createSyncedTable: add requires a build function')
    }
    const record = { ...options.build(input), modifiedAt: nextModifiedAt(), deleted: false } as T
    await write(record)
    return record
  }

  async function update (id: string, patch: Partial<Input>): Promise<T | null> {
    const existing = list.value.find(record => record.id === id)
    if (!existing) {
      return null
    }
    const updated = { ...existing, ...patch, modifiedAt: nextModifiedAt() } as T
    await write(updated)
    return updated
  }

  async function remove (id: string): Promise<T | null> {
    const existing = list.value.find(record => record.id === id)
    if (!existing) {
      return null
    }
    const tombstoned = { ...existing, deleted: true, modifiedAt: nextModifiedAt() } as T
    await table.put(toPlain(tombstoned))
    list.value = list.value.filter(record => record.id !== id)
    useSyncStore().scheduleSync()
    return tombstoned
  }

  return { hydrate, add, update, remove, write }
}
