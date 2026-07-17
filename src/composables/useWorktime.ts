import type { Expense, WorkUnitsConfig } from '@/types'
import { computed } from 'vue'
import { useFxStore } from '@/stores/fx'
import { useSettingsStore } from '@/stores/settings'
import { resolveBaseAmount } from '@/utils/base'
import { formatMoney } from '@/utils/money'
import { costToWorkSeconds, formatWorktime, incomePeriodFor } from '@/utils/worktime'

export function useWorktime () {
  const settings = useSettingsStore()
  const fx = useFxStore()

  // Ladder config for totals and previews when no period applies yet.
  const currentUnits = computed<WorkUnitsConfig>(() =>
    settings.currentIncome ?? { hoursPerDay: 8, daysPerWeek: 5 },
  )

  function baseAmountOf (expense: Expense): number | null {
    return resolveBaseAmount(expense, settings.baseCurrency, fx.convert)
  }

  function workSecondsFor (expense: Expense): number | null {
    const period = incomePeriodFor(expense.date, settings.incomePeriods)
    return costToWorkSeconds(baseAmountOf(expense), period)
  }

  function worktimeFor (expense: Expense): string {
    const period = incomePeriodFor(expense.date, settings.incomePeriods)
    if (!period) {
      return '—'
    }
    return formatWorktime(costToWorkSeconds(baseAmountOf(expense), period), period)
  }

  // Live preview while typing in the expense form.
  function worktimePreview (amount: number, currency: string, date: string): string {
    const period = incomePeriodFor(date, settings.incomePeriods)
    if (!period) {
      return '—'
    }
    return formatWorktime(costToWorkSeconds(fx.toBase(amount, currency), period), period)
  }

  function formatTotalWorktime (seconds: number | null): string {
    return formatWorktime(seconds, currentUnits.value)
  }

  function moneyFor (expense: Expense): string {
    return formatMoney(expense.amount, expense.currency)
  }

  return {
    currentUnits,
    baseAmountOf,
    workSecondsFor,
    worktimeFor,
    worktimePreview,
    formatTotalWorktime,
    moneyFor,
  }
}
