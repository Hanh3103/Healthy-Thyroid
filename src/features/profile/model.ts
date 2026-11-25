/**
 * Profile model: diet settings.
 *
 * These are the medication/meal times, preferences, allergies and accepted
 * cooking time used by the Diet Advisor. The Diet feature imports this type
 * and normalizer; Profile owns editing and persistence.
 */
export type DietBudget = 'low' | 'medium' | 'high';

export interface DietSettings {
  /** Optional; an empty value means "not supplied". */
  medicationTime: string;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  dietPreferences: string;
  allergies: string;
  avoidFoods: string;
  cookingMinutes: number;
  equipment: string;
  /** Number of people the plan cooks for. */
  servings: number;
  /** Whether leftover portions should be planned. */
  leftovers: boolean;
  cuisinePreference: string;
  /** Shop name or area; never an address. */
  shopping: string;
  budget: DietBudget;
}

export const DEFAULT_DIET_SETTINGS: DietSettings = {
  medicationTime: '',
  breakfastTime: '08:00',
  lunchTime: '12:30',
  dinnerTime: '18:30',
  dietPreferences: '',
  allergies: '',
  avoidFoods: '',
  cookingMinutes: 30,
  equipment: '',
  servings: 1,
  leftovers: false,
  cuisinePreference: '',
  shopping: '',
  budget: 'medium',
};

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

function timeValue(value: unknown, fallback: string): string {
  const text = cleanText(value, 5);
  if (!text) return '';
  const match = text.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  if (hour > 23) return fallback;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

/** Coerces stored or edited settings into safe, bounded values. */
export function normalizeDietSettings(value: unknown): DietSettings {
  const raw = isRecord(value) ? value : {};
  const legacyDiet = cleanText(raw.diet, 120);
  const legacyAvoid = cleanText(raw.avoid, 300);
  return {
    medicationTime: timeValue(raw.medicationTime, DEFAULT_DIET_SETTINGS.medicationTime),
    breakfastTime: timeValue(raw.breakfastTime, DEFAULT_DIET_SETTINGS.breakfastTime),
    lunchTime: timeValue(raw.lunchTime, DEFAULT_DIET_SETTINGS.lunchTime),
    dinnerTime: timeValue(raw.dinnerTime, DEFAULT_DIET_SETTINGS.dinnerTime),
    dietPreferences: cleanText(raw.dietPreferences ?? legacyDiet, 120),
    allergies: cleanText(raw.allergies ?? legacyAvoid, 300),
    avoidFoods: cleanText(raw.avoidFoods ?? legacyAvoid, 300),
    cookingMinutes: clampNumber(
      raw.cookingMinutes ?? raw.maxCookMinutes,
      DEFAULT_DIET_SETTINGS.cookingMinutes, 5, 240,
    ),
    equipment: cleanText(raw.equipment, 240),
    servings: clampNumber(raw.servings, DEFAULT_DIET_SETTINGS.servings, 1, 12),
    leftovers: raw.leftovers === true,
    cuisinePreference: cleanText(raw.cuisinePreference, 120),
    shopping: cleanText(raw.shopping, 120),
    budget: oneOf(raw.budget, ['low', 'medium', 'high'] as const, DEFAULT_DIET_SETTINGS.budget),
  };
}

/** Splits a Profile list into short, unique values for the AI request. */
export function splitProfileList(value: string): string[] {
  return [...new Set(value
    .split(/[,;\n]+/)
    .map((part) => part.replace(/\s+/g, ' ').trim().slice(0, 80))
    .filter(Boolean))].slice(0, 24);
}
