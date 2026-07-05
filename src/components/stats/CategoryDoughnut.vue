<template>
  <v-card class="mb-4">
    <v-card-text>
      <div class="doughnut-wrap">
        <Doughnut :data="chartData" :options="chartOptions" />

        <div class="doughnut-center">
          <div class="text-h6 text-primary font-weight-medium">{{ centerText }}</div>
          <div class="text-caption text-medium-emphasis">of work</div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  import type { CategoryStat } from '@/types'
  import type { ChartData, ChartOptions } from 'chart.js'
  import { computed } from 'vue'
  import { Doughnut } from 'vue-chartjs'
  import { useWorktime } from '@/composables/useWorktime'
  import { useChartTheme } from '@/plugins/chartjs'
  import { useSettingsStore } from '@/stores/settings'
  import { formatMoney } from '@/utils/money'

  const props = defineProps<{
    stats: CategoryStat[]
    totalSeconds: number | null
  }>()

  const settings = useSettingsStore()
  const chartTheme = useChartTheme()
  const { formatTotalWorktime } = useWorktime()

  const centerText = computed(() => formatTotalWorktime(props.totalSeconds))

  const chartData = computed<ChartData<'doughnut'>>(() => ({
    labels: props.stats.map(s => s.category.name),
    datasets: [
      {
        data: props.stats.map(s => s.base),
        backgroundColor: props.stats.map(s => s.category.color),
        borderWidth: 0,
      },
    ],
  }))

  const chartOptions = computed<ChartOptions<'doughnut'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      tooltip: {
        ...chartTheme.value.tooltip,
        callbacks: {
          label: context => {
            const stat = props.stats[context.dataIndex]
            const money = formatMoney(context.parsed, settings.baseCurrency)
            const time = stat ? formatTotalWorktime(stat.seconds) : '—'
            return ` ${money} · ${time}`
          },
        },
      },
    },
  }))
</script>

<style scoped>
  .doughnut-wrap {
    position: relative;
    height: 220px;
  }

  .doughnut-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
</style>
