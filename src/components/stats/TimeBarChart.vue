<template>
  <v-card class="mb-4">
    <v-card-text>
      <div style="height: 180px">
        <Bar :data="chartData" :options="chartOptions" />
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  import type { Expense, PeriodKind } from '@/types'
  import type { DateRange } from '@/utils/date'
  import type { ChartData, ChartOptions } from 'chart.js'
  import { computed } from 'vue'
  import { Bar } from 'vue-chartjs'
  import { useWorktime } from '@/composables/useWorktime'
  import { useChartTheme } from '@/plugins/chartjs'
  import { useSettingsStore } from '@/stores/settings'
  import { addDays, parseISODate, toISODate } from '@/utils/date'
  import { formatMoney } from '@/utils/money'

  const props = defineProps<{
    expenses: Expense[]
    kind: Exclude<PeriodKind, 'day'>
    range: DateRange
  }>()

  const settings = useSettingsStore()
  const chartTheme = useChartTheme()
  const { baseAmountOf } = useWorktime()

  interface Bucket {
    label: string
    total: number
  }

  const buckets = computed<Bucket[]>(() => {
    const result: Bucket[] = []
    const keyToIndex = new Map<string, number>()

    if (props.kind === 'year') {
      const year = parseISODate(props.range.start).getFullYear()
      for (let month = 0; month < 12; month++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`
        keyToIndex.set(key, result.length)
        result.push({
          label: new Date(year, month, 1).toLocaleDateString(undefined, { month: 'short' }),
          total: 0,
        })
      }
    } else {
      let cursor = parseISODate(props.range.start)
      const end = props.range.end
      while (toISODate(cursor) <= end) {
        const iso = toISODate(cursor)
        keyToIndex.set(iso, result.length)
        result.push({
          label: props.kind === 'week'
            ? cursor.toLocaleDateString(undefined, { weekday: 'short' })
            : String(cursor.getDate()),
          total: 0,
        })
        cursor = addDays(cursor, 1)
      }
    }

    for (const expense of props.expenses) {
      const key = props.kind === 'year' ? expense.date.slice(0, 7) : expense.date
      const index = keyToIndex.get(key)
      const base = baseAmountOf(expense)
      if (index !== undefined && base !== null) result[index]!.total += base
    }
    return result
  })

  const chartData = computed<ChartData<'bar'>>(() => ({
    labels: buckets.value.map(b => b.label),
    datasets: [
      {
        data: buckets.value.map(b => b.total),
        backgroundColor: chartTheme.value.primary,
        borderRadius: 3,
      },
    ],
  }))

  const chartOptions = computed<ChartOptions<'bar'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        ...chartTheme.value.tooltip,
        callbacks: {
          label: context => ` ${formatMoney(context.parsed.y ?? 0, settings.baseCurrency)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: chartTheme.value.mutedColor,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: props.kind === 'month' ? 10 : 12,
        },
        grid: { display: false },
      },
      y: {
        ticks: { color: chartTheme.value.mutedColor, maxTicksLimit: 5 },
        grid: { color: chartTheme.value.gridColor },
      },
    },
  }))
</script>
