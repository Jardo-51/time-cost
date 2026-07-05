<template>
  <v-card class="mb-4">
    <v-list lines="two">
      <v-list-item
        v-for="stat in stats"
        :key="stat.category.id"
        :title="stat.category.name"
      >
        <template #prepend>
          <v-avatar :color="stat.category.color" size="36">
            <v-icon color="white" :icon="stat.category.icon" size="20" />
          </v-avatar>
        </template>

        <template #subtitle>
          <v-progress-linear
            class="mt-1"
            :color="stat.category.color"
            height="4"
            :model-value="stat.share * 100"
            rounded
          />
        </template>

        <template #append>
          <div class="text-right">
            <div class="text-primary font-weight-medium">
              {{ formatTotalWorktime(stat.seconds) }}
            </div>

            <div class="text-caption text-medium-emphasis">
              {{ formatMoney(stat.base, settings.baseCurrency) }}
            </div>
          </div>
        </template>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<script lang="ts" setup>
  import type { CategoryStat } from '@/types'
  import { useWorktime } from '@/composables/useWorktime'
  import { useSettingsStore } from '@/stores/settings'
  import { formatMoney } from '@/utils/money'

  defineProps<{ stats: CategoryStat[] }>()

  const settings = useSettingsStore()
  const { formatTotalWorktime } = useWorktime()
</script>
