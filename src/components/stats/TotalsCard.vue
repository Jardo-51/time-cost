<template>
  <v-card class="mb-4">
    <v-card-text class="text-center">
      <div class="text-h4 text-primary font-weight-medium">
        {{ worktime }}
      </div>

      <div class="text-body-1 mt-1">
        {{ money }}
        <span v-if="incomplete" class="text-caption text-medium-emphasis">(partly unconverted)</span>
      </div>

      <div class="text-caption text-medium-emphasis mt-1">
        {{ count }} {{ count === 1 ? 'expense' : 'expenses' }}
        <template v-if="fx.isStale && fx.rates">
          · <v-icon icon="mdi-clock-alert-outline" size="12" /> rates from {{ fx.rates.date }}
        </template>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useWorktime } from '@/composables/useWorktime'
  import { useFxStore } from '@/stores/fx'
  import { useSettingsStore } from '@/stores/settings'
  import { formatMoney } from '@/utils/money'

  const props = defineProps<{
    totalBase: number
    totalSeconds: number | null
    count: number
    incomplete: boolean
  }>()

  const settings = useSettingsStore()
  const fx = useFxStore()
  const { formatTotalWorktime } = useWorktime()

  const worktime = computed(() => formatTotalWorktime(props.totalSeconds))
  const money = computed(() => formatMoney(props.totalBase, settings.baseCurrency))
</script>
