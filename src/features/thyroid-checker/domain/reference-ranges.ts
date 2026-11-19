import type { TestRange, ThyroidFieldKey } from './types';
import { canonicalUnit, convertRange, isKnownUnit } from './units';

/**
 * General adult reference ranges in each test's canonical unit.
 * These are defaults only: every record can override them with the range
 * printed on its own lab report.
 */
export const STANDARD_RANGES: Record<ThyroidFieldKey, TestRange> = {
  tsh: { low: 0.27, high: 4.2 },
  freeT4: { low: 0.8, high: 1.8 },
  totalT4: { low: 5, high: 12 },
  freeT3: { low: 2.3, high: 4.2 },
  totalT3: { low: 80, high: 200 },
  tpoAb: { low: null, high: 9 },
  tgAb: { low: null, high: 4 },
  trab: { low: null, high: 1.75 },
  got: { low: 10, high: 40 },
  ggt: { low: 8, high: 61 },
  cholesterol: { low: null, high: 200 },
  triglycerides: { low: null, high: 150 },
  calcium: { low: 8.6, high: 10.3 },
  glucose: { low: 70, high: 99 },
  urea: { low: 15, high: 40 },
  creatinine: { low: 0.6, high: 1.3 },
  gpt: { low: 7, high: 56 },
  uricAcid: { low: 3.4, high: 7 },
};

export function standardRangeFor(key: ThyroidFieldKey, unit: string): TestRange {
  const range = STANDARD_RANGES[key];
  if (!isKnownUnit(key, unit) || unit === canonicalUnit(key)) return range;
  return convertRange(range, key, canonicalUnit(key), unit) ?? range;
}

export type RangeAssessment = 'low' | 'normal' | 'high';

/** Compares a value with an expected range. Bounds are inclusive; missing bounds are ignored. */
export function assessValue(
  value: number | null | undefined,
  range: TestRange | null | undefined,
): RangeAssessment | null {
  if (value === null || value === undefined || !Number.isFinite(value) || !range) return null;
  if (range.low === null && range.high === null) return null;
  if (range.low !== null && value < range.low) return 'low';
  if (range.high !== null && value > range.high) return 'high';
  return 'normal';
}

export function isValidRange(range: TestRange): boolean {
  if (range.low !== null && (!Number.isFinite(range.low) || range.low < 0)) return false;
  if (range.high !== null && (!Number.isFinite(range.high) || range.high < 0)) return false;
  if (range.low !== null && range.high !== null) return range.low <= range.high;
  return true;
}

export function isEmptyRange(range: TestRange): boolean {
  return range.low === null && range.high === null;
}
