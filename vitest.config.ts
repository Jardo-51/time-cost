import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    // Vue's runtime needs a DOM at import time, and fake-indexeddb must be
    // installed before Dexie instantiates — a setup file guarantees the
    // order regardless of import sorting in test files.
    environment: 'happy-dom',
    setupFiles: ['fake-indexeddb/auto'],
  },
})
