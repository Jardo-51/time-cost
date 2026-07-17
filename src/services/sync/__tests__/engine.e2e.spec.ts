// End-to-end test of the sync engine against a real Etebase server.
// Requires a local server (see README):
//   docker run -d -p 3735:3735 -e ALLOWED_HOSTS=localhost,127.0.0.1 victorrds/etesync:alpine
// The suite self-skips when no server is reachable, so `pnpm test` stays
// green without Docker. fake-indexeddb is installed via vitest setupFiles.
import * as Etebase from 'etebase'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { seedDefaults } from '@/db/seed'
import { syncOnce } from '@/services/sync/engine'
import * as account from '@/services/sync/etebase'
import { useCategoriesStore } from '@/stores/categories'
import { useExpensesStore } from '@/stores/expenses'

const SERVER = process.env.ETEBASE_URL ?? 'http://localhost:3735'

async function serverAvailable (): Promise<boolean> {
  try {
    await Etebase.ready
    return await Etebase.Account.isEtebaseServer(SERVER)
  } catch {
    return false
  }
}

const available = await serverAvailable()

// etebase's `Account.logout()` starts its HTTP request but never awaits it
// (Etebase.js:135), so `await account.logout()` resolves while the POST is
// still on the wire, holding a promise no caller can catch. When vitest tears
// the happy-dom environment down it aborts that request, and the resulting
// rejection reaches nobody — killing the worker after the suite has already
// reported green.
//
// happy-dom registers every async XHR with its async task manager, and
// `waitUntilComplete()` drains that queue, so teardown can wait for the stray
// logout to land first. This is load-bearing on `environment: 'happy-dom'`
// (vitest.config.ts): etebase picks its transport at import time based on
// `global.XMLHttpRequest` (Request.js:48), so under `environment: 'node'` it
// would take the node-fetch path instead. That swap is not silent — the
// `happyDOM` handle below would be undefined and this suite would fail loudly.
const { happyDOM } = globalThis as typeof globalThis & {
  happyDOM: { waitUntilComplete: () => Promise<void> }
}

// Wipes all local state to simulate a brand-new device on the same account.
async function freshDevice (username: string, password: string): Promise<void> {
  await account.logout()
  await db.delete()
  await db.open()
  setActivePinia(createPinia())
  await seedDefaults()
  await account.login(SERVER, username, password)
}

describe.skipIf(!available)('etebase sync engine (e2e against local server)', () => {
  // Open signup is disabled on etebase-server by default; the Etebase signup
  // handshake still works for a pre-created Django user (the container's
  // SUPER_USER), and it is a no-op error on repeat runs.
  const username = process.env.ETEBASE_TEST_USER ?? 'admin'
  const password = process.env.ETEBASE_TEST_PASSWORD ?? 'test-password-123'

  beforeAll(async () => {
    await Etebase.ready
    try {
      const signup = await Etebase.Account.signup(
        { username, email: `${username}@example.com` },
        password,
        SERVER,
      )
      await signup.logout()
    } catch {
      // Already signed up on a previous run.
    }
    setActivePinia(createPinia())
    await seedDefaults()
    await account.login(SERVER, username, password)
  }, 60_000)

  afterAll(async () => {
    try {
      await account.logout()
    } catch {
      // Server may already be gone; local cleanup happened regardless.
    }
    // The SDK's logout POST is still unawaited in flight at this point; let it
    // land before vitest tears the environment down and aborts it.
    await happyDOM.waitUntilComplete()
  })

  it('round-trips records between devices', async () => {
    const expenses = useExpensesStore()
    await expenses.hydrate()
    const created = await expenses.add({
      amount: 40,
      currency: 'EUR',
      description: 'Test coffee',
      categoryId: 'default-food',
      date: '2026-07-05',
    })
    await syncOnce()

    await freshDevice(username, password)
    await syncOnce()

    const pulled = await db.expenses.get(created.id)
    expect(pulled).toBeDefined()
    expect(pulled!.description).toBe('Test coffee')
    expect(pulled!.deleted).toBe(false)
    expect(pulled!.amount).toBe(40)

    // Deterministically-seeded categories merge instead of duplicating.
    const categories = (await db.categories.toArray()).filter(c => !c.deleted)
    expect(categories).toHaveLength(7)
  }, 120_000)

  it('does not resurrect deleted records on a fresh device', async () => {
    const expenses = useExpensesStore()
    await expenses.hydrate()
    const target = expenses.expenses.find(e => e.description === 'Test coffee')
    expect(target).toBeDefined()
    await expenses.remove(target!.id)
    await syncOnce()

    await freshDevice(username, password)
    await syncOnce()

    // A fresh device either never materializes the record or holds a tombstone.
    const gone = await db.expenses.get(target!.id)
    expect(gone === undefined || gone.deleted).toBe(true)
    const store = useExpensesStore()
    await store.hydrate()
    expect(store.expenses.some(e => e.id === target!.id)).toBe(false)
  }, 120_000)

  it('tombstones a local record when a remote deletion arrives', async () => {
    const expenses = useExpensesStore()
    await expenses.hydrate()
    const created = await expenses.add({
      amount: 5,
      currency: 'EUR',
      description: 'Doomed',
      categoryId: 'default-other',
      date: '2026-07-02',
    })
    await syncOnce()

    // Simulate another device deleting the item directly through the SDK.
    const collection = await account.getCollection()
    const itemManager = account.getItemManager(collection)
    const mapping = await db.syncItems.get(created.id)
    expect(mapping?.cachedItem).toBeTruthy()
    const item = itemManager.cacheLoad(mapping!.cachedItem!)
    item.delete(true)
    await itemManager.batch([item])

    await syncOnce()
    const local = await db.expenses.get(created.id)
    expect(local?.deleted).toBe(true)
  }, 120_000)

  // Regression test for finding #2: a fresh device seeds the defaults locally
  // before its first sync. If those seeds carried Date.now(), they would beat
  // the older remote rename under LWW and revert it everywhere.
  it('does not let a fresh device\'s seeds clobber a synced rename of a default category', async () => {
    const categories = useCategoriesStore()
    await categories.hydrate()
    await categories.update('default-food', { name: 'Groceries' })
    await syncOnce()

    await freshDevice(username, password)
    await syncOnce()

    const pulled = await db.categories.get('default-food')
    expect(pulled?.name).toBe('Groceries')

    // And the rename must survive being pushed back from the fresh device.
    await syncOnce()
    await freshDevice(username, password)
    await syncOnce()
    expect((await db.categories.get('default-food'))?.name).toBe('Groceries')
  }, 120_000)

  it('pushes edits of previously pulled items (revision update path)', async () => {
    const expenses = useExpensesStore()
    await expenses.hydrate()
    const created = await expenses.add({
      amount: 10,
      currency: 'EUR',
      description: 'LWW v1',
      categoryId: 'default-other',
      date: '2026-07-01',
    })
    await syncOnce()

    await freshDevice(username, password)
    await syncOnce()
    const deviceB = useExpensesStore()
    await deviceB.hydrate()
    await deviceB.update(created.id, { description: 'LWW v2' })
    await syncOnce()

    await freshDevice(username, password)
    await syncOnce()
    const final = await db.expenses.get(created.id)
    expect(final?.description).toBe('LWW v2')
  }, 120_000)
})
