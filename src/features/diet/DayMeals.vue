<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { keyOf } from '../../shared/utils';
import { usePlanner } from '../planner/usePlanner';
import { savePlanner } from '../planner/api';
import { EN_NAMES, type EnergyLevel } from '../planner/model';
import { parseSymptomChips } from '../planner/checkin';
import { requestCheckInSuggestion } from '../planner/checkinAi';
import CheckInForm from '../planner/CheckInForm.vue';
import { isDatePlannable, weekOffsetOf, type ConsentChoice, type PlanScope } from './model';
import { useDiet } from './useDiet';
import DayPlanQuestions from './DayPlanQuestions.vue';
import EnergyBattery from './EnergyBattery.vue';
import MealCard from './MealCard.vue';
import TimingNotes from './TimingNotes.vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppInput from '../../shared/ui/AppInput.vue';

interface QuestionAnswers {
  pantry: string[];
  wants: string[];
  scope: PlanScope;
  savePantry: boolean;
  skip: boolean;
  appetite?: 'low' | 'normal' | 'high';
}

const props = defineProps<{ date: string }>();
const emit = defineEmits<{
  today: [];
  escape: [];
  'show-shopping': [date: string];
  'show-pantry': [];
}>();

const planner = usePlanner();
const { checkInForm } = planner;
const {
  facts,
  data,
  errorText,
  canRetryGeneration,
  retryGeneration,
  generationNote,
  planStaleNote,
  consentChoice,
  wantChips,
  pantry,
  alarming,
  planForDate,
  answersForDate,
  formatBasis,
  isGeneratingDate,
  shoppingCountForDate,
  logForDate,
  generateForDate,
  regenerate,
  setConsentChoice,
  markMealForDate,
  editMealForDate,
  suggestMealAlternative,
  addActual,
  deleteActual,
} = useDiet();

const headingRef = ref<HTMLElement | null>(null);
const adviceCol = ref<HTMLElement | null>(null);
const questionsRef = ref<InstanceType<typeof DayPlanQuestions> | null>(null);
const answers = ref(answersForDate(props.date));
const editing = ref(false);
const notice = ref('');
const highlightedFactId = ref<string | null>(null);
const factAnnouncement = ref('');
const scienceOpen = ref(typeof window === 'undefined' ? true : window.innerWidth > 900);
let highlightTimer = 0;

const symptoms = ref('');
const level = ref<EnergyLevel>(2);
const checkInMessage = ref('');
const editingEnergy = ref(false);
const pastSuggestion = ref<EnergyLevel | null>(null);
const pastLoading = ref(false);

const todayKey = computed(() => keyOf(new Date()));
const isToday = computed(() => props.date === todayKey.value);
const isPast = computed(() => props.date < todayKey.value);
const canPlan = computed(() => isDatePlannable(props.date));
const showScope = computed(() =>
  weekOffsetOf(new Date(`${props.date}T12:00:00`), new Date()) > 0);
const savedCheckIn = computed(() => planner.state.value.checkIns[props.date] ?? null);
const savedTimeLabel = computed(() => {
  const at = savedCheckIn.value?.at;
  if (!at) return 'Saved';
  const time = new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `Saved ${time}`;
});
const symptomChips = computed(() => parseSymptomChips(savedCheckIn.value?.symptoms ?? ''));
const plan = computed(() => planForDate(props.date));
const entries = computed(() => logForDate(props.date));
const actualForMeal = (mealId: string | undefined) => entries.value.find((entry) => entry.mealId === mealId) ?? null;
const emptySlots: Array<{ slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'; label: string; prepMinutes: number }> = [
  { slot: 'breakfast', label: 'Breakfast', prepMinutes: 10 },
  { slot: 'lunch', label: 'Lunch', prepMinutes: 15 },
  { slot: 'dinner', label: 'Dinner', prepMinutes: 20 },
  { slot: 'snack', label: 'Snack', prepMinutes: 5 },
];
const emptyDrafts = ref<Record<string, string>>({ breakfast: '', lunch: '', dinner: '', snack: '' });
const generating = computed(() => isGeneratingDate(props.date));
const showForm = computed(() => canPlan.value && !isPast.value && (editing.value || !plan.value));
const usedFactIds = computed(() => {
  if (!plan.value) return [] as string[];
  const ids: string[] = [];
  for (const meal of plan.value.meals) for (const id of meal.factIds) if (!ids.includes(id)) ids.push(id);
  for (const note of plan.value.timingNotes) for (const id of note.factIds) if (!ids.includes(id)) ids.push(id);
  return ids;
});
const usedFacts = computed(() => usedFactIds.value
  .map((id) => facts.find((fact) => fact.id === id))
  .filter((fact): fact is (typeof facts)[number] => !!fact));
