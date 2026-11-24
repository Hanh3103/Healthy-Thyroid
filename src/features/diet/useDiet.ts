/** Diet Advisor ViewModel: three ranges, shared pantry, shopping and actual log. */
import { computed, ref, watch } from 'vue';
import { keyOf } from '../../shared/utils';
import {
  buildContextsForDates,
  buildDietContext,
  basisLine,
  buildRangePlanFromDays,
  busynessLabel,
  clippedPlanMessage,
  clearMealDataForDates,
  countShoppingForDate as countShoppingForDateItems,
  datesForRange,
  detectAlarmingSymptoms,
  emergencyRangePlan,
  energyLabel,
  heuristicMeal,
  heuristicRangePlan,
  isDatePlannable,
  legacyRangePlan,
  markBought,
  markMeal,
  applyMealShoppingDelta,
  availablePantryNames,
  combineQuantities,
  isBasicShoppingItem,
  pantryNames,
  normalizeDietData,
  parseRangePlan,
  planningWeekFor,
  RANGE_LABELS,
  rebuildRangePlans,
  remainingPantry,
  restrictToRemainingMeals,
  sortShoppingItems,
  storeRangePlanInDays,
  toDietLogEntries,
  WANT_CHIPS,
  type ActualEntry,
  type ConsentChoice,
  type DayPlanAnswers,
  type DietContext,
  type DietData,
  type DietEnergy,
  type DietLogEntry,
  type DietRange,
  type MealPlanDay,
  type PlanBasis,
  type PlanScope,
  type MealSlot,
  type MealStatus,
  type PantryItem,
  type RangePlan,
  type RangeRequest,
  type ShoppingItem,
  type ShoppingMerge,
  type ThyroidFact,
} from './model';
import { buildDietAiRequest, type Appetite, type DietAiMode, type DietAiRequest } from './ai.ts';
import { usePlanner } from '../planner/usePlanner';
import { dietSettings, loadSettings } from '../profile/settings';
import * as api from './api';
import factsJson from './knowledge/thyroidFacts.json';

const facts = factsJson as unknown as ThyroidFact[];
const planner = usePlanner();

/** Optional answers from the calendar day panel; nothing is generated implicitly. */
interface GenerateOptions extends Partial<PlanBasis> {
  scope?: PlanScope;
  savePantry?: boolean;
  mode?: DietAiMode;
}

export type ShoppingFilter = 'all' | 'today' | 'tomorrow' | 'this-week' | 'next-week' | { date: string };

const data = ref<DietData>(normalizeDietData({}, facts));
const activeRange = ref<DietRange>('today');
const status = ref<'idle' | 'loading' | 'ready' | 'error' | 'offline'>('idle');
const statusText = ref('');
const errorText = ref('');
const canRetryGeneration = ref(false);
let lastFailedAiRequest: DietAiRequest | null = null;
const selectedFactId = ref<string | null>(null);
/** Set by the calendar's Generate button until the consent dialog is answered. */
const pendingGeneration = ref<{
  dates: string[];
  range: DietRange;
  note: string;
  showClipping: boolean;
  mode: DietAiMode;
  answers?: PlanBasis;
} | null>(null);
const generationNote = ref('');
const generatingDates = ref<string[]>([]);
const planStaleNote = ref('');
const shoppingMerge = ref<ShoppingMerge | null>(null);
const shoppingFilter = ref<ShoppingFilter>('all');
const shoppingUpdateStatus = ref<'idle' | 'updating' | 'done' | 'error'>('idle');
const shoppingUpdateError = ref('');
const lastBought = ref<{
  itemId: string;
  pantryItemId?: string;
  previousShopping: ShoppingItem;
  previousPantry?: PantryItem;
} | null>(null);
/** Removal messages keep the two stores independent and offer an Undo. */
const pantryNotice = ref('');
const lastPantryRemoval = ref<{ item: PantryItem; index: number } | null>(null);
const shoppingNotice = ref('');
const lastShoppingRemoval = ref<{
  item: ShoppingItem;
  previousLow?: { id: string; low?: boolean };
} | null>(null);
/** Tick feedback: the row lingers briefly, the notice offers Undo for 5 seconds. */
const BOUGHT_ROW_MS = 1000;
const BOUGHT_NOTICE_MS = 5000;
const boughtNotice = ref('');
const recentlyBought = ref<string[]>([]);
const boughtRowTimers = new Map<string, ReturnType<typeof setTimeout>>();
let boughtNoticeTimer: ReturnType<typeof setTimeout> | null = null;

/** Runs a UI timer without keeping a Node test process alive. */
function scheduleTimer(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
  const timer = setTimeout(callback, ms);
  (timer as unknown as { unref?: () => void }).unref?.();
  return timer;
}

interface MealEditBatch {
  date: string;
  oldMeal: { idea: string; ingredients: string[] };
  newMeal: { idea: string; ingredients: string[] };
  request: DietAiRequest;
}

let shoppingUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let shoppingUpdateBatch: MealEditBatch[] = [];
let lastShoppingUpdateBatch: MealEditBatch[] = [];
let shoppingUpdateUndoSnapshot: ShoppingItem[] | null = null;
let initialized = false;
let watchReady = false;

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const preferences = computed(() => dietSettings.value);
const consentChoice = computed<ConsentChoice>(() => data.value.consentChoice);
const todayContext = computed<DietContext>(() =>
  buildDietContext(planner.state.value, planner.energy.value, preferences.value));
const contexts = computed(() => buildContextsForDates(
  planner.state.value,
  datesForRange(activeRange.value),
  preferences.value,
  todayContext.value,
));
const plan = computed<RangePlan | null>(() => data.value.plans[activeRange.value]);
const wants = computed(() => data.value.wants[activeRange.value]);
const pantry = computed(() => data.value.pantry);
const pantryNamesView = computed(() => pantryNames(data.value.pantry));
const availablePantry = computed(() => availablePantryNames(data.value.pantry));
const shopping = computed(() => sortShoppingItems(data.value.shopping));
const log = computed(() => data.value.log);
const dayPlans = computed(() => data.value.dayPlans);

function planForDate(date: string): MealPlanDay | null {
  return data.value.dayPlans[date] ?? null;
}

/** Items relevant to a range, including open items with no assigned days. */
function shoppingForDates(dates: string[]): ShoppingItem[] {
  const targets = new Set(dates);
  return shopping.value.filter((item) =>
    item.forDays.length === 0 || item.forDays.some((day) => targets.has(day)));
}

function shoppingCountForDate(date: string): number {
  return countShoppingForDateItems(data.value.shopping, date);
}

function setShoppingFilter(filter: ShoppingFilter): void {
  shoppingFilter.value = filter;
}

function logForDate(date: string) {
  return data.value.log.filter((entry) => entry.date === date);
}

function logEntriesForDate(date: string): DietLogEntry[] {
  return toDietLogEntries(logForDate(date));
}

function isGeneratingDate(date: string): boolean {
  return generatingDates.value.includes(date);
}

function rangeForDate(date: string): DietRange {
  const now = new Date();
  if (date === keyOf(now)) return 'today';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  if (date === keyOf(tomorrow)) return 'tomorrow';
  return 'week';
}

function cleanNames(value: string[] | undefined, max: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  (value ?? []).forEach((entry) => {
    const clean = entry.replace(/\s+/g, ' ').trim().slice(0, 100);
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  });
  return result.slice(0, max);
}

/**
 * Pantry names for a plan. Canonical items marked running low are treated as
 * missing even when an older per-plan answer still lists them.
 */
