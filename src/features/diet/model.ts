/**
 * Diet Advisor model: pure types, rules, prompt/response handling and local
 * fallbacks. No Vue, no DOM, no network. Facts are passed in by the caller so
 * the curated library stays editable and this module stays testable.
 */
import { daysUntil, keyOf } from '../../shared/utils/index.ts';
import {
  buildHabitItems,
  isDateKey,
  isTodayTask,
  tasksForEnergy,
  type AppState,
  type EnergyLevel as PlannerEnergy,
} from '../planner/model.ts';
import {
  DEFAULT_DIET_SETTINGS,
  normalizeDietSettings,
  splitProfileList,
  type DietSettings,
} from '../profile/dietSettings.ts';

export type DietEnergy = 'low' | 'medium' | 'high';
export type Busyness = 'light' | 'normal' | 'packed';
export type Evidence = 'strong' | 'moderate' | 'limited';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type DietRange = 'today' | 'tomorrow' | 'week';
export type MealStatus = 'planned' | 'ate' | 'ate-other' | 'skipped';
export type MealKind = 'main' | 'fallback';
export type PlanScope = 'day' | 'week';
export type ConsentChoice = 'unset' | 'allowed' | 'declined';

/** The optional answers that shape one generated plan. */
export interface PlanBasis {
  pantry: string[];
  wants: string[];
  appetite?: 'low' | 'normal' | 'high';
}

export interface DayPlanAnswers extends PlanBasis {
  scope: PlanScope;
  savePantry: boolean;
  updatedAt: number;
}

export interface ThyroidFact {
  id: string;
  text: string;
  evidence: Evidence;
  source: { title: string; url: string };
  lastReviewed: string;
  verified: boolean;
}

export interface DietContext {
  date: string;
  energy: DietEnergy;
  busyness: Busyness;
  totalMinutes: number;
  taskCount: number;
  /** Future energy is unknown; today's level is shown only as a hint. */
  energyIsHint?: boolean;
}

/** Profile owns these settings; Diet keeps the alias for its existing API. */
export type DietPreferences = DietSettings;
export const DEFAULT_PREFERENCES = DEFAULT_DIET_SETTINGS;
export const normalizePreferences = normalizeDietSettings;

export interface DietInput extends DietContext {
  preferences: DietPreferences;
  alarmingSymptoms: boolean;
}

export interface MealIdea {
  slot: MealSlot;
  idea: string;
  prepMinutes: number;
  why: string;
  factIds: string[];
  ingredients?: string[];
}

export interface TimingNote {
  text: string;
  factIds: string[];
}

export interface DietPlan {
  summary: string;
  meals: MealIdea[];
  timingNotes: TimingNote[];
  urgent: boolean;
  context: DietContext;
  source: 'ai' | 'offline';
  generatedAt: number;
}

export type PantrySource = 'manual' | 'shopping';

export interface PantryItem {
  id: string;
  name: string;
  addedAt: number;
  /** Running low: still at home, but treated as missing for planning. */
  low?: boolean;
  source?: PantrySource;
  /** Set when the item was ticked as bought on the shopping list. */
  boughtAt?: number;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity?: string;
  /** Planned dates that need this item. Empty means an open, self-added item. */
  forDays: string[];
  source: 'ai' | 'user';
  status: 'open' | 'bought' | 'removed';
  inPlan: boolean;
  isNew?: boolean;
  /** Added or hidden because a matching pantry item was added/removed. */
  fromPantry?: boolean;
  /** Added because the matching pantry item was marked running low. */
  runningLow?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** All saved pantry names, including items that are running low. */
export function pantryNames(pantry: PantryItem[]): string[] {
  return pantry.map((item) => item.name);
}

/** Names the AI and shopping list may treat as available at home. */
export function availablePantryNames(pantry: PantryItem[]): string[] {
  return pantry.filter((item) => item.low !== true).map((item) => item.name);
}

export interface ShoppingMerge {
  summary: ShoppingMergeSummary;
  before: ShoppingItem[];
  after: ShoppingItem[];
}

/** Public log shape shared with the calendar. `ActualEntry` adds local edit metadata. */
export interface DietLogEntry {
  date: string;
  meal: MealSlot;
  status: MealStatus;
  text: string;
}

export interface ActualEntry extends Omit<DietLogEntry, 'meal'> {
  id: string;
  slot: MealSlot;
  mealId?: string;
  createdAt: number;
  updatedAt: number;
}

export function toDietLogEntries(entries: ActualEntry[]): DietLogEntry[] {
  return entries.map(({ date, slot, status, text }) => ({
    date,
    meal: slot,
    status,
    text,
  }));
}

/* -------------------------------------------------------------------------- */
/* Meal planning horizon                                                      */
/* -------------------------------------------------------------------------- */

/** Meals can be planned this many days ahead of today. Change here only. */
export const PLAN_AHEAD_DAYS = 14;

/** Midday of the last date that is inside the planning window. */
export function lastPlannableDate(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + PLAN_AHEAD_DAYS, 12);
}

/** Past days are always plannable; future days only inside the horizon. */
export function isDatePlannable(key: string, now: Date = new Date()): boolean {
  const days = daysUntil(key, now);
  return days !== null && days <= PLAN_AHEAD_DAYS;
}

/** Monday at midday of the week containing the given date. */
export function mondayOf(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset, 12);
}

/** Whole-week offset of a date relative to the week containing today. */
export function weekOffsetOf(date: Date, now: Date = new Date()): number {
  const target = mondayOf(date).getTime();
  const current = mondayOf(now).getTime();
  return Math.round((target - current) / (7 * 86_400_000));
}

/** Last week offset that still contains at least one plannable day. */
export function maxPlannableWeekOffset(now: Date = new Date()): number {
  return weekOffsetOf(lastPlannableDate(now), now);
}

/** True while the next month still contains a day inside the planning window. */
export function canAdvanceMonth(year: number, month: number, now: Date = new Date()): boolean {
  const next = new Date(year, month + 1, 1, 12);
  return next.getTime() <= lastPlannableDate(now).getTime();
}

export interface PlannedMeal extends MealIdea {
  id: string;
  day: string;
  kind: MealKind;
  ingredients: string[];
  status: MealStatus;
  source: 'ai' | 'user';
  editedAt?: number;
}

export interface DayPlan {
  date: string;
  summary: string;
  meals: PlannedMeal[];
  timingNotes: TimingNote[];
  urgent: boolean;
  context: DietContext;
  source: 'ai' | 'offline';
  generatedAt: number;
}

export interface RangePlan {
  range: DietRange;
  days: DayPlan[];
  shopping: ShoppingItem[];
  source: 'ai' | 'offline';
  generatedAt: number;
  hint?: DietContext;
}

/**
 * A plan saved for one calendar date. Each planned meal keeps its own status,
 * so the calendar day panel and the Diet Advisor always read the same data.
 */
export interface MealPlanDay {
  date: string;
  summary: string;
  meals: PlannedMeal[];
  timingNotes: TimingNote[];
  urgent: boolean;
  context: DietContext;
  source: 'ai' | 'offline';
  generatedAt: number;
  range: DietRange | 'day';
  /** Snapshot of the answers actually used for this plan. */
  basedOn?: PlanBasis;
}

export interface DietData {
  preferences: DietPreferences;
  lastPlan: DietPlan | null;
  consentGiven: boolean;
  /** 'unset' keeps the inline first-time notice visible in the day panel. */
  consentChoice: ConsentChoice;
  pantry: PantryItem[];
  wants: Record<DietRange, string[]>;
  plans: Record<DietRange, RangePlan | null>;
  /** Canonical per-date plans; range plans are rebuilt from these. */
  dayPlans: Record<string, MealPlanDay>;
  /** Prefills the day-panel questions on later visits. */
  dayAnswers: Record<string, DayPlanAnswers>;
  log: ActualEntry[];
  /** The single canonical shopping list for every planned day. */
  shopping: ShoppingItem[];
}

/** A sanitised AI request; no names, planner notes or medical records. */
export interface RangeRequest {
  range: DietRange;
  dates: string[];
  contexts: DietContext[];
  wants: string[];
  pantry: string[];
  preferences: DietPreferences;
  log: ActualEntry[];
  alarmingSymptoms: boolean;
  hint?: DietContext;
  currentShopping?: { name: string; status: 'open' | 'bought' | 'removed'; inPlan: boolean; source: 'ai' | 'user' }[];
}

