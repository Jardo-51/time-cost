<template>
  <v-select
    v-model="categoryId"
    item-title="name"
    item-value="id"
    :items="categories.sorted"
    label="Category"
  >
    <template #item="{ props: itemProps, item }">
      <v-list-item v-bind="itemProps">
        <template #prepend>
          <v-avatar :color="item.color" size="32">
            <v-icon color="white" :icon="item.icon" size="18" />
          </v-avatar>
        </template>
      </v-list-item>
    </template>

    <template #selection="{ item }">
      <v-icon class="me-2" :color="item.color" :icon="item.icon" size="20" />
      {{ item.name }}
    </template>
  </v-select>
</template>

<script lang="ts" setup>
  import { useCategoriesStore } from '@/stores/categories'

  const categoryId = defineModel<string>({ required: true })

  const categories = useCategoriesStore()
</script>
