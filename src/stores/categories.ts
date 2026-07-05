import type { Category, SyncFields } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { OTHER_CATEGORY_ID } from '@/constants/categories'
import { db } from '@/db'
import { useExpensesStore } from '@/stores/expenses'
import { useSyncStore } from '@/stores/sync'
import { useTemplatesStore } from '@/stores/templates'

export type CategoryInput = Omit<Category, keyof SyncFields | 'isProtected'>

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref<Category[]>([])

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

  async function hydrate (): Promise<void> {
    categories.value = (await db.categories.toArray()).filter(c => !c.deleted)
  }

  async function add (input: CategoryInput): Promise<void> {
    const category: Category = {
      ...input,
      id: crypto.randomUUID(),
      modifiedAt: Date.now(),
      deleted: false,
    }
    await db.categories.put(category)
    categories.value = [...categories.value, category]
    useSyncStore().scheduleSync()
  }

  async function update (id: string, patch: Partial<CategoryInput>): Promise<void> {
    const existing = categories.value.find(c => c.id === id)
    if (!existing) {
      return
    }
    const updated: Category = { ...existing, ...patch, modifiedAt: Date.now() }
    await db.categories.put(updated)
    categories.value = categories.value.map(c => (c.id === id ? updated : c))
    useSyncStore().scheduleSync()
  }

  // Tombstones the category and moves its expenses and templates to "Other"
  // in a single transaction.
  async function remove (id: string): Promise<void> {
    const existing = categories.value.find(c => c.id === id)
    if (!existing || existing.isProtected) {
      return
    }
    const now = Date.now()
    await db.transaction('rw', [db.categories, db.expenses, db.templates], async () => {
      await db.expenses
        .where('categoryId')
        .equals(id)
        .modify({ categoryId: OTHER_CATEGORY_ID, modifiedAt: now })
      await db.templates
        .filter(t => t.categoryId === id)
        .modify({ categoryId: OTHER_CATEGORY_ID, modifiedAt: now })
      await db.categories.put({ ...existing, deleted: true, modifiedAt: now })
    })
    categories.value = categories.value.filter(c => c.id !== id)
    await Promise.all([useExpensesStore().hydrate(), useTemplatesStore().hydrate()])
    useSyncStore().scheduleSync()
  }

  return {
    categories,
    sorted,
    byId,
    hydrate,
    add,
    update,
    remove,
  }
})
