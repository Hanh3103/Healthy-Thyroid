<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getAppInfo, type AppInfo } from './about';

const info = ref<AppInfo>({ version: '…', promptVersion: '…', licenses: [] });

onMounted(async () => {
  info.value = await getAppInfo();
});
</script>

<template>
  <div class="settings-section">
    <div class="sec-head"><h2>About</h2></div>
    <p class="muted">Healthy Thyroid keeps planning and health data on your device.</p>

    <dl class="about-list">
      <dt>App version</dt>
      <dd>{{ info.version }}</dd>
      <dt>AI prompt version</dt>
      <dd>{{ info.promptVersion }}</dd>
    </dl>

    <h3>Licenses</h3>
    <ul class="settings-list">
      <li v-for="license in info.licenses" :key="license">{{ license }}</li>
    </ul>
  </div>
</template>
