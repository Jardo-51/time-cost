import type { Expense } from '@/types'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/db'
import { toPlain } from '@/db/plain'
import { useFxStore } from '@/stores/fx'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'
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

  async function hydrate (): Promise<void> {
    // Records synced in from a pre-tags build have no tagIds field.
    expenses.value = sortExpenses(
      (await db.expenses.toArray())
        .filter(e => !e.deleted)
        .map(e => ({ ...e, tagIds: e.tagIds ?? [] })),
    )
  }

  function snapshotBase (amount: number, currency: string): Pick<Expense, 'baseAmount' | 'baseCurrency'> {
    return {
      baseAmount: useFxStore().toBase(amount, currency),
      baseCurrency: useSettingsStore().baseCurrency,
    }
  }

  async function add (input: ExpenseInput): Promise<Expense> {
    const expense: Expense = {
      ...input,
      ...snapshotBase(input.amount, input.currency),
      tagIds: input.tagIds ?? [],
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      modifiedAt: nextModifiedAt(),
      deleted: false,
    }
    await db.expenses.put(toPlain(expense))
    expenses.value = sortExpenses([...expenses.value, expense])
    useSyncStore().scheduleSync()
    return expense
  }

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
    await db.expenses.put(toPlain(updated))
    expenses.value = sortExpenses(expenses.value.map(e => (e.id === id ? updated : e)))
    useSyncStore().scheduleSync()
  }

  async function remove (id: string): Promise<Expense | null> {
    const existing = expenses.value.find(e => e.id === id)
    if (!existing) {
      return null
    }
    const tombstoned: Expense = { ...existing, deleted: true, modifiedAt: nextModifiedAt() }
    await db.expenses.put(toPlain(tombstoned))
    expenses.value = expenses.value.filter(e => e.id !== id)
    useSyncStore().scheduleSync()
    return tombstoned
  }

  async function restore (expense: Expense): Promise<void> {
    const revived: Expense = { ...expense, deleted: false, modifiedAt: nextModifiedAt() }
    await db.expenses.put(toPlain(revived))
    expenses.value = sortExpenses([...expenses.value, revived])
    useSyncStore().scheduleSync()
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
    hydrate,
    add,
    update,
    remove,
    restore,
    resyncBaseSnapshots,
  }
})
