/**
 * Thyroid feature model.
 *
 * A single, framework-free module holding every type, constant and pure rule
 * used by the feature: field definitions, reference ranges, unit conversion,
 * OCR parsing, appointment maths, form-draft helpers and the view-model data
 * builders (dashboard, history table, appointment card).
 *
 * No Vue, no DOM and no persistence lives here.
 */
import { esc, keyOf } from '../../shared/utils';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface TestRange {
  low: number | null;
  high: number | null;
}

export interface ThyroidBloodValues {
  tsh: number | null;
  freeT4: number | null;
  totalT4: number | null;
  freeT3: number | null;
  totalT3: number | null;
  tpoAb: number | null;
  tgAb: number | null;
  trab: number | null;
  got: number | null;
  ggt: number | null;
  cholesterol: number | null;
  triglycerides: number | null;
  calcium: number | null;
  glucose: number | null;
  urea: number | null;
  creatinine: number | null;
  gpt: number | null;
  uricAcid: number | null;
}

export type ThyroidFieldKey = keyof ThyroidBloodValues;

/** Units selected for a record, keyed by built-in test. */
export type UnitMap = Partial<Record<ThyroidFieldKey, string>>;

/** User-edited expected ranges for a record, in that record's unit. */
export type RangeMap = Partial<Record<ThyroidFieldKey, TestRange>>;

/** A user-defined test such as Vitamin D. */
export interface CustomTestDefinition {
  id: string;
  name: string;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  archived: boolean;
  createdAt: number;
}

/** A custom test value for one record. */
export interface CustomMeasurement {
  name: string;
  value: number | null;
  unit: string;
  range?: TestRange;
}

export type CustomMeasurementMap = Record<string, CustomMeasurement>;

export interface ThyroidAppointment {
  id: string;
  date: string;
  time?: string;
  note?: string;
  createdAt: number;
  completed?: boolean;
}

export interface ThyroidBloodRecord extends ThyroidBloodValues {
  id: string;
  date: string;
  sourceFileName?: string;
  units?: UnitMap;
  ranges?: RangeMap;
  custom?: CustomMeasurementMap;
  createdAt: number;
  updatedAt: number;
}

export interface CustomDraftEntry {
  name: string;
  value: number | null;
  unit: string;
  range?: TestRange;
}

export interface Draft {
  values: ThyroidBloodValues;
  units: UnitMap;
  ranges: RangeMap;
  custom: Record<string, CustomDraftEntry>;
}

export function createDraft(): Draft {
  return {
    values: createEmptyValues(),
    units: {},
    ranges: {},
    custom: {},
  };
}

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

export interface FieldDefinition {
  key: ThyroidFieldKey;
  label: string;
  fullName: string;
  description: string;
  step?: string;
}

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: 'tsh', label: 'TSH', fullName: 'Thyroid-Stimulating Hormone', description: 'Signals the thyroid gland to produce and release thyroid hormones.', step: '0.001' },
  { key: 'freeT4', label: 'Free T4', fullName: 'Free Thyroxine', description: 'The unbound thyroxine available to tissues; the usual T4 test when only “T4” is not specified.', step: '0.01' },
  { key: 'totalT4', label: 'Total T4', fullName: 'Total Thyroxine', description: 'Protein-bound plus free thyroxine; reported by some labs instead of free T4.', step: '0.01' },
  { key: 'freeT3', label: 'Free T3', fullName: 'Free Triiodothyronine', description: 'The unbound, active thyroid hormone that influences metabolism and organ function.', step: '0.01' },
  { key: 'totalT3', label: 'Total T3', fullName: 'Total Triiodothyronine', description: 'Protein-bound plus free triiodothyronine; reported by some labs instead of free T3.', step: '0.1' },
  { key: 'tpoAb', label: 'TPO Ab', fullName: 'Thyroid Peroxidase Antibody', description: 'Antibody marker commonly associated with autoimmune thyroid inflammation.', step: '0.01' },
  { key: 'tgAb', label: 'Tg Ab', fullName: 'Thyroglobulin Antibody', description: 'Antibody that may indicate autoimmune thyroid disease or interfere with thyroglobulin testing.', step: '0.01' },
  { key: 'trab', label: 'TRAb', fullName: 'TSH Receptor Antibody', description: 'Antibody that may stimulate or block the TSH receptor in thyroid autoimmune disease.', step: '0.01' },
  { key: 'got', label: 'GOT / AST', fullName: 'Aspartate Aminotransferase', description: 'Measures liver and muscle cell enzymes that can rise with tissue injury.', step: '0.1' },
  { key: 'ggt', label: 'GGT', fullName: 'Gamma-Glutamyl Transferase', description: 'Measures a liver enzyme and helps assess liver or bile-duct conditions.', step: '0.1' },
  { key: 'cholesterol', label: 'CHO', fullName: 'Total Cholesterol', description: 'Measures blood cholesterol used to assess cardiovascular risk.', step: '0.1' },
  { key: 'triglycerides', label: 'TRIG', fullName: 'Triglycerides', description: 'Measures blood fat used for energy and related to metabolic and cardiovascular risk.', step: '0.1' },
  { key: 'calcium', label: 'Calcium', fullName: 'Blood Calcium', description: 'Supports bone, muscle, nerve, and blood-clotting functions.', step: '0.01' },
  { key: 'glucose', label: 'GLU', fullName: 'Blood Glucose', description: 'Measures circulating sugar used as the body’s main energy source.', step: '0.1' },
  { key: 'urea', label: 'URE', fullName: 'Urea', description: 'Reflects protein metabolism and kidney or hydration status.', step: '0.1' },
  { key: 'creatinine', label: 'CRE', fullName: 'Creatinine', description: 'Waste product used to estimate kidney function.', step: '0.01' },
  { key: 'gpt', label: 'GPT / ALT', fullName: 'Alanine Aminotransferase', description: 'Measures a liver enzyme that rises when liver cells are injured.', step: '0.1' },
  { key: 'uricAcid', label: 'UA', fullName: 'Uric Acid', description: 'Measures a waste product associated with gout and kidney or metabolic conditions.', step: '0.1' },
];

