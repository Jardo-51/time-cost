import type { AppSettings, SyncFields } from '@/types'
import type { Table } from 'dexie'
import * as Etebase from 'etebase'
import { db, getMeta, setMeta } from '@/db'
import { getCollection, getItemManager } from '@/services/sync/etebase'
import { useCategoriesStore } from '@/stores/categories'
import { useExpensesStore } from '@/stores/expenses'
import { useFxStore } from '@/stores/fx'
import { useSettingsStore } from '@/stores/settings'
import { useTagsStore } from '@/stores/tags'
import { useTemplatesStore } from '@/stores/templates'
import { observeModifiedAt } from '@/utils/clock'

// One Etebase collection, one encrypted item per record. Item content is
// JSON { entity, data }; item meta { name: localId, mtime: modifiedAt }.
// Conflicts resolve last-write-wins by the record's modifiedAt, and an exact
// tie (remoteModifiedAt === local.modifiedAt) counts as "already applied".
// modifiedAt is minted by the device-monotonic clock (utils/clock), which
// keeps a local edit strictly increasing and — via observeModifiedAt below —
// never behind a remote timestamp this device has already pulled in. Clock
// skew *between* devices is still not resolved here; that is an accepted
// tradeoff for this offline-first app class.

const STOKEN_KEY = 'etebase.stoken'
const BATCH_SIZE = 50
const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000

type SyncEntity = 'expense' | 'category' | 'tag' | 'template' | 'incomePeriod' | 'customRate' | 'settings'

type SyncRecord = SyncFields & Record<string, unknown>

interface ItemPayload {
  entity: SyncEntity
  data: SyncRecord
}

const TABLE_ENTITIES: Array<{ entity: SyncEntity, table: Table<SyncRecord, string> }> = [
  { entity: 'expense', table: db.expenses as unknown as Table<SyncRecord, string> },
  { entity: 'category', table: db.categories as unknown as Table<SyncRecord, string> },
  { entity: 'tag', table: db.tags as unknown as Table<SyncRecord, string> },
  { entity: 'template', table: db.templates as unknown as Table<SyncRecord, string> },
  { entity: 'incomePeriod', table: db.incomePeriods as unknown as Table<SyncRecord, string> },
  { entity: 'customRate', table: db.customRates as unknown as Table<SyncRecord, string> },
]

function tableFor (entity: SyncEntity): Table<SyncRecord, string> | null {
  return TABLE_ENTITIES.find(t => t.entity === entity)?.table ?? null
}

export async function syncOnce (): Promise<void> {
  const collection = await getCollection()
  const itemManager = getItemManager(collection)
  await pull(itemManager)
  await push(itemManager)
  await purgeOldTombstones()
}

// ---------------------------------------------------------------- pull

async function pull (itemManager: Etebase.ItemManager): Promise<void> {
  let stoken = (await getMeta<string>(STOKEN_KEY)) ?? undefined
  let done = false
  const touched = new Set<SyncEntity>()

  while (!done) {
    const response = await itemManager.list({ stoken, limit: BATCH_SIZE })
    for (const item of response.data) {
      await applyRemoteItem(itemManager, item, touched)
    }
    stoken = response.stoken ?? stoken
    done = response.done
  }

  if (stoken) {
    await setMeta(STOKEN_KEY, stoken)
  }
  await rehydrate(touched)
}

async function applyRemoteItem (
  itemManager: Etebase.ItemManager,
  item: Etebase.Item,
  touched: Set<SyncEntity>,
): Promise<void> {
  let payload: ItemPayload | null = null
  try {
    const content = await item.getContent(Etebase.OutputFormat.String)
    if (content) {
      payload = JSON.parse(content) as ItemPayload
    }
  } catch {
    payload = null
  }

  const meta = item.getMeta()
  const mapping = await db.syncItems.where('itemUid').equals(item.uid).first()
  const localId = mapping?.localId
    ?? payload?.data?.id
    ?? (typeof meta.name === 'string' ? meta.name : null)
  if (!localId) {
    return
  }

  const remoteModifiedAt = typeof payload?.data?.modifiedAt === 'number'
    ? payload.data.modifiedAt
    : (typeof meta.mtime === 'number' ? meta.mtime : Date.now())
  // Keep the local clock from later minting an edit behind a remote revision
  // it has already seen — LWW would silently discard such an edit.
  observeModifiedAt(remoteModifiedAt)

  let entity = payload?.entity ?? null
  if (!entity && localId === 'settings') {
    entity = 'settings'
  }
  if (!entity) {
    entity = await findEntityOfLocal(localId)
  }

  // Whether the local copy now matches the remote revision.
  const remoteApplied = entity === 'settings'
    ? await applyRemoteSettings(payload, remoteModifiedAt, touched)
    : (entity
        ? await applyRemoteRecord(entity, localId, payload, remoteModifiedAt, item.isDeleted, touched)
        : false)

  await db.syncItems.put({
    localId,
    itemUid: item.uid,
    cachedItem: itemManager.cacheSave(item),
    lastSyncedModifiedAt: remoteApplied
      ? remoteModifiedAt
      : (mapping?.lastSyncedModifiedAt ?? 0),
  })
}

async function applyRemoteSettings (
  payload: ItemPayload | null,
  remoteModifiedAt: number,
  touched: Set<SyncEntity>,
): Promise<boolean> {
  if (!payload) {
    // Content didn't parse: nothing was applied, so the local copy does NOT
    // match this remote revision. Reporting success here would advance
    // lastSyncedModifiedAt past a revision we never applied (applyRemoteRecord
    // returns false in the same situation).
    return false
  }
  const local = await getMeta<AppSettings>('appSettings')
  if (local && remoteModifiedAt <= local.modifiedAt) {
    return remoteModifiedAt === local.modifiedAt
  }
  await setMeta('appSettings', {
    baseCurrency: String(payload.data.baseCurrency ?? 'EUR'),
    modifiedAt: remoteModifiedAt,
  })
  touched.add('settings')
  return true
}

