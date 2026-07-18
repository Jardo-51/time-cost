<template>
  <v-app>
    <v-main class="pb-16">
      <router-view />
    </v-main>

    <AppBottomNav />

    <ConfirmDialog />

    <v-snackbar
      v-model="app.snackbar"
      :color="app.snackbarColor"
      :timeout="3000"
    >
      {{ app.snackbarText }}
    </v-snackbar>
  </v-app>
</template>

<script lang="ts" setup>
  import { watch } from 'vue'
  import { useTheme } from 'vuetify'
  import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
  import AppBottomNav from '@/components/layout/AppBottomNav.vue'
  import { useAppStore } from '@/stores/app'

  const app = useAppStore()
  const theme = useTheme()

  watch(() => app.darkMode, dark => {
    theme.change(dark ? 'dark' : 'light')
  }, { immediate: true })
</script>
