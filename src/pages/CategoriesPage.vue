<template>
  <v-container class="pa-3">
    <div class="d-flex align-center mb-4">
      <v-btn aria-label="Back" icon="mdi-arrow-left" variant="text" @click="router.back()" />
      <h1 class="ms-2">Categories</h1>
      <v-spacer />

      <v-btn
        aria-label="Add category"
        color="primary"
        icon="mdi-plus"
        variant="tonal"
        @click="openAdd"
      />
    </div>

    <v-card>
      <v-list lines="one">
        <v-list-item
          v-for="category in categories.sorted"
          :key="category.id"
          :title="category.name"
        >
          <template #prepend>
            <v-avatar :color="category.color" size="36">
              <v-icon color="white" :icon="category.icon" size="20" />
            </v-avatar>
          </template>

          <template #append>
            <v-btn
              :aria-label="`Edit ${category.name}`"
              icon="mdi-pencil"
              size="small"
              variant="text"
              @click="openEdit(category)"
            />

            <v-btn
              v-if="!category.isProtected"
              :aria-label="`Delete ${category.name}`"
              icon="mdi-delete"
              size="small"
              variant="text"
              @click="confirmDelete(category)"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <CategoryFormDialog v-model="dialogOpen" :category="editing" />
  </v-container>
</template>

<script lang="ts" setup>
  import type { Category } from '@/types'
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import CategoryFormDialog from '@/components/categories/CategoryFormDialog.vue'
  import { useConfirm } from '@/composables/useConfirm'
  import { useAppStore } from '@/stores/app'
  import { useCategoriesStore } from '@/stores/categories'

  const router = useRouter()
  const categories = useCategoriesStore()
  const app = useAppStore()
  const { confirm } = useConfirm()

  const dialogOpen = ref(false)
  const editing = ref<Category | null>(null)

  function openAdd (): void {
    editing.value = null
    dialogOpen.value = true
  }

  function openEdit (category: Category): void {
    editing.value = category
    dialogOpen.value = true
  }

  async function confirmDelete (category: Category): Promise<void> {
    const ok = await confirm({
      title: `Delete “${category.name}”?`,
      message: 'Expenses and templates in this category will move to “Other”.',
    })
    if (!ok) return
    await categories.remove(category.id)
    app.showSnackbar(`${category.name} deleted`)
  }
</script>
