<template>
  <v-dialog v-model="isOpen" max-width="480">
    <v-card>
      <v-card-title>{{ expense ? 'Edit expense' : 'New expense' }}</v-card-title>

      <v-card-text class="pb-0">
        <CurrencyAmountFields v-model:amount="amount" v-model:currency="currency" autofocus />

        <v-text-field v-model="description" label="Description" />

        <CategorySelect v-model="categoryId" />

        <v-combobox
          v-model="tagNames"
          chips
          closable-chips
          hint="Type to create a new tag"
          :items="tagsStore.sorted.map(t => t.name)"
          label="Tags"
          multiple
        >
          <template #chip="{ props: chipProps, item }">
            <v-chip
              v-bind="chipProps"
              :color="tagsStore.byName(item)?.color"
              size="small"
              variant="tonal"
            />
          </template>
        </v-combobox>

        <v-text-field v-model="date" label="Date" type="date" />

        <v-alert
          class="mb-2"
          density="compact"
          :type="settings.isIncomeConfigured ? 'info' : 'warning'"
          variant="tonal"
        >
          <template v-if="settings.isIncomeConfigured">
            <span class="font-weight-medium">{{ preview }}</span> of work
            <span v-if="convertedHint" class="text-medium-emphasis"> · {{ convertedHint }}</span>
          </template>

          <template v-else>
            Set your income in Settings to see this in worktime.
          </template>
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-btn v-if="expense" color="error" variant="text" @click="removeExpense">
          Delete
        </v-btn>

        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>

        <v-btn
          color="primary"
          :disabled="!isValid || saving"
          :loading="saving"
          variant="flat"
          @click="save"
        >Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { Expense } from '@/types'
  import { computed, ref, watch } from 'vue'
  import CategorySelect from '@/components/expenses/CategorySelect.vue'
  import CurrencyAmountFields from '@/components/expenses/CurrencyAmountFields.vue'
  import { useWorktime } from '@/composables/useWorktime'
  import { OTHER_CATEGORY_ID } from '@/constants/categories'
  import { useExpensesStore } from '@/stores/expenses'
  import { useFxStore } from '@/stores/fx'
  import { useSettingsStore } from '@/stores/settings'
  import { useTagsStore } from '@/stores/tags'
  import { isValidISODate, todayISO } from '@/utils/date'
  import { formatMoney } from '@/utils/money'

  const props = defineProps<{
    expense?: Expense | null
  }>()

  const emit = defineEmits<{
    deleted: [expense: Expense]
  }>()

  const isOpen = defineModel<boolean>({ default: false })

  const expensesStore = useExpensesStore()
  const settings = useSettingsStore()
  const fx = useFxStore()
  const tagsStore = useTagsStore()
  const { worktimePreview } = useWorktime()

  const amount = ref('')
  const currency = ref('EUR')
  const description = ref('')
  const categoryId = ref(OTHER_CATEGORY_ID)
  const tagNames = ref<string[]>([])
  const date = ref(todayISO())
  const saving = ref(false)

  watch(isOpen, open => {
    if (!open) return
    if (props.expense) {
      amount.value = String(props.expense.amount)
      currency.value = props.expense.currency
      description.value = props.expense.description
      categoryId.value = props.expense.categoryId
      tagNames.value = props.expense.tagIds
        .map(id => tagsStore.byId(id)?.name)
        .filter((name): name is string => !!name)
      date.value = props.expense.date
    } else {
      amount.value = ''
      // The remembered currency may have been a custom rate that was since
      // removed; fall back to the base currency so we never preselect a code
      // with no rate (which would silently save baseAmount: null).
      const remembered = localStorage.getItem('lastCurrency')
      currency.value = remembered && fx.currencies.some(c => c.code === remembered)
        ? remembered
        : settings.baseCurrency
      description.value = ''
      categoryId.value = OTHER_CATEGORY_ID
      tagNames.value = []
      date.value = todayISO()
    }
  })

  const parsedAmount = computed(() => {
    const n = Number.parseFloat(amount.value)
    return Number.isFinite(n) && n >= 0 ? n : null
  })

  const isValid = computed(() =>
    parsedAmount.value !== null && parsedAmount.value > 0 && isValidISODate(date.value),
  )

  // The signature moment: worktime updates live while typing.
  const preview = computed(() =>
    parsedAmount.value === null
      ? '—'
      : worktimePreview(parsedAmount.value, currency.value, date.value),
  )

  const convertedHint = computed(() => {
    if (parsedAmount.value === null || currency.value === settings.baseCurrency) return ''
    const converted = fx.toBase(parsedAmount.value, currency.value)
    return converted === null
      ? 'no exchange rate yet'
      : `≈ ${formatMoney(converted, settings.baseCurrency)}`
  })

  function close (): void {
    isOpen.value = false
  }

  async function save (): Promise<void> {
    // A double tap (common on mobile) must not create two expenses.
    if (!isValid.value || parsedAmount.value === null || saving.value) return
    saving.value = true
    try {
      const input = {
        amount: parsedAmount.value,
        currency: currency.value,
        description: description.value.trim(),
        categoryId: categoryId.value,
        tagIds: await tagsStore.ensureIds(tagNames.value),
        date: date.value,
      }
      await (props.expense
        ? expensesStore.update(props.expense.id, input)
        : expensesStore.add(input))
      localStorage.setItem('lastCurrency', currency.value)
      close()
    } finally {
      saving.value = false
    }
  }

  async function removeExpense (): Promise<void> {
    if (!props.expense) return
    const tombstoned = await expensesStore.remove(props.expense.id)
    if (tombstoned) emit('deleted', tombstoned)
    close()
  }
</script>
