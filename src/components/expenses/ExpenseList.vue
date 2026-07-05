<template>
  <v-list class="bg-transparent" lines="two">
    <template v-for="group in groups" :key="group.date">
      <div class="d-flex align-center justify-space-between px-4 pt-3 pb-1">
        <span class="text-caption text-medium-emphasis text-uppercase">
          {{ dateGroupLabel(group.date) }}
        </span>

        <span v-if="group.subtotal" class="text-caption text-primary font-weight-medium">
          {{ group.subtotal }}
        </span>
      </div>

      <v-card class="mx-1" variant="flat">
        <ExpenseListItem
          v-for="expense in group.items"
          :key="expense.id"
          :expense="expense"
          @edit="emit('edit', $event)"
        />
      </v-card>
    </template>
  </v-list>
</template>

<script lang="ts" setup>
  import type { Expense } from '@/types'
  import { computed } from 'vue'
  import ExpenseListItem from '@/components/expenses/ExpenseListItem.vue'
  import { useWorktime } from '@/composables/useWorktime'
  import { useSettingsStore } from '@/stores/settings'
  import { dateGroupLabel } from '@/utils/date'
  import { formatWorktime, incomePeriodFor } from '@/utils/worktime'

  const props = defineProps<{ expenses: Expense[] }>()

  const emit = defineEmits<{ edit: [expense: Expense] }>()

  const settings = useSettingsStore()
  const { workSecondsFor } = useWorktime()

  interface DayGroup {
    date: string
    items: Expense[]
    subtotal: string
  }

  // Input is already sorted date desc, createdAt desc.
  const groups = computed<DayGroup[]>(() => {
    const result: DayGroup[] = []
    for (const expense of props.expenses) {
      let group = result.at(-1)
      if (!group || group.date !== expense.date) {
        group = { date: expense.date, items: [], subtotal: '' }
        result.push(group)
      }
      group.items.push(expense)
    }
    for (const group of result) {
      const period = incomePeriodFor(group.date, settings.incomePeriods)
      if (!period) continue
      let sum = 0
      let complete = true
      for (const expense of group.items) {
        const seconds = workSecondsFor(expense)
        if (seconds === null) {
          complete = false
          continue
        }
        sum += seconds
      }
      if (sum > 0) group.subtotal = (complete ? '' : '≥ ') + formatWorktime(sum, period)
    }
    return result
  })
</script>