export interface RangeInput {
  range: DietRange;
  days: DietContext[];
  wants: string[];
  pantry: string[];
  settings: {
    medicationTime: string;
    mealTimes: { breakfast: string; lunch: string; dinner: string };
    dietPreferences: string;
    allergies: string[];
    avoidFoods: string[];
    cookingMinutes: number;
    equipment: string[];
    servings: number;
    leftovers: boolean;
    cuisinePreference: string;
    shopping: string;
    budget: 'low' | 'medium' | 'high';
  };
  actual: { date: string; slot: MealSlot; status: MealStatus; text: string }[];
  shoppingList?: string[];
  todayHint?: { date: string; energy: DietEnergy };
  alarmingSymptoms: boolean;
}

export const RANGE_LABELS: Record<DietRange, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'Next week',
};

export const WANT_CHIPS = [
  'soup',
  'salad',
  'leftovers',
  'vegetarian',
  'batch cooking',
  'no-cook',
  'fish',
  'eggs',
  'berries',
  'oats',
];

/** Rules embedded in the prompt. The Rust command enforces the same rules. */
export const DIET_SYSTEM_PROMPT = `You suggest general food ideas. You are not a doctor and you must never give medical advice.
Use ONLY the facts in the FACTS list for any science or thyroid claim. Cite them by their exact id in factIds. Anything outside the library: say "ask your doctor or a dietitian".
Never diagnose, change or suggest medication doses, and never recommend supplements or supplement doses.
Respect the user's allergies and preferences strictly. Do not send or repeat names or personal notes.
Use food ideas and meal timing only. Never claim that food cures, reverses or treats thyroid disease.
If the input mentions chest pain, trouble breathing, fainting or a very fast heartbeat, set urgent to true and tell the user to contact a doctor or emergency services instead of giving meals.
For a packed day or low energy, keep meals at 10 minutes or less: no-cook or batch-prepared, protein plus fibre, regular meal times and enough water.
For a light day and high energy, more cooking time is fine and include one meal-prep idea for tomorrow in the summary.
Plan only the requested range. For tomorrow and next week, energy is unknown: give each day full main meals plus one quick fallback meal (10 minutes or less) for a low-energy day. Today's energy is a hint only.
Reuse ingredients across the week. Return ingredients for every meal, then a minimal shopping list of only the missing items; anything already in the pantry must NOT appear.
If a shoppingList is provided, do not suggest items already bought or removed by the user.
Never include pantry basics in shopping: salt, pepper or water are assumed at home.
If actual meals eaten are supplied, adjust only the remaining meals, keep the timing notes and science notes, and use what is left at home.
Reply only with JSON: {"summary":string,"meals":[{"day":"YYYY-MM-DD","slot":"breakfast"|"lunch"|"dinner"|"snack","kind":"main"|"fallback","idea":string,"prepMinutes":number,"why":string,"ingredients":string[],"factIds":string[]}],"timingNotes":[{"text":string,"factIds":string[]}],"shopping":string[],"urgent":boolean}`;

const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_STATUSES: MealStatus[] = ['planned', 'ate', 'ate-other', 'skipped'];
const DIET_RANGES: DietRange[] = ['today', 'tomorrow', 'week'];
const PLAN_SCOPES: (DietRange | 'day')[] = ['today', 'tomorrow', 'week', 'day'];
const PLAN_SCOPE_OPTIONS: PlanScope[] = ['day', 'week'];
const CONSENT_CHOICES: ConsentChoice[] = ['unset', 'allowed', 'declined'];
const ALARMING = /(chest pain|shortness of breath|trouble breathing|difficulty breathing|faint(?:ed|ing)?|pass(?:ed)? out|palpitations|very fast heartbeat|racing heart)/i;
const MEDICAL_CLAIM = /\b(cure[sd]?|curing|revers(?:e|es|ed|ing)|heal(?:s|ed|ing)?|treat(?:s|ed|ing)?\s+(?:thyroid|disease|condition)|prevent(?:s|ed|ing)?\s+(?:thyroid|disease|condition)|detox)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max = 240): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueByText(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = lower(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function energyFromPlanner(level: PlannerEnergy): DietEnergy {
  return level === 1 ? 'low' : level === 3 ? 'high' : 'medium';
}

export function energyLabel(energy: DietEnergy): string {
  return energy === 'low' ? 'Low' : energy === 'medium' ? 'Medium' : 'High';
}

export function busynessLabel(busyness: Busyness): string {
  return busyness === 'light' ? 'Light' : busyness === 'normal' ? 'Normal' : 'Packed';
}

/** Light: under 2h. Normal: 2–5h. Packed: over 5h. */
export function computeBusyness(totalMinutes: number): Busyness {
  if (totalMinutes < 120) return 'light';
  if (totalMinutes <= 300) return 'normal';
  return 'packed';
}

/** Builds today's inputs from planner state. Only counts and levels stay local. */
export function buildDietContext(
  state: AppState,
  plannerEnergy: PlannerEnergy,
  _preferences: DietPreferences,
  now: Date = new Date(),
): DietContext {
  const todayTasks = state.tasks.filter((task) => !task.done && isTodayTask(task));
  const fitted = tasksForEnergy(todayTasks, plannerEnergy);
  const taskMinutes = fitted.reduce((sum, task) => sum + (task.min || 0), 0);
  const habits = buildHabitItems(state.habits, state.log, now, plannerEnergy).items;
  const habitMinutes = habits.reduce((sum, habit) => sum + (habit.detail?.min || 0), 0);

  return {
    date: keyOf(now),
    energy: energyFromPlanner(plannerEnergy),
    busyness: computeBusyness(taskMinutes + habitMinutes),
    totalMinutes: taskMinutes + habitMinutes,
    taskCount: fitted.length,
  };
}

/**
 * Future busyness comes from tasks due on that exact day plus recurring habits.
 * Energy is not known yet, so it is flagged as today's hint only.
 */
export function buildContextsForDates(
  state: AppState,
  dates: Date[],
  _preferences: DietPreferences,
  today: DietContext,
): DietContext[] {
  return dates.map((date) => {
    const key = keyOf(date);
    if (key === today.date) return today;
    const plannerEnergy = state.energy;
    const tasks = state.tasks.filter((task) => !task.done && daysUntil(task.due, date) === 0);
    const fitted = tasksForEnergy(tasks, plannerEnergy);
    const taskMinutes = fitted.reduce((sum, task) => sum + (task.min || 0), 0);
    const habitMinutes = buildHabitItems(state.habits, state.log, date, plannerEnergy).items
      .reduce((sum, habit) => sum + (habit.detail?.min || 0), 0);
    return {
      date: key,
      energy: energyFromPlanner(plannerEnergy),
      busyness: computeBusyness(taskMinutes + habitMinutes),
      totalMinutes: taskMinutes + habitMinutes,
      taskCount: fitted.length,
      energyIsHint: true,
    };
  });
}

export function detectAlarmingSymptoms(text: string): boolean {
  return ALARMING.test(text);
}

function normalizeContext(value: unknown): DietContext {
  const raw = isRecord(value) ? value : {};
  return {
    date: cleanText(raw.date, 10),
    energy: oneOf(raw.energy, ['low', 'medium', 'high'] as const, 'medium'),
    busyness: oneOf(raw.busyness, ['light', 'normal', 'packed'] as const, 'normal'),
    totalMinutes: clampNumber(raw.totalMinutes, 0, 0, 100000),
    taskCount: clampNumber(raw.taskCount, 0, 0, 1000),
    energyIsHint: raw.energyIsHint === true,
  };
}

function normalizeFactIds(value: unknown, facts: ThyroidFact[]): string[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(facts.map((fact) => fact.id));
  const unique = new Set<string>();
  value.forEach((id) => {
    if (typeof id === 'string' && known.has(id)) unique.add(id);
  });
  return [...unique].slice(0, 3);
}

function normalizeMeals(value: unknown, facts: ThyroidFact[]): MealIdea[] {
  if (!Array.isArray(value)) return [];
  const meals: MealIdea[] = [];
  value.forEach((entry) => {
    if (!isRecord(entry)) return;
    const slot = oneOf(entry.slot, MEAL_SLOTS, 'snack');
    const idea = cleanText(entry.idea, 180);
    const why = cleanText(entry.why, 180);
    if (!idea || !why) return;
    meals.push({
      slot,
      idea,
      why,
      prepMinutes: clampNumber(entry.prepMinutes, 10, 0, 240),
      factIds: normalizeFactIds(entry.factIds, facts),
      ingredients: normalizeIngredients(entry.ingredients),
    });
  });
  return meals;
}

function normalizeTimingNotes(value: unknown, facts: ThyroidFact[]): TimingNote[] {
  if (!Array.isArray(value)) return [];
  const notes: TimingNote[] = [];
  value.forEach((entry) => {
    if (!isRecord(entry)) return;
    const text = cleanText(entry.text, 240);
    if (!text) return;
    notes.push({ text, factIds: normalizeFactIds(entry.factIds, facts) });
  });
  return notes.slice(0, 8);
}

function normalizeTextList(value: unknown, maxCount = 12, maxLength = 100): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueByText(value.map((item) => cleanText(item, maxLength))).slice(0, maxCount);
}

function normalizeIngredients(value: unknown): string[] {
  return normalizeTextList(value, 14, 60);
}

function normalizePantry(value: unknown): PantryItem[] {
  if (!Array.isArray(value)) return [];
  const byName = new Map<string, PantryItem>();
  value.forEach((entry) => {
    const rec = isRecord(entry) ? entry : {};
    const name = cleanText(rec.name ?? entry, 80);
    if (!name || byName.has(lower(name))) return;
    const boughtAt = clampNumber(rec.boughtAt, 0, 0, Number.MAX_SAFE_INTEGER);
    byName.set(lower(name), {
      id: cleanText(rec.id, 60) || newId(),
      name,
      addedAt: clampNumber(rec.addedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      low: rec.low === true || undefined,
      source: oneOf(rec.source, ['manual', 'shopping'] as const, 'manual'),
      boughtAt: boughtAt || undefined,
    });
  });
  return [...byName.values()].slice(0, 200);
}

const BASIC_SHOPPING_NAMES = new Set(['salt', 'pepper', 'water']);

/** Staples the planner always assumes are at home, so they never reach the list. */
export function isBasicShoppingItem(name: string): boolean {
  return BASIC_SHOPPING_NAMES.has(lower(name));
}

function normalizeShoppingDays(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const days = raw.flatMap((entry) => {
    const day = cleanText(entry, 10);
    return isDateKey(day) ? [day] : [];
  });
  return [...new Set(days)].sort();
}

interface QuantityParts {
  amount: number;
  unit: string;
}

function parseQuantity(value: string): QuantityParts | null {
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  return { amount, unit: match[2].trim() };
}

function formatQuantityAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return String(Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, ''));
}

