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
// bootstrap is fire-and-forget. Two failure modes get distinct screens so the
// diagnosis stays accurate:
//   - bootstrap throwing (IndexedDB unavailable in private browsing, storage
//     pressure, a failed migration) means the local store is inaccessible. We
//     must NOT mount — that would render the "Add your first expense" empty
//     state over the user's real, merely inaccessible data.
//   - a mount/render error after a successful bootstrap (a component bug, a
//     Vuetify init failure) is a code/startup problem, not a storage one, so it
//     gets its own message instead of blaming local storage.
// Either way, keep the rejection from escaping unhandled.
bootstrap().then(
  () => {
    try {
      app.mount('#app')
    } catch (error) {
      console.error('Time Cost failed to start', error)
      renderErrorScreen(
        'Something went wrong',
        'Time Cost ran into a problem while starting up. Your data has not been '
        + 'lost — try reloading the app.',
      )
    }
  },
  (error: unknown) => {
    console.error('Time Cost failed to load local data', error)
    renderErrorScreen(
      'Couldn’t load your data',
      'Time Cost couldn’t open its local storage. This can happen in private '
      + 'browsing or when the device is out of storage. Your data has not been '
      + 'lost — try reloading, or reopen the app in a normal window.',
    )
  },
)

// Built with `createElement`/`textContent` rather than an `innerHTML` template:
// `heading`/`message` are compile-time constants today, but going through the
// DOM API keeps that from mattering — a future caller passing an
// attacker-influenceable string (e.g. `error.message`) still can't inject markup.
function renderErrorScreen (heading: string, message: string): void {
  const root = document.querySelector('#app')
  if (!root) {
    return
  }

  const container = document.createElement('div')
  container.style.cssText = 'max-width:32rem;margin:15vh auto;padding:0 1.5rem;font-family:Roboto,system-ui,sans-serif;text-align:center;color:#333'

  const title = document.createElement('h1')
  title.style.cssText = 'font-size:1.4rem;margin-bottom:.75rem'
  title.textContent = heading

  const body = document.createElement('p')
  body.style.cssText = 'line-height:1.5;color:#666'
  body.textContent = message

  const button = document.createElement('button')
  button.type = 'button'
  button.style.cssText = 'margin-top:1.25rem;padding:.6rem 1.4rem;border:0;border-radius:.4rem;background:#1976D2;color:#fff;font-size:1rem;cursor:pointer'
  button.textContent = 'Reload'
  button.addEventListener('click', () => location.reload())

  container.append(title, body, button)
  root.replaceChildren(container)
}
