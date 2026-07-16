import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { useTemplatesStore } from '@/stores/templates'

async function addTemplate (name: string, tagIds: string[] = []) {
  return useTemplatesStore().add({
    name,
    amount: 10,
    currency: 'EUR',
    categoryId: 'default-other',
    tagIds,
  })
}

// ExpenseTemplate.tagIds is nested data, so the templates store hits the same
// reactive-proxy-into-Dexie failure the expenses store does.
describe('templates store persists hydrated records', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await Promise.all([db.templates.clear(), db.syncItems.clear()])
  })

  it('updates a hydrated template', async () => {
    const templates = useTemplatesStore()
    await addTemplate('coffee', ['trip'])
    await templates.hydrate()

    await templates.update(templates.templates[0]!.id, { name: 'espresso' })

    const [stored] = await db.templates.toArray()
    expect(stored?.name).toBe('espresso')
    expect(stored?.tagIds).toEqual(['trip'])
  })

  it('tombstones a hydrated template', async () => {
    const templates = useTemplatesStore()
    await addTemplate('coffee', ['trip'])
    await templates.hydrate()

    await templates.remove(templates.templates[0]!.id)

    const [stored] = await db.templates.toArray()
    expect(stored?.deleted).toBe(true)
    expect(templates.templates).toHaveLength(0)
  })

  it('reorders hydrated templates', async () => {
    const templates = useTemplatesStore()
    await addTemplate('coffee', ['trip'])
    await addTemplate('lunch', [])
    await templates.hydrate()

    await templates.move(templates.sorted[1]!.id, -1)

    expect(templates.sorted.map(t => t.name)).toEqual(['lunch', 'coffee'])
    const stored = await db.templates.orderBy('sortOrder').toArray()
    expect(stored.map(t => t.name)).toEqual(['lunch', 'coffee'])
  })
})