async function applyRemoteRecord (
  entity: SyncEntity,
  localId: string,
  payload: ItemPayload | null,
  remoteModifiedAt: number,
  remoteDeleted: boolean,
  touched: Set<SyncEntity>,
): Promise<boolean> {
  const table = tableFor(entity)
  if (!table) {
    return false
  }
  // Sync runs in the background while the UI is live. Read, compare and write
  // in one transaction so a concurrent local edit committed between the get
  // and the put can't be silently clobbered by older remote data — the LWW
  // comparison and the write must see the same snapshot.
  return db.transaction('rw', table, async () => {
    const local = await table.get(localId)
    if (remoteDeleted) {
      if (!local) {
        return true
      }
      if (local.modifiedAt > remoteModifiedAt) {
        return false // local edit wins over the remote delete
      }
      await table.put({ ...local, deleted: true, modifiedAt: remoteModifiedAt })
      touched.add(entity)
      return true
    }
    if (!payload) {
      return false
    }
    if (local && remoteModifiedAt <= local.modifiedAt) {
      return remoteModifiedAt === local.modifiedAt
    }
    await table.put({ ...payload.data, id: localId })
    touched.add(entity)
    return true
  })
}

async function findEntityOfLocal (localId: string): Promise<SyncEntity | null> {
  for (const { entity, table } of TABLE_ENTITIES) {
    if (await table.get(localId)) {
      return entity
    }
  }
  return null
}

async function rehydrate (touched: Set<SyncEntity>): Promise<void> {
  const jobs: Array<Promise<void>> = []
  if (touched.has('expense')) {
    jobs.push(useExpensesStore().hydrate())
  }
  if (touched.has('category')) {
    jobs.push(useCategoriesStore().hydrate())
  }
  if (touched.has('tag')) {
    jobs.push(useTagsStore().hydrate())
  }
  if (touched.has('template')) {
    jobs.push(useTemplatesStore().hydrate())
  }
  if (touched.has('customRate')) {
    jobs.push(useFxStore().hydrate())
  }
  if (touched.has('incomePeriod') || touched.has('settings')) {
    jobs.push(useSettingsStore().hydrate())
  }
  await Promise.all(jobs)
}

// ---------------------------------------------------------------- push

interface DirtyRecord {
  localId: string
  entity: SyncEntity
  data: SyncRecord
  deleted: boolean
  modifiedAt: number
}

async function collectDirty (): Promise<DirtyRecord[]> {
  const mappings = new Map(
    (await db.syncItems.toArray()).map(m => [m.localId, m]),
  )
  const dirty: DirtyRecord[] = []

  for (const { entity, table } of TABLE_ENTITIES) {
    for (const record of await table.toArray()) {
      const mapping = mappings.get(record.id)
      if (!mapping || record.modifiedAt > mapping.lastSyncedModifiedAt) {
        dirty.push({
          localId: record.id,
          entity,
          data: record,
          deleted: record.deleted,
          modifiedAt: record.modifiedAt,
        })
      }
    }
  }

  const settings = await getMeta<AppSettings>('appSettings')
  if (settings) {
    const mapping = mappings.get('settings')
    if (!mapping || settings.modifiedAt > mapping.lastSyncedModifiedAt) {
      dirty.push({
        localId: 'settings',
        entity: 'settings',
        data: { id: 'settings', deleted: false, ...settings },
        deleted: false,
        modifiedAt: settings.modifiedAt,
      })
    }
  }
  return dirty
}

async function push (itemManager: Etebase.ItemManager): Promise<void> {
  const dirty = await collectDirty()
  if (dirty.length === 0) {
    return
  }

  const prepared: Array<{ item: Etebase.Item, record: DirtyRecord }> = []
  for (const record of dirty) {
    const content = JSON.stringify({ entity: record.entity, data: record.data })
    const mapping = await db.syncItems.get(record.localId)
    let item: Etebase.Item
    if (mapping?.cachedItem) {
      item = itemManager.cacheLoad(mapping.cachedItem)
      item.setMeta({ ...item.getMeta(), mtime: record.modifiedAt })
      await item.setContent(content)
    } else {
      item = await itemManager.create({ name: record.localId, mtime: record.modifiedAt }, content)
    }
    if (record.deleted && !item.isDeleted) {
      item.delete(true)
    }
    prepared.push({ item, record })
  }

  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE)
    await itemManager.batch(chunk.map(p => p.item))
    for (const { item, record } of chunk) {
      await db.syncItems.put({
        localId: record.localId,
        itemUid: item.uid,
        cachedItem: itemManager.cacheSave(item),
        lastSyncedModifiedAt: record.modifiedAt,
      })
    }
  }
}

// ------------------------------------------------------------- cleanup

// Hard-delete tombstones that were confirmed pushed more than 90 days ago.
// The syncItems mapping is kept so the record cannot be resurrected by an
// old remote revision.
async function purgeOldTombstones (): Promise<void> {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS
  for (const { table } of TABLE_ENTITIES) {
    const stale = (await table.toArray())
      .filter(r => r.deleted && r.modifiedAt < cutoff)
    for (const record of stale) {
      const mapping = await db.syncItems.get(record.id)
      if (mapping && mapping.lastSyncedModifiedAt >= record.modifiedAt) {
        await table.delete(record.id)
      }
    }
  }
}
