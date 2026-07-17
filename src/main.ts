/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Composables
import { createApp } from 'vue'
import { bootstrap } from '@/bootstrap'
// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Styles
import 'unfonts.css'

const app = createApp(App)

registerPlugins(app)

// Local data must be hydrated before first render; network work inside
// bootstrap is fire-and-forget. If bootstrap throws (IndexedDB unavailable
// in private browsing, storage pressure, a failed migration) we must NOT
// mount the app: it would render the "Add your first expense" empty state
// over the user's real, merely inaccessible data. Surface the failure
// instead and keep the rejection from escaping unhandled.
bootstrap()
  .then(() => app.mount('#app'))
  .catch((error: unknown) => {
    console.error('Time Cost failed to start', error)
    renderBootstrapError()
  })

function renderBootstrapError (): void {
  const root = document.querySelector('#app')
  if (!root) {
    return
  }
  root.innerHTML = `
    <div style="max-width:32rem;margin:15vh auto;padding:0 1.5rem;font-family:Roboto,system-ui,sans-serif;text-align:center;color:#333">
      <h1 style="font-size:1.4rem;margin-bottom:.75rem">Couldn’t load your data</h1>
      <p style="line-height:1.5;color:#666">
        Time Cost couldn’t open its local storage. This can happen in private
        browsing or when the device is out of storage. Your data has not been
        lost — try reloading, or reopen the app in a normal window.
      </p>
      <button
        type="button"
        onclick="location.reload()"
        style="margin-top:1.25rem;padding:.6rem 1.4rem;border:0;border-radius:.4rem;background:#1976D2;color:#fff;font-size:1rem;cursor:pointer"
      >Reload</button>
    </div>
  `
}