function availableDraftPantry(drafts?: string[]): string[] {
  // An explicitly empty draft means "use no pantry for this one plan".
  const names = drafts === undefined ? pantryNamesView.value : cleanNames(drafts, 40);
  const low = new Set(data.value.pantry
    .filter((item) => item.low)
    .map((item) => item.name.toLowerCase()));
  return names.filter((name) => !low.has(name.toLowerCase()));
}

function basisFor(range: DietRange): PlanBasis {
  return {
    pantry: availablePantry.value,
    wants: [...data.value.wants[range]],
  };
}

/**
 * Prefills the questions from last answers or the saved plan, but always shows
 * the canonical pantry card list. Per-plan pantry drafts stay in `basedOn`.
 */
function answersForDate(date: string): DayPlanAnswers {
  const saved = data.value.dayAnswers[date];
  if (saved) return { ...saved, pantry: pantryNamesView.value };
  const stored = data.value.dayPlans[date];
  if (stored?.basedOn) {
    return {
      ...stored.basedOn,
      pantry: pantryNamesView.value,
      scope: stored.range === 'week' ? 'week' : 'day',
      savePantry: true,
      updatedAt: stored.generatedAt,
    };
  }
  return {
    ...basisFor(rangeForDate(date)),
    pantry: pantryNamesView.value,
    scope: 'day',
    savePantry: true,
    updatedAt: 0,
  };
}

async function rememberAnswers(
  dates: string[],
  basis: PlanBasis,
  scope: PlanScope,
  savePantry: boolean,
): Promise<void> {
  const answers: DayPlanAnswers = {
    pantry: cleanNames(basis.pantry, 40),
    wants: cleanNames(basis.wants, 16),
    appetite: basis.appetite,
    scope,
    savePantry,
    updatedAt: Date.now(),
  };
  dates.forEach((date) => {
    data.value.dayAnswers[date] = { ...answers, pantry: [...answers.pantry], wants: [...answers.wants] };
  });
  await persist();
}

/** Applies the optional pantry edits only when the day panel checkbox is on. */
async function applyPantryDraft(value: string[]): Promise<void> {
  const names = cleanNames(value, 40);
  const existing = new Map(data.value.pantry.map((item) => [item.name.toLowerCase(), item] as const));
  data.value.pantry = names.map((name) => existing.get(name.toLowerCase()) ?? {
    id: makeId(),
    name,
    addedAt: Date.now(),
    source: 'manual' as const,
  });
  hideShoppingForPantry(names);
  syncRunningLow();
  await persist();
}

const alarming = computed(() =>
  detectAlarmingSymptoms(planner.checkIn.value?.symptoms ?? '')
  || data.value.log.some((entry) => detectAlarmingSymptoms(entry.text)));

function buildRequest(range: DietRange): RangeRequest {
  const rangeContexts = range === activeRange.value
    ? contexts.value
    : buildContextsForDates(planner.state.value, datesForRange(range), preferences.value, todayContext.value);
  const dates = rangeContexts.map((context) => context.date);
  return {
    range,
    dates,
    contexts: rangeContexts,
    wants: [...data.value.wants[range]],
    pantry: remainingPantry(availablePantry.value, data.value.log, dates),
    preferences: preferences.value,
    log: [...data.value.log],
    alarmingSymptoms: alarming.value,
    hint: range === 'today' ? undefined : todayContext.value,
    currentShopping: shoppingForDates(dates).map((item) => ({
      name: item.name, status: item.status, inPlan: item.inPlan, source: item.source,
    })),
  };
}

async function persist(): Promise<void> {
  await api.saveDiet(data.value);
}

function pantryFor(dates: string[], basis?: PlanBasis): string[] {
  return remainingPantry(availableDraftPantry(basis?.pantry), data.value.log, dates);
}

/** Eaten, skipped and edited meals are immutable across generation. */
function carryStatuses(next: RangePlan): RangePlan {
  return {
    ...next,
    days: next.days.map((day) => {
      const previous = data.value.dayPlans[day.date];
      if (!previous) return day;
      const keep = previous.meals.filter((meal) =>
        meal.status === 'ate' || meal.status === 'ate-other'
        || meal.status === 'skipped' || meal.source === 'user' || !!meal.editedAt);
      const keptSlots = new Set(keep.map((meal) => meal.slot));
      const fresh = day.meals.filter((meal) => !keptSlots.has(meal.slot));
      return { ...day, meals: [...fresh, ...keep].sort((a, b) => MEAL_SLOT_ORDER.indexOf(a.slot) - MEAL_SLOT_ORDER.indexOf(b.slot)) };
    }),
  };
}

const MEAL_SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

async function applyPlan(range: DietRange, next: RangePlan, basis?: PlanBasis): Promise<void> {
  const applied = range === 'today'
    ? restrictToRemainingMeals(next, preferences.value, pantryFor(next.days.map((day) => day.date), basis))
    : next;
  const carried = carryStatuses(applied);
  const before = data.value.shopping.map((item) => ({ ...item, forDays: [...item.forDays] }));
  const summaries = storeRangePlanInDays(data.value, carried, range, applied.hint, new Date(), basis);
  const summary = summaries.shopping;
  if (summary && (summary.added || summary.noLongerNeeded)) {
    shoppingMerge.value = {
      summary,
      before,
      after: data.value.shopping.map((item) => ({ ...item, forDays: [...item.forDays] })),
    };
  }
  const first = carried.days[0];
  if (range === 'today' && first) {
    data.value.lastPlan = {
      summary: first.summary,
      meals: first.meals,
      timingNotes: first.timingNotes,
      urgent: first.urgent,
      context: first.context,
      source: carried.source,
      generatedAt: carried.generatedAt,
    };
  }
  await persist();
}

async function offline(range: DietRange, message?: string): Promise<void> {
  const request = buildRequest(range);
  const next = request.alarmingSymptoms
    ? emergencyRangePlan(request)
    : heuristicRangePlan(request, preferences.value);
  await applyPlan(range, next);
  status.value = request.alarmingSymptoms ? 'ready' : 'offline';
  statusText.value = request.alarmingSymptoms
    ? 'Please seek urgent help before planning meals.'
    : message ?? 'AI ideas are off. Showing general food ideas.';
}

async function generate(range: DietRange, mode: DietAiMode = 'generate'): Promise<void> {
  const request = buildRequest(range);
  if (request.alarmingSymptoms) {
    await applyPlan(range, emergencyRangePlan(request));
    status.value = 'ready';
    statusText.value = 'Please seek urgent help before planning meals.';
    canRetryGeneration.value = false;
    return;
  }
  if (!data.value.consentGiven) {
    await offline(range);
    return;
  }

  const aiRequest = buildDietAiRequest({
    mode,
    sources: {
      contexts: request.contexts,
      state: planner.state.value,
      preferences: preferences.value,
      pantry: request.pantry,
      recentMeals: recentDietMeals(new Date()),
      keepMeals: keptMealsFor(request.dates),
      shoppingNames: (request.currentShopping ?? []).map((item) => item.name),
      facts,
      wantsByDate: wantsByDateFor(request.dates),
      appetiteByDate: appetiteByDateFor(request.dates),
    },
  });
  status.value = 'loading';
  statusText.value = range === 'week' ? 'Writing seven days of meal ideas…' : 'Writing your meal ideas…';
  errorText.value = '';
  canRetryGeneration.value = false;
  try {
    const raw = await api.requestDietPlan(aiRequest);
    const result = parseRangePlan(raw, facts, request, preferences.value);
    if (!result.plan) throw new Error(result.error || 'The AI response could not be used.');
    await applyPlan(range, result.plan);
    status.value = 'ready';
    statusText.value = 'Written from your curated thyroid facts and what you have at home.';
    lastFailedAiRequest = null;
  } catch (error) {
    errorText.value = detailOf(error);
    lastFailedAiRequest = aiRequest;
    canRetryGeneration.value = true;
    status.value = 'error';
    statusText.value = 'Could not update the plan. Your existing plan is unchanged.';
  }
}

