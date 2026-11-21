<script setup lang="ts">
import { reactive } from 'vue';
import { useThyroid } from './useThyroid';

const vm = reactive(useThyroid());

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  void vm.scanFile(file);
  input.value = '';
}
</script>

<template>
  <div class="thyroid-scanner">
    <label>
      Scan a blood-result image (optional)
      <input id="thyroid-scan-input" type="file" accept="image/*" @change="onFileChange" />
    </label>
    <p v-if="vm.scanStatus" id="thyroid-scan-status" class="status" role="status">{{ vm.scanStatus }}</p>
    <details v-if="vm.ocrText">
      <summary>Recognised text</summary>
      <textarea id="thyroid-ocr-preview" :value="vm.ocrText" rows="8" readonly></textarea>
    </details>
  </div>
</template>
