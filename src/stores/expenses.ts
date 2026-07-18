import type { Expense } from '@/types'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/db'
import { toPlain } from '@/db/plain'
import { useFxStore } from '@/stores/fx'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'
import { createSyncedTable } from '@/stores/syncedTable'
import { resolveBaseAmount } from '@/utils/base'
import { nextModifiedAt } from '@/utils/clock'

export interface ExpenseInput {
  amount: number
  currency: string
  description: string
  categoryId: string
  tagIds?: string[]
  date: string
}

function sortExpenses (list: Expense[]): Expense[] {
  return list.toSorted((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

export const useExpensesStore = defineStore('expenses', () => {
  const expenses = ref<Expense[]>([])

  function snapshotBase (amount: number, currency: string): Pick<Expense, 'baseAmount' | 'baseCurrency'> {
    return {
      baseAmount: useFxStore().toBase(amount, currency),
      baseCurrency: useSettingsStore().baseCurrency,
    }
  }

  const table = createSyncedTable<Expense, ExpenseInput>({
    table: db.expenses,
    list: expenses,
    build: input => ({
      ...input,
      ...snapshotBase(input.amount, input.currency),
      tagIds: input.tagIds ?? [],
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }),
    // Records synced in from a pre-tags build have no tagIds field.
    fromStored: e => ({ ...e, tagIds: e.tagIds ?? [] }),
    sort: sortExpenses,
  })

  async function update (id: string, patch: Partial<ExpenseInput>): Promise<void> {
    const existing = expenses.value.find(e => e.id === id)
    if (!existing) {
      return
    }
    const updated: Expense = { ...existing, ...patch, modifiedAt: nextModifiedAt() }
    // Amount/currency edits re-snapshot with today's rates — the frozen value
    // belongs to the entry as it was; a corrected entry is a new fact.
    if (patch.amount !== undefined || patch.currency !== undefined) {
      Object.assign(updated, snapshotBase(updated.amount, updated.currency))
    }
    await table.write(updated)
  }

  async function restore (expense: Expense): Promise<void> {
    await table.write({ ...expense, deleted: false, modifiedAt: nextModifiedAt() })
  }

  // Repairs every snapshot that is missing (entered while no rate was known)
  // or denominated in a currency that is no longer the base (after a base
  // change, or synced in from a device that hadn't seen the change yet).
  // Called after a successful FX refresh and after a base-currency change.
  async function resyncBaseSnapshots (): Promise<void> {
    const fx = useFxStore()
    const base = useSettingsStore().baseCurrency
    const now = nextModifiedAt()
    const repaired = new Map<string, Expense>()
    for (const expense of expenses.value) {
      if (expense.baseAmount != null && expense.baseCurrency === base) {
        continue
      }
      const baseAmount = resolveBaseAmount(expense, base, fx.convert)
      if (baseAmount == null) {
        continue
      }
      repaired.set(expense.id, { ...expense, baseAmount, baseCurrency: base, modifiedAt: now })
    }
    if (repaired.size === 0) {
      return
    }
    await db.expenses.bulkPut(toPlain([...repaired.values()]))
    expenses.value = expenses.value.map(e => repaired.get(e.id) ?? e)
    useSyncStore().scheduleSync()
  }

  return {
    expenses,
    hydrate: table.hydrate,
    add: table.add,
    update,
    remove: table.remove,
    restore,
    resyncBaseSnapshots,
  }
})