function buildRequestForDates(dates: string[], range: DietRange, answers?: PlanBasis): RangeRequest {
  const contexts = buildContextsForDates(
    planner.state.value,
    dates.map((date) => new Date(`${date}T12:00:00`)),
    preferences.value,
    todayContext.value,
  );
  const wanted = answers?.wants ?? (range === 'week' ? data.value.wants.week : data.value.wants[range]);
  const pantryNames = availableDraftPantry(answers?.pantry);
  return {
    range,
    dates: contexts.map((context) => context.date),
    contexts,
    wants: cleanNames(wanted, 16),
    pantry: remainingPantry(
      pantryNames,
      data.value.log,
      contexts.map((context) => context.date),
    ),
    preferences: preferences.value,
    log: [...data.value.log],
    alarmingSymptoms: alarming.value,
    hint: range === 'today' ? undefined : todayContext.value,
    currentShopping: shoppingForDates(contexts.map((context) => context.date)).map((item) => ({
      name: item.name,
      status: item.status,
      inPlan: item.inPlan,
      source: item.source,
    })),
  };
}

function recentDietMeals(now: Date): DietAiRequest['recentMeals'] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4, 12);
  const first = keyOf(start);
  return [...data.value.log]
    .filter((entry) => entry.date >= first && entry.date <= keyOf(now))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20)
    .map((entry) => ({
      date: entry.date,
      meal: entry.slot,
      status: entry.status,
      name: entry.text.replace(/\s+/g, ' ').trim().slice(0, 80),
    }));
}

function keptMealsFor(dates: string[]): DietAiRequest['keepMeals'] {
  const targets = new Set(dates);
  return Object.entries(data.value.dayPlans)
    .filter(([date]) => targets.has(date))
    .flatMap(([date, plan]) => plan.meals
      .filter((meal) => meal.status === 'ate' || meal.status === 'ate-other'
        || meal.status === 'skipped' || meal.source === 'user' || !!meal.editedAt)
      .map((meal) => ({
        date,
        slot: meal.slot,
        idea: meal.idea,
        ingredients: [...(meal.ingredients ?? [])],
        status: (meal.status === 'skipped' ? 'skipped'
          : meal.source === 'user' || !!meal.editedAt ? 'edited' : 'ate') as DietAiRequest['keepMeals'][number]['status'],
      })));
}

function wantsByDateFor(dates: string[], answers?: PlanBasis): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  dates.forEach((date) => {
    const saved = data.value.dayAnswers[date];
    result[date] = cleanNames(saved?.wants ?? answers?.wants ?? data.value.wants[rangeForDate(date)], 16);
  });
  return result;
}

function appetiteByDateFor(dates: string[], answers?: PlanBasis): Record<string, Appetite> {
  const result: Record<string, Appetite> = {};
  dates.forEach((date) => {
    const appetite = data.value.dayAnswers[date]?.appetite ?? answers?.appetite;
    if (appetite) result[date] = appetite;
  });
  return result;
}

function buildAiRequestForDates(
  dates: string[],
  range: DietRange,
  answers?: PlanBasis,
  mode: DietAiMode = 'generate',
  changedMeal?: DietAiRequest['changedMeal'],
): DietAiRequest {
  const request = buildRequestForDates(dates, range, answers);
  return buildDietAiRequest({
    mode,
    sources: {
      contexts: request.contexts,
      state: planner.state.value,
      preferences: preferences.value,
      pantry: request.pantry,
      recentMeals: recentDietMeals(new Date()),
      keepMeals: keptMealsFor(request.dates),
      changedMeal: changedMeal ?? null,
      shoppingNames: (request.currentShopping ?? []).map((item) => item.name),
      facts,
      wantsByDate: wantsByDateFor(request.dates, answers),
      appetiteByDate: appetiteByDateFor(request.dates, answers),
    },
  });
}

async function offlineForDates(
  dates: string[],
  range: DietRange,
  message?: string,
  answers?: PlanBasis,
): Promise<void> {
  const request = buildRequestForDates(dates, range, answers);
  if (!request.dates.length) return;
  const next = request.alarmingSymptoms
    ? emergencyRangePlan(request)
    : heuristicRangePlan(request, preferences.value);
  await applyPlan(range, next, answers);
  status.value = request.alarmingSymptoms ? 'ready' : 'offline';
  statusText.value = request.alarmingSymptoms
    ? 'Please seek urgent help before planning meals.'
    : message ?? 'AI ideas are off. Showing general food ideas.';
}

async function runPendingGeneration(): Promise<string> {
  const pending = pendingGeneration.value;
  if (!pending) return '';
  pendingGeneration.value = null;
  const request = buildRequestForDates(pending.dates, pending.range, pending.answers);
  if (!request.dates.length) return 'No days in this week are inside the planning window.';
  const note = pending.note
    || (pending.showClipping ? clippedPlanMessage(request.dates.length, 7) : '');
  const aiRequest = buildAiRequestForDates(
    pending.dates, pending.range, pending.answers, pending.mode,
  );

  generatingDates.value = pending.dates;
  try {
    if (request.alarmingSymptoms) {
      await applyPlan(pending.range, emergencyRangePlan(request), pending.answers);
      status.value = 'ready';
      statusText.value = 'Please seek urgent help before planning meals.';
      canRetryGeneration.value = false;
      generationNote.value = note;
      return note;
    }
    if (!data.value.consentGiven) {
      await offlineForDates(pending.dates, pending.range, undefined, pending.answers);
      generationNote.value = note;
      return note;
    }

    status.value = 'loading';
    statusText.value = request.dates.length === 1
      ? 'Writing your meal ideas…'
      : `Writing ${request.dates.length} days of meal ideas…`;
    errorText.value = '';
    canRetryGeneration.value = false;
    try {
      const raw = await api.requestDietPlan(aiRequest);
      const result = parseRangePlan(raw, facts, request, preferences.value);
      if (!result.plan) throw new Error(result.error || 'The AI response could not be used.');
      await applyPlan(pending.range, result.plan, pending.answers);
      status.value = 'ready';
      statusText.value = 'Written from your curated thyroid facts and what you have at home.';
      lastFailedAiRequest = null;
    } catch (error) {
      errorText.value = detailOf(error);
      lastFailedAiRequest = aiRequest;
      canRetryGeneration.value = true;
      status.value = 'error';
      statusText.value = 'Could not update the plan. Your existing plan is unchanged.';
    }
    generationNote.value = note;
    return note;
  } finally {
    generatingDates.value = [];
  }
}

