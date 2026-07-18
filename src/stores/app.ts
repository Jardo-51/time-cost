import { defineStore } from 'pinia'
import { ref } from 'vue'
import { initialDarkMode } from '@/utils/theme'

export const useAppStore = defineStore('app', () => {
  const snackbar = ref(false)
  const snackbarText = ref('')
  const snackbarColor = ref('success')
  const darkMode = ref(initialDarkMode())

  // While the user has made no explicit choice, follow the OS preference live:
  // a PWA left open across an OS auto-dark switch (e.g. sunset) updates without
  // a reload. The listener detaches permanently the moment the user toggles.
  const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
  function onOSPreferenceChange (event: MediaQueryListEvent) {
    darkMode.value = event.matches
  }
  if (prefersDark && localStorage.getItem('darkMode') === null) {
    prefersDark.addEventListener('change', onOSPreferenceChange)
  }

  function showSnackbar (text: string, color = 'success') {
    snackbarText.value = text
    snackbarColor.value = color
    snackbar.value = true
  }

  function toggleDarkMode () {
    darkMode.value = !darkMode.value
    localStorage.setItem('darkMode', String(darkMode.value))
    prefersDark?.removeEventListener('change', onOSPreferenceChange)
  }

  return {
    snackbar,
    snackbarText,
    snackbarColor,
    darkMode,
    showSnackbar,
    toggleDarkMode,
  }
})
