import type { AppSettings, IncomePeriod, SyncFields } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db, getMeta, setMeta } from '@/db'
import { toPlain } from '@/db/plain'
import { useSyncStore } from '@/stores/sync'
import { createSyncedTable } from '@/stores/syncedTable'
import { nextModifiedAt, observeModifiedAt } from '@/utils/clock'
import { todayISO } from '@/utils/date'
import { incomePeriodFor } from '@/utils/worktime'

export type IncomePeriodInput = Omit<IncomePeriod, keyof SyncFields>

export const useSettingsStore = defineStore('settings', () => {
  const baseCurrency = ref('EUR')
  const settingsModifiedAt = ref(0)
  const incomePeriods = ref<IncomePeriod[]>([])

  const periodsTable = createSyncedTable<IncomePeriod, IncomePeriodInput>({
    table: db.incomePeriods,
    list: incomePeriods,
    build: input => ({ ...input, id: crypto.randomUUID() }),
  })

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
      // appSettings is synced by modifiedAt too but lives in meta, not a
      // syncedTable, so seed the clock with it directly (see syncedTable.hydrate).
      observeModifiedAt(settings.modifiedAt)
    }
    await periodsTable.hydrate()
  }

  // Changing the base currency converts income amounts and expense snapshots
  // with the current cross rate. Without a rate the switch is refused
  // (returns false) rather than silently reinterpreting stored amounts:
  // income periods carry no currency of their own, so their numbers would
  // keep their old-base values under the new label with nothing able to
  // reconcile them later. Refusal is unnecessary when there is no such data
  // yet — the offline first run can still pick any base. Dynamic imports
  // avoid a module cycle with the fx/expenses stores.
  async function saveBaseCurrency (code: string): Promise<boolean> {
    const oldBase = baseCurrency.value
    if (code === oldBase) {
      return true
    }
    const { useFxStore } = await import('@/stores/fx')
    const { useExpensesStore } = await import('@/stores/expenses')
    const fx = useFxStore()
    const expenses = useExpensesStore()
    const factor = fx.convert(1, oldBase, code)

    if (factor === null && (incomePeriods.value.length > 0 || expenses.expenses.length > 0)) {
      return false
    }

    const now = nextModifiedAt()
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

      await expenses.resyncBaseSnapshots()
    }
    useSyncStore().scheduleSync()
    return true
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
    addIncomePeriod: periodsTable.add,
    updateIncomePeriod: periodsTable.update,
    removeIncomePeriod: periodsTable.remove,
  }
})
