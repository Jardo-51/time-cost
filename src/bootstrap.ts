import { seedDefaults } from '@/db/seed'
import { useCategoriesStore } from '@/stores/categories'
import { useExpensesStore } from '@/stores/expenses'
import { useFxStore } from '@/stores/fx'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'
import { useTemplatesStore } from '@/stores/templates'

// Runs after plugin registration and before mount: opens the database,
// seeds defaults, and hydrates every store so the first render is complete.
// Network work (FX refresh, sync) is fired without being awaited.
export async function bootstrap (): Promise<void> {
  await seedDefaults()

  const settings = useSettingsStore()
  const categories = useCategoriesStore()
  const expenses = useExpensesStore()
  const templates = useTemplatesStore()
  const fx = useFxStore()
  const sync = useSyncStore()

  await Promise.all([
    settings.hydrate(),
    categories.hydrate(),
    expenses.hydrate(),
    templates.hydrate(),
    fx.hydrate(),
    sync.hydrate(),
  ])

  const refreshRates = async () => {
    if (await fx.refresh()) {
      await expenses.backfillBaseAmounts()
    }
  }
  refreshRates()
  sync.syncNow()

  window.addEventListener('online', () => {
    refreshRates()
    sync.syncNow()
  })
}
