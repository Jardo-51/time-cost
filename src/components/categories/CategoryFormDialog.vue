<template>
  <v-dialog v-model="isOpen" max-width="480">
    <v-card>
      <v-card-title>{{ category ? 'Edit category' : 'New category' }}</v-card-title>

      <v-card-text class="pb-0">
        <v-text-field v-model="name" autofocus label="Name" />

        <div class="text-caption text-medium-emphasis mb-1">Icon</div>

        <div class="mb-4">
          <v-btn
            v-for="option in CATEGORY_ICONS"
            :key="option"
            class="ma-1"
            :color="option === icon ? color : undefined"
            :icon="option"
            size="small"
            :variant="option === icon ? 'flat' : 'tonal'"
            @click="icon = option"
          />
        </div>

        <div class="text-caption text-medium-emphasis mb-1">Color</div>

        <div class="mb-2">
          <v-btn
            v-for="option in CATEGORY_COLORS"
            :key="option"
            class="ma-1"
            :color="option"
            :icon="option === color ? 'mdi-check' : ''"
            size="x-small"
            variant="flat"
            @click="color = option"
          />
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">Cancel</v-btn>
        <v-btn color="primary" :disabled="!name.trim()" variant="flat" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { Category } from '@/types'
  import { ref, watch } from 'vue'
  import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/constants/categories'
  import { useCategoriesStore } from '@/stores/categories'

  const props = defineProps<{
    category?: Category | null
  }>()

  const isOpen = defineModel<boolean>({ default: false })

  const categories = useCategoriesStore()

  const name = ref('')
  const icon = ref(CATEGORY_ICONS[0]!)
  const color = ref(CATEGORY_COLORS[0]!)

  watch(isOpen, open => {
    if (!open) return
    name.value = props.category?.name ?? ''
    icon.value = props.category?.icon ?? CATEGORY_ICONS[0]!
    color.value = props.category?.color ?? CATEGORY_COLORS[0]!
  })

  async function save (): Promise<void> {
    const input = { name: name.value.trim(), icon: icon.value, color: color.value }
    await (props.category
      ? categories.update(props.category.id, input)
      : categories.add(input))
    isOpen.value = false
  }
</script>
