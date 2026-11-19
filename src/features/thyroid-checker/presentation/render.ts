import type { CustomTestDefinition, ThyroidBloodRecord, ThyroidFieldKey } from '../domain/types';
import { state } from './state';
import {
  activeCustomTests,
  builtInPlaceholder,
  builtInUnit,
  customPlaceholder,
  customUnit,
  elementById,
  esc,
  rangeLowId,
  rangeHighId,
  unitInputId,
  inputId,
  customInputId,
  rangeRow,
} from './helpers';
import { FIELD_BY_KEY, FIELD_DEFINITIONS } from '../domain/field-definitions';
import { assessValue, standardRangeFor } from '../domain/reference-ranges';
import type { RangeAssessment } from '../domain/reference-ranges';
import {
  canonicalUnit,
  formatRange,
  isKnownUnit,
  unitOptions,
} from '../domain/units';
import { formatDateDMY } from '../domain/appointments';

export const HISTORY_KEYS: ThyroidFieldKey[] = [
  'tsh', 'freeT4', 'totalT4', 'freeT3', 'totalT3', 'tpoAb', 'tgAb', 'trab',
];

export function statusNote(status: RangeAssessment | null): string {
  if (status === 'high') return ' — above expected range';
  if (status === 'low') return ' — below expected range';
  return '';
}

export function cell(value: number | null | undefined, unit: string, status: RangeAssessment | null): string {
  if (value === null || value === undefined) return '-';
  const unitHtml = '<span class="thyroid-history-unit">' + esc(unit) + '</span>';
  if (status !== 'low' && status !== 'high') return esc(String(value)) + unitHtml;
  const flag = status === 'high' ? '↑' : '↓';
  const direction = status === 'high' ? 'above' : 'below';
  return '<span class="thyroid-value-' + status + '" aria-label="' + esc(value + ' ' + unit + ', ' + direction + ' expected range') + '">' + esc(String(value)) + unitHtml + '<span class="thyroid-value-flag" aria-hidden="true">' + flag + '</span></span>';
}

export function refreshBuiltInRow(key: ThyroidFieldKey): void {
  const unit = builtInUnit(key);
  const unitInput = elementById<HTMLInputElement>(unitInputId(key));
  if (unitInput) unitInput.value = unit;
  const valueInput = elementById<HTMLInputElement>(inputId(key));
  if (valueInput) valueInput.value = String(state.draft.values[key] ?? '');
  const placeholder = builtInPlaceholder(key, unit);
  const range = state.draft.ranges[key];
  const low = elementById<HTMLInputElement>(rangeLowId(key));
  const high = elementById<HTMLInputElement>(rangeHighId(key));
  if (low) {
    low.value = range?.low === null || range?.low === undefined ? '' : String(range.low);
    low.placeholder = placeholder.low;
  }
  if (high) {
    high.value = range?.high === null || range?.high === undefined ? '' : String(range.high);
    high.placeholder = placeholder.high;
  }
  const container = low?.closest<HTMLElement>('.thyroid-range-inputs');
  if (container) container.title = placeholder.title;
}

export function refreshCustomRow(definition: CustomTestDefinition): void {
  const unit = customUnit(definition);
  const unitInput = elementById<HTMLInputElement>(unitInputId(definition.id));
  if (unitInput) unitInput.value = unit;
  const entry = state.draft.custom[definition.id];
  const valueInput = elementById<HTMLInputElement>(customInputId(definition.id));
  if (valueInput) valueInput.value = entry?.value === null || entry?.value === undefined ? '' : String(entry.value);
  const placeholder = customPlaceholder(definition, unit);
  const range = entry?.range;
  const low = elementById<HTMLInputElement>(rangeLowId(definition.id));
  const high = elementById<HTMLInputElement>(rangeHighId(definition.id));
  if (low) {
    low.value = range?.low === null || range?.low === undefined ? '' : String(range.low);
    low.placeholder = placeholder.low;
  }
  if (high) {
    high.value = range?.high === null || range?.high === undefined ? '' : String(range.high);
    high.placeholder = placeholder.high;
  }
  const container = low?.closest<HTMLElement>('.thyroid-range-inputs');
  if (container) container.title = placeholder.title;
}

