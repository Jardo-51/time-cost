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
    try {
      collection = manager.cacheLoad(cached)
      return collection
    } catch {
      // Fall through to discovery.
    }
  }

  const { data } = await manager.list(COLLECTION_TYPE)
  collection = data.find(c => !c.isDeleted) ?? null
  if (!collection) {
    collection = await manager.create(
      COLLECTION_TYPE,
      { name: 'Time Cost', mtime: Date.now() },
      '',
    )
    await manager.upload(collection)
  }
  await setMeta(COLLECTION_KEY, manager.cacheSave(collection))
  return collection
}

export function getItemManager (col: Etebase.Collection): Etebase.ItemManager {
  if (!account) {
    throw new Error('Not logged in')
  }
  return account.getCollectionManager().getItemManager(col)
}
