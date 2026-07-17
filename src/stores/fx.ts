import type { CurrencyInfo } from '@/constants/currencies'
import type { CustomRate, FxRates } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ECB_CURRENCIES } from '@/constants/currencies'
import { db, getMeta, setMeta } from '@/db'
import { toPlain } from '@/db/plain'
import { fetchEurRates } from '@/services/fx'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'

const REFRESH_AFTER_MS = 12 * 3600 * 1000
const STALE_AFTER_MS = 24 * 3600 * 1000
const VERY_STALE_AFTER_MS = 7 * 24 * 3600 * 1000

export const useFxStore = defineStore('fx', () => {
  const rates = ref<FxRates | null>(null)
  const customRates = ref<CustomRate[]>([])
  const refreshing = ref(false)

  // EUR-based table with user-defined rates merged in. A custom rate for an
  // ECB currency wins — it doubles as a manual override.
  const effectiveEurRates = computed<Record<string, number>>(() => {
    const table: Record<string, number> = { ...rates.value?.rates, EUR: 1 }
    for (const custom of customRates.value) {
      if (custom.rateToEur > 0) {
        table[custom.code] = 1 / custom.rateToEur
      }
    }
    return table
  })

  const currencies = computed<CurrencyInfo[]>(() => {
    const customs = customRates.value
      .filter(c => !ECB_CURRENCIES.some(e => e.code === c.code))
      .map(c => ({ code: c.code, name: c.name || c.code, symbol: c.code }))
    return [...ECB_CURRENCIES, ...customs].toSorted((a, b) => a.code.localeCompare(b.code))
  })

  const isStale = computed(() =>
    !!rates.value && Date.now() - rates.value.fetchedAt > STALE_AFTER_MS,
  )
  const isVeryStale = computed(() =>
    !!rates.value && Date.now() - rates.value.fetchedAt > VERY_STALE_AFTER_MS,
  )

  function convert (amount: number, from: string, to: string): number | null {
    if (from === to) {
      return amount
    }
    const table = effectiveEurRates.value
    const fromRate = table[from]
    const toRate = table[to]
    if (!fromRate || !toRate) {
      return null
    }
    return (amount / fromRate) * toRate
  }

  function toBase (amount: number, currency: string): number | null {
    return convert(amount, currency, useSettingsStore().baseCurrency)
  }

  async function hydrate (): Promise<void> {
    rates.value = (await getMeta<FxRates>('fx')) ?? null
    customRates.value = (await db.customRates.toArray()).filter(r => !r.deleted)
  }

  async function refresh (force = false): Promise<boolean> {
    if (!navigator.onLine || refreshing.value) {
      return false
    }
    if (!force && rates.value && Date.now() - rates.value.fetchedAt < REFRESH_AFTER_MS) {
      return false
    }
    refreshing.value = true
    try {
      const fresh = await fetchEurRates()
      rates.value = fresh
      await setMeta('fx', fresh)
      return true
    } catch {
      // Keep last-known rates; staleness UI surfaces the age.
      return false
    } finally {
      refreshing.value = false
    }
  }

  // The user enters "1 {code} = rateToBase {baseCurrency}"; stored EUR-relative
  // to keep one canonical table. Returns false if the base itself has no rate
  // yet (offline first run with a non-EUR base).
  async function upsertCustomRate (code: string, name: string, rateToBase: number): Promise<boolean> {
    const normalized = code.trim().toUpperCase()
    const baseRate = effectiveEurRates.value[useSettingsStore().baseCurrency]
    if (!normalized || rateToBase <= 0 || !baseRate) {
      return false
    }
    const record: CustomRate = {
      id: `fx-${normalized}`,
      code: normalized,
      name: name.trim(),
      rateToEur: rateToBase / baseRate,
      modifiedAt: Date.now(),
      deleted: false,
    }
    await db.customRates.put(toPlain(record))
    customRates.value = [...customRates.value.filter(c => c.id !== record.id), record]
    useSyncStore().scheduleSync()
    return true
  }

  async function removeCustomRate (id: string): Promise<void> {
    const existing = customRates.value.find(c => c.id === id)
    if (!existing) {
      return
    }
    await db.customRates.put(toPlain({ ...existing, deleted: true, modifiedAt: Date.now() }))
    customRates.value = customRates.value.filter(c => c.id !== id)
    useSyncStore().scheduleSync()
  }

  // For display: the stored EUR-relative custom rate expressed in the base.
  function customRateToBase (custom: CustomRate): number | null {
    const baseRate = effectiveEurRates.value[useSettingsStore().baseCurrency]
    return baseRate ? custom.rateToEur * baseRate : null
  }

  return {
    rates,
    customRates,
    refreshing,
    effectiveEurRates,
    currencies,
    isStale,
    isVeryStale,
    convert,
    toBase,
    hydrate,
    refresh,
    upsertCustomRate,
    removeCustomRate,
    customRateToBase,
  }
})
