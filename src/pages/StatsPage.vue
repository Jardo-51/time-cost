<template>
  <v-container class="pa-3">
    <h1 class="mb-4">Statistics</h1>

    <PeriodPicker v-model:anchor="anchor" v-model:kind="kind" />

    <v-empty-state
      v-if="filtered.length === 0"
      icon="mdi-chart-donut"
      text="No expenses in this period."
      title="Nothing here"
    />

    <template v-else>
      <TotalsCard
        :count="filtered.length"
        :incomplete="totals.incomplete"
        :total-base="totals.base"
        :total-seconds="totals.seconds"
      />

      <CategoryDoughnut :stats="categoryStats" :total-seconds="totals.seconds" />

      <TimeBarChart
        v-if="kind !== 'day'"
        :expenses="filtered"
        :kind="kind"
        :range="range"
      />

      <CategoryBreakdownList :stats="categoryStats" />
    </template>
  </v-container>
</template>

<script lang="ts" setup>
  import type { CategoryStat, PeriodKind } from '@/types'
  import { computed, ref } from 'vue'
  import CategoryBreakdownList from '@/components/stats/CategoryBreakdownList.vue'
  import CategoryDoughnut from '@/components/stats/CategoryDoughnut.vue'
  import PeriodPicker from '@/components/stats/PeriodPicker.vue'
  import TimeBarChart from '@/components/stats/TimeBarChart.vue'
  import TotalsCard from '@/components/stats/TotalsCard.vue'
  import { useWorktime } from '@/composables/useWorktime'
  import { useCategoriesStore } from '@/stores/categories'
  import { useExpensesStore } from '@/stores/expenses'
  import { periodRange } from '@/utils/date'

  const expenses = useExpensesStore()
  const categories = useCategoriesStore()
  const { baseAmountOf, workSecondsFor } = useWorktime()

  const kind = ref<PeriodKind>('month')
  const anchor = ref(new Date())

  const range = computed(() => periodRange(kind.value, anchor.value))

  const filtered = computed(() =>
    expenses.expenses.filter(e => e.date >= range.value.start && e.date <= range.value.end),
  )

  const totals = computed(() => {
    let base = 0
    let seconds = 0
    let anySeconds = false
    let incomplete = false
    for (const expense of filtered.value) {
      const b = baseAmountOf(expense)
      if (b === null) {
        incomplete = true
      } else {
        base += b
      }
      const s = workSecondsFor(expense)
      if (s === null) {
        incomplete = true
      } else {
        seconds += s
        anySeconds = true
      }
    }
    return { base, seconds: anySeconds ? seconds : null, incomplete }
  })

  const categoryStats = computed<CategoryStat[]>(() => {
    const byCategory = new Map<string, { base: number, seconds: number, anySeconds: boolean }>()
    for (const expense of filtered.value) {
      const entry = byCategory.get(expense.categoryId)
        ?? { base: 0, seconds: 0, anySeconds: false }
      const b = baseAmountOf(expense)
      if (b !== null) entry.base += b
      const s = workSecondsFor(expense)
      if (s !== null) {
        entry.seconds += s
        entry.anySeconds = true
      }
      byCategory.set(expense.categoryId, entry)
    }
    const total = totals.value.base
    const stats: CategoryStat[] = []
    for (const [categoryId, entry] of byCategory) {
      const category = categories.byId(categoryId)
      if (!category) continue
      stats.push({
        category,
        base: entry.base,
        seconds: entry.anySeconds ? entry.seconds : null,
        share: total > 0 ? entry.base / total : 0,
      })
    }
    return stats.toSorted((a, b) => b.base - a.base)
  })
</script>
