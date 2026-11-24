<script setup lang="ts">
import { computed, ref } from 'vue';
import { keyOf } from '../../shared/utils';
import type { ShoppingItem } from './model';
import { planningWeekFor } from './model';
import { useDiet } from './useDiet';

/** Mirrors the filter contract exposed by useDiet(). */
type ShoppingFilter = 'all' | 'today' | 'tomorrow' | 'this-week' | 'next-week' | { date: string };
type ChipKey = Exclude<ShoppingFilter, { date: string }>;

const {
  shopping,
  shoppingMerge,
  shoppingUpdateStatus,
  shoppingUpdateError,
  shoppingFilter,
  setShoppingFilter,
  shoppingCountForDate,
  lastBought,
  boughtNotice,
  recentlyBought,
  toggleShopping,
  addShopping,
  editShopping,
  untickBought,
  clearBought,
  removeShopping,
  undoShoppingRemoval,
  shoppingNotice,
  keepShopping,
  keepAllShopping,
  removeAllNoLongerNeeded,
  undoBought,
  undoShoppingMerge,
  dismissShoppingMerge,
  retryShoppingUpdate,
  undoShoppingUpdate,
} = useDiet();

const draft = ref('');
const qty = ref('');
const selectedDays = ref<string[]>([]);
const editingId = ref('');
const editName = ref('');
const editQty = ref('');
const review = ref(false);

const now = new Date();
const todayKey = keyOf(now);
const tomorrowKey = keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12));
const nextWeekKey = keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12));
const thisWeekKeys = new Set(planningWeekFor(todayKey).dates);
const nextWeekKeys = new Set(planningWeekFor(nextWeekKey).dates);

function weekdayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function daysLabel(days: string[]): string {
  return [...days].sort().map(weekdayLabel).join(', ');
}

/** Next 14 days, today included, as compact locale-aware weekday chips. */
const pickerDays = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index, 12);
  const key = keyOf(date);
  return {
    key,
    label: weekdayLabel(key),
    title: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
  };
});

const daySummary = computed(() => selectedDays.value.length ? daysLabel(selectedDays.value) : 'Any day');

function toggleDay(key: string): void {
  selectedDays.value = selectedDays.value.includes(key)
    ? selectedDays.value.filter((day) => day !== key)
    : [...selectedDays.value, key];
}

/** Open AI items that are no longer part of any plan move to the collapsed section. */
function isNoLongerNeeded(item: ShoppingItem): boolean {
  return item.status === 'open'
    && item.source === 'ai'
    && !item.runningLow
    && !item.inPlan;
}

/** Exactly one source tag per row, with Running low taking priority. */
function sourceTag(item: ShoppingItem): string {
  if (item.runningLow || item.source === 'pantry') return 'Running low';
  if (item.source === 'user') return 'Added by me';
  if (item.isNew) return 'New';
  return '';
}

const recentBoughtSet = computed(() => new Set(recentlyBought.value));

/** Open rows plus the just-ticked rows that are still showing their strike-through. */
const activeItems = computed(() => shopping.value.filter((item) => {
  if (item.status === 'removed' || isNoLongerNeeded(item)) return false;
  if (item.status === 'bought') return recentBoughtSet.value.has(item.id);
  return true;
}));

/** Everything bought, once its brief active-list linger has finished. */
const boughtItems = computed(() => shopping.value.filter((item) =>
  item.status === 'bought' && !recentBoughtSet.value.has(item.id)));

const progress = computed(() => {
  const relevant = shopping.value.filter((item) =>
    item.status !== 'removed' && !isNoLongerNeeded(item));
  return {
    total: relevant.length,
    bought: relevant.filter((item) => item.status === 'bought').length,
  };
});

const noLongerNeeded = computed(() => shopping.value.filter(isNoLongerNeeded));

function matchesFilter(item: ShoppingItem): boolean {
  const filter = shoppingFilter.value;
  if (filter === 'all') return true;
  if (typeof filter === 'object' && filter !== null) return item.forDays.includes(filter.date);
  if (filter === 'today') return item.forDays.includes(todayKey);
  if (filter === 'tomorrow') return item.forDays.includes(tomorrowKey);
  if (filter === 'this-week') return item.forDays.some((day) => thisWeekKeys.has(day));
  if (filter === 'next-week') return item.forDays.some((day) => nextWeekKeys.has(day));
  return true;
}