export const FIELD_KEYS: ThyroidFieldKey[] = FIELD_DEFINITIONS.map((field) => field.key);

export const FIELD_BY_KEY: Record<ThyroidFieldKey, FieldDefinition> = FIELD_DEFINITIONS.reduce(
  (map, field) => {
    map[field.key] = field;
    return map;
  },
  {} as Record<ThyroidFieldKey, FieldDefinition>,
);

export function createEmptyValues(): ThyroidBloodValues {
  return {
    tsh: null,
    freeT4: null,
    totalT4: null,
    freeT3: null,
    totalT3: null,
    tpoAb: null,
    tgAb: null,
    trab: null,
    got: null,
    ggt: null,
    cholesterol: null,
    triglycerides: null,
    calcium: null,
    glucose: null,
    urea: null,
    creatinine: null,
    gpt: null,
    uricAcid: null,
  };
}

// ---------------------------------------------------------------------------
// Reference ranges
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export interface UnitOption {
  label: string;
  /** Multiplier that converts a value in this unit into the canonical unit. */
  toCanonical: (value: number) => number;
  /** Multiplier that converts a canonical value into this unit. */
  fromCanonical: (value: number) => number;
}

export interface TestUnitConfig {
  canonical: string;
  options: UnitOption[];
}

function option(label: string, factor = 1): UnitOption {
  return {
    label,
    toCanonical: (value) => value * factor,
    fromCanonical: (value) => value / factor,
  };
}

export const TEST_UNITS: Record<ThyroidFieldKey, TestUnitConfig> = {
  tsh: { canonical: 'mIU/L', options: [option('mIU/L'), option('µIU/mL')] },
  freeT4: { canonical: 'ng/dL', options: [option('ng/dL'), option('pmol/L', 1 / 12.87)] },
  totalT4: { canonical: 'µg/dL', options: [option('µg/dL'), option('nmol/L', 1 / 12.87)] },
  freeT3: { canonical: 'pg/mL', options: [option('pg/mL'), option('pmol/L', 1 / 1.536)] },
  totalT3: { canonical: 'ng/dL', options: [option('ng/dL'), option('nmol/L', 65.1)] },
  tpoAb: { canonical: 'IU/mL', options: [option('IU/mL'), option('U/mL')] },
  tgAb: { canonical: 'IU/mL', options: [option('IU/mL'), option('U/mL')] },
  trab: { canonical: 'IU/L', options: [option('IU/L'), option('U/L')] },
  got: { canonical: 'U/L', options: [option('U/L'), option('µkat/L', 60)] },
  ggt: { canonical: 'U/L', options: [option('U/L'), option('µkat/L', 60)] },
  cholesterol: { canonical: 'mg/dL', options: [option('mg/dL'), option('mmol/L', 38.67)] },
  triglycerides: { canonical: 'mg/dL', options: [option('mg/dL'), option('mmol/L', 88.57)] },
  calcium: { canonical: 'mg/dL', options: [option('mg/dL'), option('mmol/L', 4.008)] },
  glucose: { canonical: 'mg/dL', options: [option('mg/dL'), option('mmol/L', 18.0182)] },
  urea: { canonical: 'mg/dL', options: [option('mg/dL'), option('mmol/L', 6.006)] },
  creatinine: { canonical: 'mg/dL', options: [option('mg/dL'), option('µmol/L', 1 / 88.4)] },
  gpt: { canonical: 'U/L', options: [option('U/L'), option('µkat/L', 60)] },
  uricAcid: { canonical: 'mg/dL', options: [option('mg/dL'), option('µmol/L', 1 / 59.48)] },
};

/** Handles common OCR/typing variants such as "ug/dL" or the Greek mu. */
const UNIT_ALIASES: Record<string, string> = {
  'ug/dl': 'µg/dL',
  'ug/l': 'µg/L',
  'umol/l': 'µmol/L',
  'ukat/l': 'µkat/L',
  'uiu/ml': 'µIU/mL',
  'miu/ml': 'mIU/L',
  'uiu/l': 'µIU/L',
  'ug/ml': 'µg/mL',
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/μ/g, 'µ').replace(/\s+/g, '');
}

function findOption(key: ThyroidFieldKey, unit: string): UnitOption | null {
  const normalized = normalizeLabel(unit);
  const target = UNIT_ALIASES[normalized] ?? normalized;
  return TEST_UNITS[key].options.find((item) => normalizeLabel(item.label) === normalizeLabel(target)) ?? null;
}

export function canonicalUnit(key: ThyroidFieldKey): string {
  return TEST_UNITS[key].canonical;
}

export function unitOptions(key: ThyroidFieldKey): string[] {
  return TEST_UNITS[key].options.map((item) => item.label);
}

/** Returns the canonical spelling for a known unit, or the trimmed input for unknown units. */
export function normalizeUnit(key: ThyroidFieldKey, unit: string): string {
  const found = findOption(key, unit);
  return found ? found.label : unit.trim();
}

export function isKnownUnit(key: ThyroidFieldKey, unit: string): boolean {
  return findOption(key, unit) !== null;
}

