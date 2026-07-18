// Resolve the initial dark-mode preference: an explicit stored choice always
// wins, otherwise fall back to the OS `prefers-color-scheme`. Used both by the
// app store (reactive state) and the Vuetify plugin (initial theme) so the
// startup theme matches the resolved preference and doesn't flash light first.
export function initialDarkMode (): boolean {
  const stored = localStorage.getItem('darkMode')
  if (stored !== null) {
    return stored === 'true'
  }
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}