/** Adds quantities when their units match; otherwise keeps both readable values. */
export function combineQuantities(...values: Array<string | undefined>): string | undefined {
  const cleaned = values
    .map((value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean);
  if (!cleaned.length) return undefined;
  const parsed = cleaned.map((value) => parseQuantity(value));
  if (parsed.every((part): part is QuantityParts => part !== null)) {
    const first = parsed[0];
    if (parsed.every((part) => part.unit.toLowerCase() === first.unit.toLowerCase())) {
      const total = parsed.reduce((sum, part) => sum + part.amount, 0);
      return `${formatQuantityAmount(total)}${first.unit ? ` ${first.unit}` : ''}`.trim().slice(0, 60);
    }
  }
  return [...new Set(cleaned)].join(' + ').slice(0, 60);
}

function shoppingStatusRank(status: ShoppingItem['status']): number {
  if (status === 'removed') return 3;
  if (status === 'bought') return 2;
  return 1;
}

/**
 * Different days add their known quantities. Regenerating a day that is already
 * on the line replaces that day with the new AI total instead of doubling it.
 */
function nextShoppingQuantity(current: ShoppingItem, next: ShoppingItem | undefined): string | undefined {
  if (!next) return current.quantity;
  const currentDays = shoppingDays(current);
  const nextDays = shoppingDays(next);
  const sameDay = nextDays.some((day) => currentDays.includes(day));
  if (!sameDay && currentDays.length && nextDays.length) {
    return combineQuantities(current.quantity, next.quantity);
  }
  return next.quantity ?? current.quantity;
}

/** Aggregates two records for the same ingredient into one shopping line. */
function shoppingDays(item: ShoppingItem): string[] {
  return Array.isArray(item.forDays) ? item.forDays : [];
}

function mergeShoppingEntries(current: ShoppingItem | undefined, next: ShoppingItem): ShoppingItem {
  if (!current) return next;
  const status = shoppingStatusRank(next.status) > shoppingStatusRank(current.status)
    ? next.status
    : current.status;
  return {
    ...current,
    forDays: [...new Set([...shoppingDays(current), ...shoppingDays(next)])].sort(),
    quantity: combineQuantities(current.quantity, next.quantity),
    source: current.source === 'user' || next.source === 'user' ? 'user' : 'ai',
    status,
    // A line is active when any of its days still needs it.
    inPlan: current.inPlan || next.inPlan,
    isNew: current.isNew || next.isNew ? true : undefined,
    fromPantry: current.fromPantry || next.fromPantry ? true : undefined,
    runningLow: current.runningLow || next.runningLow ? true : undefined,
    createdAt: Math.min(current.createdAt, next.createdAt),
    updatedAt: Math.max(current.updatedAt, next.updatedAt),
  };
}

export function sortShoppingItems(items: ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((a, b) => {
    const firstDay = [...shoppingDays(a)].sort()[0] ?? '9999-12-31';
    const secondDay = [...shoppingDays(b)].sort()[0] ?? '9999-12-31';
    const byDay = firstDay.localeCompare(secondDay);
    if (byDay) return byDay;
    const bySpan = shoppingDays(b).length - shoppingDays(a).length;
    if (bySpan) return bySpan;
    return lower(a.name).localeCompare(lower(b.name));
  });
}

/** Active items needed on one date, including days chosen for self-added items. */
export function countShoppingForDate(items: ShoppingItem[], date: string): number {
  return items.filter((item) => item.status === 'open'
    && (item.inPlan || item.source === 'user')
    && shoppingDays(item).includes(date)).length;
}

function normalizeShopping(value: unknown): ShoppingItem[] {
  if (!Array.isArray(value)) return [];
  const byName = new Map<string, ShoppingItem>();
  value.forEach((entry) => {
    const name = cleanText(isRecord(entry) ? entry.name : entry, 80);
    if (!name || isBasicShoppingItem(name)) return;
    const rec = isRecord(entry) ? entry : {};
    const checked = rec.checked === true;
    const status = oneOf(rec.status, ['open', 'bought', 'removed'] as const, checked ? 'bought' : 'open');
    const source = oneOf(rec.source, ['ai', 'user'] as const, 'ai');
    const now = Date.now();
    const next: ShoppingItem = {
      id: cleanText(rec.id, 60) || newId(),
      name,
      quantity: cleanText(rec.quantity, 60) || undefined,
      forDays: normalizeShoppingDays(rec.forDays ?? (rec.date ? [rec.date] : [])),
      source,
      status,
      inPlan: rec.inPlan !== false,
      isNew: rec.isNew === true ? true : undefined,
      fromPantry: rec.fromPantry === true ? true : undefined,
      runningLow: rec.runningLow === true ? true : undefined,
      createdAt: clampNumber(rec.createdAt ?? rec.addedAt, now, 0, Number.MAX_SAFE_INTEGER),
      updatedAt: clampNumber(rec.updatedAt ?? rec.createdAt ?? rec.addedAt, now, 0, Number.MAX_SAFE_INTEGER),
    };
    const key = lower(name);
    byName.set(key, mergeShoppingEntries(byName.get(key), next));
  });
  return sortShoppingItems([...byName.values()].slice(0, 200));
}

function normalizeActualEntries(value: unknown): ActualEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const text = cleanText(entry.text, 300);
    if (!text) return [];
    const now = Date.now();
    return [{
      id: cleanText(entry.id, 60) || newId(),
      date: cleanText(entry.date, 10),
      slot: oneOf(entry.slot, MEAL_SLOTS, 'snack'),
      text,
      status: oneOf(entry.status, MEAL_STATUSES, 'ate'),
      mealId: cleanText(entry.mealId, 60) || undefined,
      createdAt: clampNumber(entry.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
      updatedAt: clampNumber(entry.updatedAt, now, 0, Number.MAX_SAFE_INTEGER),
    }];
  }).slice(0, 500);
}

function normalizeWants(value: unknown): Record<DietRange, string[]> {
  const raw = isRecord(value) ? value : {};
  return {
    today: normalizeTextList(raw.today, 12, 100),
    tomorrow: normalizeTextList(raw.tomorrow, 12, 100),
    week: normalizeTextList(raw.week, 16, 100),
  };
}

function normalizeBasis(value: unknown): PlanBasis {
  const raw = isRecord(value) ? value : {};
  return {
    pantry: normalizeTextList(raw.pantry, 40, 80),
    wants: normalizeTextList(raw.wants, 16, 100),
    appetite: raw.appetite === 'low' || raw.appetite === 'normal' || raw.appetite === 'high'
      ? raw.appetite
      : undefined,
  };
}

