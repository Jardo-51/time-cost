import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { isReactive } from 'vue'
import { db } from '@/db'
import { useExpensesStore } from '@/stores/expenses'
import { useFxStore } from '@/stores/fx'
import { useSettingsStore } from '@/stores/settings'

async function addExpense (tagIds: string[] = [], currency = 'EUR') {
  return useExpensesStore().add({
    amount: 10,
    currency,
    description: 'test',
    categoryId: 'default-other',
    tagIds,
    date: '2026-07-01',
  })
}

// Records read back out of the store's ref are deeply reactive, so tagIds
// survives a spread as a Proxy. Structured clone rejects it, which broke
// every write path once the store had been hydrated (i.e. on every page load).
describe('expenses store persists hydrated records', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await Promise.all([db.expenses.clear(), db.syncItems.clear()])
  })

  it('hands Dexie plain data, not the reactive proxy it reads', async () => {
    const expenses = useExpensesStore()
    const created = await addExpense(['trip'])
    await expenses.hydrate()

    expect(isReactive(expenses.expenses.find(e => e.id === created.id))).toBe(true)

    await expenses.update(created.id, { description: 'edited' })

    // The real guard is that update() above didn't reject with DataCloneError;
    // `stored` is plain by construction, having been structured-cloned by Dexie.
    const stored = await db.expenses.get(created.id)
    expect(stored?.description).toBe('edited')
    expect(stored?.tagIds).toEqual(['trip'])
  })

  // An empty array is proxied just like a populated one, so an untagged
  // expense fails identically — the tag content is irrelevant.
  it.each([
    ['tagged', ['trip']],
    ['untagged', []],
  ])('tombstones a %s expense after hydrate', async (_label, tagIds) => {
    const expenses = useExpensesStore()
    const created = await addExpense(tagIds)
    await expenses.hydrate()

    await expenses.remove(created.id)

    const stored = await db.expenses.get(created.id)
    expect(stored?.deleted).toBe(true)
    expect(expenses.expenses).toHaveLength(0)
  })

  it('restores a tombstoned expense read back from the store', async () => {
    const expenses = useExpensesStore()
    const created = await addExpense(['trip'])
    await expenses.hydrate()

    const tombstoned = await expenses.remove(created.id)
    await expenses.restore(tombstoned!)

    const stored = await db.expenses.get(created.id)
    expect(stored?.deleted).toBe(false)
    expect(stored?.tagIds).toEqual(['trip'])
  })

  it('repairs snapshots of hydrated expenses once a rate arrives', async () => {
    const expenses = useExpensesStore()
    const fx = useFxStore()
    // Entered offline: no USD rate was known, so no snapshot could be taken.
    await addExpense(['trip'], 'USD')
    await expenses.hydrate()
    fx.rates = { date: '2026-07-01', fetchedAt: Date.now(), rates: { USD: 1.25 } }

    await expenses.resyncBaseSnapshots()

    // As above: resyncBaseSnapshots() not rejecting is the assertion that matters.
    const [stored] = await db.expenses.toArray()
    expect(stored?.baseAmount).toBe(8)
    expect(stored?.baseCurrency).toBe('EUR')
    expect(stored?.tagIds).toEqual(['trip'])
  })

  // A snapshot left in a superseded base must be re-taken, not trusted: the
  // number is right but the currency label is not.
  it('repairs snapshots denominated in an old base currency', async () => {
    const expenses = useExpensesStore()
    const fx = useFxStore()
    fx.rates = { date: '2026-07-01', fetchedAt: Date.now(), rates: { USD: 1.25 } }
    const created = await addExpense([], 'USD')
    await expenses.hydrate()
    // As if synced in from a device that had not seen the base change to USD.
    useSettingsStore().baseCurrency = 'USD'

    await expenses.resyncBaseSnapshots()

    const stored = await db.expenses.get(created.id)
    expect(stored?.baseAmount).toBe(10)
    expect(stored?.baseCurrency).toBe('USD')
  })
})
