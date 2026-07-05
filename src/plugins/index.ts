// Types
import type { App } from 'vue'
import { createPinia } from 'pinia'
/**
 * plugins/index.ts
 *
 * Automatically included in `./src/main.ts`
 */

import router from '../router'
// Plugins
import vuetify from './vuetify'

export const pinia = createPinia()

export function registerPlugins (app: App) {
  app.use(vuetify)
  app.use(pinia)
  app.use(router)
}
