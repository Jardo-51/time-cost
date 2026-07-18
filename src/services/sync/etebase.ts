import * as Etebase from 'etebase'
import { db, deleteMeta, getMeta, setMeta } from '@/db'

// This module (and the engine) is only ever loaded via dynamic import so the
// etebase bundle stays out of the main chunk.

const COLLECTION_TYPE = 'com.timecost.app'
const SESSION_KEY = 'etebase.session'
const COLLECTION_KEY = 'etebase.collection'
const STOKEN_KEY = 'etebase.stoken'

interface StoredSession {
  session: string
  key: string // base64-encoded 32-byte encryption key for the saved session
}

let account: Etebase.Account | null = null
let collection: Etebase.Collection | null = null

export async function isEtebaseServer (serverUrl: string): Promise<boolean> {
  await Etebase.ready
  return Etebase.Account.isEtebaseServer(serverUrl)
}

export async function login (serverUrl: string, username: string, password: string): Promise<void> {
  await Etebase.ready
  account = await Etebase.Account.login(username, password, serverUrl)
  collection = null
  await persistSession()
}

// The saved session is encrypted with a random key; both parts live in
// IndexedDB. This is obfuscation-at-rest, not protection from an attacker
// with full local access — same trust model as staying logged in anywhere.
async function persistSession (): Promise<void> {
  if (!account) {
    return
  }
  const key = Etebase.randomBytes(32)
  const session = await account.save(key)
  const stored: StoredSession = { session, key: Etebase.toBase64(key) }
  await setMeta(SESSION_KEY, stored)
}

export async function restoreSession (): Promise<boolean> {
  if (account) {
    return true
  }
  const stored = await getMeta<StoredSession>(SESSION_KEY)
  if (!stored) {
    return false
  }
  await Etebase.ready
  try {
    account = await Etebase.Account.restore(stored.session, Etebase.fromBase64(stored.key))
    return true
  } catch {
    return false
  }
}

// Re-authenticates after an expired token, keeping the stored session fresh.
export async function refreshToken (): Promise<void> {
  if (!account) {
    return
  }
  await account.fetchToken()
  await persistSession()
}

// Clears credentials and sync bookkeeping but keeps all user data local.
export async function logout (): Promise<void> {
  try {
    await account?.logout()
  } catch {
    // Offline logout is fine — the server token just expires eventually.
  }
  account = null
  collection = null
  await deleteMeta(SESSION_KEY)
  await deleteMeta(COLLECTION_KEY)
  await deleteMeta(STOKEN_KEY)
  await db.syncItems.clear()
}

export async function getCollection (): Promise<Etebase.Collection> {
  if (!account) {
    throw new Error('Not logged in')
  }
  if (collection) {
    return collection
  }
  const manager = account.getCollectionManager()

  const cached = await getMeta<Uint8Array>(COLLECTION_KEY)
  if (cached) {
    let cachedCollection: Etebase.Collection | undefined
    try {
      cachedCollection = manager.cacheLoad(cached)
    } catch {
      // Corrupt cached blob — the cached uid is unreadable, so the surviving
      // `syncItems` mappings and stoken can no longer be tied to a collection.
      // Drop them before re-discovering: a full re-sync is the safe recovery
      // when the bookkeeping's owner is unknown, and it avoids pushing items
      // cached under the old collection through a different collection's item
      // manager (which would wedge sync). A list failure inside reconcile is
      // swallowed there, so offline starts keep the cached collection instead.
      await db.syncItems.clear()
      await deleteMeta(STOKEN_KEY)
    }
    if (cachedCollection) {
      collection = await reconcileCachedCollection(manager, cachedCollection)
      await setMeta(COLLECTION_KEY, manager.cacheSave(collection))
      return collection
    }
  }

  collection = await discoverOrCreateCollection(manager)
  await setMeta(COLLECTION_KEY, manager.cacheSave(collection))
  return collection
}

// The winner is the lowest-`uid` non-deleted collection, but the cache is
// written during a possibly-concurrent first sync and can end up pointing at a
// collection that later loses the tie to another device's. Caching it and
// never re-listing leaves a residual split-brain: device A, whose re-list ran
// before device B's upload committed, caches its own collection and — without
// this reconcile — trusts it forever. Re-list once per app start (this only
// runs while the module-level `collection` is null on a fresh load) and
// converge on the global winner. If this device had cached a loser, drop its
// sync bookkeeping so every local record re-syncs against the winner on the
// same run (mappings and stoken belong to the losing collection). A list
// failure (offline) keeps the cached collection; sync needs the network anyway
// and the next successful start reconciles.
// Exported for unit testing (see __tests__/reconcile.spec.ts); not part of the
// module's public surface.
export async function reconcileCachedCollection (
  manager: Etebase.CollectionManager,
  cached: Etebase.Collection,
): Promise<Etebase.Collection> {
  let winner: Etebase.Collection | undefined
  try {
    winner = (await listCollections(manager))[0]
  } catch {
    return cached
  }
  if (!winner || winner.uid === cached.uid) {
    return cached
  }
  await db.syncItems.clear()
  await deleteMeta(STOKEN_KEY)
  return winner
}

// Two devices running their first sync concurrently (or a retry after a
// partial failure) can each create a `com.timecost.app` collection, silently
// splitting the account's data in two. There is no server-side uniqueness
// guarantee, so we make the choice deterministic instead: whenever more than
// one non-deleted collection exists, every device converges on the same one
// (lowest `uid`). A freshly created collection is empty until the first push,
// so a device that loses this race strands no data — its records are pushed
// into the winning collection on the same sync run.
async function discoverOrCreateCollection (
  manager: Etebase.CollectionManager,
): Promise<Etebase.Collection> {
  const existing = await listCollections(manager)
  if (existing.length > 0) {
    return existing[0]!
  }
  const created = await manager.create(
    COLLECTION_TYPE,
    { name: 'Time Cost', mtime: Date.now() },
    '',
  )
  await manager.upload(created)
  // Re-list to catch a collection another device created concurrently and
  // converge on the deterministic winner rather than trusting our own.
  const afterCreate = await listCollections(manager)
  const winner = afterCreate[0] ?? created
  if (winner.uid !== created.uid) {
    // We lost the race. The collection we just created is empty (nothing has
    // been pushed yet) and can never be the winner for any device, so delete
    // it on the server to keep orphan collections from accumulating.
    try {
      created.delete()
      await manager.upload(created)
    } catch {
      // Best-effort cleanup — a leftover empty collection is harmless clutter
      // and will simply never be chosen.
    }
  }
  return winner
}

async function listCollections (manager: Etebase.CollectionManager): Promise<Etebase.Collection[]> {
  const { data } = await manager.list(COLLECTION_TYPE)
  return data
    .filter(c => !c.isDeleted)
    // Compare by code unit, not `localeCompare`: the convergence rests on every
    // device independently picking the *same* lowest uid, but ICU collations
    // disagree between locales (a Danish `aa…` sorts after `z…`, case-first
    // tie-breaking differs), so `localeCompare` could hand two differently
    // configured devices different winners and silently re-split the account.
    .toSorted((a, b) => (a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0)))
}

export function getItemManager (col: Etebase.Collection): Etebase.ItemManager {
  if (!account) {
    throw new Error('Not logged in')
  }
  return account.getCollectionManager().getItemManager(col)
}
