<template>
  <div class="d-flex ga-2">
    <v-text-field
      v-model="amount"
      :autofocus="autofocus"
      inputmode="decimal"
      label="Amount"
      min="0"
      step="0.01"
      type="number"
    />

    <v-select
      v-model="currency"
      item-title="code"
      item-value="code"
      :items="fx.currencies"
      label="Currency"
      style="max-width: 130px"
    >
      <template #item="{ props: itemProps, item }">
        <v-list-item v-bind="itemProps" :subtitle="item.name" />
      </template>
    </v-select>
  </div>
</template>

<script lang="ts" setup>
  import { useFxStore } from '@/stores/fx'

  defineProps<{
    autofocus?: boolean
  }>()

  const amount = defineModel<string>('amount', { required: true })
  const currency = defineModel<string>('currency', { required: true })

  const fx = useFxStore()
</script>
