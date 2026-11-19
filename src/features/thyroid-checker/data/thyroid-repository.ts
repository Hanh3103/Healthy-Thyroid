import type {
  CustomMeasurement,
  CustomMeasurementMap,
  RangeMap,
  TestRange,
  ThyroidBloodRecord,
  ThyroidBloodValues,
  UnitMap,
} from '../domain/types';
import { FIELD_KEYS, createEmptyValues } from '../domain/field-definitions';
import { readJSON, writeJSON } from '../../../shared/storage/local-storage';

const STORAGE_KEY = 'thyroid-checker-results-v1';

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeRange(value: unknown): TestRange | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const low = asNumber(input.low);
  const high = asNumber(input.high);
  if (low === null && high === null) return null;
  return { low, high };
}

function normalizeUnits(value: unknown): UnitMap {
  const units: UnitMap = {};
  if (!value || typeof value !== 'object') return units;
  const input = value as Record<string, unknown>;
  for (const key of FIELD_KEYS) {
    const unit = input[key];
    if (typeof unit === 'string' && unit.trim()) units[key] = unit.trim();
  }
  return units;
}

function normalizeRanges(value: unknown): RangeMap {
  const ranges: RangeMap = {};
  if (!value || typeof value !== 'object') return ranges;
  const input = value as Record<string, unknown>;
  for (const key of FIELD_KEYS) {
    const range = normalizeRange(input[key]);
    if (range) ranges[key] = range;
  }
  return ranges;
}

function normalizeCustomMeasurement(value: unknown): CustomMeasurement | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.name !== 'string' || !input.name.trim()) return null;
  const range = normalizeRange(input.range);
  const measurement: CustomMeasurement = {
    name: input.name.trim(),
    value: asNumber(input.value),
    unit: typeof input.unit === 'string' ? input.unit.trim() : '',
  };
  if (range) measurement.range = range;
  return measurement;
}

function normalizeCustom(value: unknown): CustomMeasurementMap {
  const custom: CustomMeasurementMap = {};
  if (!value || typeof value !== 'object') return custom;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const measurement = normalizeCustomMeasurement(raw);
    if (measurement) custom[id] = measurement;
  }
  return custom;
}

/** Accepts both the current schema and legacy flat records. */
export function normalizeThyroidRecord(raw: unknown): ThyroidBloodRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== 'string' || !input.id.trim()) return null;

  const values: ThyroidBloodValues = createEmptyValues();
  for (const key of FIELD_KEYS) values[key] = asNumber(input[key]);

  return {
    ...values,
    id: input.id,
    date: typeof input.date === 'string' && input.date
      ? input.date
      : new Date().toISOString().slice(0, 10),
    sourceFileName: typeof input.sourceFileName === 'string' ? input.sourceFileName : undefined,
    units: normalizeUnits(input.units),
    ranges: normalizeRanges(input.ranges),
    custom: normalizeCustom(input.custom),
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : Date.now(),
  };
}

export class LocalThyroidRepository {
  load(): ThyroidBloodRecord[] {
    const stored = readJSON<unknown>(STORAGE_KEY);
    if (!Array.isArray(stored)) return [];
    return stored
      .map(normalizeThyroidRecord)
      .filter((record): record is ThyroidBloodRecord => record !== null);
  }

  save(records: ThyroidBloodRecord[]): void {
    writeJSON(STORAGE_KEY, records);
  }
}