const basis = computed(() => plan.value?.basedOn ?? {
  pantry: answers.value.pantry,
  wants: answers.value.wants,
});
const basisText = computed(() => formatBasis(basis.value));
const dateLabel = computed(() => new Date(`${props.date}T12:00:00`).toLocaleDateString(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
}));
const dayName = computed(() => new Date(`${props.date}T12:00:00`).toLocaleDateString(undefined, {
  weekday: 'long',
}));
const question = computed(() => showScope.value
  ? 'What would you like to eat this week?'
  : `What would you like to eat on ${dayName.value}?`);

function resetForDate(focusHeading: boolean): void {
  answers.value = answersForDate(props.date);
  editing.value = false;
  notice.value = '';
  highlightedFactId.value = null;
  factAnnouncement.value = '';
  editingEnergy.value = false;
  pastSuggestion.value = null;
  pastLoading.value = false;
  symptoms.value = savedCheckIn.value?.symptoms ?? '';
  level.value = savedCheckIn.value?.level ?? 2;
  checkInMessage.value = '';
  emptyDrafts.value = { breakfast: '', lunch: '', dinner: '', snack: '' };
  if (focusHeading) void nextTick(() => headingRef.value?.focus());
}

onMounted(() => resetForDate(false));

watch(() => props.date, () => resetForDate(true));

watch(
  () => [
    data.value.dayAnswers[props.date]?.updatedAt ?? 0,
    plan.value?.generatedAt ?? 0,
  ] as const,
  () => {
    answers.value = answersForDate(props.date);
    editing.value = false;
    notice.value = '';
  },
);

/** The pantry card is canonical; refresh only that field without losing unsaved answers. */
watch(
  () => pantry.value.map((item) => `${item.id}:${item.name}:${item.low ? 1 : 0}`).join('|'),
  () => {
    answers.value = { ...answers.value, pantry: pantry.value.map((item) => item.name) };
  },
);

watch(
  () => savedCheckIn.value?.at ?? 0,
  () => {
    symptoms.value = savedCheckIn.value?.symptoms ?? '';
    level.value = savedCheckIn.value?.level ?? 2;
    pastSuggestion.value = null;
  },
);

onBeforeUnmount(() => {
  if (highlightTimer) window.clearTimeout(highlightTimer);
});

