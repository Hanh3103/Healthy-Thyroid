<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppInput from '../../shared/ui/AppInput.vue';
import { requestConfirm } from '../../shared/ui/useConfirm';
import { deleteActualConfirm } from './confirmCopy';
import type { ActualEntry, MealSlot, MealStatus } from './model';

const props = withDefaults(defineProps<{
  entries: ActualEntry[];
  date: string;
  dates?: string[];
  fixedDate?: boolean;
  addLabel?: string;
}>(), {
  dates: () => [],
  fixedDate: false,
  addLabel: 'Add',
});

const emit = defineEmits<{
  add: [{ slot: MealSlot; text: string; status: MealStatus; date: string }];
  update: [id: string, text: string];
  delete: [id: string];
}>();

const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const statuses: { value: MealStatus; label: string }[] = [
  { value: 'ate', label: 'Ate this' },
  { value: 'ate-other', label: 'Ate something else' },
  { value: 'skipped', label: 'Skipped' },
];

const open = ref(false);
const slot = ref<MealSlot>('lunch');
const status = ref<MealStatus>('ate');
const text = ref('');
const editingId = ref('');
const editingText = ref('');
const selectedDate = ref(props.date);

watch(() => props.date, (date) => { selectedDate.value = date; });

const availableDates = computed(() => [...new Set([selectedDate.value, ...props.dates, ...props.entries.map((entry) => entry.date)])].sort());
const dayEntries = computed(() => props.entries.filter((entry) => entry.date === selectedDate.value));
const summary = computed(() => dayEntries.value.length === 0
  ? 'No entries yet'
  : `${dayEntries.value.length} entr${dayEntries.value.length === 1 ? 'y' : 'ies'}`);

function toggle(): void {
  open.value = !open.value;
}

function add(): void {
  const clean = text.value.trim();
  if (!clean) return;
  emit('add', {
    slot: slot.value,
    text: clean,
    status: status.value,
    date: selectedDate.value,
  });
  text.value = '';
  open.value = true;
}

function startEdit(entry: ActualEntry): void {
  editingId.value = entry.id;
  editingText.value = entry.text;
}

function saveEdit(): void {
  if (!editingId.value || !editingText.value.trim()) return;
  emit('update', editingId.value, editingText.value);
  editingId.value = '';
  editingText.value = '';
}

async function remove(entry: ActualEntry): Promise<void> {
  const confirmed = await requestConfirm(deleteActualConfirm(entry.text));
  if (confirmed) emit('delete', entry.id);
}
</script>

<template>
  <section class="actual-panel" aria-labelledby="actual-heading">
    <div class="actual-head">
      <button
        type="button"
        class="actual-toggle"
        :aria-expanded="open"
        aria-controls="actual-body"
        @click="toggle"
      >
        <span class="actual-title" id="actual-heading">What I ate</span>
        <span class="actual-summary">{{ summary }}</span>
      </button>
      <AppButton size="sm" variant="ghost" @click="open = true">Add</AppButton>
    </div>

    <div v-if="open" id="actual-body" class="actual-body-wrap">
      <label v-if="!fixedDate" class="actual-date-label">
        <span>Day</span>
        <select v-model="selectedDate">
          <option v-for="date in availableDates" :key="date" :value="date">{{ date }}</option>
        </select>
      </label>

      <div class="actual-form">
        <label>
          <span>Meal</span>
          <select v-model="slot">
            <option v-for="option in slots" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select v-model="status">
            <option v-for="option in statuses" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
      </div>
      <AppInput id="actual-text" v-model="text" label="What you ate" placeholder="e.g. lentil soup and a pear" />
      <div class="actual-add">
        <AppButton size="sm" variant="primary" @click="add()">Save entry</AppButton>
      </div>

      <ul v-if="dayEntries.length" class="actual-list">
        <li v-for="entry in dayEntries" :key="entry.id">
          <span class="chip actual-status" :data-status="entry.status">{{ entry.status }}</span>
          <div class="actual-entry">
            <template v-if="editingId === entry.id">
              <input v-model="editingText" class="actual-edit" type="text" @keydown.enter.prevent="saveEdit()" />
              <div class="actual-entry-actions">
                <AppButton size="sm" variant="primary" @click="saveEdit()">Save</AppButton>
                <AppButton size="sm" @click="editingId = ''">Cancel</AppButton>
              </div>
            </template>
            <template v-else>
              <span class="actual-text">{{ entry.text }}</span>
              <span class="muted actual-slot">{{ entry.slot }}</span>
              <div class="actual-entry-actions">
                <AppButton size="sm" variant="ghost" @click="startEdit(entry)">Edit</AppButton>
                <AppButton size="sm" variant="ghost" @click="remove(entry)">Delete</AppButton>
              </div>
            </template>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.actual-panel {
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: var(--radius-buttons);
  background: color-mix(in srgb, var(--surface-2) 35%, var(--surface));
}

.actual-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
}

.actual-toggle {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.actual-title {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: var(--font-weight-medium);
}

.actual-summary {
  color: var(--ink-2);
  font-size: 11px;
}

.actual-body-wrap {
  padding: 0 10px 10px;
}

.actual-date-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--ink-2);
}

.actual-date-label select,
.actual-form select,
.actual-edit {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-buttons);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: 12px;
}

.actual-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}

.actual-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--ink-2);
}

.actual-add {
  margin-top: 8px;
}

.actual-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.actual-list li {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
}

.actual-status {
  align-self: flex-start;
  font-size: 10px;
  white-space: nowrap;
}

.actual-entry {
  flex: 1;
  min-width: 0;
}

.actual-text {
  display: block;
  font-size: 12px;
  line-height: 1.4;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.actual-slot {
  font-size: 11px;
  text-transform: capitalize;
}

.actual-entry-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.actual-edit {
  width: 100%;
}
</style>
