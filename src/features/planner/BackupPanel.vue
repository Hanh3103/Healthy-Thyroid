<script setup lang="ts">
import { usePlanner } from './usePlanner';

const { backupText, backupStatus, copyBackup, restoreBackup } = usePlanner();
</script>

<template>
  <section class="panel">
    <details>
      <summary>Backup &amp; Data</summary>
      <p class="muted">Your data is stored safely on this machine. Copy the backup text to keep an extra copy or restore on another computer.</p>
      <textarea v-model="backupText" id="backup" aria-label="Backup text"></textarea>
      <div class="actions">
        <button class="ghost" type="button" @click="copyBackup">Copy backup</button>
        <button class="ghost" type="button" @click="restoreBackup">Restore from text</button>
      </div>
      <p class="status" id="b-status" role="status">{{ backupStatus }}</p>
    </details>
  </section>
</template>
