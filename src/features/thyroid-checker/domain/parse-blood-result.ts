import type { CustomTestDefinition, ThyroidBloodValues, UnitMap } from './types';
import { keyOf } from '../../../shared/utils';
import { createEmptyValues } from './field-definitions';

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
const UNIT_ALIASES: Array<[string, string]> = [
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
  for (const [alias, unit] of UNIT_ALIASES) {
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