/** Deliberately keeps the incoming order of `shopping` (already soonest first). */
const visibleItems = computed(() => activeItems.value.filter((item) =>
  item.status === 'bought' ? true : matchesFilter(item)));

const chipOptions = computed<Array<{ key: ChipKey; label: string; count: number }>>(() => [
  { key: 'all', label: 'All', count: activeItems.value.length },
  { key: 'today', label: 'Today', count: shoppingCountForDate(todayKey) },
  { key: 'tomorrow', label: 'Tomorrow', count: shoppingCountForDate(tomorrowKey) },
  { key: 'this-week', label: 'This week', count: [...thisWeekKeys].reduce((sum, day) => sum + shoppingCountForDate(day), 0) },
  { key: 'next-week', label: 'Next week', count: [...nextWeekKeys].reduce((sum, day) => sum + shoppingCountForDate(day), 0) },
]);

function isActiveChip(key: ChipKey): boolean {
  return shoppingFilter.value === key;
}

const mergeSummary = computed(() => shoppingMerge.value?.summary ?? null);
const mergeNew = computed(() => shoppingMerge.value?.after.filter((item) => item.isNew) ?? []);
const mergeGone = computed(() => shoppingMerge.value?.after.filter(isNoLongerNeeded) ?? []);

function add(): void {
  const name = draft.value.trim();
  if (!name) return;
  void addShopping(name, qty.value.trim(), [...selectedDays.value].sort());
  draft.value = '';
  qty.value = '';
  selectedDays.value = [];
}

function startEdit(item: ShoppingItem): void {
  editingId.value = item.id;
  editName.value = item.name;
  editQty.value = item.quantity ?? '';
}

function saveEdit(): void {
  const id = editingId.value;
  const name = editName.value.trim();
  if (!id || !name) return;
  void editShopping(id, name, editQty.value.trim());
  editingId.value = '';
}

function cancelEdit(): void {
  editingId.value = '';
}

function onToggle(id: string, event: Event): void {
  void toggleShopping(id, (event.target as HTMLInputElement).checked);
}

function onRemove(id: string): void {
  void removeShopping(id);
}

function onKeep(id: string): void {
  void keepShopping(id);
}

function onKeepAll(): void {
  void keepAllShopping();
}

function onRemoveAll(): void {
  void removeAllNoLongerNeeded();
}

function onUndoBought(): void {
  void undoBought();
}

function onUndoShoppingRemoval(): void {
  void undoShoppingRemoval();
}

function onUntickBought(id: string): void {
  void untickBought(id);
}

function onClearBought(): void {
  void clearBought();
}

function onUndoMerge(): void {
  void undoShoppingMerge();
}

function onDismissMerge(): void {
  dismissShoppingMerge();
}

function onRetryUpdate(): void {
  void retryShoppingUpdate();
}

function onUndoUpdate(): void {
  void undoShoppingUpdate();
}
</script>