function normalizeDayAnswers(value: unknown): DayPlanAnswers | null {
  if (!isRecord(value)) return null;
  const basis = normalizeBasis(value);
  return {
    ...basis,
    scope: oneOf(value.scope, PLAN_SCOPE_OPTIONS, 'day'),
    savePantry: value.savePantry !== false,
    updatedAt: clampNumber(value.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeDayAnswersMap(value: unknown): Record<string, DayPlanAnswers> {
  const result: Record<string, DayPlanAnswers> = {};
  if (!isRecord(value)) return result;
  for (const [key, entry] of Object.entries(value)) {
    if (!isDateKey(key)) continue;
    const answers = normalizeDayAnswers(entry);
    if (answers) result[key] = answers;
  }
  return result;
}

function normalizePlannedMeals(value: unknown, facts: ThyroidFact[], dates: string[]): PlannedMeal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const idea = cleanText(entry.idea, 180);
    const why = cleanText(entry.why, 180);
    if (!idea || !why) return [];
    const suggestedDay = cleanText(entry.day, 10);
    const day = dates.includes(suggestedDay)
      ? suggestedDay
      : dates[index % Math.max(dates.length, 1)] ?? dates[0] ?? '';
    const source = entry.source === 'user' ? 'user' as const : 'ai' as const;
    const editedAt = clampNumber(entry.editedAt, 0, 0, Number.MAX_SAFE_INTEGER);
    return [{
      id: cleanText(entry.id, 60) || newId(),
      day,
      slot: oneOf(entry.slot, MEAL_SLOTS, 'snack'),
      kind: entry.kind === 'fallback' ? 'fallback' as const : 'main' as const,
      idea,
      why,
      prepMinutes: clampNumber(entry.prepMinutes, 10, 0, 240),
      factIds: normalizeFactIds(entry.factIds, facts),
      ingredients: normalizeIngredients(entry.ingredients),
      status: oneOf(entry.status, MEAL_STATUSES, 'planned'),
      source,
      editedAt: editedAt > 0 ? editedAt : undefined,
    }];
  });
}

