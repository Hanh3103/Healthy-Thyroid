<script setup lang="ts">
import { reactive, ref } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import { useThyroid } from './useThyroid';

const vm = reactive(useThyroid());
const exportText = ref('');

function onExport(): void {
  exportText.value = vm.exportJson();
}

function onImport(): void {
  if (!exportText.value.trim()) return;
  try {
    vm.importJson(exportText.value);
  } catch (error) {
    vm.scanStatus = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function onDelete(id: string, date: string): void {
  if (window.confirm(`Delete the blood result from ${date}?`)) vm.deleteRecord(id);
}
</script>

<template>
  <div class="thyroid-history">
    <div class="sec-head-actions">
      <AppButton id="thyroid-export" @click="onExport">Export JSON</AppButton>
      <AppButton id="thyroid-import" @click="onImport">Import JSON</AppButton>
    </div>

    <textarea
      id="thyroid-export-text"
      v-model="exportText"
      aria-label="Thyroid data JSON"
      placeholder="Export creates JSON here; paste JSON here to import."
    ></textarea>
    <p v-if="vm.scanStatus && !vm.scanStatus.startsWith('Scan')" class="status" role="status">{{ vm.scanStatus }}</p>

    <p id="thyroid-record-count" class="thyroid-footnote">
      {{ vm.history.count }} record{{ vm.history.count === 1 ? '' : 's' }}
    </p>

    <div class="thyroid-table-wrap">
      <table class="thyroid-table">
        <thead>
          <tr>
            <th>Date</th>
            <th v-for="column in vm.history.columns" :key="column.key" :title="column.title">{{ column.label }}</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="thyroid-record-body">
          <tr v-for="row in vm.history.rows" :key="row.id" :data-record-id="row.id">
            <td>{{ row.date }}</td>
            <td v-for="cell in row.cells" :key="cell.key" :title="cell.title">
              <template v-if="cell.value === null">-</template>
              <template v-else-if="cell.status === 'low' || cell.status === 'high'">
                <span :class="`thyroid-value-${cell.status}`" :aria-label="`${cell.text} ${cell.unit}, ${cell.status} expected range`">
                  {{ cell.text }}<span class="thyroid-history-unit">{{ cell.unit }}</span>
                  <span class="thyroid-value-flag" aria-hidden="true">{{ cell.status === 'high' ? '↑' : '↓' }}</span>
                </span>
              </template>
              <template v-else>
                {{ cell.text }}<span v-if="cell.unit" class="thyroid-history-unit">{{ cell.unit }}</span>
              </template>
            </td>
            <td>
              <button type="button" class="ghost btn-sm" title="Edit record" @click="vm.fillForm(row.record)">Edit</button>
              <button type="button" class="ghost btn-sm" title="Delete record" @click="onDelete(row.id, row.date)">Delete</button>
            </td>
          </tr>
          <tr v-if="vm.history.rows.length === 0">
            <td :colspan="vm.history.columns.length + 2">No blood results yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