<template>
  <section id="shopping-list-card" class="panel shopping-panel" aria-labelledby="shopping-list-heading">
    <div class="sec-head">
      <h2 id="shopping-list-heading">Shopping list</h2>
      <span class="chip progress-chip">{{ progress.bought }} of {{ progress.total }} bought</span>
    </div>

    <div class="shopping-filters" role="group" aria-label="Filter shopping list">
      <button
        v-for="option in chipOptions"
        :key="option.key"
        type="button"
        class="chip filter-chip"
        :class="{ 'is-active': isActiveChip(option.key) }"
        :aria-pressed="isActiveChip(option.key)"
        @click="setShoppingFilter(option.key)"
      >
        {{ option.label }} <span class="filter-count">{{ option.count }}</span>
      </button>
    </div>

    <div class="shopping-update" aria-live="polite">
      <p v-if="shoppingUpdateStatus === 'updating'" class="update-msg">
        <span class="spinner" aria-hidden="true"></span> Updating shopping list...
      </p>
      <p v-else-if="shoppingUpdateStatus === 'done'" class="update-msg is-done">
        Shopping list updated
        <button type="button" class="link-btn" @click="onUndoUpdate">Undo</button>
        <button type="button" class="link-btn" @click="onRetryUpdate">Retry</button>
      </p>
      <p v-else-if="shoppingUpdateStatus === 'error'" class="update-msg is-error">
        {{ shoppingUpdateError || 'Could not update the shopping list' }}
        <button type="button" class="link-btn" @click="onRetryUpdate">Retry</button>
        <button type="button" class="link-btn" @click="onUndoUpdate">Undo</button>
      </p>
    </div>

    <p v-if="shoppingNotice" class="removal-notice" role="status">
      {{ shoppingNotice }}
      <button type="button" class="link-btn" @click="onUndoShoppingRemoval">Undo</button>
    </p>

    <p v-if="boughtNotice" class="bought-notice" role="status">
      {{ boughtNotice }}
      <button v-if="lastBought" type="button" class="link-btn" @click="onUndoBought">Undo</button>
    </p>

    <form class="shopping-add" @submit.prevent="add">
      <input
        v-model="draft"
        class="shopping-input"
        type="text"
        placeholder="Add item (Enter adds, commas for several)"
        aria-label="Add shopping item"
      />
      <input v-model="qty" class="shopping-input qty" type="text" placeholder="Qty" aria-label="Quantity (optional)" />
      <button type="submit" class="mini-btn primary">Add</button>
      <details class="day-picker">
        <summary class="day-summary">Days: <strong>{{ daySummary }}</strong></summary>
        <div class="day-options" role="group" aria-label="Add item for days">
          <button
            v-for="day in pickerDays"
            :key="day.key"
            type="button"
            class="day-option"
            :class="{ 'is-selected': selectedDays.includes(day.key) }"
            :aria-pressed="selectedDays.includes(day.key)"
            :title="day.title"
            @click="toggleDay(day.key)"
          >{{ day.label }}</button>
        </div>
      </details>
    </form>

    <div
      v-if="mergeSummary && (mergeSummary.added || mergeSummary.noLongerNeeded)"
      class="shopping-merge"
      role="status"
    >
      <div class="merge-row">
        <span>{{ mergeSummary.added }} new items, {{ mergeSummary.noLongerNeeded }} no longer needed</span>
        <div class="merge-actions">
          <button type="button" class="link-btn" @click="review = !review">
            {{ review ? 'Hide changes' : 'Review changes' }}
          </button>
          <button type="button" class="link-btn" @click="onUndoMerge">Undo</button>
          <button type="button" class="link-btn" @click="onDismissMerge">Dismiss</button>
        </div>
      </div>
      <div v-if="review" class="merge-details">
        <div v-if="mergeNew.length" class="merge-group">
          <strong>New:</strong>
          <ul>
            <li v-for="item in mergeNew" :key="item.id">{{ item.name }}</li>
          </ul>
        </div>
        <div v-if="mergeGone.length" class="merge-group">
          <strong>No longer needed:</strong>
          <ul>
            <li v-for="item in mergeGone" :key="item.id">{{ item.name }}</li>
          </ul>
        </div>
      </div>
    </div>

    <ul v-if="visibleItems.length" class="shopping-list">
      <li v-for="item in visibleItems" :key="item.id" :class="{ bought: item.status === 'bought' }">
        <form v-if="editingId === item.id" class="shopping-edit" @submit.prevent="saveEdit">
          <input v-model="editName" class="shopping-input" type="text" aria-label="Item name" />
          <input v-model="editQty" class="shopping-input qty" type="text" aria-label="Quantity" />
          <button type="submit" class="mini-btn primary">Save</button>
          <button type="button" class="mini-btn" @click="cancelEdit">Cancel</button>
        </form>
        <template v-else>
          <div class="shopping-row-main">
            <label class="shopping-label">
              <input type="checkbox" :checked="item.status === 'bought'" @change="onToggle(item.id, $event)" />
              <span class="shopping-name">
                {{ item.name }}<span v-if="item.quantity" class="shopping-qty"> ({{ item.quantity }})</span>
              </span>
            </label>
            <div v-if="item.status !== 'bought'" class="shopping-meta">
              <span v-if="item.forDays.length" class="day-tag">{{ daysLabel(item.forDays) }}</span>
              <span
                v-if="sourceTag(item)"
                class="chip item-chip"
                :class="{ 'is-low': sourceTag(item) === 'Running low', 'is-new': sourceTag(item) === 'New' }"
              >{{ sourceTag(item) }}</span>
            </div>
          </div>
          <div class="shopping-actions">
            <button type="button" class="icon-btn" :aria-label="`Edit ${item.name}`" @click="startEdit(item)">✎</button>
            <button
              type="button"
              class="icon-btn remove"
              :aria-label="`Remove ${item.name} from list`"
              @click="onRemove(item.id)"
            >×</button>
          </div>
        </template>
      </li>
    </ul>
    <p v-else class="muted shopping-empty">Nothing to buy — add your own items or generate a plan.</p>

    <details class="no-longer-needed">
      <summary class="nl-summary">No longer needed ({{ noLongerNeeded.length }})</summary>
      <div v-if="noLongerNeeded.length" class="nl-body">
        <div class="nl-actions">
          <button type="button" class="mini-btn" @click="onKeepAll">Keep all</button>
          <button type="button" class="mini-btn" @click="onRemoveAll">Remove all</button>
        </div>
        <ul class="nl-list">
          <li v-for="item in noLongerNeeded" :key="item.id">
            <span class="nl-name">
              {{ item.name }}<span v-if="item.quantity" class="shopping-qty"> ({{ item.quantity }})</span>
            </span>
            <span v-if="item.forDays.length" class="day-tag">{{ daysLabel(item.forDays) }}</span>
            <div class="nl-row-actions">
              <button type="button" class="link-btn" @click="onKeep(item.id)">Keep</button>
              <button type="button" class="link-btn danger" @click="onRemove(item.id)">Remove</button>
            </div>
          </li>
        </ul>
      </div>
      <p v-else class="muted nl-empty">Nothing here.</p>
    </details>

    <details class="bought-section">
      <summary class="bought-summary">Bought ({{ boughtItems.length }})</summary>
      <div v-if="boughtItems.length" class="bought-body">
        <div class="bought-actions">
          <button type="button" class="mini-btn" @click="onClearBought">Clear bought</button>
        </div>
        <ul class="bought-list">
          <li v-for="item in boughtItems" :key="item.id">
            <span class="bought-name">
              <s>{{ item.name }}</s><span v-if="item.quantity" class="shopping-qty"> ({{ item.quantity }})</span>
            </span>
            <button
              type="button"
              class="link-btn"
              :aria-label="`Untick ${item.name}`"
              @click="onUntickBought(item.id)"
            >Undo</button>
          </li>
        </ul>
      </div>
      <p v-else class="muted bought-empty">Nothing bought yet.</p>
    </details>
  </section>