/** Calendar Generate buttons: explicit, consent-gated, per-date or whole week. */
async function generateForDates(
  dates: string[],
  range: DietRange,
  note = '',
  options: GenerateOptions = {},
): Promise<string> {
  const unique = [...new Set(dates)].filter((date) => isDatePlannable(date)).sort();
  if (!unique.length) return 'Those days are outside the planning window.';

  const answers = options.pantry || options.wants || options.appetite
    ? {
        pantry: cleanNames(options.pantry, 40),
        wants: cleanNames(options.wants, 16),
        appetite: options.appetite,
      }
    : undefined;
  if (answers) {
    if (options.savePantry) await applyPantryDraft(answers.pantry);
    await rememberAnswers(
      unique,
      answers,
      options.scope ?? (range === 'week' ? 'week' : 'day'),
      options.savePantry ?? true,
    );
  }

  pendingGeneration.value = {
    dates: unique,
    range,
    note,
    showClipping: range === 'week' && unique.length > 1,
    mode: options.mode ?? 'generate',
    answers,
  };
  generationNote.value = '';
  planStaleNote.value = '';
  if (consentChoice.value === 'unset') {
    return 'Choose whether to use AI suggestions before generating.';
  }
  return runPendingGeneration();
}

/** One day by default; the day panel can opt into the whole clipped week. */
async function generateForDate(date: string, options: GenerateOptions = {}): Promise<string> {
  if (options.scope === 'week') {
    const week = planningWeekFor(date);
    const note = clippedPlanMessage(week.dates.length, week.total);
    return generateForDates(week.dates, 'week', note, { ...options, scope: 'week' });
  }
  return generateForDates([date], rangeForDate(date), '', { ...options, scope: 'day' });
}

/** Regeneration is always explicit; actual-meal changes only mark the plan stale. */
async function askToRegenerate(dates: string[]): Promise<void> {
  if (!dates.length) return;
  planStaleNote.value = 'Your meals or check-in changed. Regenerate?';
}

async function retryGeneration(): Promise<void> {
  if (!lastFailedAiRequest) return;
  const request = lastFailedAiRequest;
  lastFailedAiRequest = null;
  canRetryGeneration.value = false;
  const range = activeRange.value;
  status.value = 'loading';
  statusText.value = 'Retrying your meal ideas…';
  errorText.value = '';
  try {
    const raw = await api.requestDietPlan(request);
    const fallbackRequest = buildRequest(range);
    const result = parseRangePlan(raw, facts, fallbackRequest, preferences.value);
    if (!result.plan) throw new Error(result.error || 'The AI response could not be used.');
    await applyPlan(range, result.plan);
    status.value = 'ready';
    statusText.value = 'Written from your curated thyroid facts and what you have at home.';
  } catch (error) {
    errorText.value = detailOf(error);
    lastFailedAiRequest = request;
    canRetryGeneration.value = true;
    status.value = 'error';
    statusText.value = 'Could not update the plan. Your existing plan is unchanged.';
  }
}

async function init(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await loadSettings();
  await planner.init();
  planner.checkDay();
  data.value = await api.loadDiet(facts);
  clearYesterdayBought();

  const todayDate = todayContext.value.date;
  const previous = data.value.lastPlan;
  if (!data.value.dayPlans[todayDate] && previous && previous.context.date === todayDate) {
    const legacy = legacyRangePlan(previous, availablePantry.value);
    storeRangePlanInDays(data.value, legacy, 'today');
  }

  // A saved plan is narrowed to the meals still ahead; nothing is generated here.
  const todayPlan = buildRangePlanFromDays('today', [todayDate], data.value.dayPlans);
  if (todayPlan) {
    const restricted = restrictToRemainingMeals(
      todayPlan,
      preferences.value,
      pantryFor([todayDate]),
    );
    storeRangePlanInDays(data.value, restricted, 'today');
  }

  const hasToday = !!data.value.dayPlans[todayDate];
  status.value = hasToday ? (data.value.consentGiven ? 'ready' : 'offline') : 'idle';
  statusText.value = hasToday
    ? (data.value.consentGiven
      ? 'Showing your saved plan. Use Regenerate to refresh it.'
      : 'Showing your saved plan. AI ideas are off.')
    : '';
  await persist();
  watchReady = true;
}

/** Removes the saved meal state for test dates, keeping preferences and consent. */
async function clearMealsForDates(dates: string[]): Promise<string[]> {
  const cleared = clearMealDataForDates(data.value, dates);
  if (!cleared.length) return cleared;
  pendingGeneration.value = null;
  generatingDates.value = [];
  generationNote.value = '';
  errorText.value = '';
  selectedFactId.value = null;
  status.value = 'idle';
  statusText.value = '';
  await persist();
  return cleared;
}

async function setConsentChoice(choice: ConsentChoice): Promise<void> {
  data.value.consentChoice = choice;
  data.value.consentGiven = choice === 'allowed';
  await persist();
  await api.setConsent(data.value.consentGiven, choice);
}

async function regenerate(range: DietRange = activeRange.value): Promise<void> {
  if (consentChoice.value === 'unset') {
    statusText.value = 'Choose AI or general ideas in the day panel before generating.';
    return;
  }
  planStaleNote.value = '';
  await generate(range, 'regenerate');
}

async function allowConsent(): Promise<void> {
  await setConsentChoice('allowed');
  if (pendingGeneration.value) await runPendingGeneration();
  else await generate(activeRange.value);
}

async function declineConsent(): Promise<void> {
  await setConsentChoice('declined');
  const pending = pendingGeneration.value;
  if (pending) {
    pendingGeneration.value = null;
    await offlineForDates(
      pending.dates,
      pending.range,
      'AI ideas are off. Showing general food ideas.',
      pending.answers,
    );
    generationNote.value = pending.note;
  } else {
    await offline(activeRange.value, 'AI ideas are off. Showing general food ideas.');
  }
}

function selectRange(range: DietRange): void {
  activeRange.value = range;
  selectedFactId.value = null;
  errorText.value = '';
  statusText.value = '';
  status.value = data.value.plans[range]
    ? (data.value.consentGiven ? 'ready' : 'offline')
    : 'idle';
}

async function setWants(range: DietRange, items: string[]): Promise<void> {
  data.value.wants[range] = items.slice(0, 16);
  await persist();
  statusText.value = 'Saved. Use Regenerate to apply what you want to eat.';
}

/** Adds several pasted/typed names to the one canonical pantry list. */
async function addPantryMany(values: string[]): Promise<void> {
  const seen = new Set(data.value.pantry.map((item) => item.name.toLowerCase()));
  const now = Date.now();
  const added: string[] = [];
  values.forEach((value) => {
    const clean = value.replace(/\s+/g, ' ').trim().slice(0, 80);
    const key = clean.toLowerCase();
    if (!clean || isBasicShoppingItem(clean) || seen.has(key)) return;
    seen.add(key);
    data.value.pantry.push({
      id: makeId(),
      name: clean,
      addedAt: now,
      source: 'manual',
    });
    added.push(clean);
  });
  if (!added.length) return;
  hideShoppingForPantry(added);
  await persist();
  statusText.value = `${added.join(', ')} added to your pantry.`;
}

async function addPantry(name: string): Promise<void> {
  await addPantryMany([name]);
}

/**
 * Removing from At home never touches the shopping list. The row stays open (or
 * bought), and the message offers an Undo that restores the pantry item.
 */
async function removePantry(id: string): Promise<void> {
  const index = data.value.pantry.findIndex((item) => item.id === id);
  if (index < 0) return;
  const item = data.value.pantry[index];
  data.value.pantry = data.value.pantry.filter((entry) => entry.id !== id);
  const openOnList = data.value.shopping.some((entry) =>
    entry.status === 'open' && entry.name.toLowerCase() === item.name.toLowerCase());
  lastPantryRemoval.value = { item: { ...item }, index };
  pantryNotice.value = item.low || openOnList
    ? 'Removed from At home. Still on your shopping list.'
    : 'Removed from At home.';
  await persist();
}

