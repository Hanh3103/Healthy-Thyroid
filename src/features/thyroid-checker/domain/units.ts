import type { TestRange, ThyroidFieldKey } from './types';

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
