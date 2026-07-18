import { reactive } from 'vue'

// A single shared confirm dialog for destructive actions. Callers `await
// confirm(...)` and get a boolean; the dialog itself is rendered once by
// ConfirmDialog.vue (mounted in App.vue). This replaces the per-page
// hand-rolled delete dialogs so every destructive action gets the same
// guard against a single mis-tap.

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  confirmColor?: string
}

interface ConfirmState extends Required<ConfirmOptions> {
  open: boolean
  resolve: ((value: boolean) => void) | null
}

const state = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmText: 'Delete',
  confirmColor: 'error',
  resolve: null,
})

export function useConfirm () {
  function confirm (options: ConfirmOptions): Promise<boolean> {
    // A still-open prompt would leak its resolver; cancel it first.
    state.resolve?.(false)
    state.title = options.title
    state.message = options.message ?? ''
    state.confirmText = options.confirmText ?? 'Delete'
    state.confirmColor = options.confirmColor ?? 'error'
    state.open = true
    return new Promise<boolean>(resolve => {
      state.resolve = resolve
    })
  }
  return { confirm }
}

// Consumed only by ConfirmDialog.vue.
export function useConfirmDialog () {
  function respond (value: boolean): void {
    const resolve = state.resolve
    state.open = false
    state.resolve = null
    resolve?.(value)
  }
  return { state, respond }
}