/** Undo for a pantry removal restores only the pantry item. */
async function undoPantryRemoval(): Promise<void> {
  const removal = lastPantryRemoval.value;
  if (!removal) return;
  const at = Math.min(Math.max(removal.index, 0), data.value.pantry.length);
  const next = [...data.value.pantry];
  next.splice(at, 0, removal.item);
  data.value.pantry = next;
  lastPantryRemoval.value = null;
  pantryNotice.value = '';
  await persist();
}

/** Running low stays at home but is treated as missing for planning. */
async function setPantryLow(id: string, low: boolean): Promise<void> {
  const item = data.value.pantry.find((entry) => entry.id === id);
  if (!item || item.low === low) return;
  item.low = low || undefined;
  syncRunningLow();
  await persist();
}

async function clearPantry(): Promise<void> {
  if (!data.value.pantry.length) return;
  // Clearing At home leaves the shopping list untouched.
  data.value.pantry = [];
  lastPantryRemoval.value = null;
  pantryNotice.value = '';
  await persist();
  statusText.value = 'Pantry cleared.';
}

/** Clears diet data, including the pantry, from Profile > Delete my data. */
async function clearAllDietData(): Promise<void> {
  data.value = normalizeDietData({
    preferences: data.value.preferences,
    consentChoice: data.value.consentChoice,
    consentGiven: data.value.consentGiven,
  }, facts);
  // Clear transient state so a stale undo/merge cannot resurrect deleted data.
  lastBought.value = null;
  lastPantryRemoval.value = null;
  pantryNotice.value = '';
  lastShoppingRemoval.value = null;
  shoppingNotice.value = '';
  clearBoughtFeedback();
  shoppingMerge.value = null;
  pendingGeneration.value = null;
  lastFailedAiRequest = null;
  generationNote.value = '';
  planStaleNote.value = '';
  await persist();
  statusText.value = 'Diet data, including your pantry, was deleted.';
}

function setShopping(items: ShoppingItem[]): void {
  data.value.shopping = sortShoppingItems(items);
  rebuildRangePlans(data.value);
}

/**
 * Adding something you now have at home hides matching open shopping rows.
 * This is the only pantry -> shopping action; nothing here removes pantry data.
 */
function hideShoppingForPantry(names: string[]): void {
  if (!names.length) return;
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const now = Date.now();
  const next = data.value.shopping.map((item) => {
    if (item.status !== 'open' || !wanted.has(item.name.toLowerCase())) return item;
    if (isBasicShoppingItem(item.name)) return item;
    return { ...item, status: 'removed' as const, fromPantry: true, updatedAt: now };
  });
  setShopping(next);
}

/**
 * Running low reuses the one row for that ingredient: it reopens an existing
 * open/bought/removed row, or creates a source=pantry row only when none exists.
 * Unticking removes only a still-open row that this action created; an orphaned
 * row whose pantry item was deleted is left open until it is cleared.
 */
function syncRunningLow(): void {
  const now = Date.now();
  const next = [...data.value.shopping];
  const pantryByKey = new Map(data.value.pantry.map((item) => [item.name.toLowerCase(), item] as const));
  const handled = new Set<string>();

  next.forEach((item, index) => {
    if (!item.runningLow) return;
    const key = item.name.toLowerCase();
    const stored = pantryByKey.get(key);
    handled.add(key);
    if (!stored || stored.low) {
      // Keep an orphaned low row; reopen one that was ticked bought meanwhile.
      if (stored?.low && item.status !== 'open') {
        next[index] = { ...item, status: 'open', updatedAt: now };
      }
      return;
    }
    next[index] = item.status === 'open' && item.source === 'pantry'
      ? { ...item, status: 'removed', runningLow: undefined, updatedAt: now }
      : { ...item, runningLow: undefined, updatedAt: now };
  });

  data.value.pantry
    .filter((item) => item.low && !isBasicShoppingItem(item.name))
    .forEach((item) => {
      const key = item.name.toLowerCase();
      if (handled.has(key)) return;
      handled.add(key);
      const index = next.findIndex((entry) => entry.name.toLowerCase() === key);
      if (index >= 0) {
        next[index] = { ...next[index], status: 'open', runningLow: true, updatedAt: now };
        return;
      }
      next.push({
        id: makeId(),
        name: item.name,
        forDays: [],
        source: 'pantry',
        status: 'open',
        inPlan: false,
        runningLow: true,
        createdAt: now,
        updatedAt: now,
      });
    });

  setShopping(next);
}

function isNoLongerNeeded(item: ShoppingItem): boolean {
  return item.status === 'open'
    && item.source !== 'user'
    && item.source !== 'pantry'
    && !item.runningLow
    && !item.inPlan;
}

function cleanForDays(days: string[]): string[] {
  return [...new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
}

async function toggleShopping(id: string, bought: boolean): Promise<void> {
  const item = data.value.shopping.find((entry) => entry.id === id);
  if (!item) return;
  if (bought) {
    if (item.status === 'bought') return;
    await buyShopping(id);
    return;
  }
  if (item.status === 'bought') {
    await untickBought(id);
    return;
  }
  const now = Date.now();
  setShopping(data.value.shopping.map((entry) =>
    entry.id === id ? { ...entry, status: 'open', updatedAt: now } : entry));
  if (lastBought.value?.itemId === id) lastBought.value = null;
  await persist();
}

async function buyShopping(id: string): Promise<void> {
  const item = data.value.shopping.find((entry) => entry.id === id);
  if (!item) return;
  const previousPantry = data.value.pantry
    .find((entry) => entry.name.toLowerCase() === item.name.toLowerCase());
  const result = markBought(data.value.pantry, data.value.shopping, id);
  data.value.pantry = result.pantry;
  setShopping(result.shopping);
  const addedPantryItem = previousPantry
    ? undefined
    : result.pantry.find((entry) => entry.name.toLowerCase() === item.name.toLowerCase());
  lastBought.value = {
    itemId: id,
    pantryItemId: addedPantryItem?.id,
    previousShopping: { ...item },
    previousPantry: previousPantry ? { ...previousPantry } : undefined,
  };
  statusText.value = `${item.name} moved to your pantry.`;
  showBoughtFeedback(id);
  await persist();
}

/** Keeps the ticked row visible for a moment and shows the Undo notice for 5s. */
function showBoughtFeedback(id: string): void {
  if (!recentlyBought.value.includes(id)) {
    recentlyBought.value = [...recentlyBought.value, id];
  }
  const existingRowTimer = boughtRowTimers.get(id);
  if (existingRowTimer) clearTimeout(existingRowTimer);
  boughtRowTimers.set(id, scheduleTimer(() => {
    recentlyBought.value = recentlyBought.value.filter((entry) => entry !== id);
    boughtRowTimers.delete(id);
  }, BOUGHT_ROW_MS));

  boughtNotice.value = 'Moved to At home';
  if (boughtNoticeTimer) clearTimeout(boughtNoticeTimer);
  boughtNoticeTimer = scheduleTimer(() => {
    boughtNotice.value = '';
    lastBought.value = null;
    boughtNoticeTimer = null;
  }, BOUGHT_NOTICE_MS);
}

function clearBoughtFeedback(id?: string): void {
  if (boughtNoticeTimer) {
    clearTimeout(boughtNoticeTimer);
    boughtNoticeTimer = null;
  }
  boughtNotice.value = '';
  if (id === undefined) {
    boughtRowTimers.forEach((timer) => clearTimeout(timer));
    boughtRowTimers.clear();
    recentlyBought.value = [];
    return;
  }
  const timer = boughtRowTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    boughtRowTimers.delete(id);
  }
  recentlyBought.value = recentlyBought.value.filter((entry) => entry !== id);
}