function normalizeDayPlan(value: unknown, facts: ThyroidFact[], fallbackDate: string): DayPlan | null {
  if (!isRecord(value)) return null;
  const summary = cleanText(value.summary, 300);
  if (!summary && value.urgent !== true) return null;
  const date = cleanText(value.date, 10) || fallbackDate;
  return {
    date,
    summary: summary || 'Please contact a doctor or emergency services now.',
    meals: normalizePlannedMeals(value.meals, facts, [date]),
    timingNotes: normalizeTimingNotes(value.timingNotes, facts),
    urgent: value.urgent === true,
    context: normalizeContext(value.context ?? { date }),
    source: value.source === 'ai' ? 'ai' : 'offline',
    generatedAt: clampNumber(value.generatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeRangePlan(value: unknown, facts: ThyroidFact[], fallbackRange: DietRange): RangePlan | null {
  if (!isRecord(value) || !Array.isArray(value.days) || !value.days.length) return null;
  const days = value.days
    .map((day, index) => normalizeDayPlan(day, facts, cleanText(isRecord(day) ? day.date : '', 10) || `day-${index}`))
    .filter((day): day is DayPlan => day !== null);
  if (!days.length) return null;
  return {
    range: oneOf(value.range, DIET_RANGES, fallbackRange),
    days,
    shopping: normalizeShopping(value.shopping),
    source: value.source === 'ai' ? 'ai' : 'offline',
    generatedAt: clampNumber(value.generatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    hint: isRecord(value.hint) ? normalizeContext(value.hint) : undefined,
  };
}

function normalizeMealPlanDay(value: unknown, facts: ThyroidFact[], fallbackDate: string): MealPlanDay | null {
  const day = normalizeDayPlan(value, facts, fallbackDate);
  if (!day) return null;
  const raw = isRecord(value) ? value : {};
  return {
    ...day,
    range: oneOf(raw.range, PLAN_SCOPES, 'day'),
    basedOn: isRecord(raw.basedOn) ? normalizeBasis(raw.basedOn) : undefined,
  };
}

function normalizeDayPlans(value: unknown, facts: ThyroidFact[]): Record<string, MealPlanDay> {
  const result: Record<string, MealPlanDay> = {};
  if (!isRecord(value)) return result;
  for (const [key, entry] of Object.entries(value)) {
    if (!isDateKey(key)) continue;
    const day = normalizeMealPlanDay(entry, facts, key);
    if (day) result[key] = { ...day, date: key };
  }
  return result;
}

/** Projects the legacy range plans into the per-date store on first load. */
export function dayPlansFromRangePlans(
  plans: Record<DietRange, RangePlan | null>,
): Record<string, MealPlanDay> {
  const result: Record<string, MealPlanDay> = {};
  DIET_RANGES.forEach((range) => {
    const plan = plans[range];
    if (!plan) return;
    plan.days.forEach((day) => {
      result[day.date] = {
        date: day.date,
        summary: day.summary,
        meals: day.meals,
        timingNotes: day.timingNotes,
        urgent: day.urgent,
        context: day.context,
        source: day.source,
        generatedAt: day.generatedAt,
        range,
      };
    });
  });
  return result;
}

/** Rebuilds a range plan from only the dates that actually have a saved plan. */
export function buildRangePlanFromDays(
  range: DietRange,
  dates: string[],
  dayPlans: Record<string, MealPlanDay>,
  hint?: DietContext,
  shoppingItems: ShoppingItem[] = [],
): RangePlan | null {
  const days: DayPlan[] = [];
  dates.forEach((date) => {
    const stored = dayPlans[date];
    if (!stored) return;
    days.push({
      date,
      summary: stored.summary,
      meals: stored.meals,
      timingNotes: stored.timingNotes,
      urgent: stored.urgent,
      context: stored.context,
      source: stored.source,
      generatedAt: stored.generatedAt,
    });
  });
  if (!days.length) return null;
  const shopping = sortShoppingItems(shoppingItems.filter((item) => {
    const days = shoppingDays(item);
    return item.status !== 'removed'
      && (days.length === 0 || days.some((day) => dates.includes(day)));
  }));
  return {
    range,
    days,
    shopping,
    source: days.some((day) => day.source === 'ai') ? 'ai' : 'offline',
    generatedAt: days.reduce((max, day) => Math.max(max, day.generatedAt), 0),
    hint,
  };
}

/** Range plans are a view over the per-date plans; keep the two in step. */
export function rebuildRangePlans(
  data: DietData,
  hint?: DietContext,
  now: Date = new Date(),
): void {
  DIET_RANGES.forEach((range) => {
    const dates = datesForRange(range, now).map((date) => keyOf(date));
    data.plans[range] = buildRangePlanFromDays(
      range,
      dates,
      data.dayPlans,
      range === 'today' ? undefined : hint,
      data.shopping,
    );
  });
}

function shoppingForMeals(meals: PlannedMeal[], shopping: ShoppingItem[]): ShoppingItem[] {
  const ingredients = meals.flatMap((meal) => meal.ingredients.map(lower));
  if (!ingredients.length) return shopping;
  const used = shopping.filter((item) => {
    const name = lower(item.name);
    return ingredients.some((ingredient) => ingredient.includes(name) || name.includes(ingredient));
  });
  return used.length ? used : shopping;
}

/** Stores a generated plan per date, then refreshes the range views. */
export function storeRangePlanInDays(
  data: DietData,
  plan: RangePlan,
  range: DietRange,
  hint?: DietContext,
  now: Date = new Date(),
  basedOn?: PlanBasis,
): Record<string, ShoppingMergeSummary> {
  const affectedDates = plan.days.map((day) => day.date);
  const generated = new Map<string, ShoppingItem>();
  plan.days.forEach((day) => {
    shoppingForMeals(day.meals, plan.shopping).forEach((item) => {
      const key = lower(item.name);
      const existing = generated.get(key);
      if (!existing) {
        generated.set(key, { ...item, forDays: [day.date] });
        return;
      }
      existing.forDays = [...new Set([...shoppingDays(existing), day.date])].sort();
    });
  });
  // One line per ingredient; quantities stay per range, days are unioned.
  const aiItems = normalizeShopping([...generated.values()]);
  const merged = mergeShoppingList(data.shopping, aiItems, affectedDates);
  data.shopping = merged.items;
  plan.days.forEach((day) => {
    data.dayPlans[day.date] = {
      date: day.date,
      summary: day.summary,
      meals: day.meals,
      timingNotes: day.timingNotes,
      urgent: day.urgent,
      context: day.context,
      source: day.source,
      generatedAt: day.generatedAt,
      range,
      basedOn: basedOn ?? data.dayPlans[day.date]?.basedOn,
    };
  });
  rebuildRangePlans(data, hint, now);
  return { shopping: merged.summary };
}

/**
 * Test/dev reset: removes plans, answers and actual entries for the given dates.
 * Pantry, wants, preferences and consent are intentionally left alone.
 */
export function clearMealDataForDates(
  data: DietData,
  dates: string[],
  now: Date = new Date(),
): string[] {
  const targets = new Set(dates.filter((date) => isDatePlannable(date, now)));
  if (!targets.size) return [];

  targets.forEach((date) => {
    delete data.dayPlans[date];
    delete data.dayAnswers[date];
  });
  data.log = data.log.filter((entry) => !targets.has(entry.date));
  data.shopping = data.shopping.map((item) => {
    if (item.source === 'user') return item;
    const forDays = shoppingDays(item).filter((day) => !targets.has(day));
    return forDays.length === shoppingDays(item).length ? item : { ...item, forDays };
  });
  if (data.lastPlan && targets.has(data.lastPlan.context.date)) data.lastPlan = null;
  rebuildRangePlans(data, undefined, now);
  return [...targets].sort();
}

/** Monday–Sunday of a date's week, clipped to the meal-planning horizon. */
export function planningWeekFor(dateKey: string, now: Date = new Date()): {
  dates: string[];
  total: number;
  clipped: number;
} {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { dates: [], total: 7, clipped: 7 };
  const mondayOffset = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset, 12);
  const dates: string[] = [];
  for (let index = 0; index < 7; index++) {
    const candidate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index, 12);
    const key = keyOf(candidate);
    if (isDatePlannable(key, now)) dates.push(key);
  }
  return { dates, total: 7, clipped: 7 - dates.length };
}

export function clippedPlanMessage(planned: number, total: number): string {
  if (planned >= total) return '';
  return `Planned ${planned} of ${total} days. The rest opens as the days get closer.`;
}

/** Readable summary of the answers used for a plan. */
export function basisLine(basis?: PlanBasis): string {
  const pantry = basis?.pantry ?? [];
  const wants = basis?.wants ?? [];
  const home = pantry.length ? `${pantry.join(', ')} at home` : 'your saved pantry';
  const wanted = wants.length ? ` You wanted: ${wants.join(', ')}.` : ' You added no food preferences.';
  return `Based on: ${home}.${wanted}`;
}

export function normalizeDietData(value: unknown, facts: ThyroidFact[] = []): DietData {
  const raw = isRecord(value) ? value : {};
  const storedPlans = isRecord(raw.plans) ? raw.plans : {};
  const today = new Date().toISOString().slice(0, 10);
  const plans: Record<DietRange, RangePlan | null> = {
    today: normalizeRangePlan(storedPlans.today, facts, 'today'),
    tomorrow: normalizeRangePlan(storedPlans.tomorrow, facts, 'tomorrow'),
    week: normalizeRangePlan(storedPlans.week, facts, 'week'),
  };
  const savedDayPlans = normalizeDayPlans(raw.dayPlans, facts);
  const dayPlans = Object.keys(savedDayPlans).length
    ? savedDayPlans
    : dayPlansFromRangePlans(plans);
  const data = baseDietData(plans, dayPlans);
  data.shopping = migrateShopping(raw, plans);
  rebuildRangePlans(data);
  const consentChoice = oneOf(
    raw.consentChoice,
    CONSENT_CHOICES,
    raw.consentGiven === true ? 'allowed' : 'unset',
  );
  return {
    ...data,
    preferences: normalizePreferences(raw.preferences),
    lastPlan: normalizePlan(raw.lastPlan, facts, today),
    consentGiven: consentChoice === 'allowed',
    consentChoice,
    pantry: normalizePantry(raw.pantry),
    wants: normalizeWants(raw.wants),
    dayAnswers: normalizeDayAnswersMap(raw.dayAnswers),
    log: normalizeActualEntries(raw.log),
  };
}

/** Folds the old per-day, per-week and range shopping arrays into one list. */
function migrateShopping(raw: Record<string, unknown>, plans: Record<DietRange, RangePlan | null>): ShoppingItem[] {
  if (Array.isArray(raw.shopping)) return normalizeShopping(raw.shopping);
  const sources: Array<{ value: unknown; days: string[] }> = [];
  DIET_RANGES.forEach((range) => {
    const plan = plans[range];
    if (plan?.shopping.length) {
      sources.push({ value: plan.shopping, days: plan.days.map((day) => day.date) });
    }
  });
  if (isRecord(raw.dayPlans)) {
    Object.entries(raw.dayPlans).forEach(([date, entry]) => {
      if (!isDateKey(date) || !isRecord(entry)) return;
      sources.push({ value: entry.shoppingList ?? entry.shopping ?? [], days: [date] });
    });
  }
  sources.push({ value: raw.weekShopping, days: [] });

  const byName = new Map<string, ShoppingItem>();
  sources.forEach(({ value, days }) => {
    normalizeShopping(value).forEach((item) => {
      const withDays: ShoppingItem = {
        ...item,
        forDays: [...new Set([...shoppingDays(item), ...days])].sort(),
      };
      const key = lower(withDays.name);
      byName.set(key, mergeShoppingEntries(byName.get(key), withDays));
    });
  });
  return sortShoppingItems([...byName.values()].slice(0, 200));
}

function baseDietData(
  plans: Record<DietRange, RangePlan | null>,
  dayPlans: Record<string, MealPlanDay>,
): DietData {
  return {
    preferences: DEFAULT_PREFERENCES,
    lastPlan: null,
    consentGiven: false,
    consentChoice: 'unset',
    pantry: [],
    wants: { today: [], tomorrow: [], week: [] },
    plans,
    dayPlans,
    dayAnswers: {},
    log: [],
    shopping: [],
  };
}

export function normalizePlan(value: unknown, facts: ThyroidFact[], fallbackDate: string): DietPlan | null {
  if (!isRecord(value)) return null;
  const summary = cleanText(value.summary, 300);
  if (!summary && value.urgent !== true) return null;
  return {
    summary: summary || 'Please contact a doctor or emergency services now.',
    meals: normalizeMeals(value.meals, facts),
    timingNotes: normalizeTimingNotes(value.timingNotes, facts),
    urgent: value.urgent === true,
    context: normalizeContext(value.context ?? { date: fallbackDate }),
    source: value.source === 'ai' ? 'ai' : 'offline',
    generatedAt: clampNumber(value.generatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
  };
}

export function buildDietInput(
  context: DietContext,
  preferences: DietPreferences,
  alarmingSymptoms: boolean,
): DietInput {
  return { ...context, preferences, alarmingSymptoms };
}

export function buildDietPrompt(input: DietInput, facts: ThyroidFact[]): string {
  const safeFacts = facts.map(({ id, text, evidence }) => ({ id, text, evidence }));
  return `${DIET_SYSTEM_PROMPT}\n\nFACTS:\n${JSON.stringify(safeFacts)}\n\nTODAY:\n${JSON.stringify(input)}`;
}

/** Only the values needed for a plan; no names, planner notes or records. */
export function buildRangeInput(request: RangeRequest): RangeInput {
  const settings = request.preferences;
  return {
    range: request.range,
    days: request.contexts.map((context) => ({
      date: context.date,
      energy: context.energy,
      busyness: context.busyness,
      totalMinutes: context.totalMinutes,
      taskCount: context.taskCount,
    })),
    wants: request.wants,
    pantry: request.pantry,
    settings: {
      medicationTime: settings.medicationTime,
      mealTimes: {
        breakfast: settings.breakfastTime,
        lunch: settings.lunchTime,
        dinner: settings.dinnerTime,
      },
      dietPreferences: settings.dietPreferences,
      allergies: splitProfileList(settings.allergies),
      avoidFoods: splitProfileList(settings.avoidFoods),
      cookingMinutes: settings.cookingMinutes,
      equipment: splitProfileList(settings.equipment),
      servings: settings.servings,
      leftovers: settings.leftovers,
      cuisinePreference: settings.cuisinePreference,
      shopping: settings.shopping,
      budget: settings.budget,
    },
    actual: request.log
      .filter((entry) => request.dates.includes(entry.date))
      .slice(-20)
      .map((entry) => ({
        date: entry.date,
        slot: entry.slot,
        status: entry.status,
        text: entry.text,
      })),
    shoppingList: request.currentShopping?.slice(0, 80).map((item) => item.name),
    todayHint: request.hint
      ? { date: request.hint.date, energy: request.hint.energy }
      : undefined,
    alarmingSymptoms: request.alarmingSymptoms,
  };
}

export function buildRangePrompt(input: RangeInput, facts: ThyroidFact[]): string {
  const safeFacts = facts.map(({ id, text, evidence }) => ({ id, text, evidence }));
  return `${DIET_SYSTEM_PROMPT}\n\nFACTS:\n${JSON.stringify(safeFacts)}\n\nPLAN:\n${JSON.stringify(input)}`;
}

export function extractDietObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

interface IdeaTemplate {
  idea: string;
  prep: number;
  tags: string[];
}

const QUICK_IDEAS: Record<Exclude<MealSlot, 'snack'>, IdeaTemplate[]> = {
  breakfast: [
    { idea: 'Greek yoghurt with berries and a sprinkle of oats', prep: 5, tags: ['dairy', 'vegetarian', 'oats'] },
    { idea: 'Overnight oats with chia and milk of choice (batch-prepared)', prep: 5, tags: ['vegetarian', 'oats'] },
    { idea: 'Boiled eggs with wholegrain toast', prep: 8, tags: ['eggs', 'vegetarian', 'gluten'] },
    { idea: 'Tofu scramble on wholegrain toast', prep: 10, tags: ['soy', 'vegetarian', 'gluten'] },
  ],
  lunch: [
    { idea: 'Chickpea and hummus wholegrain wrap with cucumber', prep: 8, tags: ['legumes', 'vegetarian', 'gluten'] },
    { idea: 'Tuna and white bean salad with olive oil (batch-prepared)', prep: 8, tags: ['fish', 'legumes'] },
    { idea: 'Lentil soup with a wholegrain roll (batch-prepared)', prep: 10, tags: ['legumes', 'vegetarian', 'gluten'] },
  ],
  dinner: [
    { idea: 'Frozen veg and tofu stir-fry with microwave rice', prep: 10, tags: ['soy', 'vegetarian', 'rice'] },
    { idea: 'Baked fish with steamed veg and instant wholegrain couscous', prep: 10, tags: ['fish', 'gluten'] },
    { idea: 'Bean chilli with pre-cooked rice (batch-prepared)', prep: 10, tags: ['legumes', 'vegetarian', 'rice'] },
  ],
};

const SLOW_IDEAS: Record<Exclude<MealSlot, 'snack'>, IdeaTemplate[]> = {
  breakfast: [
    { idea: 'Spinach and mushroom omelette with wholegrain toast', prep: 15, tags: ['eggs', 'vegetarian', 'gluten'] },
    { idea: 'Greek yoghurt with berries, oats and toasted seeds', prep: 10, tags: ['dairy', 'vegetarian', 'oats'] },
    { idea: 'Tofu scramble with tomatoes and wholegrain toast', prep: 15, tags: ['soy', 'vegetarian', 'gluten'] },
  ],
  lunch: [
    { idea: 'Roast sweet potato with black beans, avocado and lime', prep: 25, tags: ['legumes', 'vegetarian'] },
    { idea: 'Chicken and quinoa salad with roasted vegetables', prep: 25, tags: ['meat'] },
    { idea: 'Roasted vegetable and lentil bowl with tahini', prep: 25, tags: ['legumes', 'vegetarian'] },
  ],
  dinner: [
    { idea: 'Salmon with quinoa, roasted broccoli and lemon', prep: 30, tags: ['fish'] },
    { idea: 'Vegetable curry with chickpeas and brown rice', prep: 30, tags: ['legumes', 'vegetarian', 'rice'] },
    { idea: 'Turkey meatballs with wholegrain pasta and tomato sauce', prep: 30, tags: ['meat', 'gluten'] },
  ],
};

const SNACK_IDEAS: IdeaTemplate[] = [
  { idea: 'Apple with a spoon of peanut butter', prep: 3, tags: ['nuts', 'vegetarian'] },
  { idea: 'Cottage cheese with berries', prep: 3, tags: ['dairy', 'vegetarian'] },
  { idea: 'Roasted chickpeas', prep: 4, tags: ['legumes', 'vegetarian'] },
  { idea: 'Banana with a handful of oats', prep: 2, tags: ['vegetarian', 'oats'] },
];

const FALLBACK_IDEA: IdeaTemplate = {
  idea: 'Fresh fruit with a plain plant-based yoghurt',
  prep: 3,
  tags: ['vegetarian'],
};

const INGREDIENT_WORDS = [
  'oats', 'yoghurt', 'berries', 'eggs', 'wholegrain toast', 'chia', 'tofu', 'soy',
  'chickpeas', 'chickpea', 'hummus', 'cucumber', 'tuna', 'white bean', 'lentil', 'lentils',
  'rice', 'frozen veg', 'fish', 'couscous', 'beans', 'apple', 'peanut butter',
  'cottage cheese', 'banana', 'quinoa', 'sweet potato', 'black beans', 'avocado',
  'spinach', 'mushroom', 'salmon', 'broccoli', 'turkey', 'pasta', 'tomato',
  'plant-based yoghurt', 'fruit', 'vegetables',
];

/** Extracts a small ingredient list from an idea, used when AI is unavailable. */
export function ingredientsFromText(text: string): string[] {
  const haystack = lower(text);
  return INGREDIENT_WORDS.filter((word) => haystack.includes(word));
}

function respectsPreferences(template: IdeaTemplate, preferences: DietPreferences): boolean {
  const noAnimal = /vegan|vegetarian|\bveg\b/i.test(preferences.dietPreferences);
  if (noAnimal && template.tags.some((tag) => ['fish', 'meat', 'eggs', 'dairy'].includes(tag))) return false;

  const blocked = [...splitProfileList(preferences.allergies), ...splitProfileList(preferences.avoidFoods)]
    .map((word) => word.toLowerCase());
  if (!blocked.length) return true;
  const haystack = `${template.idea} ${template.tags.join(' ')}`.toLowerCase();
  return !blocked.some((word) => haystack.includes(word) || template.tags.some((tag) => word.includes(tag)));
}

function pickIdea(pool: IdeaTemplate[], preferences: DietPreferences, cap: number): IdeaTemplate {
  const eligible = pool.filter((item) => item.prep <= cap && respectsPreferences(item, preferences));
  if (eligible.length) {
    const index = Math.floor(Date.now() / 60000) % eligible.length;
    return eligible[index];
  }
  return FALLBACK_IDEA;
}

export function heuristicMeal(slot: MealSlot, context: DietContext, preferences: DietPreferences): MealIdea {
  const quick = context.busyness === 'packed' || context.energy === 'low';
  const cap = quick
    ? Math.min(preferences.cookingMinutes || 10, 10)
    : Math.min(Math.max(preferences.cookingMinutes || 30, 5), 240);
  const pool = slot === 'snack' ? SNACK_IDEAS : (quick ? QUICK_IDEAS : SLOW_IDEAS)[slot];
  const idea = pickIdea(pool, preferences, cap);
  return {
    slot,
    idea: idea.idea,
    prepMinutes: Math.min(idea.prep, cap),
    why: quick
      ? 'No-cook or batch-prepared: protein plus fibre for steady energy.'
      : 'A cooked meal with protein and fibre; you have time today.',
    factIds: [],
    ingredients: ingredientsFromText(idea.idea),
  };
}

/** Clock timeline computed by the app. Science claims stay with curated facts. */
export function buildTimingNotes(preferences: DietPreferences): TimingNote[] {
  const entries: [string, string][] = [
    ['Medication', preferences.medicationTime],
    ['Breakfast', preferences.breakfastTime],
    ['Lunch', preferences.lunchTime],
    ['Dinner', preferences.dinnerTime],
  ];
  return entries
    .filter(([, time]) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    .map(([label, time]) => ({ text: `${label}: ${time}`, factIds: [] }));
}

export function emergencyPlan(context: DietContext): DietPlan {
  return {
    summary: 'Please contact a doctor or emergency services now — these symptoms need urgent attention.',
    meals: [],
    timingNotes: [],
    urgent: true,
    context,
    source: 'offline',
    generatedAt: Date.now(),
  };
}

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_GRACE_MINUTES = 60;

function minutesOfTime(value: string, fallback: number): number {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

/**
 * Meal slots still ahead of now, using the Profile meal times. A slot stays
 * available for an hour after its time (meals take time to eat) and snacks,
 * which have no fixed time, are always included.
 */
export function remainingSlots(preferences: DietPreferences, now: Date = new Date()): MealSlot[] {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const times: Partial<Record<MealSlot, number>> = {
    breakfast: minutesOfTime(preferences.breakfastTime, 8 * 60),
    lunch: minutesOfTime(preferences.lunchTime, 13 * 60),
    dinner: minutesOfTime(preferences.dinnerTime, 19 * 60),
  };
  return SLOT_ORDER.filter((slot) => {
    if (slot === 'snack') return true;
    return (times[slot] ?? 0) + MEAL_GRACE_MINUTES >= nowMinutes;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsItem(text: string, item: string): boolean {
  const pattern = item.split(/\s+/).map(escapeRegExp).join('\\s+');
  return new RegExp(`(^|\\W)${pattern}(\\W|$)`, 'i').test(text);
}

/**
 * Pantry minus what has already been eaten on the planned days. Used when the
 * day changes so the AI adjusts the remaining meals using what is left at home.
 */
export function remainingPantry(pantry: string[], log: ActualEntry[], dates: string[]): string[] {
  const latest = dates.reduce((max, date) => (date > max ? date : max), '');
  const consumed = log
    .filter((entry) => entry.date <= latest
      && (entry.status === 'ate' || entry.status === 'ate-other'))
    .map((entry) => lower(entry.text))
    .filter(Boolean);
  return pantry.filter((item) => !consumed.some((text) => mentionsItem(text, item)));
}

/** Keeps only the meals still ahead for the first (today) day of a Today plan. */
export function restrictToRemainingMeals(
  plan: RangePlan,
  preferences: DietPreferences,
  pantry: string[],
  now: Date = new Date(),
): RangePlan {
  const slots = remainingSlots(preferences, now);
  if (slots.length === SLOT_ORDER.length) return plan;
  const days = plan.days.map((day, index) => index === 0
    ? { ...day, meals: day.meals.filter((meal) => slots.includes(meal.slot)) }
    : day);
  const previous = new Map(plan.shopping.map((item) => [lower(item.name), item]));
  const shopping = buildShoppingList(days.flatMap((day) => day.meals), pantry)
    .map((item) => {
      const saved = previous.get(lower(item.name));
      return saved ? { ...item, id: saved.id, forDays: shoppingDays(saved), status: saved.status, inPlan: saved.inPlan, source: saved.source, createdAt: saved.createdAt, updatedAt: saved.updatedAt, quantity: saved.quantity } : item;
    });
  return { ...plan, days, shopping };
}

/** The calendar days covered by a range, normalised to midday for DST safety. */
export function datesForRange(range: DietRange, now: Date = new Date()): Date[] {
  const offsets = range === 'today' ? [0] : range === 'tomorrow' ? [1] : [1, 2, 3, 4, 5, 6, 7];
  return offsets.map((offset) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12));
}

/** Converts a saved single-day plan from the previous version into a range plan. */
export function legacyRangePlan(plan: DietPlan, pantry: string[] = []): RangePlan {
  const day: DayPlan = {
    date: plan.context.date,
    summary: plan.summary,
    meals: plan.meals.map((meal) => withPlannedMeta(meal, plan.context.date, 'main')),
    timingNotes: plan.timingNotes,
    urgent: plan.urgent,
    context: plan.context,
    source: plan.source,
    generatedAt: plan.generatedAt,
  };
  return {
    range: 'today',
    days: [day],
    shopping: buildShoppingList(day.meals, pantry),
    source: plan.source,
    generatedAt: plan.generatedAt,
  };
}

export function heuristicDietPlan(context: DietContext, preferences: DietPreferences): DietPlan {
  const quick = context.busyness === 'packed' || context.energy === 'low';
  const summary = quick
    ? `${busynessLabel(context.busyness)} day, ${energyLabel(context.energy).toLowerCase()} energy: keep it simple — no-cook or batch-prepared meals, protein plus fibre, regular meal times and enough water.`
    : `${busynessLabel(context.busyness)} day, ${energyLabel(context.energy).toLowerCase()} energy: you have room to cook. Meal-prep for tomorrow: portion roasted vegetables and quinoa tonight.`;

  return {
    summary,
    meals: [
      heuristicMeal('breakfast', context, preferences),
      heuristicMeal('lunch', context, preferences),
      heuristicMeal('dinner', context, preferences),
      heuristicMeal('snack', context, preferences),
    ],
    timingNotes: buildTimingNotes(preferences),
    urgent: false,
    context,
    source: 'offline',
    generatedAt: Date.now(),
  };
}

/** Missing items only: pantry contents and duplicates are removed. */
export function buildShoppingList(
  meals: PlannedMeal[],
  pantry: string[],
  suggested: string[] = [],
): ShoppingItem[] {
  const have = new Set(pantry.map(lower));
  const needed = uniqueByText([
    ...meals.flatMap((meal) => meal.ingredients),
    ...suggested,
  ].filter((item) => !have.has(lower(item)) && !isBasicShoppingItem(item)));
  const now = Date.now();
  return needed.map((name) => ({
    id: newId(),
    name,
    forDays: [],
    source: 'ai' as const,
    status: 'open' as const,
    inPlan: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export interface ShoppingMergeSummary {
  added: number;
  noLongerNeeded: number;
}

/** Merges a freshly generated AI list into the one canonical shopping list. */
export function mergeShoppingList(
  existing: ShoppingItem[],
  aiItems: ShoppingItem[],
  affectedDates: string[] = [],
): { items: ShoppingItem[]; summary: ShoppingMergeSummary } {
  const now = Date.now();
  const scope = new Set(affectedDates);
  const existingByName = new Map(existing.map((item) => [lower(item.name), item]));
  const aiByName = new Map(aiItems.map((item) => [lower(item.name), item]));
  const result: ShoppingItem[] = [];
  let added = 0;
  let noLongerNeeded = 0;

  for (const item of existing) {
    const key = lower(item.name);
    // Bought, removed and self-added items are never changed by regeneration.
    if (item.status === 'removed' || item.status === 'bought' || item.source === 'user') {
      result.push(item);
      continue;
    }
    const aiItem = aiByName.get(key);
    const next: ShoppingItem = { ...item, isNew: false, updatedAt: now };
    if (scope.size) {
      const keptDays = shoppingDays(item).filter((day) => !scope.has(day));
      next.forDays = [...new Set([...keptDays, ...(aiItem ? shoppingDays(aiItem) : [])])].sort();
    } else {
      next.forDays = aiItem ? shoppingDays(aiItem) : [];
    }
    if (aiItem) {
      next.quantity = nextShoppingQuantity(item, aiItem);
      next.inPlan = true;
    } else {
      next.inPlan = next.forDays.length ? item.inPlan : false;
      if (!next.inPlan && item.inPlan) noLongerNeeded += 1;
    }
    if (!next.quantity) delete next.quantity;
    result.push(next);
  }

  for (const item of aiItems) {
    const key = lower(item.name);
    if (existingByName.has(key) || isBasicShoppingItem(item.name)) continue;
    result.push({
      ...item,
      id: item.id || newId(),
      forDays: shoppingDays(item),
      source: 'ai',
      status: 'open',
      inPlan: true,
      isNew: true,
      createdAt: now,
      updatedAt: now,
    });
    added += 1;
  }

  return { items: sortShoppingItems(result).slice(0, 200), summary: { added, noLongerNeeded } };
}

/** Applies AI add/remove suggestions after a meal edit to the canonical list. */
export function applyMealShoppingDelta(
  existing: ShoppingItem[],
  addNames: string[],
  removeNames: string[],
  pantry: string[],
  affectedDates: string[] = [],
): { items: ShoppingItem[]; summary: ShoppingMergeSummary } {
  const now = Date.now();
  const scope = new Set(affectedDates);
  const pantrySet = new Set(pantry.map(lower));
  const addSet = new Set(addNames.map((name) => name.replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase()).filter(Boolean));
  const removeSet = new Set(removeNames.map(lower));
  const existingByName = new Map(existing.map((item) => [lower(item.name), item]));
  let added = 0;
  let noLongerNeeded = 0;
  const suggested = new Set<string>();

  const items = existing.map((item) => {
    const key = lower(item.name);
    if (item.status === 'removed' || item.status === 'bought' || item.source === 'user') {
      return item;
    }
    let forDays = shoppingDays(item);
    let inPlan = item.inPlan;
    if (removeSet.has(key)) {
      forDays = scope.size ? forDays.filter((day) => !scope.has(day)) : [];
      if (!forDays.length && inPlan) {
        inPlan = false;
        noLongerNeeded += 1;
      }
    }
    if (addSet.has(key)) {
      forDays = [...new Set([...forDays, ...affectedDates])].sort();
      inPlan = true;
      suggested.add(key);
    }
    return { ...item, forDays, inPlan, isNew: false, updatedAt: now };
  });

  for (const rawName of addNames) {
    const name = rawName.replace(/\s+/g, ' ').trim().slice(0, 80);
    const key = lower(name);
    if (!name || suggested.has(key) || isBasicShoppingItem(name) || pantrySet.has(key)
      || existingByName.has(key)) continue;
    items.push({
      id: newId(),
      name,
      forDays: [...affectedDates],
      source: 'ai',
      status: 'open',
      inPlan: true,
      isNew: true,
      createdAt: now,
      updatedAt: now,
    });
    existingByName.set(key, items[items.length - 1]);
    suggested.add(key);
    added += 1;
  }

  return { items: sortShoppingItems(items).slice(0, 200), summary: { added, noLongerNeeded } };
}
export function markBought(
  pantry: PantryItem[],
  shopping: ShoppingItem[],
  itemId: string,
): { pantry: PantryItem[]; shopping: ShoppingItem[] } {
  const item = shopping.find((entry) => entry.id === itemId);
  if (!item) return { pantry, shopping };
  const now = Date.now();
  const existing = pantry.find((entry) => lower(entry.name) === lower(item.name));
  const nextPantry = existing
    ? pantry.map((entry) => entry.id === existing.id
      ? { ...entry, source: 'shopping' as const, boughtAt: entry.boughtAt ?? now }
      : entry)
    : [...pantry, {
      id: newId(),
      name: item.name,
      addedAt: now,
      source: 'shopping' as const,
      boughtAt: now,
    }];
  return {
    pantry: nextPantry,
    shopping: shopping.map((entry) =>
      entry.id === itemId ? { ...entry, status: 'bought', updatedAt: now } : entry),
  };
}

/** Marks one planned meal as eaten, eaten-elsewhere or skipped. */
export function markMeal(plan: DayPlan, mealId: string, status: MealStatus): DayPlan {
  if (!MEAL_STATUSES.includes(status)) return plan;
  return {
    ...plan,
    meals: plan.meals.map((meal) => meal.id === mealId ? { ...meal, status } : meal),
  };
}

function withPlannedMeta(meal: MealIdea, day: string, kind: MealKind): PlannedMeal {
  return {
    ...meal,
    id: newId(),
    day,
    kind,
    ingredients: meal.ingredients ? [...meal.ingredients] : ingredientsFromText(meal.idea),
    status: 'planned',
    source: 'ai',
  };
}

function timingFor(preferences: DietPreferences, facts: ThyroidFact[], raw?: unknown): TimingNote[] {
  // The app owns every clock time; the model may only add fact-backed advice.
  const clock = buildTimingNotes(preferences);
  const advice = normalizeTimingNotes(raw, facts)
    .filter((note) => note.factIds.length > 0 && !/^\d{1,2}:\d{2}\b/.test(note.text));
  return [...clock, ...advice].slice(0, 8);
}

function finishRange(
  request: RangeRequest,
  days: DayPlan[],
  source: 'ai' | 'offline',
  suggestedShopping: string[] = [],
): RangePlan {
  return {
    range: request.range,
    days,
    shopping: buildShoppingList(days.flatMap((day) => day.meals), request.pantry, suggestedShopping),
    source,
    generatedAt: Date.now(),
    hint: request.hint,
  };
}

export function emergencyRangePlan(request: RangeRequest): RangePlan {
  return finishRange(request, request.contexts.map((context) => ({
    date: context.date,
    summary: emergencyPlan(context).summary,
    meals: [],
    timingNotes: [],
    urgent: true,
    context,
    source: 'offline',
    generatedAt: Date.now(),
  })), 'offline');
}

/** Local plan used when AI is off or unavailable. */
export function heuristicRangePlan(request: RangeRequest, preferences: DietPreferences): RangePlan {
  const days = request.contexts.map((context) => {
    const base = heuristicDietPlan(context, preferences);
    const meals = base.meals.map((meal) => withPlannedMeta(meal, context.date, 'main'));
    if (request.range !== 'today' && !meals.some((meal) => meal.kind === 'fallback')) {
      const lowContext: DietContext = { ...context, energy: 'low', busyness: 'packed' };
      meals.push(withPlannedMeta(heuristicMeal('snack', lowContext, preferences), context.date, 'fallback'));
    }
    return {
      date: context.date,
      summary: base.summary,
      meals,
      timingNotes: base.timingNotes,
      urgent: false,
      context,
      source: 'offline' as const,
      generatedAt: Date.now(),
    };
  });
  return finishRange(request, days, 'offline');
}

export interface ParsedRangePlan {
  plan: RangePlan | null;
  error?: string;
}

/** Validates a range response against the curated facts and hard safety rules. */
export function parseRangePlan(
  raw: string,
  facts: ThyroidFact[],
  request: RangeRequest,
  preferences: DietPreferences,
): ParsedRangePlan {
  if (request.alarmingSymptoms) return { plan: emergencyRangePlan(request) };

  const object = extractDietObject(raw);
  if (!object) return { plan: null, error: 'The AI response was not valid JSON.' };
  if (object.urgent === true) return { plan: emergencyRangePlan(request) };

  const suggestedShopping = normalizeTextList(object.shopping, 40, 80);
  const aiMeals = normalizePlannedMeals(object.meals, facts, request.dates);
  const summary = cleanText(object.summary, 300);
  const notes = timingFor(preferences, facts, object.timingNotes);

  const bannedText = [
    summary,
    ...suggestedShopping,
    ...notes.map((note) => note.text),
    ...aiMeals.flatMap((meal) => [meal.idea, meal.why, ...meal.ingredients]),
  ].join(' ');
  if (MEDICAL_CLAIM.test(bannedText)) {
    return { plan: null, error: 'The AI response included a medical claim, so local food ideas were used instead.' };
  }

  const days: DayPlan[] = request.contexts.map((context) => {
    let meals = aiMeals.filter((meal) => meal.day === context.date);
    const bySlot = new Map(meals.map((meal) => [meal.slot, meal] as const));
    MEAL_SLOTS.forEach((slot) => {
      if (context.date !== request.contexts[0]?.date && slot === 'snack') return;
      if (!bySlot.has(slot)) {
        const filler = withPlannedMeta(heuristicMeal(slot, context, preferences), context.date, 'main');
        meals.push(filler);
        bySlot.set(slot, filler);
      }
    });
    const snacks = meals.filter((meal) => meal.slot === 'snack');
    if (snacks.length > 2) {
      const keep = new Set(snacks.slice(0, 2).map((meal) => meal.id));
      meals = meals.filter((meal) => meal.slot !== 'snack' || keep.has(meal.id));
    }
    if (request.range !== 'today' && !meals.some((meal) => meal.kind === 'fallback')) {
      const lowContext: DietContext = { ...context, energy: 'low', busyness: 'packed' };
      meals.push(withPlannedMeta(heuristicMeal('snack', lowContext, preferences), context.date, 'fallback'));
    }
    const base = heuristicDietPlan(context, preferences);
    return {
      date: context.date,
      summary: summary || base.summary,
      meals,
      timingNotes: notes,
      urgent: false,
      context,
      source: 'ai',
      generatedAt: Date.now(),
    };
  });

  return { plan: finishRange(request, days, 'ai', suggestedShopping) };
}

export interface ParsedDietPlan {
  plan: DietPlan | null;
  error?: string;
}

/** Validates a legacy single-day AI response against the curated library. */
export function parseDietPlan(
  raw: string,
  facts: ThyroidFact[],
  context: DietContext,
  preferences: DietPreferences,
  alarmingSymptoms = false,
): ParsedDietPlan {
  if (alarmingSymptoms) return { plan: emergencyPlan(context) };

  const object = extractDietObject(raw);
  if (!object) return { plan: null, error: 'The AI response was not valid JSON.' };
  if (object.urgent === true) return { plan: emergencyPlan(context) };

  const parsed = parseRangePlan(
    raw,
    facts,
    {
      range: 'today',
      dates: [context.date],
      contexts: [context],
      wants: [],
      pantry: [],
      preferences,
      log: [],
      alarmingSymptoms: false,
    },
    preferences,
  );
  if (!parsed.plan) return { plan: null, error: parsed.error };
  const day = parsed.plan.days[0];
  return {
    plan: {
      summary: day.summary,
      meals: day.meals,
      timingNotes: day.timingNotes,
      urgent: day.urgent,
      context,
      source: parsed.plan.source,
      generatedAt: parsed.plan.generatedAt,
    },
  };
}
