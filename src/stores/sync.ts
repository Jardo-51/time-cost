import type { SyncStatus } from '@/types'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { deleteMeta, getMeta, setMeta } from '@/db'

// Facade over the Etebase sync engine. Every data-store mutation calls
// scheduleSync(); it is a safe no-op while no account is configured.
// The etebase modules are loaded via dynamic import only when sync is
// actually used, keeping the crypto bundle out of the main chunk.

const INFO_KEY = 'etebase.info'
const LAST_SYNC_KEY = 'etebase.lastSyncAt'

interface AccountInfo {
  server: string
  username: string
}

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus>('disabled')
  const lastSyncAt = ref<number | null>(null)
  const lastError = ref<string | null>(null)
  const configured = ref(false)
  const serverUrl = ref('')
  const username = ref('')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let syncing = false
  let rerunRequested = false

  async function hydrate (): Promise<void> {
    const info = await getMeta<AccountInfo>(INFO_KEY)
    const session = await getMeta<unknown>('etebase.session')
    configured.value = !!info && !!session
    if (info) {
      serverUrl.value = info.server
      username.value = info.username
    }
    lastSyncAt.value = (await getMeta<number>(LAST_SYNC_KEY)) ?? null
    status.value = configured.value ? 'idle' : 'disabled'
  }

  async function login (server: string, user: string, password: string): Promise<void> {
    const etebase = await import('@/services/sync/etebase')
    if (!(await etebase.isEtebaseServer(server))) {
      throw new Error('This URL is not an Etebase server')
    }
    await etebase.login(server, user, password)
    const info: AccountInfo = { server, username: user }
    await setMeta(INFO_KEY, info)
    serverUrl.value = server
    username.value = user
    configured.value = true
    status.value = 'idle'
    lastError.value = null
    syncNow()
  }

  // Removes the account and sync bookkeeping; all local data stays.
  async function logout (): Promise<void> {
    const etebase = await import('@/services/sync/etebase')
    await etebase.logout()
    await deleteMeta(INFO_KEY)
    await deleteMeta(LAST_SYNC_KEY)
    configured.value = false
    serverUrl.value = ''
    username.value = ''
    status.value = 'disabled'
    lastSyncAt.value = null
    lastError.value = null
  }

  function scheduleSync (): void {
    if (!configured.value) {
      return
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      syncNow()
    }, 3000)
  }

  async function syncNow (): Promise<void> {
    if (!configured.value || !navigator.onLine) {
      return
    }
    if (syncing) {
      rerunRequested = true
      return
    }
    syncing = true
    status.value = 'syncing'
    try {
      const etebase = await import('@/services/sync/etebase')
      if (!(await etebase.restoreSession())) {
        throw new Error('Session expired — please log in again')
      }
      const engine = await import('@/services/sync/engine')
      const Etebase = await import('etebase')
      try {
        await engine.syncOnce()
      } catch (error) {
        if (error instanceof Etebase.ConflictError) {
          // Someone pushed concurrently; pulling again resolves it.
          await engine.syncOnce()
        } else if (error instanceof Etebase.UnauthorizedError) {
          await etebase.refreshToken()
          await engine.syncOnce()
        } else {
          throw error
        }
      }
      lastSyncAt.value = Date.now()
      await setMeta(LAST_SYNC_KEY, lastSyncAt.value)
      lastError.value = null
      status.value = 'idle'
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      status.value = 'error'
    } finally {
      syncing = false
      if (rerunRequested) {
        rerunRequested = false
        syncNow()
      }
    }
  }

  return {
    status,
    lastSyncAt,
    lastError,
    configured,
    serverUrl,
    username,
    hydrate,
    login,
    logout,
    scheduleSync,
    syncNow,
  }
})
