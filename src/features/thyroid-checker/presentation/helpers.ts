export function inputId(key: ThyroidFieldKey): string {
  return `thyroid-${key}-input`;
}

export function customInputId(id: string): string {
  return `thyroid-custom-${id}-input`;
}

export function unitInputId(token: string): string {
  return `thyroid-unit-${token}`;
}

export function rangeLowId(token: string): string {
  return `thyroid-range-${token}-low`;
}

export function rangeHighId(token: string): string {
  return `thyroid-range-${token}-high`;
}

/** Wires a click handler to an element by id, no-op if missing. */
export function onClick(id: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener('click', handler);
}

export function setStatus(id: string, message: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = message;
}

export function setFormStatus(message: string): void {
  setStatus('thyroid-form-status', message);
}


import type {
  CustomMeasurementMap,
  CustomTestDefinition,
  RangeMap,
  TestRange,
  ThyroidBloodRecord,
  ThyroidFieldKey,
  UnitMap,
} from '../domain/types';
import { FIELD_BY_KEY, FIELD_DEFINITIONS, FIELD_KEYS } from '../domain/field-definitions';
import { isValidRange, standardRangeFor } from '../domain/reference-ranges';
import {
  canonicalUnit,
  convertRange,
  convertValue,
  formatNumber,
  formatRange,
  isKnownUnit,
  normalizeUnit,
  trimConverted,
  unitOptions,
} from '../domain/units';
import type { CustomDraftEntry } from './state';
import { state } from './state';

export function activeCustomTests(): CustomTestDefinition[] {
  return state.customTests.filter((definition) => !definition.archived);
}

// === Unit / value helpers ===
export function builtInUnit(key: ThyroidFieldKey): string {
  return state.draft.units[key] ?? canonicalUnit(key);
}

export function customUnit(definition: CustomTestDefinition): string {
  return state.draft.custom[definition.id]?.unit ?? definition.unit;
}

export function valueText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function readValue(id: string): number | null {
  return parseOptionalNumber(elementById<HTMLInputElement>(id)?.value ?? '');
}

export function readRange(token: string): TestRange | null {
  const low = readValue(rangeLowId(token));
  const high = readValue(rangeHighId(token));
  return low === null && high === null ? null : { low, high };
}

export function builtInPlaceholder(key: ThyroidFieldKey, unit: string): { low: string; high: string; title: string } {
  const known = isKnownUnit(key, unit);
  const range = standardRangeFor(key, unit);
  const displayUnit = known ? normalizeUnit(key, unit) : canonicalUnit(key);
  return {
    low: range.low === null ? '' : formatNumber(range.low),
    high: range.high === null ? '' : formatNumber(range.high),
    title: `Standard: ${formatRange(range)} ${displayUnit}${known ? '' : ' — unit not recognised, range not converted'}`,
  };
}

