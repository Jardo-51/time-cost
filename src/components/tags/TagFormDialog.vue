<template>
  <v-dialog v-model="isOpen" max-width="480">
    <v-card>
      <v-card-title>{{ tag ? 'Edit tag' : 'New tag' }}</v-card-title>

      <v-card-text class="pb-0">
        <v-text-field v-model="name" autofocus label="Name" />

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
        <v-btn color="primary" :disabled="!isValid" variant="flat" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { Tag } from '@/types'
  import { computed, ref, watch } from 'vue'
  import { CATEGORY_COLORS } from '@/constants/categories'
  import { useTagsStore } from '@/stores/tags'

  const props = defineProps<{
    tag?: Tag | null
  }>()

  const isOpen = defineModel<boolean>({ default: false })

  const tags = useTagsStore()

  const name = ref('')
  const color = ref(CATEGORY_COLORS[0]!)

  watch(isOpen, open => {
    if (!open) return
    name.value = props.tag?.name ?? ''
    color.value = props.tag?.color ?? CATEGORY_COLORS[0]!
  })

  // A rename must not collide with another existing tag.
  const isValid = computed(() => {
    const trimmed = name.value.trim()
    if (!trimmed) return false
    const existing = tags.byName(trimmed)
    return !existing || existing.id === props.tag?.id
  })

  async function save (): Promise<void> {
    if (!isValid.value) return
    const input = { name: name.value.trim(), color: color.value }
    await (props.tag
      ? tags.update(props.tag.id, input)
      : tags.add(input))
    isOpen.value = false
  }
</script>
