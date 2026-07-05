import type { AppSettings } from '@/types'
import { DEFAULT_CATEGORIES } from '@/constants/categories'
import { db, getMeta, setMeta } from '@/db'

// First-run seeding. No income period is seeded — the UI prompts for it.
export async function seedDefaults (): Promise<void> {
  if (await getMeta<boolean>('seeded')) {
    return
  }
  const now = Date.now()
  await db.transaction('rw', db.categories, db.meta, async () => {
    if (await getMeta<boolean>('seeded')) {
      return
    }
    await db.categories.bulkPut(
      DEFAULT_CATEGORIES.map(cat => ({ ...cat, modifiedAt: now, deleted: false })),
    )
    const settings: AppSettings = { baseCurrency: 'EUR', modifiedAt: now }
    await setMeta('appSettings', settings)
    await setMeta('seeded', true)
  })
}
