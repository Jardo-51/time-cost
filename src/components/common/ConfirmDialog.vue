<template>
  <v-dialog
    max-width="400"
    :model-value="state.open"
    @update:model-value="value => { if (!value) respond(false) }"
  >
    <v-card>
      <v-card-title>{{ state.title }}</v-card-title>

      <v-card-text v-if="state.message">{{ state.message }}</v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="respond(false)">Cancel</v-btn>

        <v-btn :color="state.confirmColor" variant="flat" @click="respond(true)">
          {{ state.confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import { useConfirmDialog } from '@/composables/useConfirm'

  const { state, respond } = useConfirmDialog()
</script>
