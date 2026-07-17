import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { useExpensesStore } from '@/stores/expenses'
import { useFxStore } from '@/stores/fx'
import { useSettingsStore } from '@/stores/settings'

async function addIncomePeriod () {
  return useSettingsStore().addIncomePeriod({
    amount: 2000,
    unit: 'month',
    hoursPerDay: 8,
    daysPerWeek: 5,
    effectiveFrom: '2026-01-01',
  })
}

async function addExpense (currency = 'EUR') {
  return useExpensesStore().add({
    amount: 10,
    currency,
    description: 'test',
    categoryId: 'default-other',
    tagIds: [],
    date: '2026-07-01',
  })
}

describe('settings store base currency', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await Promise.all([
      db.expenses.clear(),
      db.incomePeriods.clear(),
      db.meta.clear(),
      db.syncItems.clear(),
    ])
  })

  // Income amounts carry no currency of their own, so a switch made without a
  // rate would leave them at their old-base value under the new label with
  // nothing able to reconcile them once rates arrive. Refusing is the only
  // lossless option.
  it.each([
    ['income periods', addIncomePeriod],
    ['expenses', addExpense],
  ])('refuses the switch with no rate known and existing %s', async (_label, seed) => {
    const settings = useSettingsStore()
    await seed()

    expect(await settings.saveBaseCurrency('USD')).toBe(false)
    expect(settings.baseCurrency).toBe('EUR')
  })

  it('leaves stored amounts untouched when it refuses', async () => {
    const settings = useSettingsStore()
    await addIncomePeriod()

    await settings.saveBaseCurrency('USD')

    expect(settings.incomePeriods[0]?.amount).toBe(2000)
    const [stored] = await db.incomePeriods.toArray()
    expect(stored?.amount).toBe(2000)
  })

  // Nothing to reinterpret yet, so the offline first run can still pick a base.
  it('allows the switch with no rate known on an empty profile', async () => {
    const settings = useSettingsStore()

    expect(await settings.saveBaseCurrency('USD')).toBe(true)
    expect(settings.baseCurrency).toBe('USD')
  })

  it('converts income and expense snapshots when a rate is known', async () => {
    const settings = useSettingsStore()
    const fx = useFxStore()
    fx.rates = { date: '2026-07-01', fetchedAt: Date.now(), rates: { USD: 1.25 } }
    await addIncomePeriod()
    const expense = await addExpense()

    expect(await settings.saveBaseCurrency('USD')).toBe(true)

    expect(settings.baseCurrency).toBe('USD')
    expect(settings.incomePeriods[0]?.amount).toBe(2500)
    const stored = await db.expenses.get(expense.id)
    expect(stored?.baseAmount).toBe(12.5)
    expect(stored?.baseCurrency).toBe('USD')
  })
})
