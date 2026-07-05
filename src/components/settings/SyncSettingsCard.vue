<template>
  <v-card class="mb-4">
    <v-card-title>EteSync</v-card-title>

    <v-card-text v-if="!sync.configured">
      <div class="text-body-2 text-medium-emphasis mb-3">
        Optional end-to-end encrypted sync between your devices via an
        Etebase (EteSync 2.0) account. The app keeps working fully offline.
      </div>

      <v-text-field
        v-model="server"
        label="Server URL"
        placeholder="https://api.etebase.com/partner/etesync/"
      />

      <v-text-field v-model="user" autocomplete="username" label="Username" />

      <v-text-field
        v-model="password"
        autocomplete="current-password"
        label="Password"
        type="password"
        @keyup.enter="doLogin"
      />

      <v-alert
        v-if="loginError"
        class="mb-3"
        density="compact"
        type="error"
        variant="tonal"
      >
        {{ loginError }}
      </v-alert>

      <v-btn
        color="primary"
        :disabled="!server.trim() || !user.trim() || !password"
        :loading="loggingIn"
        variant="flat"
        @click="doLogin"
      >
        Log in
      </v-btn>
    </v-card-text>

    <v-card-text v-else>
      <div class="d-flex align-center mb-2">
        <v-icon class="me-2" :color="statusColor" :icon="statusIcon" size="20" />

        <div>
          <div class="text-body-2">{{ statusText }}</div>

          <div class="text-caption text-medium-emphasis">
            {{ sync.username }} · {{ sync.serverUrl }}
          </div>
        </div>
      </div>

      <v-alert
        v-if="sync.status === 'error' && sync.lastError"
        class="mb-3"
        density="compact"
        type="error"
        variant="tonal"
      >
        {{ sync.lastError }}
      </v-alert>

      <div class="d-flex ga-2">
        <v-btn
          :loading="sync.status === 'syncing'"
          prepend-icon="mdi-sync"
          variant="tonal"
          @click="sync.syncNow()"
        >
          Sync now
        </v-btn>

        <v-btn variant="text" @click="logoutDialog = true">Log out</v-btn>
      </div>
    </v-card-text>
  </v-card>

  <v-dialog v-model="logoutDialog" max-width="400">
    <v-card>
      <v-card-title>Log out of sync?</v-card-title>

      <v-card-text>
        Your expenses stay on this device — only synchronization stops.
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="logoutDialog = false">Cancel</v-btn>
        <v-btn color="error" variant="flat" @click="doLogout">Log out</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { useAppStore } from '@/stores/app'
  import { useSyncStore } from '@/stores/sync'
  import { relativeTime } from '@/utils/date'

  const sync = useSyncStore()
  const app = useAppStore()

  const server = ref('https://api.etebase.com/partner/etesync/')
  const user = ref('')
  const password = ref('')
  const loggingIn = ref(false)
  const loginError = ref('')
  const logoutDialog = ref(false)

  const statusIcon = computed(() => {
    switch (sync.status) {
      case 'syncing': {
        return 'mdi-cloud-sync'
      }
      case 'error': {
        return 'mdi-cloud-alert'
      }
      default: {
        return 'mdi-cloud-check'
      }
    }
  })

  const statusColor = computed(() => {
    switch (sync.status) {
      case 'error': {
        return 'error'
      }
      case 'syncing': {
        return 'primary'
      }
      default: {
        return 'success'
      }
    }
  })

  const statusText = computed(() => {
    if (sync.status === 'syncing') return 'Syncing…'
    if (sync.status === 'error') return 'Sync failed'
    return sync.lastSyncAt ? `Last synced ${relativeTime(sync.lastSyncAt)}` : 'Not synced yet'
  })

  async function doLogin (): Promise<void> {
    if (loggingIn.value) return
    loggingIn.value = true
    loginError.value = ''
    try {
      await sync.login(server.value.trim(), user.value.trim(), password.value)
      password.value = ''
      app.showSnackbar('Sync enabled')
    } catch (error) {
      loginError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loggingIn.value = false
    }
  }

  async function doLogout (): Promise<void> {
    logoutDialog.value = false
    await sync.logout()
    app.showSnackbar('Sync disabled — local data kept')
  }
</script>