async function undoBought(): Promise<void> {
  const purchase = lastBought.value;
  if (!purchase) return;
  const restore = purchase.previousShopping;
  setShopping(data.value.shopping.map((item) =>
    item.id === restore.id ? { ...restore, updatedAt: Date.now() } : item));
  if (purchase.pantryItemId) {
    data.value.pantry = data.value.pantry.filter((item) => item.id !== purchase.pantryItemId);
  } else if (purchase.previousPantry) {
    const restorePantry = purchase.previousPantry;
    data.value.pantry = data.value.pantry.map((item) => item.id === restorePantry.id ? { ...restorePantry } : item);
  }
  lastBought.value = null;
  clearBoughtFeedback(restore.id);
  statusText.value = 'Move to pantry undone.';
  await persist();
}

/** Untick a bought row: it returns to the active list and leaves At home. */
async function untickBought(id: string): Promise<void> {
  const item = data.value.shopping.find((entry) => entry.id === id);
  if (!item || item.status !== 'bought') return;
  const now = Date.now();
  setShopping(data.value.shopping.map((entry) =>
    entry.id === id ? { ...entry, status: 'open', isNew: false, updatedAt: now } : entry));
  const key = item.name.toLowerCase();
  data.value.pantry = data.value.pantry.filter((entry) =>
    !(entry.name.toLowerCase() === key && entry.boughtAt));
  if (lastBought.value?.itemId === id) {
    lastBought.value = null;
    clearBoughtFeedback(id);
  }
  await persist();
}

/** Clears the whole Bought section without touching At home. */
async function clearBought(): Promise<void> {
  if (!data.value.shopping.some((entry) => entry.status === 'bought')) return;
  const now = Date.now();
  setShopping(data.value.shopping.map((entry) =>
    entry.status === 'bought' ? { ...entry, status: 'removed', updatedAt: now } : entry));
  lastBought.value = null;
  clearBoughtFeedback();
  await persist();
  statusText.value = 'Bought items cleared.';
}

/** Bought rows from a previous day are cleared automatically on load. */
function clearYesterdayBought(): void {
  const today = keyOf(new Date());
  const stale = new Set(data.value.shopping
    .filter((entry) => entry.status === 'bought' && keyOf(new Date(entry.updatedAt)) < today)
    .map((entry) => entry.id));
  if (!stale.size) return;
  const now = Date.now();
  setShopping(data.value.shopping.map((entry) =>
    stale.has(entry.id) ? { ...entry, status: 'removed', updatedAt: now } : entry));
}

/**
 * Deleting a shopping row only ever affects that row. If it came from Running
 * low, the matching pantry item stays and Running low is switched off.
 */
async function removeShopping(id: string): Promise<void> {
  const item = data.value.shopping.find((entry) => entry.id === id);
  if (!item) return;
  const now = Date.now();
  let previousLow: { id: string; low?: boolean } | undefined;
  if (item.runningLow) {
    const pantryItem = data.value.pantry.find(
      (entry) => entry.name.toLowerCase() === item.name.toLowerCase(),
    );
    if (pantryItem) {
      previousLow = { id: pantryItem.id, low: pantryItem.low };
      pantryItem.low = undefined;
    }
  }
  setShopping(data.value.shopping.map((entry) =>
    entry.id === id ? { ...entry, status: 'removed', isNew: false, updatedAt: now } : entry));
  lastShoppingRemoval.value = { item: { ...item }, previousLow };
  shoppingNotice.value = 'Removed from your shopping list.';
  if (lastBought.value?.itemId === id) lastBought.value = null;
  await persist();
}

/** Undo for a shopping removal restores the row and any Running low it cleared. */
async function undoShoppingRemoval(): Promise<void> {
  const removal = lastShoppingRemoval.value;
  if (!removal) return;
  const restore = removal.item;
  setShopping(data.value.shopping.map((entry) =>
    entry.id === restore.id ? { ...restore, updatedAt: Date.now() } : entry));
  if (removal.previousLow) {
    const { id, low } = removal.previousLow;
    data.value.pantry = data.value.pantry.map((entry) =>
      entry.id === id ? { ...entry, low } : entry);
  }
  lastShoppingRemoval.value = null;
  shoppingNotice.value = '';
  await persist();
}

async function addShopping(name: string, quantity = '', forDays: string[] = []): Promise<void> {
  const names = name.split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim().slice(0, 80))
    .filter((part) => part && !isBasicShoppingItem(part));
  if (!names.length) return;
  const days = cleanForDays(forDays);
  const cleanQuantity = quantity.replace(/\s+/g, ' ').trim().slice(0, 60);
  const now = Date.now();
  const next = [...data.value.shopping];
  const byName = new Map(next.map((item) => [item.name.toLowerCase(), item]));
  for (const itemName of names) {
    const key = itemName.toLowerCase();
    const previous = byName.get(key);
    if (previous) {
      // One row per ingredient: typing a name reopens/updates the existing row.
      const updated: ShoppingItem = {
        ...previous,
        forDays: [...new Set([...previous.forDays, ...days])].sort(),
        quantity: combineQuantities(previous.quantity, cleanQuantity) || previous.quantity,
        source: 'user',
        status: 'open',
        inPlan: false,
        isNew: undefined,
        fromPantry: undefined,
        runningLow: undefined,
        updatedAt: now,
      };
      if (!updated.quantity) delete updated.quantity;
      next[next.indexOf(previous)] = updated;
      byName.set(key, updated);
      continue;
    }
    const item: ShoppingItem = {
      id: makeId(),
      name: itemName,
      quantity: cleanQuantity || undefined,
      forDays: days,
      source: 'user',
      status: 'open',
      inPlan: false,
      createdAt: now,
      updatedAt: now,
    };
    next.push(item);
    byName.set(key, item);
  }
  setShopping(next);
  await persist();
}

async function editShopping(id: string, name: string, quantity = ''): Promise<void> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean || isBasicShoppingItem(clean)) return;
  const cleanQuantity = quantity.replace(/\s+/g, ' ').trim().slice(0, 60);
  const now = Date.now();
  const current = data.value.shopping.find((item) => item.id === id);
  if (!current) return;
  const next = data.value.shopping.filter((item) => item.id !== id);
  const key = clean.toLowerCase();
  const duplicate = next.find((item) => item.name.toLowerCase() === key);
  if (duplicate) {
    // Renaming onto an existing ingredient merges the two rows into one.
    const merged: ShoppingItem = {
      ...duplicate,
      name: clean,
      forDays: [...new Set([...duplicate.forDays, ...current.forDays])].sort(),
      quantity: combineQuantities(duplicate.quantity, cleanQuantity) || duplicate.quantity,
      status: duplicate.status === 'removed' && current.status === 'open' ? 'open' : duplicate.status,
      inPlan: duplicate.inPlan || current.inPlan,
      updatedAt: now,
    };
    if (!merged.quantity) delete merged.quantity;
    next[next.indexOf(duplicate)] = merged;
  } else {
    const updated: ShoppingItem = { ...current, name: clean, quantity: cleanQuantity || undefined, updatedAt: now };
    if (!updated.quantity) delete updated.quantity;
    next.push(updated);
  }
  setShopping(next);
  await persist();
}

