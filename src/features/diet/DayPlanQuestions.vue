<script setup lang="ts">
import { ref } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import type { ConsentChoice, PlanBasis, PlanScope } from './model';

type Appetite = NonNullable<PlanBasis['appetite']>;

const props = defineProps<{
  pantry: string[];
  wants: string[];
  fieldId: string;
  question: string;
  showScope: boolean;
  scope: PlanScope;
  consentChoice: ConsentChoice;
  wantChips: string[];
}>();

const emit = defineEmits<{
  consent: [choice: 'allowed' | 'declined'];
  generate: [answers: {
    pantry: string[];
    wants: string[];
    scope: PlanScope;
    savePantry: boolean;
    skip: boolean;
    appetite?: Appetite;
  }];
}>();

const PANTRY_CHIPS = ['eggs', 'oats', 'rice', 'lentils', 'frozen veg', 'leftovers'];
const APPETITE_OPTIONS: Array<{ value: Appetite; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const pantryItems = ref([...props.pantry]);
const pantryDraft = ref('');
const wantsDraft = ref(props.wants.join(', '));
const savePantry = ref(true);
const selectedScope = ref<PlanScope>(props.scope);
const appetite = ref<Appetite | undefined>(undefined);

function addPantry(value: string): void {
  const clean = value.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean || pantryItems.value.some((item) => item.toLowerCase() === clean.toLowerCase())) return;
  pantryItems.value = [...pantryItems.value, clean];
}

function addPantryDraft(): void {
  pantryDraft.value.split(',').forEach(addPantry);
  pantryDraft.value = '';
}

function onPantryKeydown(event: KeyboardEvent): void {
  if (event.key !== ',') return;
  event.preventDefault();
  addPantryDraft();
}

function removePantry(index: number): void {
  pantryItems.value = pantryItems.value.filter((_, position) => position !== index);
}

function parseWants(value: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  value.split(/[,\n]/).forEach((part) => {
    const clean = part.replace(/\s+/g, ' ').trim().slice(0, 100);
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  });
  return result.slice(0, 16);
}

function addWant(value: string): void {
  wantsDraft.value = [...new Set([...parseWants(wantsDraft.value), value])].slice(0, 16).join(', ');
}

function submit(skip: boolean): void {
  emit('generate', {
    pantry: [...pantryItems.value],
    wants: parseWants(wantsDraft.value),
    scope: selectedScope.value,
    savePantry: savePantry.value,
    skip,
    appetite: appetite.value,
  });
}
</script>

