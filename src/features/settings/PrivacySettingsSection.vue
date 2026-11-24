<script setup lang="ts">
import { ref } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import { deleteMyDataConfirm } from '../diet/confirmCopy';
import { useDiet } from '../diet/useDiet';
import { usePlanner } from '../planner/usePlanner';
import { useThyroid } from '../thyroid/useThyroid';
import { requestConfirm } from '../../shared/ui/useConfirm';
import { AI_CONSENT_ITEMS, AI_STORAGE_ITEMS } from './consent';
import { preferences } from './preferences';

const planner = usePlanner();
const thyroid = useThyroid();
const diet = useDiet();

const showConsent = ref(false);
const exportStatus = ref('');
const deleteStatus = ref('');

async function exportData(): Promise<void> {
  await Promise.all([planner.init(), thyroid.init(), diet.init()]);
  const payload = {
    exportedAt: new Date().toISOString(),
    planner: JSON.parse(JSON.stringify(planner.state.value)),
    thyroid: JSON.parse(thyroid.exportJson()),
    diet: JSON.parse(JSON.stringify(diet.data.value)),
    preferences: preferences.value,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `healthy-thyroid-data-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  exportStatus.value = 'Your data file was downloaded.';
}

async function deleteData(): Promise<void> {
  if (!await requestConfirm(deleteMyDataConfirm())) return;
  await diet.init();
  await diet.clearAllDietData();
  deleteStatus.value = 'Saved diet data, including your pantry, was deleted.';
}
</script>

<template>
  <div class="settings-section">
    <div class="sec-head"><h2>Data and privacy</h2></div>
    <p class="muted">Everything below stays on this device unless you choose to export it.</p>

    <h3>What is stored on this device</h3>
    <ul class="settings-list">
      <li v-for="item in AI_STORAGE_ITEMS" :key="item">{{ item }}</li>
    </ul>

    <h3>What is sent to the AI</h3>
    <AppButton @click="showConsent = !showConsent">
      {{ showConsent ? 'Hide consent notice' : 'View what is sent to the AI' }}
    </AppButton>
    <div v-if="showConsent" class="consent-inline" role="note">
      <p>Before the first AI call, this is sent:</p>
      <ul class="settings-list">
        <li v-for="item in AI_CONSENT_ITEMS" :key="item">{{ item }}</li>
      </ul>
    </div>

    <h3>Your data</h3>
    <div class="settings-button-row">
      <AppButton variant="primary" @click="exportData">Export my data</AppButton>
      <AppButton variant="danger" @click="deleteData">Delete my data</AppButton>
    </div>
    <p v-if="exportStatus" class="status" role="status">{{ exportStatus }}</p>
    <p v-if="deleteStatus" class="status" role="status">{{ deleteStatus }}</p>
  </div>
</template>