export function customPlaceholder(
  definition: CustomTestDefinition,
  unit: string,
): { low: string; high: string; title: string } {
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

export function rangeRow(token: string, label: string, placeholder: { low: string; high: string; title: string }, range: TestRange | undefined): string {
  return `
    <div class="thyroid-range-inputs" title="${esc(placeholder.title)}">
      <input id="${rangeLowId(token)}" class="thyroid-range-input" type="number" step="any" inputmode="decimal"
        data-nav-field="true" value="${valueText(range?.low ?? null)}" placeholder="${placeholder.low}"
        aria-label="${esc(label)} expected minimum" />
      <span class="thyroid-range-sep">–</span>
      <input id="${rangeHighId(token)}" class="thyroid-range-input" type="number" step="any" inputmode="decimal"
        data-nav-field="true" value="${valueText(range?.high ?? null)}" placeholder="${placeholder.high}"
        aria-label="${esc(label)} expected maximum" />
    </div>
  `;
}

// === Refresh helpers ===
export function refreshBuiltInRow(key: ThyroidFieldKey): void {
  const unit = builtInUnit(key);
  const unitInput = elementById<HTMLInputElement>(unitInputId(key));
  if (unitInput) unitInput.value = unit;

  const valueInput = elementById<HTMLInputElement>(inputId(key));
  if (valueInput) valueInput.value = valueText(state.draft.values[key]);

  const placeholder = builtInPlaceholder(key, unit);
  const range = state.draft.ranges[key];
  const low = elementById<HTMLInputElement>(rangeLowId(key));
  const high = elementById<HTMLInputElement>(rangeHighId(key));
  if (low) {
    low.value = valueText(range?.low ?? null);
    low.placeholder = placeholder.low;
  }
  if (high) {
    high.value = valueText(range?.high ?? null);
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
  if (valueInput) valueInput.value = valueText(entry?.value ?? null);

  const placeholder = customPlaceholder(definition, unit);
  const range = entry?.range;
  const low = elementById<HTMLInputElement>(rangeLowId(definition.id));
  const high = elementById<HTMLInputElement>(rangeHighId(definition.id));
  if (low) {
    low.value = valueText(range?.low ?? null);
    low.placeholder = placeholder.low;
  }
  if (high) {
    high.value = valueText(range?.high ?? null);
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
    return `
      <tr>
        <td>
          <label for="${inputId(key)}" class="thyroid-marker"
            title="${esc(definition.fullName)}&#10;${esc(definition.description)}">${esc(definition.label)}</label>
        </td>
        <td>
          <input id="${unitInputId(key)}" class="thyroid-unit-input" type="text"
            value="${esc(unit)}" data-unit-kind="builtin" data-unit-key="${key}" data-nav-field="true"
            title="${esc(`Known units: ${unitOptions(key).join(', ')}. You can type any other unit.`)}"
            aria-label="${esc(definition.label)} unit" />
        </td>
        <td>${rangeRow(key, definition.label, placeholder, state.draft.ranges[key])}</td>
        <td>
          <input id="${inputId(key)}" type="number" step="${definition.step ?? '0.01'}" inputmode="decimal"
            data-value-input="true" data-nav-field="true" placeholder="Value" value="${valueText(state.draft.values[key])}" />
        </td>
      </tr>
    `;
  }).join('');

  const customRows = activeCustomTests().map((definition) => {
    const entry = state.draft.custom[definition.id];
    const unit = customUnit(definition);
    const placeholder = customPlaceholder(definition, unit);
    return `
      <tr data-custom-row="${esc(definition.id)}">
        <td>
          <span class="thyroid-custom-label">
            <label for="${customInputId(definition.id)}" class="thyroid-marker"
              title="Custom test — saved for future state.records">${esc(definition.name)}</label>
            <button type="button" class="ghost btn-sm thyroid-archive-btn"
              data-custom-archive="${esc(definition.id)}" title="Archive this test">×</button>
          </span>
        </td>
        <td>
          <input id="${unitInputId(definition.id)}" class="thyroid-unit-input" type="text"
            value="${esc(unit)}" data-unit-kind="custom" data-unit-key="${esc(definition.id)}" data-nav-field="true"
            title="Type the unit printed on your lab report."
            aria-label="${esc(definition.name)} unit" />
        </td>
        <td>${rangeRow(definition.id, definition.name, placeholder, entry?.range)}</td>
        <td>
          <input id="${customInputId(definition.id)}" type="number" step="any" inputmode="decimal"
            data-value-input="true" data-nav-field="true" placeholder="Value" value="${valueText(entry?.value ?? null)}" />
        </td>
      </tr>
    `;
  }).join('');

  grid.innerHTML = `
    <table class="thyroid-field-table">
      <thead>
        <tr>
          <th>Test</th>
          <th>Unit</th>
          <th>Expected Range</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>${builtInRows}${customRows}</tbody>
    </table>
  `;

  if (focusId) {
    elementById<HTMLInputElement>(focusId)?.focus();
  }
}

// === Form helpers ===
export function captureForm(): void {
  for (const key of FIELD_KEYS) {
    state.draft.values[key] = readValue(inputId(key));
    const range = readRange(key);
    if (range) state.draft.ranges[key] = range;
    else delete state.draft.ranges[key];
  }

  for (const definition of activeCustomTests()) {
    const value = readValue(customInputId(definition.id));
    const range = readRange(definition.id);
    const unit = customUnit(definition);
    if (value === null && !range) {
      if (unit === definition.unit) delete state.draft.custom[definition.id];
      else state.draft.custom[definition.id] = { name: definition.name, value: null, unit };
      continue;
    }
    state.draft.custom[definition.id] = {
      name: definition.name,
      value,
      unit,
      ...(range ? { range } : {}),
    };
  }
}

export function applyBuiltInUnit(key: ThyroidFieldKey, rawUnit: string): void {
  const oldUnit = builtInUnit(key);
  const newUnit = normalizeUnit(key, rawUnit.trim() || canonicalUnit(key));

  if (newUnit !== oldUnit && isKnownUnit(key, oldUnit) && isKnownUnit(key, newUnit)) {
    const value = state.draft.values[key];
    if (value !== null) {
      const converted = convertValue(key, value, oldUnit, newUnit);
      if (converted !== null) state.draft.values[key] = trimConverted(converted);
    }
    const range = state.draft.ranges[key];
    if (range) {
      const converted = convertRange(range, key, oldUnit, newUnit);
      if (converted) {
        state.draft.ranges[key] = {
          low: converted.low === null ? null : trimConverted(converted.low),
          high: converted.high === null ? null : trimConverted(converted.high),
        };
      }
    }
  }

  state.draft.units[key] = newUnit;
}

export function applyCustomUnit(definition: CustomTestDefinition, rawUnit: string): void {
  const unit = rawUnit.trim() || definition.unit;
  const entry = state.draft.custom[definition.id];
  state.draft.custom[definition.id] = entry
    ? { ...entry, unit }
    : { name: definition.name, value: null, unit };
}

export function flushUnitInputs(): void {
  captureForm();
  for (const key of FIELD_KEYS) {
    const input = elementById<HTMLInputElement>(unitInputId(key));
    if (input && input.value.trim() !== builtInUnit(key)) applyBuiltInUnit(key, input.value);
  }
  for (const definition of activeCustomTests()) {
    const input = elementById<HTMLInputElement>(unitInputId(definition.id));
    if (input && input.value.trim() !== customUnit(definition)) applyCustomUnit(definition, input.value);
  }
}

export function validateDraft(): string | null {
  for (const key of FIELD_KEYS) {
    const range = state.draft.ranges[key];
    if (range && !isValidRange(range)) {
      return `${FIELD_BY_KEY[key].label}: the expected range must have min ≤ max (blank means no limit).`;
    }
  }
  for (const definition of activeCustomTests()) {
    const range = state.draft.custom[definition.id]?.range;
    if (range && !isValidRange(range)) {
      return `${definition.name}: the expected range must have min ≤ max (blank means no limit).`;
    }
  }
  return null;
}

export function collectUnits(): UnitMap {
  const units: UnitMap = {};
  for (const key of FIELD_KEYS) {
    if (state.draft.values[key] !== null) units[key] = builtInUnit(key);
  }
  return units;
}

export function collectRanges(): RangeMap {
  const ranges: RangeMap = {};
  for (const key of FIELD_KEYS) {
    const range = state.draft.ranges[key];
    if (range) ranges[key] = range;
  }
  return ranges;
}

export function collectCustom(): CustomMeasurementMap {
  const custom: CustomMeasurementMap = {};
  for (const definition of activeCustomTests()) {
    const entry = state.draft.custom[definition.id];
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

export function preserveArchivedCustom(existing: ThyroidBloodRecord): CustomMeasurementMap {
  const preserved: CustomMeasurementMap = {};
  for (const [id, measurement] of Object.entries(existing.custom ?? {})) {
    const isActive = state.customTests.some((definition) => definition.id === id && !definition.archived);
    if (!isActive) preserved[id] = measurement;
  }
  return preserved;
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

// === Form actions ===

export function elementById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}


export function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