function selectFact(id: string): void {
  highlightedFactId.value = id;
  scienceOpen.value = true;
  factAnnouncement.value = `Science note ${id}`;
  if (highlightTimer) window.clearTimeout(highlightTimer);
  void nextTick(() => {
    adviceCol.value?.querySelector<HTMLElement>(`[data-fact-id="${id}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  });
  highlightTimer = window.setTimeout(() => {
    highlightedFactId.value = null;
  }, 2400);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  emit('escape');
}

/** Opens the shared form for today, loading the saved values first. */
function startTodayEnergyEdit(): void {
  if (savedCheckIn.value) planner.editCheckIn();
  editingEnergy.value = true;
}

function cancelTodayEnergyEdit(): void {
  planner.cancelCheckInEdit();
  editingEnergy.value = false;
}

/** Today saves through the shared planner check-in so Energy stays in sync. */
function saveTodayEnergy(): void {
  planner.saveCheckIn();
  editingEnergy.value = !planner.checkInLocked.value;
}

/** Asks for an AI/heuristic suggestion for a past day without touching today. */
async function suggestPastCheckIn(): Promise<void> {
  const note = symptoms.value.replace(/\s+/g, ' ').trim();
  if (!note) {
    checkInMessage.value = 'Describe your symptoms first, then ask for a suggestion.';
    return;
  }
  pastLoading.value = true;
  checkInMessage.value = 'Asking AI...';
  try {
    const result = await requestCheckInSuggestion(note);
    pastSuggestion.value = result.suggestion.level;
    checkInMessage.value = result.status;
  } finally {
    pastLoading.value = false;
  }
}

function acceptPastSuggestion(): void {
  if (pastSuggestion.value === null) return;
  level.value = pastSuggestion.value;
  checkInMessage.value = `Using ${EN_NAMES[pastSuggestion.value]}. You can still change it before saving.`;
}

/** Writes a past check-in through the shared planner state and storage. */
function savePastCheckIn(): void {
  const note = symptoms.value.replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!note) {
    checkInMessage.value = 'Add a short symptom note before saving.';
    return;
  }

  const state = planner.state.value;
  state.energyHistory[props.date] = level.value;
  state.checkIns[props.date] = {
    symptoms: note,
    level: level.value,
    suggested: pastSuggestion.value,
    aiReason: null,
    source: 'manual',
    at: Date.now(),
  };
  void savePlanner(state);
  pastSuggestion.value = null;
  checkInMessage.value = 'Saved for this day.';
}

async function saveMealOther(mealId: string, text: string): Promise<void> {
  await markMealForDate(props.date, mealId, 'ate-other', text);
}

async function deleteMealOther(mealId: string): Promise<void> {
  const entry = actualForMeal(mealId);
  if (entry) await deleteActual(entry.id);
}

async function saveEmptySlot(slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'): Promise<void> {
  const text = (emptyDrafts.value[slot] || '').replace(/\s+/g, ' ').trim();
  if (!text) return;
  await addActual({ slot, status: 'ate', text, date: props.date });
  emptyDrafts.value[slot] = '';
}

async function answerConsent(choice: Exclude<ConsentChoice, 'unset'>): Promise<void> {
  notice.value = '';
  await setConsentChoice(choice);
}

async function submitAnswers(payload: QuestionAnswers): Promise<void> {
  if (!canPlan.value || isPast.value) return;
  notice.value = '';
  const source = payload.skip ? answers.value : payload;
  const note = await generateForDate(props.date, {
    pantry: source.pantry,
    wants: source.wants,
    scope: payload.scope,
    savePantry: payload.skip ? true : payload.savePantry,
    appetite: source.appetite,
  });
  notice.value = note;
  if (!note || plan.value) {
    answers.value = answersForDate(props.date);
    editing.value = false;
    questionsRef.value?.resetDirty();
  }
}

function editAnswers(): void {
  answers.value = answersForDate(props.date);
  editing.value = true;
  notice.value = '';
}

async function regeneratePlan(): Promise<void> {
  await submitAnswers({ ...answers.value, skip: false });
}
</script>

<template>
  <section
    id="day-meals-card"
    class="panel day-meals-card"
    aria-labelledby="day-meals-heading"
    @keydown="onKeydown"
  >
    <div class="sec-head day-heading">
      <div>
        <h2 id="day-meals-heading" ref="headingRef" tabindex="-1">
          {{ dateLabel }}
          <span v-if="isToday" class="chip today-chip">Today</span>
        </h2>
        <button type="button" class="pantry-day-link" @click="emit('show-pantry')">
          {{ pantry.length }} item{{ pantry.length === 1 ? '' : 's' }} at home
        </button>
      </div>
      <div class="day-actions">
        <AppButton v-if="!isToday" @click="emit('today')">Show today</AppButton>
        <template v-if="plan && canPlan && !isPast && !generating">
          <AppButton @click="editAnswers">Edit answers</AppButton>
          <AppButton variant="primary" @click="regeneratePlan">Regenerate</AppButton>
        </template>
      </div>
    </div>

    <section v-if="alarming" class="panel urgent-panel" role="alert">
      <h3>Urgent</h3>
      <p>Please contact a doctor or emergency services now — these symptoms need urgent attention.</p>
      <p class="muted">Meal planning is paused. Keep your saved plan for reference; it is not medical advice.</p>
    </section>

    <section v-if="isToday || isPast" class="panel day-energy" aria-label="Energy check-in">
      <template v-if="isToday">
        <div v-if="!editingEnergy" class="energy-summary">
          <EnergyBattery :level="savedCheckIn?.level ?? null" />
          <strong class="energy-level" :class="{ 'is-empty': !savedCheckIn }">
            {{ savedCheckIn ? EN_NAMES[savedCheckIn.level] : 'Not checked in' }}
          </strong>
          <div v-if="savedCheckIn" class="energy-chips">
            <span v-for="(chip, index) in symptomChips" :key="`${chip}-${index}`" class="energy-chip">{{ chip }}</span>
            <span v-if="!symptomChips.length" class="energy-empty">No symptoms logged</span>
          </div>
          <span v-if="savedCheckIn" class="energy-saved">{{ savedTimeLabel }}</span>
          <AppButton size="sm" @click="startTodayEnergyEdit">
            {{ savedCheckIn ? 'Edit check-in' : 'Add check-in' }}
          </AppButton>
        </div>
        <CheckInForm
          v-else
          id-prefix="day-checkin-today"
          label="How did you feel?"
          save-label="Save check-in"
          :symptoms="checkInForm.symptoms"
          :level="checkInForm.level"
          :suggestion="checkInForm.suggestion"
          :status="checkInForm.status"
          :loading="checkInForm.loading"
          @update:symptoms="checkInForm.symptoms = $event"
          @update:level="checkInForm.level = $event"
          @suggest="planner.suggestCheckInEnergy"
          @accept="planner.acceptCheckInSuggestion"
          @save="saveTodayEnergy"
          @cancel="cancelTodayEnergyEdit"
        />
      </template>
      <CheckInForm
        v-else
        id-prefix="day-checkin-past"
        label="How did you feel?"
        save-label="Save check-in"
        :symptoms="symptoms"
        :level="level"
        :suggestion="pastSuggestion"
        :status="checkInMessage"
        :loading="pastLoading"
        :show-cancel="false"
        @update:symptoms="symptoms = $event"
        @update:level="level = $event"
        @suggest="suggestPastCheckIn"
        @accept="acceptPastSuggestion"
        @save="savePastCheckIn"
      />
    </section>

    <p v-if="generationNote" class="status is-ready" role="status">{{ generationNote }}</p>
    <div v-if="planStaleNote" class="status stale-banner" role="status">
      <div class="stale-copy">
        <span>{{ planStaleNote }}</span>
        <span class="stale-question">Your energy, symptoms or meals changed. Regenerate this plan now?</span>
      </div>
      <AppButton size="sm" variant="primary" @click="regenerate">Regenerate</AppButton>
    </div>
    <p v-if="notice" class="status" role="status">{{ notice }}</p>

    <DayPlanQuestions
      v-if="showForm && !generating"
      ref="questionsRef"
      :key="`questions-${date}-${editing}`"
      :pantry="answers.pantry"
      :wants="answers.wants"
      :field-id="date"
      :question="question"
      :show-scope="showScope"
      :scope="answers.scope"
      :consent-choice="consentChoice"
      :want-chips="wantChips"
      @consent="answerConsent"
      @generate="submitAnswers"
    />

    <div v-if="generating" class="meal-loading" aria-live="polite" aria-busy="true">
      <p class="muted loading-label">Writing your meal ideas…</p>
      <p class="basis-line">{{ basisText }}</p>
      <div class="skeleton-grid" aria-hidden="true">
        <div v-for="card in 3" :key="card" class="skeleton-card">
          <span class="skeleton-line is-title"></span>
          <span class="skeleton-line"></span>
          <span class="skeleton-line is-short"></span>
        </div>
      </div>
    </div>

    <template v-else-if="plan">
      <p class="basis-line">{{ basisText }}</p>
      <div class="day-layout">
        <div class="day-main">
          <div class="meal-grid">
            <MealCard
              v-for="meal in plan.meals"
              :key="meal.id || `${date}-${meal.slot}-${meal.idea}`"
              :meal="meal"
              :facts="facts"
              :actions="true"
              :actual-entry="actualForMeal(meal.id)"
              :suggest-alternative="() => suggestMealAlternative(date, meal.id ?? '')"
              @select-fact="selectFact"
              @mark="(value) => markMealForDate(date, meal.id ?? '', value)"
              @save-other="(text) => saveMealOther(meal.id ?? '', text)"
              @delete-other="() => deleteMealOther(meal.id ?? '')"
              @edit="(payload) => editMealForDate(date, meal.id ?? '', payload)"
            />
          </div>
          <button type="button" class="shopping-day-link" @click="emit('show-shopping', date)">
            {{ shoppingCountForDate(date) }} item{{ shoppingCountForDate(date) === 1 ? '' : 's' }} to buy for this day
          </button>
        </div>

        <aside ref="adviceCol" class="day-advice" aria-label="Timing, advice and science notes">
          <section class="panel advice-card" aria-labelledby="timing-advice-heading">
            <h3 id="timing-advice-heading" class="advice-title">Timing and advice</h3>
            <TimingNotes :notes="plan.timingNotes" :facts="facts" @select-fact="selectFact" />
            <p v-if="!plan.timingNotes.length" class="muted advice-empty">No timing notes for this day.</p>
          </section>

          <section class="panel advice-card" aria-labelledby="science-notes-heading">
            <button
              type="button"
              class="science-disclosure"
              :aria-expanded="scienceOpen"
              aria-controls="science-notes-body"
              @click="scienceOpen = !scienceOpen"
            >
              <h3 id="science-notes-heading" class="advice-title">Science notes<span class="science-count"> ({{ usedFacts.length }})</span></h3>
              <span class="science-toggle" aria-hidden="true">{{ scienceOpen ? 'Hide' : 'Show' }}</span>
            </button>
            <div v-if="scienceOpen" id="science-notes-body" class="science-list">
              <article
                v-for="fact in usedFacts"
                :key="fact.id"
                :data-fact-id="fact.id"
                class="science-note"
                :class="{ 'is-highlighted': highlightedFactId === fact.id }"
              >
                <div class="science-note-head">
                  <strong>{{ fact.id }}</strong>
                  <span class="chip science-evidence">{{ fact.evidence }}</span>
                </div>
                <p>{{ fact.text }}</p>
                <a :href="fact.source.url" target="_blank" rel="noreferrer">{{ fact.source.title }}</a>
              </article>
              <p v-if="!usedFacts.length" class="muted advice-empty">No science notes for this day.</p>
            </div>
          </section>
          <p class="sr-only" role="status" aria-live="polite">{{ factAnnouncement }}</p>
        </aside>
      </div>
    </template>

    <div v-else-if="!showForm && isPast" class="day-empty-log">
      <p class="muted empty-log-note">No meal plan was saved for this day. Add what you ate below.</p>
      <div class="empty-slots">
        <section v-for="slot in emptySlots" :key="slot.slot" class="panel empty-slot" :data-slot="slot.slot">
          <div class="meal-head">
            <h3 class="meal-title">{{ slot.label }}</h3>
          </div>
          <div class="meal-body">
            <AppInput
              :id="`empty-${date}-${slot.slot}`"
              v-model="emptyDrafts[slot.slot]"
              label="Add what I ate"
              placeholder="e.g. lentil soup"
            />
            <div class="empty-slot-actions">
              <AppButton size="sm" variant="primary" @click="saveEmptySlot(slot.slot)">Save</AppButton>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div v-else-if="!showForm" class="day-empty">
      <p class="empty">
        {{ isPast ? 'No meal plan was saved for this day.' : 'No meal plan for this day yet' }}
      </p>
      <p v-if="!canPlan" class="muted">This day is outside the two-week planning window.</p>
    </div>

    <div v-if="errorText" class="error-row" role="alert">
      <p class="error-text">{{ errorText }}</p>
      <AppButton v-if="canRetryGeneration" size="sm" @click="retryGeneration">Retry</AppButton>
    </div>

    <p class="diet-disclaimer">
      General food ideas, not medical advice. Talk to your doctor or a dietitian about your diet and medication.
    </p>
  </section>
</template>

<style scoped>
.day-meals-card {
  width: 100%;
  box-sizing: border-box;
  margin-top: var(--spacing-12);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.day-heading {
  height: auto;
  align-items: flex-start;
  flex-wrap: wrap;
}

.day-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  color: var(--ink);
}

.day-heading h2:focus {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.today-chip {
  font-size: 10px;
}

.day-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.urgent-panel {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--line));
}

.urgent-panel h3 {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}

.urgent-panel p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.day-energy {
  padding: 10px 12px;
}

.energy-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 24px;
}

.energy-level {
  color: var(--ink);
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
}

.energy-level.is-empty {
  color: var(--ink-2);
  font-weight: var(--font-weight-medium);
}

.energy-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.energy-chip {
  padding: 2px 7px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  border-radius: var(--radius-full);
  background: var(--surface-2);
  color: var(--ink);
  font-size: 10px;
  line-height: 1.3;
}

.energy-empty {
  color: var(--ink-2);
  font-size: 11px;
  font-style: italic;
}

.energy-saved {
  margin-left: auto;
  color: var(--ink-2);
  font-size: 11px;
  white-space: nowrap;
}

.stale-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
  border-radius: var(--radius-buttons);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  font-size: 12px;
}

.stale-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stale-question {
  color: var(--ink-2);
}

.error-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.basis-line {
  margin: 0;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.5;
}

.meal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--spacing-12);
}

.day-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
  gap: var(--spacing-12);
  align-items: start;
}

.day-main {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
  min-width: 0;
}

.shopping-day-link {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.shopping-day-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.pantry-day-link {
  align-self: flex-start;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.pantry-day-link:hover,
.pantry-day-link:focus-visible {
  color: var(--accent);
}

.day-advice {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
  min-width: 0;
  position: sticky;
  top: 12px;
}

.day-empty {
  padding: 4px 0;
  font-size: 12px;
}

.day-empty .empty {
  margin: 0 0 4px;
}

.meal-loading {
  padding-top: 4px;
}

.loading-label {
  margin: 0 0 4px;
  font-size: 12px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-buttons);
  background: var(--surface-2);
}

.skeleton-line {
  display: block;
  height: 10px;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--ink-2) 8%, transparent),
    color-mix(in srgb, var(--ink-2) 18%, transparent),
    color-mix(in srgb, var(--ink-2) 8%, transparent));
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s linear infinite;
}

.skeleton-line.is-title { width: 70%; height: 14px; }
.skeleton-line.is-short { width: 45%; }

@keyframes skeleton-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

.advice-card {
  padding: 12px;
}

.advice-title {
  margin: 0;
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--ink);
}

.advice-empty {
  margin: 8px 0 0;
  font-size: 12px;
}

.science-disclosure {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.science-count,
.science-toggle {
  color: var(--ink-2);
  font-size: 11px;
  font-weight: var(--font-weight-medium);
}

.science-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.science-note {
  padding: 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  font-size: 12px;
}

.science-note-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.science-note-head strong {
  font-size: 12px;
  color: var(--ink);
}

.science-evidence {
  font-size: 10px;
  text-transform: capitalize;
}

.science-note p {
  margin: 0 0 4px;
  line-height: 1.5;
  color: var(--ink);
}

.science-note a {
  color: var(--accent);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.science-note.is-highlighted {
  margin: 0 -8px;
  padding: 8px;
  border-radius: var(--radius-buttons);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  outline: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}

.sr-only {
  position: absolute !important;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.diet-disclaimer {
  margin: 0;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.45;
}

.empty-log-note { margin: 0 0 10px; font-size: 12px; }
.empty-slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--spacing-12); }
.empty-slot { padding: 0; overflow: hidden; border-color: color-mix(in srgb, var(--meal-tint) 55%, var(--line)); }
.empty-slot[data-slot="breakfast"] { --meal-text: var(--meal-breakfast-text); --meal-tint: var(--meal-breakfast-tint); }
.empty-slot[data-slot="lunch"] { --meal-text: var(--meal-lunch-text); --meal-tint: var(--meal-lunch-tint); }
.empty-slot[data-slot="dinner"] { --meal-text: var(--meal-dinner-text); --meal-tint: var(--meal-dinner-tint); }
.empty-slot[data-slot="snack"] { --meal-text: var(--meal-snack-text); --meal-tint: var(--meal-snack-tint); }
.empty-slot .meal-head { padding: 10px 12px; background: var(--meal-tint); }
.empty-slot .meal-title { margin: 0; font-size: 13px; font-weight: var(--font-weight-semibold); color: var(--meal-text); }
.empty-slot .meal-body { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; background: var(--surface); }
.empty-slot-actions { display: flex; gap: 6px; }

@media (max-width: 900px) {
  .day-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .day-advice {
    position: static;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line {
    animation: none;
  }
}
</style>
