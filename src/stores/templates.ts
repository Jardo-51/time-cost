import type { Expense, ExpenseTemplate, SyncFields } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from '@/db'
import { useExpensesStore } from '@/stores/expenses'
import { useSyncStore } from '@/stores/sync'
import { todayISO } from '@/utils/date'

export type TemplateInput = Omit<ExpenseTemplate, keyof SyncFields | 'sortOrder'>

export const useTemplatesStore = defineStore('templates', () => {
  const templates = ref<ExpenseTemplate[]>([])

  const sorted = computed(() =>
    templates.value.toSorted((a: ExpenseTemplate, b: ExpenseTemplate) => a.sortOrder - b.sortOrder),
  )

  async function hydrate (): Promise<void> {
    // Records synced in from a pre-tags build have no tagIds field.
    templates.value = (await db.templates.toArray())
      .filter(t => !t.deleted)
      .map(t => ({ ...t, tagIds: t.tagIds ?? [] }))
  }

  async function add (input: TemplateInput): Promise<void> {
    const maxOrder = Math.max(0, ...templates.value.map(t => t.sortOrder))
    const template: ExpenseTemplate = {
      ...input,
      sortOrder: maxOrder + 1,
      id: crypto.randomUUID(),
      modifiedAt: Date.now(),
      deleted: false,
    }
    await db.templates.put(template)
    templates.value = [...templates.value, template]
    useSyncStore().scheduleSync()
  }

  async function update (id: string, patch: Partial<TemplateInput>): Promise<void> {
    const existing = templates.value.find(t => t.id === id)
    if (!existing) {
      return
    }
    const updated: ExpenseTemplate = { ...existing, ...patch, modifiedAt: Date.now() }
    await db.templates.put(updated)
    templates.value = templates.value.map(t => (t.id === id ? updated : t))
    useSyncStore().scheduleSync()
  }

  async function remove (id: string): Promise<void> {
    const existing = templates.value.find(t => t.id === id)
    if (!existing) {
      return
    }
    await db.templates.put({ ...existing, deleted: true, modifiedAt: Date.now() })
    templates.value = templates.value.filter(t => t.id !== id)
    useSyncStore().scheduleSync()
  }

  async function move (id: string, direction: -1 | 1): Promise<void> {
    const list = sorted.value
    const index = list.findIndex((t: ExpenseTemplate) => t.id === id)
    const other = list[index + direction]
    if (index === -1 || !other) {
      return
    }
    const current = list[index]!
    const now = Date.now()
    const a: ExpenseTemplate = { ...current, sortOrder: other.sortOrder, modifiedAt: now }
    const b: ExpenseTemplate = { ...other, sortOrder: current.sortOrder, modifiedAt: now }
    await db.templates.bulkPut([a, b])
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
    hydrate,
    add,
    update,
    remove,
    move,
    applyTemplate,
  }
})
