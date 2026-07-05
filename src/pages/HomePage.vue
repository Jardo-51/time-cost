<template>
  <v-container class="pa-3">
    <QuickAddRow />

    <v-alert
      v-if="!settings.isIncomeConfigured && expenses.expenses.length > 0"
      class="mb-3"
      density="compact"
      type="info"
      variant="tonal"
    >
      Set your income to see expenses in worktime.
      <template #append>
        <v-btn size="small" to="/settings" variant="text">Settings</v-btn>
      </template>
    </v-alert>

    <v-empty-state
      v-if="expenses.expenses.length === 0"
      icon="mdi-cash-clock"
      :text="settings.isIncomeConfigured
        ? 'Add your first expense with the + button.'
        : 'Set your income in Settings, then add expenses to see what they cost you in worktime.'"
      title="Your money is time"
    >
      <template #actions>
        <v-btn
          v-if="!settings.isIncomeConfigured"
          color="primary"
          to="/settings"
          variant="flat"
        >
          Set income
        </v-btn>
      </template>
    </v-empty-state>

    <ExpenseList v-else :expenses="expenses.expenses" @edit="openEdit" />

    <v-btn
      class="fab"
      color="primary"
      icon="mdi-plus"
      size="large"
      @click="openAdd"
    />

    <ExpenseFormDialog
      v-model="dialogOpen"
      :expense="editing"
      @deleted="onDeleted"
    />

    <v-snackbar v-model="undoSnackbar" :timeout="5000">
      Expense deleted
      <template #actions>
        <v-btn color="primary" variant="text" @click="undoDelete">Undo</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<script lang="ts" setup>
  import type { Expense } from '@/types'
  import { ref } from 'vue'
  import ExpenseFormDialog from '@/components/expenses/ExpenseFormDialog.vue'
  import ExpenseList from '@/components/expenses/ExpenseList.vue'
  import QuickAddRow from '@/components/expenses/QuickAddRow.vue'
  import { useExpensesStore } from '@/stores/expenses'
  import { useSettingsStore } from '@/stores/settings'

  const expenses = useExpensesStore()
  const settings = useSettingsStore()

  const dialogOpen = ref(false)
  const editing = ref<Expense | null>(null)
  const undoSnackbar = ref(false)
  const lastDeleted = ref<Expense | null>(null)

  function openAdd (): void {
    editing.value = null
    dialogOpen.value = true
  }

  function openEdit (expense: Expense): void {
    editing.value = expense
    dialogOpen.value = true
  }

  function onDeleted (expense: Expense): void {
    lastDeleted.value = expense
    undoSnackbar.value = true
  }

  async function undoDelete (): Promise<void> {
    if (lastDeleted.value) await expenses.restore(lastDeleted.value)
    lastDeleted.value = null
    undoSnackbar.value = false
  }
</script>

<style scoped>
  .fab {
    position: fixed;
    right: 16px;
    bottom: 72px;
    z-index: 5;
  }
</style>
