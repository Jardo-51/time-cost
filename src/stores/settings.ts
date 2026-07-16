import type { AppSettings, IncomePeriod, SyncFields } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db, getMeta, setMeta } from '@/db'
import { toPlain } from '@/db/plain'
import { useSyncStore } from '@/stores/sync'
import { todayISO } from '@/utils/date'
import { incomePeriodFor } from '@/utils/worktime'

export type IncomePeriodInput = Omit<IncomePeriod, keyof SyncFields>

export const useSettingsStore = defineStore('settings', () => {
  const baseCurrency = ref('EUR')
  const settingsModifiedAt = ref(0)
  const incomePeriods = ref<IncomePeriod[]>([])

  const sortedPeriods = computed(() =>
    incomePeriods.value.toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
  )
  const currentIncome = computed(() => incomePeriodFor(todayISO(), incomePeriods.value))
  const isIncomeConfigured = computed(() => incomePeriods.value.length > 0)

  async function hydrate (): Promise<void> {
    const settings = await getMeta<AppSettings>('appSettings')
    if (settings) {
      baseCurrency.value = settings.baseCurrency
      settingsModifiedAt.value = settings.modifiedAt
    }
    incomePeriods.value = (await db.incomePeriods.toArray()).filter(p => !p.deleted)
  }

  // Changing the base currency converts income amounts and expense
  // snapshots with the current cross rate (returns false when no rate is
  // known and amounts were left untouched). Dynamic imports avoid a module
  // cycle with the fx/expenses stores.
  async function saveBaseCurrency (code: string): Promise<boolean> {
    const oldBase = baseCurrency.value
    if (code === oldBase) {
      return true
    }
    const { useFxStore } = await import('@/stores/fx')
    const fx = useFxStore()
    const table = fx.effectiveEurRates
    const from = table[oldBase]
    const to = table[code]
    const factor = from && to ? to / from : null

    const now = Date.now()
    baseCurrency.value = code
    settingsModifiedAt.value = now
    const settings: AppSettings = { baseCurrency: code, modifiedAt: now }
    await setMeta('appSettings', settings)

    if (factor !== null) {
      const converted = incomePeriods.value.map(p => ({
        ...p,
        amount: p.amount * factor,
        modifiedAt: now,
      }))
      await db.incomePeriods.bulkPut(toPlain(converted))
      incomePeriods.value = converted

      const { useExpensesStore } = await import('@/stores/expenses')
      await useExpensesStore().rebaseSnapshots(factor)
    }
    useSyncStore().scheduleSync()
    return factor !== null
  }

  async function addIncomePeriod (input: IncomePeriodInput): Promise<void> {
    const period: IncomePeriod = {
      ...input,
      id: crypto.randomUUID(),
      modifiedAt: Date.now(),
      deleted: false,
    }
    await db.incomePeriods.put(toPlain(period))
    incomePeriods.value = [...incomePeriods.value, period]
    useSyncStore().scheduleSync()
  }

  async function updateIncomePeriod (id: string, patch: Partial<IncomePeriodInput>): Promise<void> {
    const existing = incomePeriods.value.find(p => p.id === id)
    if (!existing) {
      return
    }
    const updated: IncomePeriod = { ...existing, ...patch, modifiedAt: Date.now() }
    await db.incomePeriods.put(toPlain(updated))
    incomePeriods.value = incomePeriods.value.map(p => (p.id === id ? updated : p))
    useSyncStore().scheduleSync()
  }

  async function removeIncomePeriod (id: string): Promise<void> {
    const existing = incomePeriods.value.find(p => p.id === id)
    if (!existing) {
      return
    }
    await db.incomePeriods.put(toPlain({ ...existing, deleted: true, modifiedAt: Date.now() }))
    incomePeriods.value = incomePeriods.value.filter(p => p.id !== id)
    useSyncStore().scheduleSync()
  }

  return {
    baseCurrency,
    settingsModifiedAt,
    incomePeriods,
    sortedPeriods,
    currentIncome,
    isIncomeConfigured,
    hydrate,
    saveBaseCurrency,
    addIncomePeriod,
    updateIncomePeriod,
    removeIncomePeriod,
  }
})
