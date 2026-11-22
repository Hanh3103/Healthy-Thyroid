<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import AppInput from '../../shared/ui/AppInput.vue';
import type { ActualEntry, MealIdea, MealStatus, ThyroidFact } from './model';

type Meal = MealIdea & { id?: string; kind?: 'main' | 'fallback'; status?: MealStatus; day?: string; source?: 'ai' | 'user'; editedAt?: number };

const props = withDefaults(defineProps<{
  meal: Meal;
  facts: ThyroidFact[];
  actions?: boolean;
  actualEntry?: ActualEntry | null;
  suggestAlternative?: (() => Promise<{ idea: string; ingredients: string[]; prepMinutes: number } | null>) | null;
}>(), { actions: false, actualEntry: null, suggestAlternative: null });

const emit = defineEmits<{
  'select-fact': [id: string];
  mark: [status: MealStatus];
  'save-other': [text: string];
  'delete-other': [];
  edit: [payload: { idea: string; ingredients: string[]; prepMinutes: number }];
}>();

const slotLabels = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as const;

const editingOther = ref(false);
const otherText = ref('');
const editingMeal = ref(false);
const editIdea = ref('');
const editIngredients = ref<string[]>([]);
const ingredientDraft = ref('');
const editPrep = ref(10);
const suggesting = ref(false);

watch(() => props.actualEntry?.id, () => {
  editingOther.value = false;
  otherText.value = props.actualEntry?.text ?? '';
});
watch(() => props.meal.id, () => { editingMeal.value = false; });

function clampPrep(value: number | undefined): number {
  const minutes = Math.round(Number(value) || 10);
  return Math.max(1, Math.min(240, minutes));
}

const factText = (id: string): string => props.facts.find((fact) => fact.id === id)?.text ?? id;
const primaryFact = computed(() => props.facts.find((fact) => fact.id === props.meal.factIds[0]) ?? null);
const showOtherForm = computed(() => editingOther.value || (props.meal.status === 'ate-other' && !props.actualEntry));
const isUserMeal = computed(() => props.meal.source === 'user');
const statusLabel = computed(() => {
  if (props.meal.status === 'ate') return 'Eaten';
  if (props.meal.status === 'ate-other') return 'Ate something else';
  if (props.meal.status === 'skipped') return 'Skipped';
  return '';
});

function startOther(): void { otherText.value = props.actualEntry?.text ?? ''; editingOther.value = true; }
function startEditOther(): void { otherText.value = props.actualEntry?.text ?? ''; editingOther.value = true; }
function cancelOther(): void {
  if (props.actualEntry) { editingOther.value = false; otherText.value = props.actualEntry.text; return; }
  editingOther.value = false; otherText.value = ''; emit('mark', 'planned');
}
function saveOther(): void {
  const clean = otherText.value.replace(/\s+/g, ' ').trim();
  if (!clean) return;
  emit('save-other', clean);
  editingOther.value = false;
}

function startEditMeal(): void {
  editIdea.value = props.meal.idea;
  editIngredients.value = [...(props.meal.ingredients ?? [])];
  ingredientDraft.value = '';
  editPrep.value = clampPrep(props.meal.prepMinutes);
  editingMeal.value = true;
}
function cancelEditMeal(): void { editingMeal.value = false; }
function addIngredient(): void {
  const parts = ingredientDraft.value.split(',').map((p) => p.replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean);
  for (const part of parts) if (!editIngredients.value.some((i) => i.toLowerCase() === part.toLowerCase())) editIngredients.value.push(part);
  ingredientDraft.value = '';
}
function removeIngredient(name: string): void { editIngredients.value = editIngredients.value.filter((i) => i !== name); }
function saveEditMeal(): void {
  addIngredient();
  const idea = editIdea.value.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!idea) return;
  emit('edit', { idea, ingredients: [...editIngredients.value], prepMinutes: clampPrep(editPrep.value) });
  editingMeal.value = false;
}

async function suggestAnother(): Promise<void> {
  if (!props.suggestAlternative || suggesting.value) return;
  suggesting.value = true;
  try {
    const suggestion = await props.suggestAlternative();
    if (suggestion) {
      editIdea.value = suggestion.idea;
      editIngredients.value = [...suggestion.ingredients];
      editPrep.value = clampPrep(suggestion.prepMinutes);
      ingredientDraft.value = '';
    }
  } finally {
    suggesting.value = false;
  }
}
</script>