/** Converts between two units of the same test, or returns null when either unit is unknown. */
export function convertValue(key: ThyroidFieldKey, value: number, fromUnit: string, toUnit: string): number | null {
  const from = findOption(key, fromUnit);
  const to = findOption(key, toUnit);
  if (!from || !to || from.label === to.label) return from && to ? value : null;
  return to.fromCanonical(from.toCanonical(value));
}

export function convertRange(
  range: TestRange,
  key: ThyroidFieldKey,
  fromUnit: string,
  toUnit: string,
): TestRange | null {
  if (!isKnownUnit(key, fromUnit) || !isKnownUnit(key, toUnit)) return null;
  const convert = (value: number | null): number | null =>
    value === null ? null : convertValue(key, value, fromUnit, toUnit);
  return { low: convert(range.low), high: convert(range.high) };
}

/** Formats a number without noisy trailing decimals. */
export function formatNumber(value: number): string {
  const absolute = Math.abs(value);
  const digits = absolute >= 100 ? 0 : absolute >= 10 ? 1 : absolute >= 1 ? 2 : 3;
  return value
    .toFixed(digits)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}

/** Formats a range without units, e.g. "0.8 – 1.8", "≤ 9", "≥ 3". */
export function formatRange(range: TestRange): string {
  if (range.low !== null && range.high !== null) {
    return `${formatNumber(range.low)} – ${formatNumber(range.high)}`;
  }
  if (range.low !== null) return `≥ ${formatNumber(range.low)}`;
  if (range.high !== null) return `≤ ${formatNumber(range.high)}`;
  return '—';
}

