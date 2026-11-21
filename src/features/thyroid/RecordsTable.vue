<script setup lang="ts">
import { reactive, ref } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppDialog from '../../shared/ui/AppDialog.vue';
import { requestConfirm } from '../../shared/ui/useConfirm';
import { deleteThyroidResultConfirm } from '../../shared/ui/confirmCopy';
import { useThyroid } from './useThyroid';

const vm = reactive(useThyroid());
const dialogOpen = ref(false);
const dialogMode = ref<'export' | 'import'>('export');
const exportText = ref('');
const importStatus = ref('');

function openExport(): void {
  exportText.value = vm.exportJson();
  importStatus.value = '';
  dialogMode.value = 'export';
  dialogOpen.value = true;
}

function openImport(): void {
  exportText.value = '';
  importStatus.value = '';
  dialogMode.value = 'import';
  dialogOpen.value = true;
}

function runImport(): void {
  if (!exportText.value.trim()) {
    importStatus.value = 'Paste JSON to import.';
    return;
  }
  try {
    vm.importJson(exportText.value);
    dialogOpen.value = false;
  } catch (error) {
    importStatus.value = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function onDelete(id: string, date: string): Promise<void> {
  if (await requestConfirm(deleteThyroidResultConfirm(date))) vm.deleteRecord(id);
}
</script>

<template>
  <div class="thyroid-history">
    <div class="sec-head-actions">
      <AppButton id="thyroid-export" @click="openExport">Export JSON</AppButton>
      <AppButton id="thyroid-import" @click="openImport">Import JSON</AppButton>
    </div>

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

    <AppDialog
      v-model="dialogOpen"
      :title="dialogMode === 'export' ? 'Export JSON' : 'Import JSON'"
      width="560px"
    >
      <textarea
        id="thyroid-export-text"
        v-model="exportText"
        class="thyroid-json-textarea"
        aria-label="Thyroid data JSON"
        :placeholder="dialogMode === 'export'
          ? 'Select and copy this JSON to back up your data.'
          : 'Paste exported JSON here to import.'"
      ></textarea>
      <p v-if="importStatus" class="status" role="status">{{ importStatus }}</p>
      <template #footer>
        <AppButton @click="dialogOpen = false">Close</AppButton>
        <AppButton v-if="dialogMode === 'import'" variant="primary" @click="runImport">Import</AppButton>
      </template>
    </AppDialog>
  </div>
</template>
