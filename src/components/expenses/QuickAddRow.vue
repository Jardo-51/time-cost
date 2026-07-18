<template>
  <v-slide-group v-if="templates.sorted.length > 0" class="quick-add mb-1">
    <v-slide-group-item v-for="template in templates.sorted" :key="template.id">
      <v-chip
        class="me-2"
        :color="categories.byId(template.categoryId)?.color"
        :disabled="pending.has(template.id)"
        variant="tonal"
        @click="quickAdd(template)"
      >
        <v-icon :icon="categories.byId(template.categoryId)?.icon" size="16" start />
        {{ template.name }} · {{ formatMoney(template.amount, template.currency) }}
      </v-chip>
    </v-slide-group-item>

    <v-slide-group-item>
      <v-chip to="/settings/templates" variant="outlined">
        <v-icon icon="mdi-pencil" size="16" />
      </v-chip>
    </v-slide-group-item>
  </v-slide-group>
</template>

<script lang="ts" setup>
  import type { ExpenseTemplate } from '@/types'
  import { reactive } from 'vue'
  import { useWorktime } from '@/composables/useWorktime'
  import { useAppStore } from '@/stores/app'
  import { useCategoriesStore } from '@/stores/categories'
  import { useTemplatesStore } from '@/stores/templates'
  import { formatMoney } from '@/utils/money'

  const templates = useTemplatesStore()
  const categories = useCategoriesStore()
  const app = useAppStore()
  const { worktimeFor } = useWorktime()

  // In-flight guard so a double tap on a chip (common on mobile) doesn't
  // create two expenses from the same template.
  const pending = reactive(new Set<string>())

  async function quickAdd (template: ExpenseTemplate): Promise<void> {
    if (pending.has(template.id)) return
    pending.add(template.id)
    try {
      const expense = await templates.applyTemplate(template.id)
      if (!expense) return
      const worktime = worktimeFor(expense)
      app.showSnackbar(worktime === '—'
        ? `${template.name} added`
        : `${template.name} added — ${worktime} of work`)
    } finally {
      pending.delete(template.id)
    }
  }
</script>
