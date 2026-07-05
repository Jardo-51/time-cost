<template>
  <div class="mb-3">
    <v-btn-toggle
      class="d-flex mb-2"
      color="primary"
      density="comfortable"
      divided
      mandatory
      :model-value="kind"
      variant="outlined"
      @update:model-value="onKindChange"
    >
      <v-btn class="flex-grow-1" size="small" value="day">Day</v-btn>
      <v-btn class="flex-grow-1" size="small" value="week">Week</v-btn>
      <v-btn class="flex-grow-1" size="small" value="month">Month</v-btn>
      <v-btn class="flex-grow-1" size="small" value="year">Year</v-btn>
    </v-btn-toggle>

    <div class="d-flex align-center justify-space-between">
      <v-btn
        icon="mdi-chevron-left"
        size="small"
        variant="text"
        @click="shift(-1)"
      />

      <span class="text-subtitle-1">{{ label }}</span>

      <v-btn
        icon="mdi-chevron-right"
        size="small"
        variant="text"
        @click="shift(1)"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { PeriodKind } from '@/types'
  import { computed } from 'vue'
  import { periodLabel, shiftAnchor } from '@/utils/date'

  const kind = defineModel<PeriodKind>('kind', { required: true })
  const anchor = defineModel<Date>('anchor', { required: true })

  const label = computed(() => periodLabel(kind.value, anchor.value))

  function onKindChange (value: unknown): void {
    if (value) kind.value = value as PeriodKind
  }

  function shift (delta: number): void {
    anchor.value = shiftAnchor(kind.value, anchor.value, delta)
  }
</script>
