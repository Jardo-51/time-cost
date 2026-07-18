import type { Category, SyncFields } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { OTHER_CATEGORY_ID } from '@/constants/categories'
import { db } from '@/db'
import { toPlain } from '@/db/plain'
import { useExpensesStore } from '@/stores/expenses'
import { useSyncStore } from '@/stores/sync'
import { createSyncedTable } from '@/stores/syncedTable'
import { useTemplatesStore } from '@/stores/templates'
import { nextModifiedAt } from '@/utils/clock'

export type CategoryInput = Omit<Category, keyof SyncFields | 'isProtected'>

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref<Category[]>([])

  const table = createSyncedTable<Category, CategoryInput>({
    table: db.categories,
    list: categories,
    build: input => ({ ...input, id: crypto.randomUUID() }),
  })

  const sorted = computed(() =>
    categories.value.toSorted((a, b) => {
      // "Other" always last
      if (a.id === OTHER_CATEGORY_ID) {
        return 1
      }
      if (b.id === OTHER_CATEGORY_ID) {
        return -1
      }
      return a.name.localeCompare(b.name)
    }),
  )

  function byId (id: string): Category | undefined {
    return categories.value.find(c => c.id === id)
  }

  // Tombstones the category and moves its expenses and templates to "Other"
  // in a single transaction.
  async function remove (id: string): Promise<void> {
    const existing = categories.value.find(c => c.id === id)
    if (!existing || existing.isProtected) {
      return
    }
    const now = nextModifiedAt()
    await db.transaction('rw', [db.categories, db.expenses, db.templates], async () => {
      await db.expenses
        .where('categoryId')
        .equals(id)
        .modify({ categoryId: OTHER_CATEGORY_ID, modifiedAt: now })
      await db.templates
        .where('categoryId')
        .equals(id)
        .modify({ categoryId: OTHER_CATEGORY_ID, modifiedAt: now })
      await db.categories.put(toPlain({ ...existing, deleted: true, modifiedAt: now }))
    })
    categories.value = categories.value.filter(c => c.id !== id)
    await Promise.all([useExpensesStore().hydrate(), useTemplatesStore().hydrate()])
    useSyncStore().scheduleSync()
  }

  return {
    categories,
    sorted,
    byId,
    hydrate: table.hydrate,
    add: table.add,
    update: table.update,
    remove,
  }
})