</template>

<style scoped>
.shopping-filters { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.filter-chip { cursor: pointer; font-size: 11px; background: transparent; color: var(--ink-2); }
.filter-chip.is-active { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
.filter-count { opacity: 0.7; font-variant-numeric: tabular-nums; }
.shopping-empty, .nl-empty { font-size: 12px; line-height: 1.45; }
.shopping-update { min-height: 0; }
.shopping-update:empty { display: none; }
.removal-notice { margin: 6px 0 0; font-size: 12px; color: var(--ink-2); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bought-notice { margin: 6px 0 0; font-size: 12px; color: var(--ok, #2f855a); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.progress-chip { font-variant-numeric: tabular-nums; }
.update-msg { margin: 6px 0 0; font-size: 12px; color: var(--ink-2); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.update-msg.is-done { color: var(--ok, #2f855a); }
.update-msg.is-error { color: var(--danger); }
.spinner { width: 12px; height: 12px; border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; flex: 0 0 auto; }
@keyframes spin { to { transform: rotate(360deg); } }
.shopping-add { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; align-items: flex-start; }
.shopping-input { flex: 1 1 180px; min-width: 0; height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--radius-buttons); background: var(--surface); color: var(--ink); font: inherit; font-size: 12px; }
.shopping-input.qty { flex: 0 0 72px; }
.mini-btn { height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius-buttons); background: var(--surface); color: var(--ink); font: inherit; font-size: 12px; cursor: pointer; }
.mini-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.day-picker { position: relative; flex: 0 0 auto; }
.day-summary { height: 32px; display: flex; align-items: center; gap: 4px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius-buttons); background: var(--surface); color: var(--ink-2); font-size: 11px; cursor: pointer; white-space: nowrap; }
.day-summary strong { color: var(--ink); font-weight: 600; }
.day-options { position: absolute; z-index: 5; top: calc(100% + 4px); right: 0; width: 248px; padding: 8px; display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); box-shadow: 0 8px 20px color-mix(in srgb, var(--ink) 16%, transparent); }
.day-option { padding: 5px 0; border: 1px solid var(--line); border-radius: var(--radius-buttons); background: var(--surface-2); color: var(--ink-2); font: inherit; font-size: 10px; cursor: pointer; }
.day-option.is-selected { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.shopping-merge { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line)); border-radius: var(--radius-buttons); background: color-mix(in srgb, var(--accent) 6%, var(--surface)); font-size: 12px; }
.merge-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.merge-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.merge-details { font-size: 11px; color: var(--ink-2); display: flex; flex-direction: column; gap: 4px; }
.merge-details p { margin: 0; }
.merge-group ul { margin: 2px 0 0; padding-left: 16px; }
.link-btn { padding: 0; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 11px; cursor: pointer; text-decoration: underline; }
.link-btn.danger { color: var(--danger); }
.shopping-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.shopping-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface-2) 45%, transparent); flex-wrap: wrap; }
.shopping-list li.bought .shopping-name { text-decoration: line-through; color: var(--ink-2); }
.shopping-row-main { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.shopping-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; min-width: 0; }
.shopping-name { overflow-wrap: anywhere; }
.shopping-qty { color: var(--ink-2); }
.shopping-meta { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
.day-tag { font-size: 10px; color: var(--ink-2); border: 1px solid var(--line); border-radius: var(--radius-buttons); padding: 1px 5px; white-space: nowrap; }
.item-chip { font-size: 10px; }
.item-chip.is-new { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); }
.item-chip.is-low { color: var(--warn, #b7791f); border-color: color-mix(in srgb, var(--warn, #b7791f) 45%, var(--line)); }
.shopping-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.icon-btn { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: var(--radius-buttons); background: transparent; color: var(--ink-2); font-size: 15px; line-height: 1; cursor: pointer; }
.icon-btn:hover { border-color: var(--line); background: var(--surface); color: var(--ink); }
.icon-btn.remove { font-size: 18px; }
.pantry-note { flex: 1 1 100%; margin: 0; font-size: 11px; color: var(--ok, #2f855a); }
.shopping-edit { display: flex; gap: 6px; width: 100%; flex-wrap: wrap; }
.no-longer-needed { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 8px; }
.nl-summary { cursor: pointer; font-size: 12px; color: var(--ink-2); }
.nl-body { margin-top: 8px; }
.nl-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.nl-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.nl-list li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 5px 8px; border: 1px solid var(--line); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface-2) 35%, transparent); font-size: 12px; }
.nl-name { overflow-wrap: anywhere; }
.nl-row-actions { display: flex; gap: 8px; margin-left: auto; }
.bought-section { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 8px; }
.bought-summary { cursor: pointer; font-size: 12px; color: var(--ink-2); }
.bought-body { margin-top: 8px; }
.bought-actions { display: flex; justify-content: flex-end; }
.bought-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.bought-list li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 5px 8px; border: 1px solid var(--line); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface-2) 35%, transparent); font-size: 12px; }
.bought-name { overflow-wrap: anywhere; color: var(--ink-2); }
.bought-list .link-btn { margin-left: auto; }
.bought-empty { font-size: 12px; line-height: 1.45; }
</style>
