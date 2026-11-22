/**
 * Profile-owned diet settings.
 *
 * These are the medication/meal times, preferences, allergies and accepted
 * cooking time used by the Diet Advisor. The Diet feature imports this type
 * and normalizer; Profile owns editing and persistence.
 */
export type DietEnergy = 'low' | 'medium' | 'high';
export type Busyness = 'light' | 'normal' | 'packed';

export interface DietSettings {
  medicationTime: string;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  diet: string;
  avoid: string;
  maxCookMinutes: number;
  /* Optional day-level overrides; Profile keeps these out of its form. */
  energyOverride: '' | DietEnergy;
  busynessOverride: '' | Busyness;
}

export const DEFAULT_DIET_SETTINGS: DietSettings = {
  medicationTime: '07:00',
  breakfastTime: '08:00',
  lunchTime: '12:30',
  dinnerTime: '18:30',
  diet: '',
  avoid: '',
  maxCookMinutes: 30,
  energyOverride: '',
  busynessOverride: '',
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
  const match = text.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  if (hour > 23) return fallback;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

/** Coerces stored or edited settings into safe, bounded values. */
export function normalizeDietSettings(value: unknown): DietSettings {
  const raw = isRecord(value) ? value : {};
  return {
    medicationTime: timeValue(raw.medicationTime, DEFAULT_DIET_SETTINGS.medicationTime),
    breakfastTime: timeValue(raw.breakfastTime, DEFAULT_DIET_SETTINGS.breakfastTime),
    lunchTime: timeValue(raw.lunchTime, DEFAULT_DIET_SETTINGS.lunchTime),
    dinnerTime: timeValue(raw.dinnerTime, DEFAULT_DIET_SETTINGS.dinnerTime),
    diet: cleanText(raw.diet, 120),
    avoid: cleanText(raw.avoid, 300),
    maxCookMinutes: clampNumber(raw.maxCookMinutes, DEFAULT_DIET_SETTINGS.maxCookMinutes, 5, 240),
    energyOverride: oneOf(raw.energyOverride, ['', 'low', 'medium', 'high'] as const, ''),
    busynessOverride: oneOf(raw.busynessOverride, ['', 'light', 'normal', 'packed'] as const, ''),
  };
}
