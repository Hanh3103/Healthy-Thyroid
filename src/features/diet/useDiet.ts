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
  heuristicRangePlan,
  isDatePlannable,
  legacyRangePlan,
  markBought,
  markMeal,
  applyMealShoppingDelta,
  combineQuantities,
  isBasicShoppingItem,
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
}

export type ShoppingFilter = 'all' | 'today' | 'tomorrow' | 'this-week' | 'next-week' | { date: string };

const data = ref<DietData>(normalizeDietData({}, facts));
const activeRange = ref<DietRange>('today');
const status = ref<'idle' | 'loading' | 'ready' | 'error' | 'offline'>('idle');
const statusText = ref('');
const errorText = ref('');
const selectedFactId = ref<string | null>(null);
/** Set by the calendar's Generate button until the consent dialog is answered. */
const pendingGeneration = ref<{
  dates: string[];
  range: DietRange;
  note: string;
  showClipping: boolean;
  answers?: PlanBasis;
} | null>(null);
const generationNote = ref('');
const generatingDates = ref<string[]>([]);
const planStaleNote = ref('');
const shoppingMerge = ref<ShoppingMerge | null>(null);
const shoppingFilter = ref<ShoppingFilter>('all');
const shoppingUpdateStatus = ref<'idle' | 'updating' | 'done' | 'error'>('idle');
const shoppingUpdateError = ref('');
const lastBought = ref<{ itemId: string; pantryItemId?: string; previousStatus: 'open' | 'bought' } | null>(null);
let shoppingUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let shoppingUpdateBatch: Array<{ date: string; oldMeal: { idea: string; ingredients: string[] }; newMeal: { idea: string; ingredients: string[] } }> = [];
let lastShoppingUpdateBatch: Array<{ date: string; oldMeal: { idea: string; ingredients: string[] }; newMeal: { idea: string; ingredients: string[] } }> = [];
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

function basisFor(range: DietRange): PlanBasis {
  return {
    pantry: data.value.pantry.map((item) => item.name),
    wants: [...data.value.wants[range]],
  };
}

/** Prefills the questions from the last answers, then the saved plan, then settings. */
function answersForDate(date: string): DayPlanAnswers {
  const saved = data.value.dayAnswers[date];
  if (saved) return saved;
  const stored = data.value.dayPlans[date];
  if (stored?.basedOn) {
    return {
      ...stored.basedOn,
      scope: stored.range === 'week' ? 'week' : 'day',
      savePantry: true,
      updatedAt: stored.generatedAt,
    };
  }
  return {
    ...basisFor(rangeForDate(date)),
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
  });
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
    pantry: remainingPantry(data.value.pantry.map((item) => item.name), data.value.log, dates),
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
  return remainingPantry(
    basis?.pantry ?? data.value.pantry.map((item) => item.name),
    data.value.log,
    dates,
  );
}

/** Keeps ate / ate-other / skipped markers when a plan is regenerated. */
function carryStatuses(next: RangePlan): RangePlan {
  return {
    ...next,
    days: next.days.map((day) => {
      const previous = data.value.dayPlans[day.date];
      if (!previous) return day;
      const bySlot = new Map(previous.meals.map((meal) => [meal.slot, meal.status] as const));
      return {
        ...day,
        meals: day.meals.map((meal) => ({
          ...meal,
          status: bySlot.get(meal.slot) ?? meal.status,
        })),
      };
    }),
  };
}

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

