import type { AppSettings } from '@/types'
import { DEFAULT_CATEGORIES } from '@/constants/categories'
import { db, getMeta, setMeta } from '@/db'

// First-run seeding. No income period is seeded — the UI prompts for it.
//
// Seeded defaults are stamped with modifiedAt = 0 (the epoch) rather than
// Date.now() so that any genuine user edit — including one made earlier on
// another device and pulled in during the first sync — always wins last-write-
// wins conflict resolution. Two truly-fresh devices still merge cleanly because
// their seeds are identical. Using Date.now() here would let a fresh device
// overwrite synced edits to the defaults (see 2026-07-07 code review, #2).
const SEED_MODIFIED_AT = 0

export async function seedDefaults (): Promise<void> {
  if (await getMeta<boolean>('seeded')) {
    return
  }
  await db.transaction('rw', db.categories, db.meta, async () => {
    if (await getMeta<boolean>('seeded')) {
      return
    }
    await db.categories.bulkPut(
      DEFAULT_CATEGORIES.map(cat => ({ ...cat, modifiedAt: SEED_MODIFIED_AT, deleted: false })),
    )
    const settings: AppSettings = { baseCurrency: 'EUR', modifiedAt: SEED_MODIFIED_AT }
    await setMeta('appSettings', settings)
    await setMeta('seeded', true)
  })
}
