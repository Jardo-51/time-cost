<template>
  <v-container class="pa-3">
    <h1 class="mb-4">Settings</h1>

    <IncomeSettingsCard />

    <SyncSettingsCard />

    <FxSettingsCard />

    <v-card class="mb-4">
      <v-card-title>Manage</v-card-title>

      <v-list>
        <v-list-item
          prepend-icon="mdi-shape"
          subtitle="Add, edit or remove expense categories"
          title="Categories"
          to="/settings/categories"
        />

        <v-list-item
          prepend-icon="mdi-tag-multiple"
          subtitle="Labels that cut across categories, for filtering stats"
          title="Tags"
          to="/settings/tags"
        />

        <v-list-item
          prepend-icon="mdi-flash"
          subtitle="One-tap expenses like coffee or a bus ticket"
          title="Quick-add templates"
          to="/settings/templates"
        />
      </v-list>
    </v-card>

    <ThemeToggle />
  </v-container>
</template>

<script lang="ts" setup>
  import FxSettingsCard from '@/components/settings/FxSettingsCard.vue'
  import IncomeSettingsCard from '@/components/settings/IncomeSettingsCard.vue'
  import SyncSettingsCard from '@/components/settings/SyncSettingsCard.vue'
  import ThemeToggle from '@/components/settings/ThemeToggle.vue'
</script>
