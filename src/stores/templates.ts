import type { Expense, ExpenseTemplate, SyncFields } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from '@/db'
import { toPlain } from '@/db/plain'
import { useExpensesStore } from '@/stores/expenses'
import { useSyncStore } from '@/stores/sync'
import { createSyncedTable } from '@/stores/syncedTable'
import { nextModifiedAt } from '@/utils/clock'
import { todayISO } from '@/utils/date'

export type TemplateInput = Omit<ExpenseTemplate, keyof SyncFields | 'sortOrder'>

export const useTemplatesStore = defineStore('templates', () => {
  const templates = ref<ExpenseTemplate[]>([])

  const table = createSyncedTable<ExpenseTemplate, TemplateInput>({
    table: db.templates,
    list: templates,
    // New templates sort after the current maximum.
    build: input => ({
      ...input,
      sortOrder: Math.max(0, ...templates.value.map(t => t.sortOrder)) + 1,
      id: crypto.randomUUID(),
    }),
    // Records synced in from a pre-tags build have no tagIds field.
    fromStored: t => ({ ...t, tagIds: t.tagIds ?? [] }),
  })

  const sorted = computed(() =>
    templates.value.toSorted((a: ExpenseTemplate, b: ExpenseTemplate) => a.sortOrder - b.sortOrder),
  )

  async function move (id: string, direction: -1 | 1): Promise<void> {
    const list = sorted.value
    const index = list.findIndex((t: ExpenseTemplate) => t.id === id)
    const other = list[index + direction]
    if (index === -1 || !other) {
      return
    }
    const current = list[index]!
    const now = nextModifiedAt()
    const a: ExpenseTemplate = { ...current, sortOrder: other.sortOrder, modifiedAt: now }
    const b: ExpenseTemplate = { ...other, sortOrder: current.sortOrder, modifiedAt: now }
    await db.templates.bulkPut(toPlain([a, b]))
    templates.value = templates.value.map(t => (t.id === a.id ? a : (t.id === b.id ? b : t)))
    useSyncStore().scheduleSync()
  }

  // Quick-add: one tap creates today's expense from the template.
  async function applyTemplate (id: string): Promise<Expense | null> {
    const template = templates.value.find(t => t.id === id)
    if (!template) {
      return null
    }
    return useExpensesStore().add({
      amount: template.amount,
      currency: template.currency,
      description: template.name,
      categoryId: template.categoryId,
      tagIds: [...template.tagIds],
      date: todayISO(),
    })
  }

  return {
    templates,
    sorted,
    hydrate: table.hydrate,
    add: table.add,
    update: table.update,
    remove: table.remove,
    move,
    applyTemplate,
  }
})
