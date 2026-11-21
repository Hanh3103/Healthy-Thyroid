/**
 * Thyroid persistence boundary.
 *
 * Tauri uses the `load_thyroid` / `save_thyroid` commands and a single JSON
 * file. Browser development keeps the old localStorage keys. On the first
 * Tauri run, legacy browser data is migrated into the single file and then
 * removed from localStorage.
 */
import { isTauri, localLoad as readLegacy, localRemove, localSave, tauriLoad, tauriSave } from '../../shared/platform';
import {
  createEmptyValues,
  FIELD_KEYS,
  type CustomMeasurement,
  type CustomMeasurementMap,
  type CustomTestDefinition,
  type RangeMap,
  type TestRange,
  type ThyroidAppointment,
  type ThyroidBloodRecord,
  type ThyroidBloodValues,
  type UnitMap,
} from './model';

export interface ThyroidData {
  records: ThyroidBloodRecord[];
  customTests: CustomTestDefinition[];
  appointments: ThyroidAppointment[];
  appointmentFrequency: number | null;
  firstRunDone: boolean;
}

const LEGACY_KEYS = {
  records: 'thyroid-checker-results-v1',
  customTests: 'thyroid-custom-tests-v1',
  appointments: 'thyroid-appointments-v1',
  frequency: 'thyroid-blood-control-frequency-v1',
  firstRunDone: 'thyroid-appointment-first-run-done-v1',
} as const;

const ALL_LEGACY_KEYS = Object.values(LEGACY_KEYS);

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

export function normalizeCustomTestDefinition(value: unknown): CustomTestDefinition | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== 'string' || !input.id.trim()) return null;
  if (typeof input.name !== 'string' || !input.name.trim()) return null;
  return {
    id: input.id,
    name: input.name.trim(),
    unit: typeof input.unit === 'string' ? input.unit.trim() : '',
    refLow: asNumber(input.refLow),
    refHigh: asNumber(input.refHigh),
    archived: input.archived === true,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
  };
}

export function normalizeAppointment(value: unknown): ThyroidAppointment | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ThyroidAppointment>;
  if (typeof candidate.id !== 'string' || typeof candidate.date !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)) return null;
  return {
    id: candidate.id,
    date: candidate.date,
    time: typeof candidate.time === 'string' ? candidate.time : undefined,
    note: typeof candidate.note === 'string' ? candidate.note : undefined,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    completed: candidate.completed === true,
  };
}

function normalizeFrequency(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** Coerces stored or imported data into a safe shape. */
export function normalizeThyroidData(value: unknown): ThyroidData {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const recordsSource = Array.isArray(value) ? value : raw.records;
  const records = Array.isArray(recordsSource)
    ? recordsSource
      .map(normalizeThyroidRecord)
      .filter((record): record is ThyroidBloodRecord => record !== null)
    : [];

  let customTests: CustomTestDefinition[] = [];
  if (Array.isArray(raw.customTests)) {
    customTests = raw.customTests
      .map(normalizeCustomTestDefinition)
      .filter((definition): definition is CustomTestDefinition => definition !== null);
  }

  // Records can reference custom tests that are missing from the definitions;
  // recreate them so historical values stay visible.
  const knownIds = new Set(customTests.map((definition) => definition.id));
  for (const record of records) {
    for (const [id, measurement] of Object.entries(record.custom ?? {})) {
      if (knownIds.has(id)) continue;
      knownIds.add(id);
      customTests.push({
        id,
        name: measurement.name,
        unit: measurement.unit,
        refLow: null,
        refHigh: null,
        archived: true,
        createdAt: 0,
      });
    }
  }

  const appointments = Array.isArray(raw.appointments)
    ? raw.appointments
      .map(normalizeAppointment)
      .filter((appointment): appointment is ThyroidAppointment => appointment !== null)
    : [];

  return {
    records,
    customTests,
    appointments,
    appointmentFrequency: normalizeFrequency(raw.appointmentFrequency),
    firstRunDone: raw.firstRunDone === true || raw.firstRunDone === 1 || raw.firstRunDone === '1',
  };
}

function emptyData(): ThyroidData {
  return { records: [], customTests: [], appointments: [], appointmentFrequency: null, firstRunDone: false };
}

function readLegacyData(): ThyroidData {
  const result = emptyData();
  const records = readLegacy<unknown>(LEGACY_KEYS.records);
  if (Array.isArray(records)) {
    result.records = records
      .map(normalizeThyroidRecord)
      .filter((record): record is ThyroidBloodRecord => record !== null);
  }
  const customTests = readLegacy<unknown>(LEGACY_KEYS.customTests);
  if (Array.isArray(customTests)) {
    result.customTests = customTests
      .map(normalizeCustomTestDefinition)
      .filter((definition): definition is CustomTestDefinition => definition !== null);
  }
  const appointments = readLegacy<unknown>(LEGACY_KEYS.appointments);
  if (Array.isArray(appointments)) {
    result.appointments = appointments
      .map(normalizeAppointment)
      .filter((appointment): appointment is ThyroidAppointment => appointment !== null);
  }
  result.appointmentFrequency = normalizeFrequency(readLegacy<unknown>(LEGACY_KEYS.frequency));
  const firstRun = readLegacy<unknown>(LEGACY_KEYS.firstRunDone);
  result.firstRunDone = firstRun === 1 || firstRun === '1' || firstRun === true;
  return normalizeThyroidData(result);
}

function removeLegacyKeys(): void {
  ALL_LEGACY_KEYS.forEach((key) => localRemove(key));
}

/** Loads all thyroid data, migrating the old localStorage keys when needed. */
export async function loadThyroid(): Promise<ThyroidData> {
  if (!isTauri()) return readLegacyData();

  const stored = await tauriLoad<unknown>('load_thyroid');
  if (stored) return normalizeThyroidData(stored);

  const migrated = readLegacyData();
  await tauriSave('save_thyroid', migrated);
  removeLegacyKeys();
  return migrated;
}

/** Persists all thyroid data to the active storage backend. */
export async function saveThyroid(data: ThyroidData): Promise<void> {
  const normalized = normalizeThyroidData(data);
  if (isTauri()) {
    await tauriSave('save_thyroid', normalized);
    return;
  }

  localSave(LEGACY_KEYS.records, normalized.records);
  localSave(LEGACY_KEYS.customTests, normalized.customTests);
  localSave(LEGACY_KEYS.appointments, normalized.appointments);
  if (normalized.appointmentFrequency === null) localRemove(LEGACY_KEYS.frequency);
  else localSave(LEGACY_KEYS.frequency, normalized.appointmentFrequency);
  if (normalized.firstRunDone) localSave(LEGACY_KEYS.firstRunDone, 1);
  else localRemove(LEGACY_KEYS.firstRunDone);
}
