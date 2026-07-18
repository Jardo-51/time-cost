<template>
  <v-container class="pa-3">
    <div class="d-flex align-center mb-4">
      <v-btn aria-label="Back" icon="mdi-arrow-left" variant="text" @click="router.back()" />
      <h1 class="ms-2">Tags</h1>
      <v-spacer />

      <v-btn
        aria-label="Add tag"
        color="primary"
        icon="mdi-plus"
        variant="tonal"
        @click="openAdd"
      />
    </div>

    <v-empty-state
      v-if="tags.sorted.length === 0"
      icon="mdi-tag-outline"
      text="Create tags here or type them directly in the expense form."
      title="No tags yet"
    />

    <v-card v-else>
      <v-list lines="one">
        <v-list-item
          v-for="tag in tags.sorted"
          :key="tag.id"
          :subtitle="usageLabel(tag.id)"
          :title="tag.name"
        >
          <template #prepend>
            <v-avatar :color="tag.color" size="36">
              <v-icon color="white" icon="mdi-tag" size="18" />
            </v-avatar>
          </template>

          <template #append>
            <v-btn
              :aria-label="`Edit ${tag.name}`"
              icon="mdi-pencil"
              size="small"
              variant="text"
              @click="openEdit(tag)"
            />

            <v-btn
              :aria-label="`Delete ${tag.name}`"
              icon="mdi-delete"
              size="small"
              variant="text"
              @click="confirmDelete(tag)"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <TagFormDialog v-model="dialogOpen" :tag="editing" />

    <v-dialog v-model="deleteDialogOpen" max-width="400">
      <v-card>
        <v-card-title>Delete “{{ deleting?.name }}”?</v-card-title>

        <v-card-text>
          The tag will be removed from
          {{ deleting ? usageLabel(deleting.id) : '' }}. The expenses themselves stay.
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialogOpen = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="doDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
  import type { Tag } from '@/types'
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import TagFormDialog from '@/components/tags/TagFormDialog.vue'
  import { useAppStore } from '@/stores/app'
  import { useExpensesStore } from '@/stores/expenses'
  import { useTagsStore } from '@/stores/tags'

  const router = useRouter()
  const tags = useTagsStore()
  const expenses = useExpensesStore()
  const app = useAppStore()

  const dialogOpen = ref(false)
  const editing = ref<Tag | null>(null)
  const deleteDialogOpen = ref(false)
  const deleting = ref<Tag | null>(null)

  const usageCounts = computed(() => {
    const counts = new Map<string, number>()
    for (const expense of expenses.expenses) {
      for (const tagId of expense.tagIds) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
      }
    }
    return counts
  })

  function usageLabel (tagId: string): string {
    const count = usageCounts.value.get(tagId) ?? 0
    return count === 1 ? '1 expense' : `${count} expenses`
  }

  function openAdd (): void {
    editing.value = null
    dialogOpen.value = true
  }

  function openEdit (tag: Tag): void {
    editing.value = tag
    dialogOpen.value = true
  }

  function confirmDelete (tag: Tag): void {
    deleting.value = tag
    deleteDialogOpen.value = true
  }

  async function doDelete (): Promise<void> {
    if (deleting.value) {
      await tags.remove(deleting.value.id)
      app.showSnackbar(`${deleting.value.name} deleted`)
    }
    deleteDialogOpen.value = false
    deleting.value = null
  }
</script>
