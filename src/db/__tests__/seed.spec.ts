import type { AppSettings } from '@/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '@/constants/categories'
import { db, getMeta, setMeta } from '@/db'
import { seedDefaults } from '@/db/seed'

describe('seedDefaults', () => {
  beforeEach(async () => {
    await Promise.all([db.categories.clear(), db.meta.clear()])
  })

  // Pins the fix for finding #2: a seed stamped Date.now() would beat an older
  // user edit pulled in during the first sync and revert it on every device.
  it('stamps seeded categories at the epoch so any genuine edit wins LWW', async () => {
    await seedDefaults()

    const categories = await db.categories.toArray()
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length)
    for (const category of categories) {
      expect(category.modifiedAt).toBe(0)
      expect(category.deleted).toBe(false)
    }
  })

  it('stamps seeded appSettings at the epoch', async () => {
    await seedDefaults()

    const settings = await getMeta<AppSettings>('appSettings')
    expect(settings?.modifiedAt).toBe(0)
  })

  it('does not re-seed over existing data once the seeded flag is set', async () => {
    await seedDefaults()
    const renamedAt = Date.now()
    await db.categories.put({
      ...DEFAULT_CATEGORIES[0]!,
      name: 'Groceries',
      modifiedAt: renamedAt,
      deleted: false,
    })

    await seedDefaults()

    const category = await db.categories.get(DEFAULT_CATEGORIES[0]!.id)
    expect(category?.name).toBe('Groceries')
    expect(category?.modifiedAt).toBe(renamedAt)
  })

  it('leaves an already-seeded database untouched even if the flag predates the rows', async () => {
    await setMeta('seeded', true)
    await seedDefaults()
    expect(await db.categories.count()).toBe(0)
  })
})
