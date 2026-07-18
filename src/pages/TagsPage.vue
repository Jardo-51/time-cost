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
  </v-container>
</template>

<script lang="ts" setup>
  import type { Tag } from '@/types'
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import TagFormDialog from '@/components/tags/TagFormDialog.vue'
  import { useConfirm } from '@/composables/useConfirm'
  import { useAppStore } from '@/stores/app'
  import { useExpensesStore } from '@/stores/expenses'
  import { useTagsStore } from '@/stores/tags'

  const router = useRouter()
  const tags = useTagsStore()
  const expenses = useExpensesStore()
  const app = useAppStore()
  const { confirm } = useConfirm()

  const dialogOpen = ref(false)
  const editing = ref<Tag | null>(null)

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

  async function confirmDelete (tag: Tag): Promise<void> {
    const ok = await confirm({
      title: `Delete “${tag.name}”?`,
      message: `The tag will be removed from ${usageLabel(tag.id)}. The expenses themselves stay.`,
    })
    if (!ok) return
    await tags.remove(tag.id)
    app.showSnackbar(`${tag.name} deleted`)
  }
</script>
