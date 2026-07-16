import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { isReactive } from 'vue'
import { db } from '@/db'
import { useExpensesStore } from '@/stores/expenses'

async function addExpense (tagIds: string[] = []) {
  return useExpensesStore().add({
    amount: 10,
    currency: 'EUR',
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

    const stored = await db.expenses.get(created.id)
    expect(stored?.description).toBe('edited')
    expect(stored?.tagIds).toEqual(['trip'])
    expect(isReactive(stored?.tagIds)).toBe(false)
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

  it('rebases snapshots of hydrated expenses', async () => {
    const expenses = useExpensesStore()
    await addExpense(['trip'])
    await expenses.hydrate()

    await expenses.rebaseSnapshots(2)

    const [stored] = await db.expenses.toArray()
    expect(stored?.baseCurrency).toBe('EUR')
    expect(isReactive(stored?.tagIds)).toBe(false)
  })
})