async function keepShopping(id: string): Promise<void> {
  const now = Date.now();
  setShopping(data.value.shopping.map((item) =>
    item.id === id ? { ...item, source: 'user', inPlan: false, isNew: false, updatedAt: now } : item));
  await persist();
}

async function keepAllShopping(): Promise<void> {
  const now = Date.now();
  setShopping(data.value.shopping.map((item) =>
    isNoLongerNeeded(item)
      ? { ...item, source: 'user', inPlan: false, isNew: false, updatedAt: now }
      : item));
  await persist();
}

async function removeAllNoLongerNeeded(): Promise<void> {
  const now = Date.now();
  setShopping(data.value.shopping.map((item) =>
    isNoLongerNeeded(item) ? { ...item, status: 'removed', isNew: false, updatedAt: now } : item));
  await persist();
}

async function undoShoppingMerge(): Promise<void> {
  const merge = shoppingMerge.value;
  if (!merge) return;
  setShopping(merge.before.map((item) => ({ ...item, forDays: [...item.forDays] })));
  shoppingMerge.value = null;
  await persist();
}

function dismissShoppingMerge(): void {
  shoppingMerge.value = null;
}

function cloneShopping(items: ShoppingItem[]): ShoppingItem[] {
  return items.map((item) => ({ ...item, forDays: [...item.forDays] }));
}

async function applyShoppingDeltaToDates(dates: string[], add: string[], remove: string[]): Promise<void> {
  const before = cloneShopping(shoppingUpdateUndoSnapshot ?? data.value.shopping);
  const result = applyMealShoppingDelta(
    data.value.shopping,
    add,
    remove,
    data.value.pantry.map((item) => item.name),
    dates,
  );
  setShopping(result.items);
  if (result.summary.added || result.summary.noLongerNeeded) {
    shoppingMerge.value = {
      summary: result.summary,
      before,
      after: cloneShopping(result.items),
    };
  }
  await persist();
}

async function flushShoppingUpdate(): Promise<void> {
  if (shoppingUpdateTimer) { clearTimeout(shoppingUpdateTimer); shoppingUpdateTimer = null; }
  const batch = [...shoppingUpdateBatch];
  shoppingUpdateBatch = [];
  if (!batch.length) return;
  lastShoppingUpdateBatch = [...batch];
  const dates = [...new Set(batch.map((entry) => entry.date))];
  shoppingUpdateUndoSnapshot = cloneShopping(data.value.shopping);
  shoppingUpdateStatus.value = 'updating';
  shoppingUpdateError.value = '';
  try {
    const requests = batch.map((entry) => entry.request);
    const primary = requests[0];
    if (!primary) return;
    const result = await api.requestMealEditIngredients(primary);
    const oldIngredients = new Set(batch.flatMap((entry) => entry.oldMeal.ingredients.map((name) => name.toLowerCase())));
    const newIngredients = new Set(batch.flatMap((entry) => entry.newMeal.ingredients.map((name) => name.toLowerCase())));
    const remove = [...oldIngredients].filter((name) => !newIngredients.has(name));
    await applyShoppingDeltaToDates(dates, result.add, remove);
    shoppingUpdateStatus.value = 'done';
  } catch (error) {
    const pantryNames = data.value.pantry.map((item) => item.name.toLowerCase());
    const fallbackAdd = batch.flatMap((entry) => entry.newMeal.ingredients)
      .map((name) => name.replace(/\s+/g, ' ').trim().slice(0, 80))
      .filter((name) => name && !pantryNames.includes(name.toLowerCase()));
    if (fallbackAdd.length) await applyShoppingDeltaToDates(dates, fallbackAdd, []);
    shoppingUpdateStatus.value = 'error';
    shoppingUpdateError.value = detailOf(error) || 'Could not update the shopping list';
  }
}

function queueShoppingUpdate(entry: MealEditBatch): void {
  shoppingUpdateBatch.push(entry);
  shoppingUpdateStatus.value = 'updating';
  shoppingUpdateError.value = '';
  if (shoppingUpdateTimer) clearTimeout(shoppingUpdateTimer);
  shoppingUpdateTimer = setTimeout(() => { void flushShoppingUpdate(); }, 1500);
}

async function retryShoppingUpdate(): Promise<void> {
  // if there is no batch but last failed, we can't reconstruct; keep simple - status error with retry triggers last batch? 
  // Store last batch for retry
  if (lastShoppingUpdateBatch.length) {
    shoppingUpdateBatch = [...lastShoppingUpdateBatch];
    await flushShoppingUpdate();
  }
}

async function undoShoppingUpdate(): Promise<void> {
  if (!shoppingUpdateUndoSnapshot) return;
  setShopping(cloneShopping(shoppingUpdateUndoSnapshot));
  shoppingUpdateUndoSnapshot = null;
  shoppingUpdateStatus.value = 'idle';
  shoppingUpdateError.value = '';
  await persist();
}

function pushActual(entry: Omit<ActualEntry, 'id' | 'createdAt' | 'updatedAt'>): void {
  const now = Date.now();
  data.value.log.push({ ...entry, id: makeId(), createdAt: now, updatedAt: now });
}

async function adjustForActual(dates: string[]): Promise<void> {
  await persist();
  if (status.value === 'loading') return;
  await askToRegenerate(dates);
}

function findMealDate(mealId: string): string {
  for (const [date, stored] of Object.entries(data.value.dayPlans)) {
    if (stored.meals.some((meal) => meal.id === mealId)) return date;
  }
  return '';
}

/** Local alternative only; AI editMeal never returns a new meal idea. */
async function suggestMealAlternative(date: string, mealId: string): Promise<{ idea: string; ingredients: string[]; prepMinutes: number } | null> {
  const stored = data.value.dayPlans[date];
  const meal = stored?.meals.find((item) => item.id === mealId);
  if (!meal || meal.slot === 'snack') return null;
  const context = data.value.dayPlans[date]?.context ?? todayContext.value;
  const alternative = heuristicMeal(meal.slot, context, preferences.value);
  if (alternative.idea === meal.idea) return null;
  return { idea: alternative.idea, ingredients: alternative.ingredients ?? [], prepMinutes: alternative.prepMinutes };
}

async function editMealForDate(
  date: string,
  mealId: string,
  patch: { idea: string; ingredients: string[]; prepMinutes?: number },
): Promise<void> {
  const stored = data.value.dayPlans[date];
  if (!stored) return;
  const meal = stored.meals.find((item) => item.id === mealId);
  if (!meal) return;
  const oldMeal = { idea: meal.idea, ingredients: [...(meal.ingredients ?? [])] };
  const cleanIdea = patch.idea.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!cleanIdea) return;
  const cleanIngredients = [...new Set(patch.ingredients.map((i) => i.replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean))].slice(0, 24);
  const prep = Math.max(0, Math.min(240, Math.round(patch.prepMinutes ?? meal.prepMinutes ?? 10)));
  const nextMeal = {
    ...meal,
    idea: cleanIdea,
    ingredients: cleanIngredients,
    prepMinutes: prep,
    source: 'user' as const,
    editedAt: Date.now(),
    factIds: [],
  };
  data.value.dayPlans[date] = {
    ...stored,
    meals: stored.meals.map((item) => item.id === mealId ? nextMeal : item),
  };
  rebuildRangePlans(data.value);

  if (meal.status === 'ate') {
    data.value.log = data.value.log.map((entry) =>
      entry.mealId === mealId ? { ...entry, text: cleanIdea, updatedAt: Date.now() } : entry);
    await persist();
    return;
  }

  const changedMeal: DietAiRequest['changedMeal'] = {
    date,
    slot: meal.slot,
    old: { idea: meal.idea, ingredients: oldMeal.ingredients, prepMinutes: meal.prepMinutes },
    new: { idea: cleanIdea, ingredients: cleanIngredients, prepMinutes: prep },
  };
  const request = buildAiRequestForDates([date], rangeForDate(date), undefined, 'editMeal', changedMeal);
  await persist();
  queueShoppingUpdate({
    date,
    oldMeal,
    newMeal: { idea: cleanIdea, ingredients: cleanIngredients },
    request,
  });
}