<template>
  <article class="panel meal-card" :data-slot="meal.slot" :data-status="meal.status ?? 'planned'">
    <div class="meal-head">
      <h3 class="meal-title">{{ slotLabels[meal.slot] }}</h3>
      <div class="meal-head-right">
        <span v-if="isUserMeal" class="chip edited-chip">Edited by you</span>
        <span class="chip meal-prep">{{ meal.prepMinutes }} min</span>
      </div>
    </div>

    <div class="meal-body">
      <div v-if="meal.kind === 'fallback' || meal.status === 'skipped'" class="meal-badges">
        <span v-if="meal.kind === 'fallback'" class="chip meal-fallback">Low-energy fallback</span>
        <span v-if="meal.status === 'skipped'" class="chip meal-status">Skipped</span>
      </div>

      <template v-if="!editingMeal">
        <p class="meal-idea">{{ meal.idea }}</p>
        <p v-if="!isUserMeal" class="muted meal-why">{{ meal.why }}</p>
        <p v-if="meal.ingredients?.length" class="muted meal-ingredients">Uses: {{ meal.ingredients.join(', ') }}</p>
      </template>

      <form v-else class="meal-edit-form" @submit.prevent="saveEditMeal">
        <AppInput :id="`edit-idea-${meal.id ?? meal.slot}`" v-model="editIdea" label="What will you eat?" />
        <label class="field-label" :for="`edit-ing-${meal.id ?? meal.slot}`">Ingredients (optional)</label>
        <div class="ingredient-chips">
          <span v-for="ing in editIngredients" :key="ing" class="chip ingredient-chip">
            {{ ing }}
            <button type="button" class="chip-remove" :aria-label="`Remove ${ing}`" @click="removeIngredient(ing)">×</button>
          </span>
        </div>
        <div class="ingredient-add">
          <input :id="`edit-ing-${meal.id ?? meal.slot}`" v-model="ingredientDraft" class="ingredient-input" type="text" placeholder="Add ingredient" @keydown.enter.prevent="addIngredient" />
          <AppButton class="ingredient-add-btn" size="sm" type="button" @click="addIngredient">Add</AppButton>
        </div>
        <div class="prep-row">
          <label class="field-label" :for="`edit-prep-${meal.id ?? meal.slot}`">Prep time (optional)</label>
          <div class="prep-field">
            <input :id="`edit-prep-${meal.id ?? meal.slot}`" v-model.number="editPrep" class="prep-input" type="number" min="1" max="240" step="1" inputmode="numeric" placeholder="10" />
            <span class="prep-unit" aria-hidden="true">min</span>
          </div>
        </div>
        <AppFormActions align="start" class="meal-edit-form-actions">
          <AppButton variant="ghost" size="sm" type="button" :equal="true" @click="cancelEditMeal">Cancel</AppButton>
          <AppButton variant="primary" size="sm" type="submit" :equal="true">Save</AppButton>
        </AppFormActions>
        <div class="meal-edit-suggest">
          <button type="button" class="link-btn" :disabled="suggesting || !suggestAlternative" @click="suggestAnother">{{ suggesting ? 'Suggesting…' : 'Suggest another idea' }}</button>
        </div>
      </form>

      <div v-if="meal.status === 'ate-other' && actualEntry && !editingOther" class="ate-other-summary">
        <p class="ate-other-text"><strong>You ate:</strong> {{ actualEntry.text }}</p>
        <div class="ate-other-actions">
          <button type="button" class="icon-btn" aria-label="Edit what you ate" @click="startEditOther">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.7 2.3a1 1 0 0 1 1.4 1.4L5 11.8 2.8 12.3l.5-2.2 8.4-7.8Z"/><path d="M9.8 4.2 11.8 6.2"/></svg>
          </button>
          <button type="button" class="icon-btn is-danger" aria-label="Delete what you ate" @click="emit('delete-other')">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6 4.5V3h4v1.5M6.5 7v4.5M9.5 7v4.5M4 4.5l.7 7h6.6l.7-7"/></svg>
          </button>
        </div>
      </div>

      <form v-if="showOtherForm" class="ate-other-form" @submit.prevent="saveOther">
        <AppInput :id="`ate-other-${meal.id ?? meal.slot}`" v-model="otherText" label="What did you eat instead?" placeholder="e.g. lentil soup" />
        <div class="ate-other-form-actions">
          <AppButton size="sm" variant="primary" type="submit">Save</AppButton>
          <AppButton size="sm" type="button" @click="cancelOther">Cancel</AppButton>
        </div>
      </form>

      <div v-if="!isUserMeal && meal.factIds.length && !editingMeal" class="science-tags" aria-label="Science notes for this meal">
        <button v-for="id in meal.factIds" :key="id" type="button" class="science-tag" :title="factText(id)" @click="emit('select-fact', id)">Science note · {{ id }}</button>
      </div>

      <div v-if="!editingMeal" class="meal-source">
        <a v-if="primaryFact && !isUserMeal" :href="primaryFact.source.url" target="_blank" rel="noopener noreferrer">Source: {{ primaryFact.source.title }}</a>
        <span v-else-if="!isUserMeal" class="muted">Outside the curated notes: ask your doctor or a dietitian.</span>
      </div>

      <div v-if="actions && !editingMeal" class="meal-actions">
        <div class="meal-actions-row meal-actions-edit">
          <span class="meal-actions-prompt">Don't want to eat this?</span>
          <button type="button" class="edit-btn" aria-label="Edit meal" title="Edit meal" @click="startEditMeal">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.7 2.3a1 1 0 0 1 1.4 1.4L5 11.8 2.8 12.3l.5-2.2 8.4-7.8Z"/><path d="M9.8 4.2 11.8 6.2"/></svg>
            <span>Edit</span>
          </button>
        </div>
        <div class="meal-actions-row meal-actions-status">
          <div class="status-buttons" role="group" aria-label="Meal status">
            <button type="button" class="status-btn" :class="{ 'is-active': meal.status === 'ate' }" :aria-pressed="meal.status === 'ate'" aria-label="Ate this" title="Ate this" @click="emit('mark', 'ate')">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3L13 4.5"/></svg>
            </button>
            <button type="button" class="status-btn" :class="{ 'is-active': meal.status === 'ate-other' }" :aria-pressed="meal.status === 'ate-other'" aria-label="Ate something else" title="Ate something else" @click="startOther">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5h8M10 3l2 2-2 2M12 11H4m2-2l-2 2 2 2"/></svg>
            </button>
            <button type="button" class="status-btn" :class="{ 'is-active': meal.status === 'skipped' }" :aria-pressed="meal.status === 'skipped'" aria-label="Skipped" title="Skipped" @click="emit('mark', 'skipped')">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M5.5 8h5"/></svg>
            </button>
          </div>
          <span v-if="statusLabel" class="status-label">{{ statusLabel }}</span>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.meal-card { display: flex; flex-direction: column; gap: 0; padding: 0; overflow: hidden; border-color: color-mix(in srgb, var(--meal-tint) 55%, var(--line)); }
