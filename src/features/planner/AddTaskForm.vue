<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import AppInput from '../../shared/ui/AppInput.vue';
import AppDateField from '../../shared/ui/AppDateField.vue';
import AppNumberInput from '../../shared/ui/AppNumberInput.vue';
import AppButton from '../../shared/ui/AppButton.vue';
import { usePlanner } from './usePlanner';

const { taskAddOpen, addTask, addBulkTasks } = usePlanner();

const form = ref({ title: '', due: '', minutes: undefined as number | undefined });
const bulk = ref('');

function focusTitle(): void {
  document.getElementById('t-title-vue')?.focus();
}

function reset(): void {
  form.value = { title: '', due: '', minutes: undefined };
  bulk.value = '';
}

function cancel(): void {
  reset();
  taskAddOpen.value = false;
}

watch(taskAddOpen, async (open) => {
  if (!open) return;
  await nextTick();
  focusTitle();
});

function onSubmit(): void {
  const title = form.value.title.trim();
  if (!title) return;
  addTask(title, form.value.due || '', Number(form.value.minutes || 0));
  reset();
  void nextTick(focusTitle);
}

function onBulkAdd(): void {
  addBulkTasks(bulk.value);
  bulk.value = '';
}
</script>

<template>
  <div v-show="taskAddOpen" id="task-add-panel">
    <form class="add task-add-form" autocomplete="off" @submit.prevent="onSubmit">
      <div class="grow">
        <AppInput
          id="t-title-vue"
          v-model="form.title"
          label="Task"
          placeholder="e.g. Tailor CV for the next application"
          :maxlength="140"
          required
        />
      </div>
      <div class="field-due">
        <AppDateField id="t-due-vue" v-model="form.due" label="Due (optional)" placeholder="DD/MM/YYYY" />
      </div>
      <div class="field-minutes">
        <AppNumberInput
          id="t-minutes-vue"
          v-model="form.minutes"
          label="Estimate time (optional)"
          :min="5"
          :max="360"
          :step="5"
          placeholder="Minutes"
        />
      </div>
      <div class="actions task-add-actions">
        <AppButton variant="ghost" size="sm" type="button" :equal="true" @click="cancel">Cancel</AppButton>
        <AppButton variant="primary" size="sm" type="submit" :equal="true">Add</AppButton>
      </div>
    </form>
    <p class="muted hint-line">Only type what the task is. Time, urgency, and due date can be set later.</p>
    <details class="hint-line">
      <summary>Paste a list instead</summary>
      <p class="muted">One task per line.</p>
      <el-input v-model="bulk" type="textarea" :rows="4" aria-label="Tasks, one per line" placeholder="Reply to recruiter&#10;Write portfolio README&#10;Practise interview answers" />
      <div class="actions"><AppButton variant="ghost" size="sm" @click="onBulkAdd">Add lines as tasks</AppButton></div>
    </details>
  </div>
</template>

<style scoped>
#task-add-panel { 
  margin-bottom: var(--spacing-12); 
  padding: var(--spacing-12); 
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 92%, var(--bg)) 0%, var(--surface-2) 100%); 
  border: 1px solid color-mix(in srgb, var(--line) 90%, transparent); 
  border-radius: var(--radius-cards); 
  box-shadow: inset 0 1px 2px color-mix(in srgb, black 8%, transparent), 0 1px 0 color-mix(in srgb, white 25%, transparent); 
}
.task-add-form { 
  display: flex; 
  flex-wrap: wrap; 
  gap: var(--spacing-12); 
  row-gap: var(--spacing-14, 14px); 
  align-items: flex-end; }
.task-add-form .grow { flex: 1 1 200px; min-width: 0; }
.task-add-form .field-due { flex: 0 0 190px; min-width: 0; }
.task-add-form .field-minutes { flex: 0 0 140px; min-width: 0; }
.task-add-actions { align-items: center; margin-left: auto; }
</style>
