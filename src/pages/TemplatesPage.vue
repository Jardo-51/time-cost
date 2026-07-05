<template>
  <v-container class="pa-3">
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" @click="router.back()" />
      <h1 class="ms-2">Quick-add</h1>
      <v-spacer />
      <v-btn color="primary" icon="mdi-plus" variant="tonal" @click="openAdd" />
    </div>

    <v-empty-state
      v-if="templates.sorted.length === 0"
      icon="mdi-flash"
      text="Templates for recurring expenses — coffee, a transport ticket, rent — appear as one-tap chips on the expenses screen."
      title="No templates yet"
    >
      <template #actions>
        <v-btn color="primary" variant="flat" @click="openAdd">Add template</v-btn>
      </template>
    </v-empty-state>

    <v-card v-else>
      <v-list lines="one">
        <v-list-item
          v-for="(template, index) in templates.sorted"
          :key="template.id"
          :subtitle="formatMoney(template.amount, template.currency)"
          :title="template.name"
        >
          <template #prepend>
            <v-avatar :color="categories.byId(template.categoryId)?.color" size="36">
              <v-icon
                color="white"
                :icon="categories.byId(template.categoryId)?.icon"
                size="20"
              />
            </v-avatar>
          </template>

          <template #append>
            <v-btn
              :disabled="index === 0"
              icon="mdi-chevron-up"
              size="small"
              variant="text"
              @click="templates.move(template.id, -1)"
            />

            <v-btn
              :disabled="index === templates.sorted.length - 1"
              icon="mdi-chevron-down"
              size="small"
              variant="text"
              @click="templates.move(template.id, 1)"
            />

            <v-btn
              icon="mdi-pencil"
              size="small"
              variant="text"
              @click="openEdit(template)"
            />

            <v-btn
              icon="mdi-delete"
              size="small"
              variant="text"
              @click="remove(template)"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <TemplateFormDialog v-model="dialogOpen" :template="editing" />
  </v-container>
</template>

<script lang="ts" setup>
  import type { ExpenseTemplate } from '@/types'
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import TemplateFormDialog from '@/components/templates/TemplateFormDialog.vue'
  import { useAppStore } from '@/stores/app'
  import { useCategoriesStore } from '@/stores/categories'
  import { useTemplatesStore } from '@/stores/templates'
  import { formatMoney } from '@/utils/money'

  const router = useRouter()
  const templates = useTemplatesStore()
  const categories = useCategoriesStore()
  const app = useAppStore()

  const dialogOpen = ref(false)
  const editing = ref<ExpenseTemplate | null>(null)

  function openAdd (): void {
    editing.value = null
    dialogOpen.value = true
  }

  function openEdit (template: ExpenseTemplate): void {
    editing.value = template
    dialogOpen.value = true
  }

  async function remove (template: ExpenseTemplate): Promise<void> {
    await templates.remove(template.id)
    app.showSnackbar(`${template.name} removed`)
  }
</script>