.meal-card[data-slot="breakfast"] { --meal-text: var(--meal-breakfast-text); --meal-tint: var(--meal-breakfast-tint); }
.meal-card[data-slot="lunch"] { --meal-text: var(--meal-lunch-text); --meal-tint: var(--meal-lunch-tint); }
.meal-card[data-slot="dinner"] { --meal-text: var(--meal-dinner-text); --meal-tint: var(--meal-dinner-tint); }
.meal-card[data-slot="snack"] { --meal-text: var(--meal-snack-text); --meal-tint: var(--meal-snack-tint); }
.meal-card[data-status="skipped"] .meal-body { opacity: 0.72; }
.meal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 10px 12px; background: var(--meal-tint); }
.meal-title { margin: 0; min-width: 0; flex: 1 1 auto; font-size: 13px; font-weight: var(--font-weight-semibold); color: var(--meal-text); }
.meal-head-right { display: flex; gap: 4px; align-items: center; flex: 0 0 auto; }
.meal-prep, .edited-chip { font-size: 10px; white-space: nowrap; color: var(--meal-text); background: color-mix(in srgb, var(--meal-text) 10%, var(--meal-tint)); border-color: color-mix(in srgb, var(--meal-text) 22%, transparent); }
.meal-body { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px 12px; background: var(--surface); flex: 1 1 auto; }
.meal-badges { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.meal-fallback, .meal-status { font-size: 10px; }
.meal-idea { margin: 0; font-size: 14px; line-height: 1.45; color: var(--ink); }
.meal-why, .meal-ingredients { font-size: 12px; line-height: 1.4; }
.meal-ingredients { font-size: 11px; }
.meal-edit-form { display: flex; flex-direction: column; gap: 8px; padding: 0; margin: 0; }
.field-label { font-size: 11px; font-weight: var(--font-weight-medium); color: var(--ink-2); }
.ingredient-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ingredient-chip { font-size: 10px; gap: 4px; }
.chip-remove { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0; font-size: 12px; line-height: 1; }
.ingredient-add { display: flex; gap: 6px; align-items: stretch; }
.ingredient-input { flex: 1 1 auto; min-width: 0; height: 44px; box-sizing: border-box; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius-buttons); background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; }
.ingredient-add :deep(.el-button.ingredient-add-btn) { height: 44px; padding: 0 var(--spacing-12); }
.meal-edit-form :deep(.app-control .el-input__wrapper) { height: 44px; }
.meal-edit-form :deep(.app-control .el-input__inner) { height: 42px; line-height: 42px; }
.prep-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.prep-field { position: relative; display: flex; align-items: center; flex: 0 0 96px; width: 96px; height: 44px; }
.prep-input { box-sizing: border-box; width: 100%; height: 100%; min-height: 0; margin: 0; padding: 0 26px 0 10px; border: 1px solid var(--line); border-radius: var(--radius-buttons); background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; line-height: 42px; text-align: left; -moz-appearance: textfield; appearance: textfield; }
.prep-input::-webkit-outer-spin-button, .prep-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.prep-input:focus { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.prep-unit { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--ink-2); font-size: 11px; line-height: 1; pointer-events: none; }
.meal-edit-form-actions { justify-content: flex-start; margin-top: 4px; }
.meal-edit-suggest { margin-top: 2px; }
.link-btn { padding: 0; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 11px; cursor: pointer; text-decoration: underline; }
.link-btn:disabled { opacity: 0.6; cursor: default; }
.ate-other-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: var(--radius-buttons); background: color-mix(in srgb, var(--surface-2) 70%, transparent); }
.ate-other-text { margin: 0; font-size: 12px; line-height: 1.45; color: var(--ink); }
.ate-other-actions { display: flex; gap: 4px; flex: 0 0 auto; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-buttons); background: var(--surface); color: var(--ink-2); cursor: pointer; }
.icon-btn:hover { color: var(--ink); border-color: var(--ink-2); }
.icon-btn.is-danger:hover { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); }
.icon-btn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.ate-other-form { display: flex; flex-direction: column; gap: 8px; }
.ate-other-form-actions { display: flex; gap: 6px; }
.science-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.science-tag { padding: 2px 8px; border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--line)); border-radius: var(--radius-full); background: color-mix(in srgb, var(--surface-2) 70%, transparent); color: var(--ink-2); font-family: inherit; font-size: 10px; font-weight: var(--font-weight-medium); cursor: pointer; }
.science-tag:hover { color: var(--ink); border-color: var(--accent); }
.science-tag:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.meal-source { font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
.meal-source a { color: var(--accent); text-decoration: underline; }
.meal-actions { display: flex; flex-direction: column; gap: 8px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--line); }
.meal-actions-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.meal-actions-edit { justify-content: space-between; }
.meal-actions-prompt { font-size: 13px; color: var(--ink-2); }
.edit-btn { display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink-2); font: inherit; font-size: 12px; cursor: pointer; }
.edit-btn:hover, .edit-btn:focus-visible { color: var(--ink); border-color: var(--ink-2); outline: 2px solid var(--accent); outline-offset: 1px; }
.edit-btn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.status-buttons { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; }
.status-btn { position: relative; width: 32px; height: 32px; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: 0 0 auto; }
.status-btn::after { content: ''; position: absolute; inset: -6px; }
.status-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.status-btn:hover, .status-btn:focus-visible { border-color: var(--meal-text); color: var(--meal-text); outline: 2px solid var(--meal-text); outline-offset: 1px; }
.status-btn.is-active { background: var(--meal-text); border-color: var(--meal-text); color: #fff; }
.status-btn.is-active:hover, .status-btn.is-active:focus-visible { color: #fff; }
.status-label { font-size: 13px; color: var(--ink-2); white-space: nowrap; }
</style>