async function markMealAt(
  date: string,
  mealId: string,
  statusValue: MealStatus,
  otherText = '',
): Promise<void> {
  const stored = data.value.dayPlans[date];
  if (!stored) return;
  const meal = stored.meals.find((item) => item.id === mealId);
  if (!meal) return;
  data.value.dayPlans[date] = {
    ...stored,
    meals: markMeal(stored, mealId, statusValue).meals,
  };
  rebuildRangePlans(data.value);

  if (statusValue === 'ate-other') {
    const text = otherText.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text) return;
    const existing = data.value.log.find((entry) => entry.mealId === mealId);
    if (existing) {
      data.value.log = data.value.log.map((entry) =>
        entry.id === existing.id
          ? { ...entry, text, status: 'ate-other', updatedAt: Date.now() }
          : entry);
    } else {
      pushActual({ date, slot: meal.slot, status: 'ate-other', text, mealId });
    }
    await adjustForActual([date]);
    return;
  }
  if (!data.value.log.some((entry) => entry.mealId === mealId)) {
    pushActual({
      date,
      slot: meal.slot,
      status: statusValue,
      text: statusValue === 'skipped' ? `Skipped planned meal: ${meal.idea}` : meal.idea,
      mealId,
    });
  }
  await adjustForActual([date]);
}

async function markPlanned(mealId: string, statusValue: MealStatus): Promise<void> {
  const date = findMealDate(mealId);
  if (date) await markMealAt(date, mealId, statusValue);
}

/** Calendar day-panel action; updates the same per-date plan the tab reads. */
async function markMealForDate(
  date: string,
  mealId: string,
  statusValue: MealStatus,
  otherText = '',
): Promise<void> {
  await markMealAt(date, mealId, statusValue, otherText);
}

async function addActual(payload: { slot: MealSlot; text: string; status: MealStatus; date?: string }): Promise<void> {
  const text = payload.text.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) return;
  const date = payload.date || todayContext.value.date;
  pushActual({ date, slot: payload.slot, status: payload.status, text });
  await adjustForActual([date]);
}

async function updateActual(id: string, text: string): Promise<void> {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!clean) return;
  const date = data.value.log.find((entry) => entry.id === id)?.date ?? todayContext.value.date;
  data.value.log = data.value.log.map((entry) =>
    entry.id === id ? { ...entry, text: clean, updatedAt: Date.now() } : entry);
  await adjustForActual([date]);
}

async function deleteActual(id: string): Promise<void> {
  const entry = data.value.log.find((item) => item.id === id);
  const date = entry?.date ?? todayContext.value.date;
  if (entry?.mealId) {
    const stored = data.value.dayPlans[date];
    if (stored) {
      data.value.dayPlans[date] = {
        ...stored,
        meals: markMeal(stored, entry.mealId, 'planned').meals,
      };
      rebuildRangePlans(data.value);
    }
  }
  data.value.log = data.value.log.filter((item) => item.id !== id);
  await adjustForActual([date]);
}

function selectFact(id: string): void {
  selectedFactId.value = id;
}

/* Energy or symptom changes never regenerate silently; the user must ask. */
watch(
  () => [
    planner.checkIn.value?.at ?? 0,
    planner.energy.value,
    (planner.checkIn.value?.symptomEntries ?? []).map((entry) => `${entry.name}:${entry.severity}`).join('|'),
    planner.checkIn.value?.symptoms ?? '',
  ] as const,
  (next, previous) => {
    if (!watchReady || !data.value.plans.today) return;
    if (next.every((value, index) => value === previous[index])) return;
    planStaleNote.value = 'Your energy or symptoms changed. Regenerate?';
  },
);

export function useDiet() {
  return {
    facts,
    data,
    activeRange,
    contexts,
    plan,
    wants,
    pantry,
    pantryNames: pantryNamesView,
    availablePantry,
    shopping,
    log,
    dayPlans,
    planForDate,
    logForDate,
    logEntriesForDate,
    answersForDate,
    formatBasis: basisLine,
    isGeneratingDate,
    status,
    statusText,
    errorText,
    canRetryGeneration,
    retryGeneration,
    generationNote,
    planStaleNote,
    consentChoice,
    selectedFactId,
    alarming,
    preferences,
    consentGiven: computed(() => data.value.consentGiven),
    todayContext,
    rangeLabels: RANGE_LABELS,
    wantChips: WANT_CHIPS,
    chips: computed(() => [
      { label: `${energyLabel(contexts.value[0]?.energy ?? 'medium')} energy${contexts.value[0]?.energyIsHint ? ' (hint)' : ''}`, tone: contexts.value[0]?.energy ?? 'medium' },
      { label: `${busynessLabel(contexts.value[0]?.busyness ?? 'normal')} day`, tone: contexts.value[0]?.busyness ?? 'normal' },
    ]),
    plannedSummary: computed(() => {
      const total = contexts.value.reduce((sum, context) => sum + context.totalMinutes, 0);
      const tasks = contexts.value.reduce((sum, context) => sum + context.taskCount, 0);
      return `${contexts.value.length} day${contexts.value.length === 1 ? '' : 's'} · ${tasks} task${tasks === 1 ? '' : 's'} · ${total} min planned`;
    }),
    factById: computed(() => new Map(facts.map((fact) => [fact.id, fact]))),
    factLabels: computed(() => new Map<DietEnergy, string>([
      ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'],
    ])),
    init,
    regenerate,
    generateForDates,
    generateForDate,
    selectRange,
    allowConsent,
    declineConsent,
    setConsentChoice,
    clearMealsForDates,
    setWants,
    addPantry,
    addPantryMany,
    removePantry,
    undoPantryRemoval,
    pantryNotice,
    lastPantryRemoval,
    setPantryLow,
    clearPantry,
    clearAllDietData,
    shoppingMerge,
    shoppingFilter,
    setShoppingFilter,
    shoppingCountForDate,
    lastBought,
    boughtNotice,
    recentlyBought,
    toggleShopping,
    buyShopping,
    untickBought,
    clearBought,
    clearYesterdayBought,
    removeShopping,
    undoShoppingRemoval,
    shoppingNotice,
    lastShoppingRemoval,
    addShopping,
    editShopping,
    keepShopping,
    keepAllShopping,
    removeAllNoLongerNeeded,
    undoBought,
    shoppingUpdateStatus,
    shoppingUpdateError,
    retryShoppingUpdate,
    undoShoppingUpdate,
    undoShoppingMerge,
    dismissShoppingMerge,
    markPlanned,
    markMealForDate,
    editMealForDate,
    suggestMealAlternative,
    addActual,
    updateActual,
    deleteActual,
    selectFact,
  };
}
