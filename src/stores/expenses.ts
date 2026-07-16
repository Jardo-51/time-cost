import type { Expense } from '@/types'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/db'
import { toPlain } from '@/db/plain'
import { useFxStore } from '@/stores/fx'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'

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
    const now = Date.now()
    const expense: Expense = {
      ...input,
      ...snapshotBase(input.amount, input.currency),
      tagIds: input.tagIds ?? [],
      id: crypto.randomUUID(),
      createdAt: now,
      modifiedAt: now,
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
    const updated: Expense = { ...existing, ...patch, modifiedAt: Date.now() }
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
    const tombstoned: Expense = { ...existing, deleted: true, modifiedAt: Date.now() }
    await db.expenses.put(toPlain(tombstoned))
    expenses.value = expenses.value.filter(e => e.id !== id)
    useSyncStore().scheduleSync()
    return tombstoned
  }

  async function restore (expense: Expense): Promise<void> {
    const revived: Expense = { ...expense, deleted: false, modifiedAt: Date.now() }
    await db.expenses.put(toPlain(revived))
    expenses.value = sortExpenses([...expenses.value, revived])
    useSyncStore().scheduleSync()
  }

  // Fills in base-currency snapshots for expenses entered while no rate was
  // available (e.g. offline first run). Called after a successful FX refresh.
  async function backfillBaseAmounts (): Promise<void> {
    const fx = useFxStore()
    const base = useSettingsStore().baseCurrency
    let changed = false
    for (const expense of expenses.value) {
      if (expense.baseAmount != null) {
        continue
      }
      const baseAmount = fx.toBase(expense.amount, expense.currency)
      if (baseAmount == null) {
        continue
      }
      const updated: Expense = { ...expense, baseAmount, baseCurrency: base, modifiedAt: Date.now() }
      await db.expenses.put(toPlain(updated))
      expenses.value = expenses.value.map(e => (e.id === expense.id ? updated : e))
      changed = true
    }
    if (changed) {
      useSyncStore().scheduleSync()
    }
  }

  // Re-snapshots every expense after a base-currency change: preferably from
  // the original amount with current rates, else by converting the old
  // snapshot with the provided cross-rate factor.
  async function rebaseSnapshots (factor: number | null): Promise<void> {
    const fx = useFxStore()
    const base = useSettingsStore().baseCurrency
    const now = Date.now()
    const rebased = expenses.value.map(expense => {
      let baseAmount = fx.toBase(expense.amount, expense.currency)
      if (baseAmount === null && expense.baseAmount !== null && factor !== null) {
        baseAmount = expense.baseAmount * factor
      }
      return { ...expense, baseAmount, baseCurrency: base, modifiedAt: now }
    })
    await db.expenses.bulkPut(toPlain(rebased))
    expenses.value = rebased
    useSyncStore().scheduleSync()
  }

  return {
    expenses,
    hydrate,
    add,
    update,
    remove,
    restore,
    backfillBaseAmounts,
    rebaseSnapshots,
  }
})