export function renderFieldGrid(focusId?: string): void {
  const grid = elementById<HTMLDivElement>('thyroid-field-grid');
  if (!grid) return;
  const builtInRows = FIELD_DEFINITIONS.map((definition) => {
    const key = definition.key;
    const unit = builtInUnit(key);
    const placeholder = builtInPlaceholder(key, unit);
    return '<tr>' +
      '<td><label for="' + inputId(key) + '" class="thyroid-marker" title="' + esc(definition.fullName) + '&#10;' + esc(definition.description) + '">' + esc(definition.label) + '</label></td>' +
      '<td><input id="' + unitInputId(key) + '" class="thyroid-unit-input" type="text" value="' + esc(unit) + '" data-unit-kind="builtin" data-unit-key="' + key + '" data-nav-field="true" title="Known units: ' + esc(unitOptions(key).join(', ')) + '. You can type any other unit." aria-label="' + esc(definition.label) + ' unit" /></td>' +
      '<td>' + rangeRow(key, definition.label, placeholder, state.draft.ranges[key]) + '</td>' +
      '<td><input id="' + inputId(key) + '" type="number" step="' + (definition.step ?? '0.01') + '" inputmode="decimal" data-value-input="true" data-nav-field="true" placeholder="Value" value="' + String(state.draft.values[key] ?? '') + '" /></td>' +
      '</tr>';
  }).join('');

  const customRows = activeCustomTests().map((definition) => {
    const entry = state.draft.custom[definition.id];
    const unit = customUnit(definition);
    const placeholder = customPlaceholder(definition, unit);
    return '<tr data-custom-row="' + esc(definition.id) + '">' +
      '<td><span class="thyroid-custom-label"><label for="' + customInputId(definition.id) + '" class="thyroid-marker">' + esc(definition.name) + '</label><button type="button" class="ghost btn-sm thyroid-archive-btn" data-custom-archive="' + esc(definition.id) + '" title="Archive this test">×</button></span></td>' +
      '<td><input id="' + unitInputId(definition.id) + '" class="thyroid-unit-input" type="text" value="' + esc(unit) + '" data-unit-kind="custom" data-unit-key="' + esc(definition.id) + '" data-nav-field="true" title="Type the unit printed on your lab report." aria-label="' + esc(definition.name) + ' unit" /></td>' +
      '<td>' + rangeRow(definition.id, definition.name, placeholder, entry?.range) + '</td>' +
      '<td><input id="' + customInputId(definition.id) + '" type="number" step="any" inputmode="decimal" data-value-input="true" data-nav-field="true" placeholder="Value" value="' + String(entry?.value ?? '') + '" /></td>' +
      '</tr>';
  }).join('');

  grid.innerHTML = '<table class="thyroid-field-table"><thead><tr><th>Test</th><th>Unit</th><th>Expected Range</th><th>Value</th></tr></thead><tbody>' + builtInRows + customRows + '</tbody></table>';

  if (focusId) {
    elementById<HTMLInputElement>(focusId)?.focus();
  }
}

export function historyCustomTests(): CustomTestDefinition[] {
  const withData = new Set<string>();
  for (const record of state.records) {
    for (const [id, measurement] of Object.entries(record.custom ?? {})) {
      if (measurement.value !== null) withData.add(id);
    }
  }
  const columns = state.customTests.filter((definition) => withData.has(definition.id));
  const known = new Set(columns.map((definition) => definition.id));
  const unknown: CustomTestDefinition[] = [];
  for (const id of withData) {
    if (known.has(id)) continue;
    const name = state.records
      .map((record) => record.custom?.[id]?.name)
      .find((value): value is string => typeof value === 'string' && value.length > 0) ?? id;
    unknown.push({ id, name, unit: '', refLow: null, refHigh: null, archived: true, createdAt: 0 });
  }
  return [...columns, ...unknown].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderHistoryHead(): void {
  const head = document.getElementById('thyroid-record-head');
  if (!head) return;
  const customColumns = historyCustomTests();
  head.innerHTML = '<tr><th>Date</th>' +
    HISTORY_KEYS.map((key) => '<th>' + esc(FIELD_BY_KEY[key].label) + '</th>').join('') +
    customColumns.map((definition) => '<th>' + esc(definition.name) + '</th>').join('') +
    '<th>Actions</th></tr>';
}

export function builtInCell(record: ThyroidBloodRecord, key: ThyroidFieldKey): string {
  const unit = record.units?.[key] ?? canonicalUnit(key);
  const override = record.ranges?.[key];
  const known = isKnownUnit(key, unit);
  const standard = standardRangeFor(key, unit);
  const range = override ?? (known ? standard : null);
  const displayUnit = override || known ? unit : canonicalUnit(key);
  const status = assessValue(record[key], range);
  const expected = override || known
    ? 'Expected ' + formatRange(override ?? standard) + ' ' + displayUnit
    : 'Expected ' + formatRange(standard) + ' ' + displayUnit + ' (unit not recognised)';
  return '<td title="' + esc(expected + statusNote(status)) + '">' + cell(record[key], unit, status) + '</td>';
}

export function customCell(record: ThyroidBloodRecord, definition: CustomTestDefinition): string {
  const measurement = record.custom?.[definition.id];
  if (!measurement) return '<td>-</td>';
  const unit = measurement.unit || definition.unit;
  const standard = definition.refLow !== null || definition.refHigh !== null
    ? { low: definition.refLow, high: definition.refHigh }
    : null;
  const comparable = measurement.range ?? (unit === definition.unit ? standard : null);
  const status = assessValue(measurement.value, comparable);
  const rangeUnit = measurement.range ? unit : definition.unit || unit;
  const title = standard || measurement.range
    ? 'Expected ' + formatRange(measurement.range ?? standard!) + ' ' + rangeUnit
    : 'No expected range';
  return '<td title="' + esc(title + statusNote(status)) + '">' + cell(measurement.value, unit, status) + '</td>';
}

export function renderRecords(): void {
  renderHistoryHead();
  const body = document.getElementById('thyroid-record-body');
  if (!body) return;
  const customColumns = historyCustomTests();
  const sorted = [...state.records].sort((a, b) => b.date.localeCompare(a.date));
  body.innerHTML = sorted.map((record) => {
    return '<tr data-record-id="' + esc(record.id) + '">' +
      '<td>' + esc(formatDateDMY(record.date)) + '</td>' +
      HISTORY_KEYS.map((key) => builtInCell(record, key)).join('') +
      customColumns.map((definition) => customCell(record, definition)).join('') +
      '<td><button type="button" class="ghost btn-sm" data-thyroid-act="edit" title="Edit record">Edit</button> ' +
      '<button type="button" class="ghost btn-sm" data-thyroid-act="delete" title="Delete record">Delete</button></td>' +
      '</tr>';
  }).join('');
  const count = document.getElementById('thyroid-record-count');
  if (count) count.textContent = state.records.length + ' record' + (state.records.length === 1 ? '' : 's');
}
