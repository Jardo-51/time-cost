<template>
  <v-card class="mb-4">
    <v-card-title>Income</v-card-title>

    <v-card-text>
      <template v-if="settings.currentIncome">
        <div class="text-h6">
          {{ formatMoney(settings.currentIncome.amount, settings.baseCurrency) }}
          <span class="text-body-2 text-medium-emphasis">per {{ settings.currentIncome.unit }}</span>
        </div>

        <div class="text-caption text-medium-emphasis mb-2">
          ≈ {{ formatMoney(hourlyRate(settings.currentIncome), settings.baseCurrency) }}/hour
          · {{ settings.currentIncome.hoursPerDay }}h/day
          · {{ settings.currentIncome.daysPerWeek }}d/week
        </div>
      </template>

      <v-alert
        v-else
        class="mb-3"
        density="compact"
        type="info"
        variant="tonal"
      >
        Set your income to see expenses as worktime.
      </v-alert>

      <div class="d-flex ga-2 mb-2">
        <v-btn color="primary" variant="tonal" @click="openDialog()">
          {{ settings.currentIncome ? 'Change income' : 'Set income' }}
        </v-btn>
      </div>

      <v-select
        class="mt-3"
        density="compact"
        hide-details
        item-title="code"
        item-value="code"
        :items="fx.currencies"
        label="Base currency"
        :model-value="settings.baseCurrency"
        @update:model-value="changeBaseCurrency"
      >
        <template #item="{ props: itemProps, item }">
          <v-list-item v-bind="itemProps" :subtitle="item.name" />
        </template>
      </v-select>

      <v-expansion-panels v-if="settings.sortedPeriods.length > 1" class="mt-3" variant="accordion">
        <v-expansion-panel title="Income history">
          <v-expansion-panel-text>
            <v-list density="compact">
              <v-list-item
                v-for="period in settings.sortedPeriods"
                :key="period.id"
                :subtitle="`from ${period.effectiveFrom}`"
                :title="`${formatMoney(period.amount, settings.baseCurrency)} per ${period.unit}`"
              >
                <template #append>
                  <v-btn
                    icon="mdi-pencil"
                    size="small"
                    variant="text"
                    @click="openDialog(period)"
                  />

                  <v-btn
                    icon="mdi-delete"
                    size="small"
                    variant="text"
                    @click="removePeriod(period)"
                  />
                </template>
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>
  </v-card>

  <v-dialog v-model="dialogOpen" max-width="480">
    <v-card>
      <v-card-title>{{ editingPeriod ? 'Edit income' : 'Set income' }}</v-card-title>

      <v-card-text class="pb-0">
        <div class="d-flex ga-2">
          <v-text-field
            v-model="amount"
            autofocus
            inputmode="decimal"
            :label="`Amount (${settings.baseCurrency})`"
            min="0"
            type="number"
          />

          <v-select
            v-model="unit"
            :items="unitOptions"
            label="Per"
            style="max-width: 140px"
          />
        </div>

        <div class="d-flex ga-2">
          <v-text-field
            v-model="hoursPerDay"
            label="Work hours per day"
            max="24"
            min="1"
            type="number"
          />

          <v-text-field
            v-model="daysPerWeek"
            label="Workdays per week"
            max="7"
            min="1"
            type="number"
          />
        </div>

        <v-text-field
          v-model="effectiveFrom"
          hint="Earlier expenses keep their old worktime"
          label="Effective from"
          persistent-hint
          type="date"
        />

        <div v-if="previewHourly" class="text-caption text-medium-emphasis mt-2 mb-2">
          You earn ≈ {{ previewHourly }} per hour of work.
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="dialogOpen = false">Cancel</v-btn>
        <v-btn color="primary" :disabled="!isValid" variant="flat" @click="savePeriod">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { IncomePeriod, IncomeUnit } from '@/types'
  import { computed, ref } from 'vue'
  import { useAppStore } from '@/stores/app'
  import { useFxStore } from '@/stores/fx'
  import { useSettingsStore } from '@/stores/settings'
  import { todayISO } from '@/utils/date'
  import { formatMoney } from '@/utils/money'
  import { hourlyRate } from '@/utils/worktime'

  const settings = useSettingsStore()
  const fx = useFxStore()
  const app = useAppStore()

  const unitOptions: Array<{ title: string, value: IncomeUnit }> = [
    { title: 'hour', value: 'hour' },
    { title: 'day', value: 'day' },
    { title: 'week', value: 'week' },
    { title: 'month', value: 'month' },
  ]

  const dialogOpen = ref(false)
  const editingPeriod = ref<IncomePeriod | null>(null)
  const amount = ref('')
  const unit = ref<IncomeUnit>('month')
  const hoursPerDay = ref('8')
  const daysPerWeek = ref('5')
  const effectiveFrom = ref(todayISO())

  function openDialog (period?: IncomePeriod): void {
    editingPeriod.value = period ?? null
    const source = period ?? settings.currentIncome
    amount.value = period ? String(period.amount) : ''
    unit.value = source?.unit ?? 'month'
    hoursPerDay.value = String(source?.hoursPerDay ?? 8)
    daysPerWeek.value = String(source?.daysPerWeek ?? 5)
    effectiveFrom.value = period?.effectiveFrom ?? todayISO()
    dialogOpen.value = true
  }

  const parsed = computed(() => ({
    amount: Number.parseFloat(amount.value),
    hoursPerDay: Number.parseFloat(hoursPerDay.value),
    daysPerWeek: Number.parseFloat(daysPerWeek.value),
  }))

  const isValid = computed(() => {
    const p = parsed.value
    return p.amount > 0
      && p.hoursPerDay >= 1 && p.hoursPerDay <= 24
      && p.daysPerWeek >= 1 && p.daysPerWeek <= 7
      && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom.value)
  })

  const previewHourly = computed(() => {
    if (!isValid.value) return ''
    const p = parsed.value
    const rate = hourlyRate({
      id: '',
      modifiedAt: 0,
      deleted: false,
      effectiveFrom: effectiveFrom.value,
      amount: p.amount,
      unit: unit.value,
      hoursPerDay: p.hoursPerDay,
      daysPerWeek: p.daysPerWeek,
    })
    return formatMoney(rate, settings.baseCurrency)
  })

  async function savePeriod (): Promise<void> {
    if (!isValid.value) return
    const p = parsed.value
    const input = {
      effectiveFrom: effectiveFrom.value,
      amount: p.amount,
      unit: unit.value,
      hoursPerDay: p.hoursPerDay,
      daysPerWeek: p.daysPerWeek,
    }
    // Two saves for the same start date collapse into one period.
    const sameDay = settings.incomePeriods.find(x => x.effectiveFrom === input.effectiveFrom)
    const target = editingPeriod.value ?? sameDay
    await (target
      ? settings.updateIncomePeriod(target.id, input)
      : settings.addIncomePeriod(input))
    dialogOpen.value = false
  }

  async function removePeriod (period: IncomePeriod): Promise<void> {
    await settings.removeIncomePeriod(period.id)
    app.showSnackbar('Income period removed')
  }

  async function changeBaseCurrency (code: string): Promise<void> {
    if (code === settings.baseCurrency) return
    const oldBase = settings.baseCurrency
    const switched = await settings.saveBaseCurrency(code)
    // Either side of the pair can be the one without a rate, and a custom
    // currency's rate only ever arrives by hand — so name the pair rather than
    // blame the new code or promise that connecting will fix it.
    app.showSnackbar(switched
                       ? `Base currency is now ${code} — amounts converted`
                       : `Can't switch to ${code} yet — no exchange rate between ${oldBase} and ${code} is known`,
                     switched ? 'success' : 'warning')
  }
</script>
