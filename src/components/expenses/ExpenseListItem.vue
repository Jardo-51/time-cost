<template>
  <v-list-item @click="emit('edit', expense)">
    <template #prepend>
      <v-avatar :color="category?.color ?? 'grey'" size="40">
        <v-icon color="white" :icon="category?.icon ?? 'mdi-help'" size="22" />
      </v-avatar>
    </template>

    <v-list-item-title>{{ expense.description || category?.name || 'Expense' }}</v-list-item-title>
    <v-list-item-subtitle>{{ moneyFor(expense) }}</v-list-item-subtitle>

    <template #append>
      <div class="text-right">
        <div class="text-primary font-weight-medium">{{ worktimeFor(expense) }}</div>
        <div v-if="convertedHint" class="text-caption text-medium-emphasis">{{ convertedHint }}</div>
      </div>
    </template>
  </v-list-item>
</template>

<script lang="ts" setup>
  import type { Expense } from '@/types'
  import { computed } from 'vue'
  import { useWorktime } from '@/composables/useWorktime'
  import { useCategoriesStore } from '@/stores/categories'
  import { useSettingsStore } from '@/stores/settings'
  import { formatMoney } from '@/utils/money'

  const props = defineProps<{ expense: Expense }>()

  const emit = defineEmits<{ edit: [expense: Expense] }>()

  const categories = useCategoriesStore()
  const settings = useSettingsStore()
  const { worktimeFor, moneyFor, baseAmountOf } = useWorktime()

  const category = computed(() => categories.byId(props.expense.categoryId))

  const convertedHint = computed(() => {
    if (props.expense.currency === settings.baseCurrency) return ''
    const base = baseAmountOf(props.expense)
    return base === null ? '' : `≈ ${formatMoney(base, settings.baseCurrency)}`
  })
</script>
