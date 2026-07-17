<template>
  <v-dialog v-model="isOpen" max-width="480">
    <v-card>
      <v-card-title>{{ template ? 'Edit template' : 'New template' }}</v-card-title>

      <v-card-text class="pb-0">
        <v-text-field
          v-model="name"
          autofocus
          hint="e.g. Coffee, Bus ticket, Rent"
          label="Name"
        />

        <div class="d-flex ga-2">
          <v-text-field
            v-model="amount"
            inputmode="decimal"
            label="Amount"
            min="0"
            step="0.01"
            type="number"
          />

          <v-select
            v-model="currency"
            item-title="code"
            item-value="code"
            :items="fx.currencies"
            label="Currency"
            style="max-width: 130px"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="item.name" />
            </template>
          </v-select>
        </div>

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

        <v-combobox
          v-model="tagNames"
          chips
          closable-chips
          hint="Applied to every expense created from this template"
          :items="tags.sorted.map(t => t.name)"
          label="Tags"
          multiple
        >
          <template #chip="{ props: chipProps, item }">
            <v-chip
              v-bind="chipProps"
              :color="tags.byName(item)?.color"
              size="small"
              variant="tonal"
            />
          </template>
        </v-combobox>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">Cancel</v-btn>
        <v-btn color="primary" :disabled="!isValid || saving" :loading="saving" variant="flat" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { ExpenseTemplate } from '@/types'
  import { computed, ref, watch } from 'vue'
  import { OTHER_CATEGORY_ID } from '@/constants/categories'
  import { useCategoriesStore } from '@/stores/categories'
  import { useFxStore } from '@/stores/fx'
  import { useSettingsStore } from '@/stores/settings'
  import { useTagsStore } from '@/stores/tags'
  import { useTemplatesStore } from '@/stores/templates'

  const props = defineProps<{
    template?: ExpenseTemplate | null
  }>()

  const isOpen = defineModel<boolean>({ default: false })

  const templates = useTemplatesStore()
  const categories = useCategoriesStore()
  const settings = useSettingsStore()
  const fx = useFxStore()
  const tags = useTagsStore()

  const name = ref('')
  const amount = ref('')
  const currency = ref('EUR')
  const categoryId = ref(OTHER_CATEGORY_ID)
  const tagNames = ref<string[]>([])
  const saving = ref(false)

  watch(isOpen, open => {
    if (!open) return
    name.value = props.template?.name ?? ''
    amount.value = props.template ? String(props.template.amount) : ''
    currency.value = props.template?.currency ?? settings.baseCurrency
    categoryId.value = props.template?.categoryId ?? OTHER_CATEGORY_ID
    tagNames.value = (props.template?.tagIds ?? [])
      .map(id => tags.byId(id)?.name)
      .filter((tagName): tagName is string => !!tagName)
  })

  const parsedAmount = computed(() => {
    const n = Number.parseFloat(amount.value)
    return Number.isFinite(n) && n > 0 ? n : null
  })

  const isValid = computed(() => !!name.value.trim() && parsedAmount.value !== null)

  async function save (): Promise<void> {
    // A double tap must not create two templates.
    if (!isValid.value || parsedAmount.value === null || saving.value) return
    saving.value = true
    try {
      const input = {
        name: name.value.trim(),
        amount: parsedAmount.value,
        currency: currency.value,
        categoryId: categoryId.value,
        tagIds: await tags.ensureIds(tagNames.value),
      }
      await (props.template
        ? templates.update(props.template.id, input)
        : templates.add(input))
      isOpen.value = false
    } finally {
      saving.value = false
    }
  }
</script>
