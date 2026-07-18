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
    // Tie-break on id: two templates created concurrently on different devices
    // can sync in sharing a sortOrder, and a bare numeric sort would leave their
    // relative order undefined (and move() below unable to separate them).
    templates.value.toSorted((a: ExpenseTemplate, b: ExpenseTemplate) =>
      a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    ),
  )

  async function move (id: string, direction: -1 | 1): Promise<void> {
    const list = sorted.value
    const index = list.findIndex((t: ExpenseTemplate) => t.id === id)
    const target = index + direction
    if (index === -1 || target < 0 || target >= list.length) {
      return
    }
    // Reorder in the deterministic sorted order, then renumber to a contiguous
    // sequence starting at 1, matching add()'s numbering. Swapping the two
    // sortOrder values alone is a no-op when they are equal (a post-sync
    // collision), so renumber instead of swap. Numbering from 1 keeps an
    // already-contiguous (1..n) list at two updates per move rather than
    // rewriting every row, which would needlessly dirty the whole table and
    // widen the last-write-wins race to every template.
    const reordered = [...list]
    reordered.splice(target, 0, reordered.splice(index, 1)[0]!)
    const now = nextModifiedAt()
    const updates: ExpenseTemplate[] = []
    for (const [i, t] of reordered.entries()) {
      // t still carries its old sortOrder here; i + 1 is its new 1-based position.
      if (t.sortOrder !== i + 1) {
        updates.push({ ...t, sortOrder: i + 1, modifiedAt: now })
      }
    }
    if (updates.length === 0) {
      return
    }
    await db.templates.bulkPut(toPlain(updates))
    const updated = new Map(updates.map(t => [t.id, t]))
    templates.value = templates.value.map(t => updated.get(t.id) ?? t)
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