/** Keeps converted values tidy (three decimals is plenty for lab data). */
export function trimConverted(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// OCR parsing
// ---------------------------------------------------------------------------

interface ParsedEntry {
  value: number | null;
  unit?: string;
}

export interface ParsedCustomResult {
  value: number | null;
  unit?: string;
}

export interface ParsedBloodResult {
  values: ThyroidBloodValues;
  units: UnitMap;
  custom: Record<string, ParsedCustomResult>;
}

function parseNumber(text: string): number | null {
  const normalized = text.trim()
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.+-]/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Longest / most specific aliases first so "µIU/mL" is not read as "IU/mL". */
const PARSED_UNIT_ALIASES: Array<[string, string]> = [
  ['µiu/ml', 'µIU/mL'],
  ['uiu/ml', 'µIU/mL'],
  ['miu/l', 'mIU/L'],
  ['pmol/l', 'pmol/L'],
  ['nmol/l', 'nmol/L'],
  ['µmol/l', 'µmol/L'],
  ['umol/l', 'µmol/L'],
  ['µkat/l', 'µkat/L'],
  ['ukat/l', 'µkat/L'],
  ['µg/dl', 'µg/dL'],
  ['ug/dl', 'µg/dL'],
  ['ng/dl', 'ng/dL'],
  ['pg/ml', 'pg/mL'],
  ['ng/ml', 'ng/mL'],
  ['µg/ml', 'µg/mL'],
  ['ug/ml', 'µg/mL'],
  ['mg/dl', 'mg/dL'],
  ['mmol/l', 'mmol/L'],
  ['iu/ml', 'IU/mL'],
  ['iu/l', 'IU/L'],
  ['u/ml', 'U/mL'],
  ['u/l', 'U/L'],
];

function detectUnit(trailingText: string): string | undefined {
  const text = trailingText.toLowerCase().replace(/μ/g, 'µ');
  for (const [alias, unit] of PARSED_UNIT_ALIASES) {
    if (text.includes(alias)) return unit;
  }
  return undefined;
}

function escapeLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function entryFromMatch(match: RegExpMatchArray | null): ParsedEntry {
  if (!match) return { value: null };
  const value = parseNumber(match[1]);
  if (value === null) return { value: null };
  return { value, unit: detectUnit(match[2] ?? '') };
}

function extractValue(text: string, labels: string[]): ParsedEntry {
  for (const label of labels) {
    const pattern = new RegExp(
      escapeLabel(label) + String.raw`[^0-9+\-]*([+\-]?\d+(?:[.,]\d+)?)([^\n]*)`,
      'i',
    );
    const entry = entryFromMatch(text.match(pattern));
    if (entry.value !== null) return entry;
  }
  return { value: null };
}

/** Matches a bare token such as T4 without matching inside FT4 or TT4. */
function extractToken(text: string, token: string): ParsedEntry {
  const pattern = new RegExp(
    String.raw`\b` + token + String.raw`\b[^0-9+\-]*([+\-]?\d+(?:[.,]\d+)?)([^\n]*)`,
    'i',
  );
  return entryFromMatch(text.match(pattern));
}

export function parseBloodDate(text: string): string {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const dmy = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  return keyOf(new Date());
}

export function parseBloodResult(text: string, customTests: CustomTestDefinition[] = []): ParsedBloodResult {
  const normalized = text.replace(/\r/g, '\n');

  const freeT4 = extractValue(normalized, ['FREE T4', 'FREE-T4', 'FREE_T4', 'FT4', 'F T4']);
  const totalT4Explicit = extractValue(normalized, ['TOTAL T4', 'TOTAL-T4', 'TT4']);
  const totalT4 = totalT4Explicit.value !== null
    ? totalT4Explicit
    : freeT4.value === null
      ? extractToken(normalized, 'T4')
      : { value: null };

  const freeT3 = extractValue(normalized, ['FREE T3', 'FREE-T3', 'FREE_T3', 'FT3', 'F T3']);
  const totalT3Explicit = extractValue(normalized, ['TOTAL T3', 'TOTAL-T3', 'TT3']);
  const totalT3 = totalT3Explicit.value !== null
    ? totalT3Explicit
    : freeT3.value === null
      ? extractToken(normalized, 'T3')
      : { value: null };

  const entries: Record<keyof ThyroidBloodValues, ParsedEntry> = {
    tsh: extractValue(normalized, ['TSH']),
    freeT4,
    totalT4,
    freeT3,
    totalT3,
    tpoAb: extractValue(normalized, ['TPO AB', 'TPOAB', 'ANTI TPO', 'TPO']),
    tgAb: extractValue(normalized, ['TG AB', 'TG-AB', 'TGAB', 'ANTI TG', 'ANTI-TG']),
    trab: extractValue(normalized, ['TRAB', 'TR AB', 'TSH RAB', 'TSH-RECEPTOR']),
    got: extractValue(normalized, ['GOT', 'AST']),
    ggt: extractValue(normalized, ['GGT']),
    cholesterol: extractValue(normalized, ['CHO', 'CHOLESTEROL', 'TOTAL CHOLESTEROL']),
    triglycerides: extractValue(normalized, ['TRIG', 'TRIGLYCERIDES']),
    calcium: extractValue(normalized, ['CALCIUM', 'CA']),
    glucose: extractValue(normalized, ['GLU', 'GLUCOSE']),
    urea: extractValue(normalized, ['URE', 'UREA', 'BUN']),
    creatinine: extractValue(normalized, ['CRE', 'CREATININE']),
    gpt: extractValue(normalized, ['GPT', 'ALT']),
    uricAcid: extractValue(normalized, ['URIC ACID', 'UA']),
  };

  const values = createEmptyValues();
  const units: UnitMap = {};
  (Object.keys(entries) as Array<keyof ThyroidBloodValues>).forEach((key) => {
    const entry = entries[key];
    values[key] = entry.value;
    if (entry.value !== null && entry.unit) units[key] = entry.unit;
  });

  const custom: Record<string, ParsedCustomResult> = {};
  for (const definition of customTests) {
    if (definition.archived) continue;
    const entry = extractValue(normalized, [definition.name]);
    if (entry.value !== null) {
      custom[definition.id] = { value: entry.value, unit: entry.unit };
    }
  }

  return { values, units, custom };
}

// ---------------------------------------------------------------------------
// Appointment helpers
// ---------------------------------------------------------------------------

/** Adds `months` months to an ISO date string, clamping day to the last day of the target month. */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const base = new Date(year, month - 1, day);
  const targetMonth = base.getMonth() + months;
  const targetYear = base.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  const result = new Date(targetYear, normalizedMonth, clampedDay);
  return toIsoDate(result);
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00').getTime();
  const to = new Date(toIso + 'T00:00:00').getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export function lastResultDate(records: ThyroidBloodRecord[]): string | null {
  if (records.length === 0) return null;
  return records.reduce((latest, record) => (record.date > latest ? record.date : latest), records[0].date);
}

export function suggestedAppointmentDate(records: ThyroidBloodRecord[], frequencyPerYear: number): string {
  const baseline = lastResultDate(records) ?? todayIso();
  const intervalMonths = Math.max(1, Math.round(12 / frequencyPerYear));
  return addMonths(baseline, intervalMonths);
}

export function nextTargetDate(appointments: ThyroidAppointment[], suggested: string): string {
  const future = appointments
    .filter((appointment) => !appointment.completed && appointment.date >= todayIso())
    .map((appointment) => appointment.date)
    .sort();
  return future.length > 0 ? future[0] : suggested;
}

export function formatDateDMY(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function dmyToIso(dmy: string): string | null {
  const match = dmy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatAppointmentDate(iso: string): string {
  return formatDateDMY(iso);
}

// ---------------------------------------------------------------------------
// Form draft helpers (pure versions of the old DOM-dependent helpers)
// ---------------------------------------------------------------------------

export interface Placeholder {
  low: string;
  high: string;
  title: string;
}

export function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function valueText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function activeCustomTests(customTests: CustomTestDefinition[]): CustomTestDefinition[] {
  return customTests.filter((definition) => !definition.archived);
}

export function builtInUnit(draft: Draft, key: ThyroidFieldKey): string {
  return draft.units[key] ?? canonicalUnit(key);
}

export function customUnit(draft: Draft, definition: CustomTestDefinition): string {
  return draft.custom[definition.id]?.unit ?? definition.unit;
}

export function builtInPlaceholder(key: ThyroidFieldKey, unit: string): Placeholder {
  const known = isKnownUnit(key, unit);
  const range = standardRangeFor(key, unit);
  const displayUnit = known ? normalizeUnit(key, unit) : canonicalUnit(key);
  return {
    low: range.low === null ? '' : formatNumber(range.low),
    high: range.high === null ? '' : formatNumber(range.high),
    title: `Standard: ${formatRange(range)} ${displayUnit}${known ? '' : ' — unit not recognised, range not converted'}`,
  };
}

export function customPlaceholder(definition: CustomTestDefinition, unit: string): Placeholder {
  const range: TestRange = { low: definition.refLow, high: definition.refHigh };
  const hasRange = definition.refLow !== null || definition.refHigh !== null;
  if (!hasRange) {
    return { low: '', high: '', title: 'No standard range — type one to override' };
  }
  if (unit && unit !== definition.unit) {
    return {
      low: '',
      high: '',
      title: `Standard range is ${formatRange(range)} ${definition.unit} — this row uses ${unit}`,
    };
  }
  return {
    low: definition.refLow === null ? '' : formatNumber(definition.refLow),
    high: definition.refHigh === null ? '' : formatNumber(definition.refHigh),
    title: `Standard: ${formatRange(range)} ${definition.unit}`,
  };
}

export function applyBuiltInUnit(draft: Draft, key: ThyroidFieldKey, rawUnit: string): void {
  const oldUnit = builtInUnit(draft, key);
  const newUnit = normalizeUnit(key, rawUnit.trim() || canonicalUnit(key));

  if (newUnit !== oldUnit && isKnownUnit(key, oldUnit) && isKnownUnit(key, newUnit)) {
    const value = draft.values[key];
    if (value !== null) {
      const converted = convertValue(key, value, oldUnit, newUnit);
      if (converted !== null) draft.values[key] = trimConverted(converted);
    }
    const range = draft.ranges[key];
    if (range) {
      const converted = convertRange(range, key, oldUnit, newUnit);
      if (converted) {
        draft.ranges[key] = {
          low: converted.low === null ? null : trimConverted(converted.low),
          high: converted.high === null ? null : trimConverted(converted.high),
        };
      }
    }
  }

  draft.units[key] = newUnit;
}

export function applyCustomUnit(draft: Draft, definition: CustomTestDefinition, rawUnit: string): void {
  const unit = rawUnit.trim() || definition.unit;
  const entry = draft.custom[definition.id];
  draft.custom[definition.id] = entry
    ? { ...entry, unit }
    : { name: definition.name, value: null, unit };
}

export function ensureCustomDraft(draft: Draft, definition: CustomTestDefinition): CustomDraftEntry {
  const existing = draft.custom[definition.id];
  if (existing) return existing;
  const entry: CustomDraftEntry = { name: definition.name, value: null, unit: definition.unit };
  draft.custom[definition.id] = entry;
  return entry;
}

/** Drops an untouched custom row so it is not persisted as an empty measurement. */
function pruneCustomDraft(draft: Draft, definition: CustomTestDefinition): void {
  const entry = draft.custom[definition.id];
  if (entry && entry.value === null && !entry.range && entry.unit === definition.unit) {
    delete draft.custom[definition.id];
  }
}

export function setBuiltInRange(draft: Draft, key: ThyroidFieldKey, low: number | null, high: number | null): void {
  if (low === null && high === null) delete draft.ranges[key];
  else draft.ranges[key] = { low, high };
}

export function setCustomValue(draft: Draft, definition: CustomTestDefinition, value: number | null): void {
  ensureCustomDraft(draft, definition).value = value;
  pruneCustomDraft(draft, definition);
}

export function setCustomRange(
  draft: Draft,
  definition: CustomTestDefinition,
  low: number | null,
  high: number | null,
): void {
  const entry = ensureCustomDraft(draft, definition);
  if (low === null && high === null) delete entry.range;
  else entry.range = { low, high };
  pruneCustomDraft(draft, definition);
}

export function cloneRanges(ranges: RangeMap | undefined): RangeMap {
  const copy: RangeMap = {};
  for (const key of FIELD_KEYS) {
    const range = ranges?.[key];
    if (range) copy[key] = { low: range.low, high: range.high };
  }
  return copy;
}

export function cloneCustom(custom: CustomMeasurementMap | undefined): Record<string, CustomDraftEntry> {
  const copy: Record<string, CustomDraftEntry> = {};
  for (const [id, measurement] of Object.entries(custom ?? {})) {
    copy[id] = {
      name: measurement.name,
      value: measurement.value,
      unit: measurement.unit,
      ...(measurement.range
        ? { range: { low: measurement.range.low, high: measurement.range.high } }
        : {}),
    };
  }
  return copy;
}

export function preserveArchivedCustom(
  existing: ThyroidBloodRecord,
  customTests: CustomTestDefinition[],
): CustomMeasurementMap {
  const preserved: CustomMeasurementMap = {};
  for (const [id, measurement] of Object.entries(existing.custom ?? {})) {
    const isActive = customTests.some((definition) => definition.id === id && !definition.archived);
    if (!isActive) preserved[id] = measurement;
  }
  return preserved;
}

export function validateDraft(draft: Draft, customTests: CustomTestDefinition[]): string | null {
  for (const key of FIELD_KEYS) {
    const range = draft.ranges[key];
    if (range && !isValidRange(range)) {
      return `${FIELD_BY_KEY[key].label}: the expected range must have min ≤ max (blank means no limit).`;
    }
  }
  for (const definition of activeCustomTests(customTests)) {
    const range = draft.custom[definition.id]?.range;
    if (range && !isValidRange(range)) {
      return `${definition.name}: the expected range must have min ≤ max (blank means no limit).`;
    }
  }
  return null;
}

export function collectUnits(draft: Draft): UnitMap {
  const units: UnitMap = {};
  for (const key of FIELD_KEYS) {
    if (draft.values[key] !== null) units[key] = builtInUnit(draft, key);
  }
  return units;
}

export function collectRanges(draft: Draft): RangeMap {
  const ranges: RangeMap = {};
  for (const key of FIELD_KEYS) {
    const range = draft.ranges[key];
    if (range) ranges[key] = range;
  }
  return ranges;
}

export function collectCustom(draft: Draft, customTests: CustomTestDefinition[]): CustomMeasurementMap {
  const custom: CustomMeasurementMap = {};
  for (const definition of activeCustomTests(customTests)) {
    const entry = draft.custom[definition.id];
    if (!entry) continue;
    if (entry.value === null && !entry.range) continue;
    custom[definition.id] = {
      name: definition.name,
      value: entry.value,
      unit: entry.unit || definition.unit,
      ...(entry.range ? { range: entry.range } : {}),
    };
  }
  return custom;
}

// ---------------------------------------------------------------------------
// History table view models
// ---------------------------------------------------------------------------

export const HISTORY_KEYS: ThyroidFieldKey[] = [
  'tsh', 'freeT4', 'totalT4', 'freeT3', 'totalT3', 'tpoAb', 'tgAb', 'trab',
];

export interface HistoryCellVm {
  key: string;
  label: string;
  value: number | null;
  text: string;
  unit: string;
  status: RangeAssessment | null;
  title: string;
}

export interface HistoryColumnVm {
  key: string;
  label: string;
  title?: string;
}

export interface HistoryRowVm {
  id: string;
  date: string;
  cells: HistoryCellVm[];
  record: ThyroidBloodRecord;
}

export interface HistoryVm {
  columns: HistoryColumnVm[];
  rows: HistoryRowVm[];
  count: number;
}

export function statusNote(status: RangeAssessment | null): string {
  if (status === 'high') return ' — above expected range';
  if (status === 'low') return ' — below expected range';
  return '';
}

export function builtInCellVm(record: ThyroidBloodRecord, key: ThyroidFieldKey): HistoryCellVm {
  const unit = record.units?.[key] ?? canonicalUnit(key);
  const override = record.ranges?.[key];
  const known = isKnownUnit(key, unit);
  const standard = standardRangeFor(key, unit);
  const range = override ?? (known ? standard : null);
  const displayUnit = override || known ? unit : canonicalUnit(key);
  const status = assessValue(record[key], range);
  const expected = override || known
    ? `Expected ${formatRange(override ?? standard)} ${displayUnit}`
    : `Expected ${formatRange(standard)} ${displayUnit} (unit not recognised)`;
  const value = record[key];
  return {
    key,
    label: FIELD_BY_KEY[key].label,
    value,
    text: value === null ? '-' : String(value),
    unit,
    status,
    title: expected + statusNote(status),
  };
}

export function customCellVm(record: ThyroidBloodRecord, definition: CustomTestDefinition): HistoryCellVm {
  const measurement = record.custom?.[definition.id];
  const standard = definition.refLow !== null || definition.refHigh !== null
    ? { low: definition.refLow, high: definition.refHigh }
    : null;
  if (!measurement) {
    return {
      key: `custom:${definition.id}`,
      label: definition.name,
      value: null,
      text: '-',
      unit: definition.unit,
      status: null,
      title: standard ? `Expected ${formatRange(standard)} ${definition.unit}` : 'No expected range',
    };
  }
  const unit = measurement.unit || definition.unit;
  const comparable = measurement.range ?? (unit === definition.unit ? standard : null);
  const status = assessValue(measurement.value, comparable);
  const rangeUnit = measurement.range ? unit : definition.unit || unit;
  const title = standard || measurement.range
    ? `Expected ${formatRange(measurement.range ?? standard as TestRange)} ${rangeUnit}`
    : 'No expected range';
  return {
    key: `custom:${definition.id}`,
    label: definition.name,
    value: measurement.value,
    text: measurement.value === null ? '-' : String(measurement.value),
    unit,
    status,
    title: title + statusNote(status),
  };
}

export function historyCustomTests(
  records: ThyroidBloodRecord[],
  customTests: CustomTestDefinition[],
): CustomTestDefinition[] {
  const withData = new Set<string>();
  for (const record of records) {
    for (const [id, measurement] of Object.entries(record.custom ?? {})) {
      if (measurement.value !== null) withData.add(id);
    }
  }
  const columns = customTests.filter((definition) => withData.has(definition.id));
  const known = new Set(columns.map((definition) => definition.id));
  const unknown: CustomTestDefinition[] = [];
  for (const id of withData) {
    if (known.has(id)) continue;
    const name = records
      .map((record) => record.custom?.[id]?.name)
      .find((value): value is string => typeof value === 'string' && value.length > 0) ?? id;
    unknown.push({ id, name, unit: '', refLow: null, refHigh: null, archived: true, createdAt: 0 });
  }
  return [...columns, ...unknown].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildHistory(records: ThyroidBloodRecord[], customTests: CustomTestDefinition[]): HistoryVm {
  const customColumns = historyCustomTests(records, customTests);
  const columns: HistoryColumnVm[] = [
    ...HISTORY_KEYS.map((key) => ({
      key,
      label: FIELD_BY_KEY[key].label,
      title: `${FIELD_BY_KEY[key].fullName} — ${FIELD_BY_KEY[key].description}`,
    })),
    ...customColumns.map((definition) => ({
      key: `custom:${definition.id}`,
      label: definition.name,
      title: definition.unit ? `Custom test (${definition.unit})` : 'Custom test',
    })),
  ];
  const rows = [...records]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((record) => ({
      id: record.id,
      date: formatDateDMY(record.date),
      record,
      cells: [
        ...HISTORY_KEYS.map((key) => builtInCellVm(record, key)),
        ...customColumns.map((definition) => customCellVm(record, definition)),
      ],
    }));
  return { columns, rows, count: records.length };
}

// ---------------------------------------------------------------------------
// TSH dashboard view models (pure SVG generation)
// ---------------------------------------------------------------------------

export type DashboardRange = 'all' | '6m' | '1y';
export type OverlayKey = 'freeT4' | 'freeT3';

export interface SeriesValue {
  value: number;
  unit: string;
}

export interface TshPoint {
  date: string;
  tsh: SeriesValue;
  tshStatus: RangeAssessment | null;
  tshRange: TestRange | null;
  freeT4: SeriesValue | null;
  freeT3: SeriesValue | null;
}

export interface DashboardStats {
  latest: TshPoint | null;
  average: number | null;
  min: number | null;
  max: number | null;
  inRangeCount: number;
  count: number;
}

export interface DashboardVm {
  points: TshPoint[];
  stats: DashboardStats;
  chart: string;
  hasData: boolean;
  range: DashboardRange;
  overlays: OverlayKey[];
  showTsh: boolean;
  emptyMessage: string;
}

const CHART = { width: 640, height: 240, left: 44, right: 16, top: 14, bottom: 34 };
const OVERLAY_COLORS: Record<OverlayKey, string> = {
  freeT4: 'var(--thyroid-ft4-line)',
  freeT3: 'var(--thyroid-ft3-line)',
};
const OVERLAY_LABELS: Record<OverlayKey, string> = {
  freeT4: 'Free T4',
  freeT3: 'Free T3',
};

function parseIso(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function measured(key: ThyroidFieldKey, value: number | null | undefined, units: UnitMap | undefined): SeriesValue | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return { value, unit: units?.[key] ?? canonicalUnit(key) };
}

export function collectDashboardPoints(records: ThyroidBloodRecord[]): TshPoint[] {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const points: TshPoint[] = [];

  for (const record of sorted) {
    if (record.tsh === null || record.tsh === undefined || !Number.isFinite(record.tsh)) continue;
    const unit = record.units?.tsh ?? canonicalUnit('tsh');
    const known = isKnownUnit('tsh', unit);
    const override = record.ranges?.tsh ?? null;
    const range = known || override ? override ?? standardRangeFor('tsh', unit) : null;
    points.push({
      date: record.date,
      tsh: { value: record.tsh, unit },
      tshStatus: assessValue(record.tsh, range),
      tshRange: range,
      freeT4: measured('freeT4', record.freeT4, record.units),
      freeT3: measured('freeT3', record.freeT3, record.units),
    });
  }
  return points;
}

export function filterDashboardPoints(points: TshPoint[], range: DashboardRange): TshPoint[] {
  if (range === 'all') return points;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (range === '6m' ? 6 : 12));
  const cutoffTime = cutoff.getTime();
  return points.filter((point) => parseIso(point.date) >= cutoffTime);
}

export function computeDashboardStats(points: TshPoint[]): DashboardStats {
  const values = points.map((point) => point.tsh.value);
  return {
    latest: points[points.length - 1] ?? null,
    average: values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    inRangeCount: points.filter((point) => point.tshStatus === 'normal').length,
    count: points.length,
  };
}

/** Adapter so the SVG builder can use the shared HTML escaper with any value. */
function escapeText(value: unknown): string {
  return esc(String(value ?? ''));
}

export function buildDashboardChart(points: TshPoint[], overlays: OverlayKey[] = [], showTsh = true): string {
  const { width, height, left, right, top, bottom } = CHART;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const toX = (index: number) => left + index * xStep;

  const tshValues = points.map((point) => point.tsh.value);
  const units = new Set(points.map((point) => point.tsh.unit));
  const singleUnit = units.size === 1;
  const range = singleUnit ? points[points.length - 1].tshRange : null;

  let yMin = Math.min(...tshValues);
  let yMax = Math.max(...tshValues);
  if (range) {
    if (range.low !== null) yMin = Math.min(yMin, range.low);
    if (range.high !== null) yMax = Math.max(yMax, range.high);
  }
  const padding = (yMax - yMin || Math.abs(yMax) || 1) * 0.12;
  yMin -= padding;
  yMax += padding;
  const ySpan = yMax - yMin || 1;
  const toY = (value: number) => top + plotHeight - ((value - yMin) / ySpan) * plotHeight;

  let svg = '';

  // Reference range band (only meaningful when all points share a unit).
  if (showTsh && range && (range.low !== null || range.high !== null)) {
    const bandTop = toY(range.high ?? yMax);
    const bandBottom = toY(range.low ?? yMin);
    svg += `<rect x="${left}" y="${bandTop}" width="${plotWidth}" height="${Math.max(0, bandBottom - bandTop)}" fill="var(--ok)" opacity="0.09" />`;
    svg += `<line x1="${left}" y1="${bandTop}" x2="${width - right}" y2="${bandTop}" stroke="var(--ok)" stroke-width="1" stroke-dasharray="3 4" opacity="0.5" />`;
    svg += `<line x1="${left}" y1="${bandBottom}" x2="${width - right}" y2="${bandBottom}" stroke="var(--ok)" stroke-width="1" stroke-dasharray="3 4" opacity="0.5" />`;
  }

  // Horizontal grid + Y labels.
  for (let tick = 0; tick <= 4; tick++) {
    const value = yMin + (ySpan * tick) / 4;
    const y = toY(value);
    svg += `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="var(--line)" stroke-width="1" opacity="0.7" />`;
    if (showTsh) {
      svg += `<text x="${left - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--ink-2)">${escapeText(formatNumber(value))}</text>`;
    }
  }

  // X labels: first, middle, last.
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  for (const index of labelIndexes) {
    svg += `<text x="${toX(index)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="var(--ink-2)">${escapeText(formatDateDMY(points[index].date).slice(0, 5))}</text>`;
  }

  // Overlay series on their own normalized scale so different units remain visible.
  const activeOverlays = new Set(overlays);
  for (const key of activeOverlays) {
    const values = points.map((point) => point[key]);
    const present = values.filter((value): value is SeriesValue => value !== null && value !== undefined);
    if (present.length < 2) continue;
    const overlayMin = Math.min(...present.map((value) => value.value));
    const overlayMax = Math.max(...present.map((value) => value.value));
    const overlayPad = (overlayMax - overlayMin || Math.abs(overlayMax) || 1) * 0.15;
    const low = overlayMin - overlayPad;
    const span = overlayMax - overlayMin + overlayPad * 2 || 1;
    const overlayY = (value: number) => top + plotHeight - ((value - low) / span) * plotHeight;
    const color = OVERLAY_COLORS[key];
    const segments: string[] = [];
    let started = false;
    points.forEach((point, index) => {
      const measurement = point[key];
      if (!measurement) { started = false; return; }
      const command = started ? 'L' : 'M';
      segments.push(`${command} ${toX(index)} ${overlayY(measurement.value)}`);
      started = true;
    });
    svg += `<path d="${segments.join(' ')}" fill="none" stroke="${color}" stroke-width="1.75" stroke-dasharray="5 4" stroke-linejoin="round" />`;
    points.forEach((point, index) => {
      const measurement = point[key];
      if (!measurement) return;
      svg += `<circle cx="${toX(index)}" cy="${overlayY(measurement.value)}" r="3" fill="var(--surface)" stroke="${color}" stroke-width="1.5"><title>${escapeText(formatDateDMY(point.date))}: ${OVERLAY_LABELS[key]} ${escapeText(formatNumber(measurement.value))} ${escapeText(measurement.unit)}</title></circle>`;
    });
  }

  // TSH line and points.
  if (showTsh) {
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(index)} ${toY(point.tsh.value)}`).join(' ');
    svg += `<path d="${path}" fill="none" stroke="var(--thyroid-tsh-line)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;
    points.forEach((point, index) => {
      const outOfRange = point.tshStatus === 'low' || point.tshStatus === 'high';
      const flag = point.tshStatus === 'high' ? ' ↑' : point.tshStatus === 'low' ? ' ↓' : '';
      const expected = point.tshRange ? ` · expected ${escapeText(formatRange(point.tshRange))}` : '';
      svg += `<circle cx="${toX(index)}" cy="${toY(point.tsh.value)}" r="4.5" fill="${outOfRange ? 'var(--danger)' : 'var(--thyroid-tsh-line)'}" stroke="var(--surface)" stroke-width="2"><title>${escapeText(formatDateDMY(point.date))}: TSH ${escapeText(formatNumber(point.tsh.value))} ${escapeText(point.tsh.unit)}${flag}${expected}</title></circle>`;
    });
  }

  let html = `<svg viewBox="0 0 ${width} ${height}" class="thyroid-dash-svg" role="img" aria-label="${showTsh ? 'TSH trend line chart' : 'Thyroid trend line chart'}">${svg}</svg>`;
  if (showTsh && !singleUnit) {
    html += '<p class="thyroid-dash-note">Results use different TSH units, so values are plotted as recorded. Compare values by their unit.</p>';
  }
  if (showTsh && range) {
    html += `<p class="thyroid-dash-note">Shaded band: expected TSH ${escapeText(formatRange(range))} ${escapeText(points[points.length - 1].tsh.unit)}.</p>`;
  }
  return html;
}

export function buildDashboard(
  records: ThyroidBloodRecord[],
  range: DashboardRange,
  overlays: OverlayKey[],
  showTsh = true,
): DashboardVm {
  const points = filterDashboardPoints(collectDashboardPoints(records), range);
  return {
    points,
    stats: computeDashboardStats(points),
    chart: points.length >= 2 ? buildDashboardChart(points, overlays, showTsh) : '',
    hasData: points.length >= 2,
    range,
    overlays,
    showTsh,
    emptyMessage: 'Add at least two blood results with a TSH value to see a trend.',
  };
}

// ---------------------------------------------------------------------------
// Appointment card view model
// ---------------------------------------------------------------------------

export interface AppointmentCardVm {
  targetDate: string;
  dateText: string;
  countdown: string;
  status: string;
  dueSoon: boolean;
  overdue: boolean;
  hasUpcoming: boolean;
  addLabel: string;
  bannerVisible: boolean;
  bannerText: string;
}

export function buildAppointmentCard(
  records: ThyroidBloodRecord[],
  appointments: ThyroidAppointment[],
  frequency: number | null,
  bannerOverride: string | null = null,
): AppointmentCardVm {
  const targetDate = nextTargetDate(appointments, suggestedAppointmentDate(records, frequency ?? 2));
  const days = daysBetween(todayIso(), targetDate);
  const overdue = days < 0;
  const dueSoon = days <= 7;
  const hasUpcoming = appointments.some(
    (appointment) => !appointment.completed && appointment.date >= todayIso(),
  );

  let countdown: string;
  if (days === 0) countdown = 'today';
  else if (days > 0) countdown = `in ${days} day${days === 1 ? '' : 's'}`;
  else countdown = `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;

  let status: string;
  if (overdue) status = 'Overdue — book an appointment';
  else if (days <= 7) status = 'Due soon';
  else status = 'On track';

  let bannerText = '';
  if (bannerOverride) bannerText = bannerOverride;
  else if (overdue) bannerText = `Blood control overdue (${formatAppointmentDate(targetDate)}). Please book an appointment.`;
  else if (days <= 7) bannerText = `Blood control due ${formatAppointmentDate(targetDate)}.`;

  return {
    targetDate,
    dateText: formatAppointmentDate(targetDate),
    countdown,
    status,
    dueSoon,
    overdue,
    hasUpcoming,
    addLabel: hasUpcoming ? 'Change appointment' : 'Add appointment',
    bannerVisible: Boolean(bannerText),
    bannerText,
  };
}
