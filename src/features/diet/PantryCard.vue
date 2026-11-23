<script setup lang="ts">
import { computed, ref } from 'vue';
import { requestConfirm } from '../../shared/ui/useConfirm';
import { clearPantryConfirm } from './confirmCopy';
import { PANTRY_SEPARATOR, splitPantryText } from './pantryInput';
import { useDiet } from './useDiet';

const {
  pantry,
  addPantryMany,
  removePantry,
  setPantryLow,
  clearPantry,
} = useDiet();

const draft = ref('');
const filterText = ref('');
/** Keep the card compact until the list is long enough to need filtering. */
const showFilter = computed(() => pantry.value.length > 12);

const visibleItems = computed(() => {
  const query = filterText.value.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!showFilter.value || !query) return pantry.value;
  return pantry.value.filter((item) => item.name.toLowerCase().includes(query));
});

function addDraft(): void {
  if (!draft.value.trim()) return;
  void addPantryMany(splitPantryText(draft.value));
  draft.value = '';
}

function onPantryKeydown(event: KeyboardEvent): void {
  if (event.key === ',') {
    event.preventDefault();
    addDraft();
    return;
  }
  if (event.key === 'Backspace' && !draft.value && pantry.value.length) {
    event.preventDefault();
    void removePantry(pantry.value[pantry.value.length - 1].id);
  }
}

function onPantryPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text') ?? '';
  if (!PANTRY_SEPARATOR.test(text)) return;
  event.preventDefault();
  void addPantryMany(splitPantryText(text));
  draft.value = '';
}

const BOUGHT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Stable English "22 Nov" label, independent of the browser locale. */
function boughtLabel(at: number): string {
  const date = new Date(at);
  return `${date.getDate()} ${BOUGHT_MONTHS[date.getMonth()]}`;
}

async function onClear(): Promise<void> {
  if (!pantry.value.length) return;
  if (await requestConfirm(clearPantryConfirm(pantry.value.length))) await clearPantry();
}
</script>

<template>
  <section id="pantry-card" class="panel pantry-panel" aria-labelledby="pantry-heading">
    <div class="sec-head">
      <h2 id="pantry-heading">At home</h2>
      <span class="chip" :aria-label="`${pantry.length} items at home`">
        {{ pantry.length }} {{ pantry.length === 1 ? 'item' : 'items' }}
      </span>
    </div>

    <div class="pantry-input-wrap">
      <input
        id="pantry-add-input"
        v-model="draft"
        class="pantry-input"
        type="text"
        enterkeyhint="done"
        autocomplete="off"
        placeholder="Type an item and press Enter or comma"
        @keydown.enter.prevent="addDraft()"
        @keydown="onPantryKeydown"
        @paste="onPantryPaste"
        @blur="addDraft()"
      />
      <p class="field-hint">Press Enter or comma to add</p>
    </div>

    <input
      v-if="showFilter"
      v-model="filterText"
      class="pantry-filter"
      type="search"
      placeholder="Filter items at home"
      aria-label="Filter items at home"
    />

    <div v-if="pantry.length" class="pantry-chips" aria-label="Foods at home">
      <span
        v-for="item in visibleItems"
        :key="item.id"
        class="pantry-chip"
        :class="{ 'is-low': item.low }"
      >
        <span class="pantry-name">{{ item.name }}</span>
        <label class="low-toggle" :title="item.low ? 'Mark as available' : 'Mark as running low'">
          <input
            type="checkbox"
            :checked="item.low === true"
            @change="setPantryLow(item.id, ($event.target as HTMLInputElement).checked)"
          />
          <span>Running low</span>
        </label>
        <span v-if="item.source === 'shopping' && item.boughtAt" class="bought-tag">
          Bought {{ boughtLabel(item.boughtAt) }}
        </span>
        <button
          type="button"
          class="chip-remove"
          :aria-label="`Remove ${item.name}`"
          @click="removePantry(item.id)"
        >×</button>
      </span>
      <p v-if="!visibleItems.length" class="no-match">No items match “{{ filterText }}”.</p>
    </div>
    <p v-else class="pantry-empty">
      Nothing saved yet. Add what you have to keep the shopping list short.
    </p>

    <div class="pantry-footer">
      <button type="button" class="mini-btn danger" :disabled="!pantry.length" @click="onClear">
        Clear all
      </button>
    </div>
  </section>
</template>

<style scoped>
.pantry-panel {
  min-width: 0;
}

.pantry-input-wrap {
  display: block;
}

.pantry-input,
.pantry-filter {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 36px;
  padding: 0 10px;
  border: 1.5px solid var(--line);
  border-radius: var(--radius-buttons);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
}

.pantry-filter {
  margin-top: 8px;
}

.field-hint {
  margin: 4px 0 0;
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.4;
}

.pantry-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.pantry-chip {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  max-width: 100%;
  padding: 4px 6px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  border-radius: var(--radius-buttons);
  background: color-mix(in srgb, var(--surface-2) 60%, var(--surface));
  font-size: 12px;
}

.pantry-chip.is-low {
  border-color: color-mix(in srgb, var(--warn, #b7791f) 55%, var(--line));
  background: color-mix(in srgb, var(--warn, #b7791f) 10%, var(--surface));
}

.pantry-name {
  font-weight: var(--font-weight-medium);
  overflow-wrap: anywhere;
}

.low-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--ink-2);
  font-size: 10px;
  cursor: pointer;
}

.low-toggle input {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--warn, #b7791f);
}

.bought-tag {
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--ink-2);
  font-size: 10px;
  white-space: nowrap;
}

.chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ink-2);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.chip-remove:hover {
  background: color-mix(in srgb, var(--danger, #c53030) 14%, transparent);
  color: var(--danger, #c53030);
}

.pantry-empty,
.no-match {
  margin: 10px 0 0;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.5;
}

.pantry-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.mini-btn {
  min-height: 28px;
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-buttons);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.mini-btn.danger {
  border-color: color-mix(in srgb, var(--danger, #c53030) 55%, var(--line));
  color: var(--danger, #c53030);
}

.mini-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
