<template>
  <v-card class="mb-4">
    <v-card-title>Exchange rates</v-card-title>

    <v-card-text>
      <div class="d-flex align-center mb-2">
        <div>
          <template v-if="fx.rates">
            <div class="text-body-2">ECB rates from {{ fx.rates.date }}</div>

            <div
              v-if="fx.isStale"
              class="text-caption"
              :class="fx.isVeryStale ? 'text-warning' : 'text-medium-emphasis'"
            >
              <v-icon icon="mdi-clock-alert-outline" size="14" />
              fetched {{ relativeTime(fx.rates.fetchedAt) }}
            </div>
          </template>

          <div v-else class="text-body-2 text-medium-emphasis">
            No rates yet — they are fetched automatically when online.
          </div>
        </div>

        <v-spacer />

        <v-btn
          aria-label="Refresh rates"
          icon="mdi-refresh"
          :loading="fx.refreshing"
          size="small"
          variant="tonal"
          @click="refreshNow"
        />
      </div>

      <v-divider class="my-3" />

      <div class="d-flex align-center mb-1">
        <span class="text-subtitle-2">Custom currencies</span>
        <v-spacer />

        <v-btn
          prepend-icon="mdi-plus"
          size="small"
          variant="text"
          @click="openAdd"
        >
          Add
        </v-btn>
      </div>

      <div class="text-caption text-medium-emphasis mb-2">
        For currencies without automatic rates. Using a known code (e.g. USD)
        overrides its automatic rate.
      </div>

      <v-list v-if="fx.customRates.length > 0" density="compact">
        <v-list-item
          v-for="custom in fx.customRates"
          :key="custom.id"
          :subtitle="rateLabel(custom)"
          :title="custom.name ? `${custom.code} · ${custom.name}` : custom.code"
        >
          <template #append>
            <v-btn
              :aria-label="`Edit ${custom.code}`"
              icon="mdi-pencil"
              size="small"
              variant="text"
              @click="openEdit(custom)"
            />

            <v-btn
              :aria-label="`Delete ${custom.code}`"
              icon="mdi-delete"
              size="small"
              variant="text"
              @click="remove(custom)"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>

  <v-dialog v-model="dialogOpen" max-width="420">
    <v-card>
      <v-card-title>{{ editing ? 'Edit rate' : 'Add currency' }}</v-card-title>

      <v-card-text class="pb-0">
        <v-text-field
          v-model="code"
          :disabled="!!editing"
          hint="e.g. BTC, VND, points"
          label="Currency code"
          maxlength="8"
        />

        <v-text-field v-model="currencyName" label="Name (optional)" />

        <v-text-field
          v-model="rate"
          inputmode="decimal"
          :label="`1 ${code.trim().toUpperCase() || '…'} in ${settings.baseCurrency}`"
          min="0"
          type="number"
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="dialogOpen = false">Cancel</v-btn>
        <v-btn color="primary" :disabled="!isValid" variant="flat" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { CustomRate } from '@/types'
  import { computed, ref } from 'vue'
  import { useAppStore } from '@/stores/app'
  import { useFxStore } from '@/stores/fx'
  import { useSettingsStore } from '@/stores/settings'
  import { relativeTime } from '@/utils/date'
  import { formatMoney } from '@/utils/money'

  const fx = useFxStore()
  const settings = useSettingsStore()
  const app = useAppStore()

  const dialogOpen = ref(false)
  const editing = ref<CustomRate | null>(null)
  const code = ref('')
  const currencyName = ref('')
  const rate = ref('')

  const parsedRate = computed(() => {
    const n = Number.parseFloat(rate.value)
    return Number.isFinite(n) && n > 0 ? n : null
  })

  const isValid = computed(() =>
    /^[A-Z0-9]{2,8}$/i.test(code.value.trim()) && parsedRate.value !== null,
  )

  function rateLabel (custom: CustomRate): string {
    const inBase = fx.customRateToBase(custom)
    return inBase === null
      ? '—'
      : `1 ${custom.code} = ${formatMoney(inBase, settings.baseCurrency)}`
  }

  function openAdd (): void {
    editing.value = null
    code.value = ''
    currencyName.value = ''
    rate.value = ''
    dialogOpen.value = true
  }

  function openEdit (custom: CustomRate): void {
    editing.value = custom
    code.value = custom.code
    currencyName.value = custom.name
    const inBase = fx.customRateToBase(custom)
    rate.value = inBase === null ? '' : String(inBase)
    dialogOpen.value = true
  }

  async function save (): Promise<void> {
    if (!isValid.value || parsedRate.value === null) return
    const ok = await fx.upsertCustomRate(code.value, currencyName.value, parsedRate.value)
    if (ok) {
      dialogOpen.value = false
    } else {
      app.showSnackbar('Could not save — no rate for the base currency yet', 'error')
    }
  }

  async function remove (custom: CustomRate): Promise<void> {
    await fx.removeCustomRate(custom.id)
    app.showSnackbar(`${custom.code} removed`)
  }

  async function refreshNow (): Promise<void> {
    const ok = await fx.refresh(true)
    app.showSnackbar(ok ? 'Rates updated' : 'Could not fetch rates', ok ? 'success' : 'error')
  }
</script>