<template>
  <form class="plan-questions" @submit.prevent="submit(false)">
    <fieldset v-if="showScope" class="question-block scope-block">
      <legend>Generate for</legend>
      <div class="choice-row">
        <button
          type="button"
          class="pill scope-choice"
          :class="{ active: selectedScope === 'day' }"
          :aria-pressed="selectedScope === 'day'"
          @click="selectedScope = 'day'"
        >This day</button>
        <button
          type="button"
          class="pill scope-choice"
          :class="{ active: selectedScope === 'week' }"
          :aria-pressed="selectedScope === 'week'"
          @click="selectedScope = 'week'"
        >Whole week</button>
      </div>
    </fieldset>

    <div class="question-block pantry-block">
      <label class="question-label" :for="`day-pantry-${fieldId}`">What do you have at home?</label>
      <div v-if="pantryItems.length" class="answer-chips" aria-label="Foods at home">
        <span v-for="(item, index) in pantryItems" :key="`${item}-${index}`" class="answer-chip">
          {{ item }}
          <button type="button" class="chip-remove" :aria-label="`Remove ${item}`" @click="removePantry(index)">×</button>
        </span>
      </div>
      <div class="answer-input-row">
        <input
          :id="`day-pantry-${fieldId}`"
          v-model="pantryDraft"
          class="answer-input"
          type="text"
          placeholder="e.g. oats, lentils, frozen veg"
          @keydown.enter.prevent="addPantryDraft()"
          @keydown="onPantryKeydown"
        />
        <AppButton @click="addPantryDraft()">Add</AppButton>
      </div>
      <div class="quick-chips" aria-label="Quick-add foods at home">
        <button v-for="chip in PANTRY_CHIPS" :key="chip" type="button" class="quick-chip" @click="addPantry(chip)">+ {{ chip }}</button>
      </div>
      <label class="save-pantry">
        <input v-model="savePantry" type="checkbox" />
        Save changes to my pantry
      </label>
    </div>

    <div class="question-block wants-block">
      <label class="question-label" :for="`day-wants-${fieldId}`">{{ question }}</label>
      <textarea
        :id="`day-wants-${fieldId}`"
        v-model="wantsDraft"
        class="answer-textarea"
        rows="2"
        placeholder="e.g. lentil soup, no-cook lunches"
      ></textarea>
      <div class="quick-chips" aria-label="Quick-add foods you want">
        <button v-for="chip in wantChips" :key="chip" type="button" class="quick-chip" @click="addWant(chip)">+ {{ chip }}</button>
      </div>
    </div>

    <fieldset class="question-block appetite-block">
      <legend>Appetite (optional)</legend>
      <div class="choice-row" aria-label="Appetite (optional)">
        <button
          v-for="option in APPETITE_OPTIONS"
          :key="option.value"
          type="button"
          class="pill appetite-choice"
          :class="{ active: appetite === option.value }"
          :aria-pressed="appetite === option.value"
          @click="appetite = appetite === option.value ? undefined : option.value"
        >{{ option.label }}</button>
      </div>
    </fieldset>

    <p class="also-used">
      Also used: your energy and how busy the day is, your Profile settings and the curated science notes.
    </p>

    <div v-if="consentChoice === 'unset'" class="consent-inline" role="note">
      <p>Before the first AI call, this is sent:</p>
      <ul class="consent-list">
        <li>Daily Check-in energy level for selected day(s), symptoms as name + severity only (never the free note), and busyness computed from task/habit counts and minutes.</li>
        <li>Profile: medication time, meal times, diet preferences, allergies, avoided foods, cooking minutes, equipment, servings/leftovers, cuisine preference, shopping place and budget.</li>
        <li>Diet: wanted foods and appetite for the day, pantry, recent meals from the last 3–5 days, kept meals, the changed meal when editing, shopping-item names only, and the curated fact library.</li>
        <li>Computed by the app: days/weekdays, remaining meals for today, and the timing clock times.</li>
        <li>No names, free notes, task/habit names, or medical records. API key stays in Rust.</li>
      </ul>
      <div class="consent-actions">
        <AppButton variant="primary" @click="emit('consent', 'allowed')">Allow AI suggestions</AppButton>
        <AppButton @click="emit('consent', 'declined')">Use general ideas only</AppButton>
      </div>
    </div>
    <p v-else-if="consentChoice === 'declined'" class="muted consent-off">
      AI ideas are off. General food ideas will be used.
    </p>

    <div class="question-actions">
      <AppButton variant="primary" type="submit">Generate plan</AppButton>
      <AppButton variant="text" type="button" @click="submit(true)">Skip questions and generate</AppButton>
    </div>
  </form>
</template>

<style scoped>
.plan-questions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 12px 16px;
}

.scope-block,
.appetite-block,
.also-used,
.consent-inline,
.consent-off,
.question-actions {
  grid-column: 1 / -1;
}

.consent-inline {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  border-radius: var(--radius-buttons);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
}

.consent-inline p {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-2);
}

.consent-list {
  margin: 0 0 8px;
  padding-left: 18px;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.5;
}

.consent-list li + li {
  margin-top: 4px;
}

.consent-actions,
.question-actions,
.quick-chips,
.answer-input-row,
.choice-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.consent-off {
  margin: 0;
  font-size: 12px;
}

.question-block {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.question-block legend {
  margin-bottom: 6px;
  padding: 0;
  color: var(--ink-2);
  font-size: 12px;
}

.question-label {
  display: block;
  margin-bottom: 6px;
  color: var(--ink);
  font-size: 12px;
  font-weight: var(--font-weight-medium);
}

.answer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.answer-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  border-radius: var(--radius-full);
  background: var(--surface-2);
  color: var(--ink);
  font-size: 11px;
}

.chip-remove {
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.answer-input,
.answer-textarea {
  box-sizing: border-box;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius-buttons);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: 12px;
}

.answer-input {
  flex: 1 1 220px;
  min-width: 0;
}

.answer-textarea {
  display: block;
  width: 100%;
  resize: vertical;
}

.quick-chip {
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--ink-2);
  font-size: 11px;
  cursor: pointer;
}

.quick-chip:hover,
.scope-choice:hover,
.appetite-choice:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.scope-choice.active,
.appetite-choice.active {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--surface);
}

.save-pantry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: var(--ink-2);
  font-size: 11px;
}

.also-used {
  margin: 0;
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.5;
}

@media (max-width: 720px) {
  .plan-questions {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .quick-chip,
  .scope-choice,
  .appetite-choice {
    transition: none;
  }
}
</style>
