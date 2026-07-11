import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { useExpensesStore } from '@/stores/expenses'
import { useTagsStore } from '@/stores/tags'

async function addExpense (tagIds: string[]) {
  return useExpensesStore().add({
    amount: 10,
    currency: 'EUR',
    description: 'test',
    categoryId: 'default-other',
    tagIds,
    date: '2026-07-01',
  })
}

describe('tags store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await Promise.all([db.expenses.clear(), db.tags.clear(), db.syncItems.clear()])
  })

  it('ensureIds creates missing tags and reuses existing ones case-insensitively', async () => {
    const tags = useTagsStore()

    const first = await tags.ensureIds(['Trip', 'lunch'])
    expect(first).toHaveLength(2)
    expect(tags.tags).toHaveLength(2)

    const second = await tags.ensureIds([' trip ', 'TRIP', 'Lunch', 'new'])
    expect(second).toHaveLength(3)
    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])
    expect(tags.tags).toHaveLength(3)
  })

  it('ensureIds skips blank names', async () => {
    const tags = useTagsStore()
    expect(await tags.ensureIds(['', '  '])).toEqual([])
    expect(tags.tags).toHaveLength(0)
  })

  it('remove tombstones the tag and detaches it from expenses', async () => {
    const tags = useTagsStore()
    const expenses = useExpensesStore()

    const [tripId, lunchId] = await tags.ensureIds(['trip', 'lunch']) as [string, string]
    const tagged = await addExpense([tripId, lunchId])
    const untouched = await addExpense([lunchId])

    await tags.remove(tripId)

    expect(tags.tags.map(t => t.name)).toEqual(['lunch'])
    // Tombstone stays in the table so the deletion syncs.
    expect((await db.tags.get(tripId))?.deleted).toBe(true)

    const reloaded = expenses.expenses.find(e => e.id === tagged.id)
    expect(reloaded?.tagIds).toEqual([lunchId])
    expect(reloaded!.modifiedAt).toBeGreaterThanOrEqual(tagged.modifiedAt)
    expect(expenses.expenses.find(e => e.id === untouched.id)?.tagIds).toEqual([lunchId])
  })

  it('hydrate defaults tagIds for expenses stored without them', async () => {
    const expenses = useExpensesStore()
    const record = await addExpense([])
    // Simulate a record written by a pre-tags build arriving via sync.
    await db.expenses.update(record.id, { tagIds: undefined })

    await expenses.hydrate()
    expect(expenses.expenses.find(e => e.id === record.id)?.tagIds).toEqual([])
  })
})