async function generate(range: DietRange): Promise<void> {
  const request = buildRequest(range);
  if (request.alarmingSymptoms) {
    await applyPlan(range, emergencyRangePlan(request));
    status.value = 'ready';
    statusText.value = 'Please seek urgent help before planning meals.';
    return;
  }
  if (!data.value.consentGiven) {
    await offline(range);
    return;
  }

  status.value = 'loading';
  statusText.value = range === 'week' ? 'Writing seven days of meal ideas…' : 'Writing your meal ideas…';
  errorText.value = '';
  try {
    const raw = await api.requestRangeSuggestion(request, facts);
    const result = parseRangePlan(raw, facts, request, preferences.value);
    if (!result.plan) throw new Error(result.error || 'The AI response could not be used.');
    await applyPlan(range, result.plan);
    status.value = 'ready';
    statusText.value = 'Written from your curated thyroid facts and what you have at home.';
  } catch (error) {
    errorText.value = detailOf(error);
    const previous = data.value.plans[range];
    if (previous) {
      status.value = 'offline';
      statusText.value = `Could not reach the AI. Showing your last ${RANGE_LABELS[range].toLowerCase()} plan.`;
    } else {
      await offline(range, `Could not reach the AI. Showing general food ideas.`);
    }
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
  const pantryNames = answers?.pantry ?? data.value.pantry.map((item) => item.name);
  return {
    range,
    dates: contexts.map((context) => context.date),
    contexts,
    wants: cleanNames(wanted, 16),
    pantry: remainingPantry(
      cleanNames(pantryNames, 40),
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

  generatingDates.value = pending.dates;
  try {
    if (request.alarmingSymptoms) {
      await applyPlan(pending.range, emergencyRangePlan(request), pending.answers);
      status.value = 'ready';
      statusText.value = 'Please seek urgent help before planning meals.';
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
    try {
      const raw = await api.requestRangeSuggestion(request, facts);
      const result = parseRangePlan(raw, facts, request, preferences.value);
      if (!result.plan) throw new Error(result.error || 'The AI response could not be used.');
      await applyPlan(pending.range, result.plan, pending.answers);
      status.value = 'ready';
      statusText.value = 'Written from your curated thyroid facts and what you have at home.';
    } catch (error) {
      errorText.value = detailOf(error);
      await offlineForDates(
        pending.dates,
        pending.range,
        'Could not reach the AI. Showing general food ideas.',
        pending.answers,
      );
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

  const answers = options.pantry || options.wants
    ? { pantry: cleanNames(options.pantry, 40), wants: cleanNames(options.wants, 16) }
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

/** Internal regeneration after an actual-meal change; never prompts for consent. */
async function regenerateDates(dates: string[]): Promise<void> {
  const unique = [...new Set(dates)].filter((date) => isDatePlannable(date)).sort();
  if (!unique.length) return;
  const groups = new Map<DietRange, string[]>();
  unique.forEach((date) => {
    const range = rangeForDate(date);
    groups.set(range, [...(groups.get(range) ?? []), date]);
  });
  for (const [range, group] of groups) {
    pendingGeneration.value = { dates: group, range, note: '', showClipping: false };
    await runPendingGeneration();
  }
}

async function init(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await loadSettings();
  await planner.init();
  planner.checkDay();
  data.value = await api.loadDiet(facts);

  const todayDate = todayContext.value.date;
  const previous = data.value.lastPlan;
  if (!data.value.dayPlans[todayDate] && previous && previous.context.date === todayDate) {
    const legacy = legacyRangePlan(previous, data.value.pantry.map((item) => item.name));
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
  await generate(range);
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

async function addPantry(name: string): Promise<void> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean || pantry.value.some((item) => item.name.toLowerCase() === clean.toLowerCase())) return;
  const item: PantryItem = { id: makeId(), name: clean, addedAt: Date.now() };
  data.value.pantry = [...data.value.pantry, item];
  await persist();
  statusText.value = `${clean} added to your pantry.`;
}

async function removePantry(id: string): Promise<void> {
  data.value.pantry = data.value.pantry.filter((item) => item.id !== id);
  await persist();
}

function setShopping(items: ShoppingItem[]): void {
  data.value.shopping = sortShoppingItems(items);
  rebuildRangePlans(data.value);
}

function isNoLongerNeeded(item: ShoppingItem): boolean {
  return item.status === 'open' && item.source !== 'user' && !item.inPlan;
}

function cleanForDays(days: string[]): string[] {
  return [...new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
}

async function toggleShopping(id: string, bought: boolean): Promise<void> {
  const item = data.value.shopping.find((entry) => entry.id === id);
  if (!item) return;
  if (bought) {
    await buyShopping(id);
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
  const hadPantryItem = data.value.pantry.some((entry) => entry.name.toLowerCase() === item.name.toLowerCase());
  const result = markBought(data.value.pantry, data.value.shopping, id);
  data.value.pantry = result.pantry;
  setShopping(result.shopping);
  const addedPantryItem = hadPantryItem
    ? undefined
    : result.pantry.find((entry) => entry.name.toLowerCase() === item.name.toLowerCase());
  lastBought.value = {
    itemId: id,
    pantryItemId: addedPantryItem?.id,
    previousStatus: item.status === 'bought' ? 'bought' : 'open',
  };
  statusText.value = `${item.name} moved to your pantry.`;
  await persist();
}

async function undoBought(): Promise<void> {
  const purchase = lastBought.value;
  if (!purchase) return;
  setShopping(data.value.shopping.map((item) =>
    item.id === purchase.itemId ? { ...item, status: purchase.previousStatus, updatedAt: Date.now() } : item));
  if (purchase.pantryItemId) {
    data.value.pantry = data.value.pantry.filter((item) => item.id !== purchase.pantryItemId);
  }
  lastBought.value = null;
  statusText.value = 'Move to pantry undone.';
  await persist();
}

async function removeShopping(id: string): Promise<void> {
  const now = Date.now();
  setShopping(data.value.shopping.map((item) =>
    item.id === id ? { ...item, status: 'removed', isNew: false, updatedAt: now } : item));
  if (lastBought.value?.itemId === id) lastBought.value = null;
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
      // Removed items stay removed; adding the same name again does not revive them.
      if (previous.status === 'removed') continue;
      const updated: ShoppingItem = {
        ...previous,
        forDays: [...new Set([...previous.forDays, ...days])].sort(),
        quantity: combineQuantities(previous.quantity, cleanQuantity) || previous.quantity,
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
  setShopping(data.value.shopping.map((item) => {
    if (item.id !== id) return item;
    const updated: ShoppingItem = { ...item, name: clean, quantity: cleanQuantity || undefined, updatedAt: now };
    if (!updated.quantity) delete updated.quantity;
    return updated;
  }));
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
    const currentShopping = shoppingForDates(dates).map((item) => ({
      name: item.name, status: item.status, inPlan: item.inPlan,
    }));
    const result = await api.requestShoppingUpdate({
      edits: batch.map((entry) => ({ oldMeal: entry.oldMeal, newMeal: entry.newMeal })),
      pantry: data.value.pantry.map((item) => item.name),
      currentShopping,
      allergies: [],
      avoidFoods: preferences.value.avoid.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
    });
    await applyShoppingDeltaToDates(dates, result.add, result.remove);
    shoppingUpdateStatus.value = 'done';
  } catch (error) {
    // fallback: if ingredients were entered, add missing ones locally
    const pantryNames = data.value.pantry.map((item) => item.name.toLowerCase());
    const fallbackAdd = batch.flatMap((entry) => entry.newMeal.ingredients)
      .map((name) => name.replace(/\s+/g, ' ').trim().slice(0, 80))
      .filter((name) => name && !pantryNames.includes(name.toLowerCase()));
    if (fallbackAdd.length) {
      await applyShoppingDeltaToDates(dates, fallbackAdd, []);
    }
    shoppingUpdateStatus.value = 'error';
    shoppingUpdateError.value = detailOf(error) || 'Could not update the shopping list';
  }
}

function queueShoppingUpdate(date: string, oldMeal: { idea: string; ingredients: string[] }, newMeal: { idea: string; ingredients: string[] }): void {
  shoppingUpdateBatch.push({ date, oldMeal, newMeal });
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
  await regenerateDates(dates);

  // Food eaten today also changes what is left at home tomorrow.
  const now = new Date();
  const tomorrow = keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12));
  if (dates.includes(todayContext.value.date) && data.value.dayPlans[tomorrow]) {
    await regenerateDates([tomorrow]);
  }
}

function findMealDate(mealId: string): string {
  for (const [date, stored] of Object.entries(data.value.dayPlans)) {
    if (stored.meals.some((meal) => meal.id === mealId)) return date;
  }
  return '';
}

async function suggestMealAlternative(date: string, mealId: string): Promise<{ idea: string; ingredients: string[]; prepMinutes: number } | null> {
  const stored = data.value.dayPlans[date];
  const meal = stored?.meals.find((item) => item.id === mealId);
  if (!meal) return null;
  try {
    return await api.requestMealAlternative({
      slot: meal.slot,
      currentIdea: meal.idea,
      currentIngredients: meal.ingredients ?? [],
      allergies: [],
      avoidFoods: preferences.value.avoid.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
      pantry: data.value.pantry.map((item) => item.name),
    });
  } catch {
    return null;
  }
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

  await persist();
  queueShoppingUpdate(date, oldMeal, { idea: cleanIdea, ingredients: cleanIngredients });
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

/* A saved check-in changes energy: do not regenerate; prompt the user. */
watch(
  () => [planner.checkIn.value?.at ?? 0, planner.energy.value] as const,
  (next, previous) => {
    if (!watchReady || !data.value.plans.today) return;
    if (next[0] === previous[0] && next[1] === previous[1]) return;
    planStaleNote.value = 'Your energy changed since this plan was made. Regenerate?';
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
    removePantry,
    shoppingMerge,
    shoppingFilter,
    setShoppingFilter,
    shoppingCountForDate,
    lastBought,
    toggleShopping,
    buyShopping,
    removeShopping,
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
