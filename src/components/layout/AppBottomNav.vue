<template>
  <v-bottom-navigation grow>
    <v-btn :active="route.path === '/'" to="/">
      <v-icon>mdi-format-list-bulleted</v-icon>
      <span>Expenses</span>
    </v-btn>

    <v-btn :active="route.path === '/stats'" to="/stats">
      <v-icon>mdi-chart-donut</v-icon>
      <span>Stats</span>
    </v-btn>

    <v-btn :active="route.path.startsWith('/settings')" to="/settings">
      <v-icon>mdi-cog</v-icon>
      <span>Settings</span>
    </v-btn>
  </v-bottom-navigation>
</template>

<script lang="ts" setup>
  import { useRoute } from 'vue-router'

  const route = useRoute()
</script>
