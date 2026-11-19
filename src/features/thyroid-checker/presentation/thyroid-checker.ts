import { createWorker } from 'tesseract.js';
import type {
  CustomTestDefinition,
  ThyroidBloodRecord,
  ThyroidFieldKey,
} from '../domain/types';
import { FIELD_KEYS, createEmptyValues } from '../domain/field-definitions';
import { parseBloodDate, parseBloodResult } from '../domain/parse-blood-result';
import { isValidRange } from '../domain/reference-ranges';
import {
  dmyToIso,
  formatDateDMY,
  todayIso,
} from '../domain/appointments';
import { createDraft, state } from './state';
import { renderTshDashboard, wireDashboardControls } from './dashboard';
import {
  activeCustomTests,
  applyBuiltInUnit,
  applyCustomUnit,
  captureForm,
  cloneCustom,
  cloneRanges,
  collectCustom,
  collectRanges,
  collectUnits,
  customInputId,
  elementById,
  flushUnitInputs,
  onClick,
  parseOptionalNumber,
  preserveArchivedCustom,
  setFormStatus,
  setStatus,
  validateDraft,
} from './helpers';
import { renderFieldGrid, renderRecords, refreshBuiltInRow, refreshCustomRow } from './render';
import {
  refreshAppointmentCard,
  openAppointmentModal,
  closeAppointmentModal,
  saveAppointment,
  openFrequencyModal,
  closeFrequencyModal,
  saveFrequency,
  runFirstRunPromptIfNeeded,
  submitFirstRun,
} from './appointments-ui';
import { LocalThyroidRepository, normalizeThyroidRecord } from '../data/thyroid-repository';
import { LocalCustomTestRepository, normalizeCustomTestDefinition } from '../data/custom-test-repository';
import { appointmentRepository } from '../data/appointment-repository';
import { keyOf, uid } from '../../../shared/utils';

const repository = new LocalThyroidRepository();
const customTestRepository = new LocalCustomTestRepository();





// === ID helpers ===
// === Status helpers ===
function clearForm(message = ''): void {
  state.editingId = null;
  state.draft = createDraft();
  const dateInput = elementById<HTMLInputElement>('thyroid-date-input');
  if (dateInput) dateInput.value = formatDateDMY(keyOf(new Date()));
  const picker = elementById<HTMLInputElement>('thyroid-date-picker');
  if (picker) picker.value = keyOf(new Date());
  const heading = document.getElementById('thyroid-form-heading');
  if (heading) heading.textContent = 'Add blood result';
  for (const id of ['thyroid-new-test-name', 'thyroid-new-test-unit', 'thyroid-new-test-low', 'thyroid-new-test-high']) {
    const input = elementById<HTMLInputElement>(id);
    if (input) input.value = '';
  }
  setStatus('thyroid-add-test-status', '');
  renderFieldGrid();
  setFormStatus(message);
}

/** Changing the date starts a fresh entry: values, units and range overrides are cleared. */
function handleDateChange(): void {
  const dateInput = elementById<HTMLInputElement>('thyroid-date-input');
  if (state.editingId) {
    // Editing an existing record: keep all values, just allow the new date.
    const iso = dateInput?.value ? dmyToIso(dateInput.value) : null;
    setFormStatus(iso ? `Date changed to ${dateInput?.value}.` : 'Enter the date as DD/MM/YYYY.');
    return;
  }
  const iso = dateInput?.value ? dmyToIso(dateInput.value) : null;
  if (!iso) {
    setFormStatus('Enter the date as DD/MM/YYYY.');
    return;
  }
  state.editingId = null;
  state.draft = createDraft();
  const heading = document.getElementById('thyroid-form-heading');
  if (heading) heading.textContent = 'Add blood result';
  renderFieldGrid();
  setFormStatus(`Cleared the form for ${dateInput?.value}.`);
}

// === Appointments ===
function fillForm(record: ThyroidBloodRecord): void {
  state.editingId = record.id;
  const values = createEmptyValues();
  for (const key of FIELD_KEYS) values[key] = record[key];
  state.draft = {
    values,
    units: { ...(record.units ?? {}) },
    ranges: cloneRanges(record.ranges),
    custom: cloneCustom(record.custom),
  };
  for (const definition of activeCustomTests()) {
    const entry = state.draft.custom[definition.id];
    if (entry) {
      state.draft.custom[definition.id] = { ...entry, name: definition.name, unit: entry.unit || definition.unit };
    }
  }
  const dateInput = elementById<HTMLInputElement>('thyroid-date-input');
  if (dateInput) dateInput.value = formatDateDMY(record.date);
  const picker = elementById<HTMLInputElement>('thyroid-date-picker');
  if (picker) picker.value = record.date;
  const heading = document.getElementById('thyroid-form-heading');
  if (heading) heading.textContent = 'Edit blood result';
  renderFieldGrid();
  setFormStatus('');
  document.getElementById('thyroid-record-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleGridChange(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const kind = input.dataset.unitKind;
  const token = input.dataset.unitKey;
  if (!kind || !token) return;

  captureForm();
  if (kind === 'builtin') {
    const key = token as ThyroidFieldKey;
    applyBuiltInUnit(key, input.value);
    refreshBuiltInRow(key);
    return;
  }
  const definition = state.customTests.find((item) => item.id === token);
  if (!definition) return;
  applyCustomUnit(definition, input.value);
  refreshCustomRow(definition);
}

// === Grid keyboard navigation ===
function focusField(input: HTMLInputElement, selector: string, offset: number, select = false): boolean {
  const grid = document.getElementById('thyroid-field-grid');
  const fields = Array.from(grid?.querySelectorAll<HTMLInputElement>(selector) ?? []);
  const index = fields.indexOf(input);
  const next = index >= 0 ? fields[index + offset] : undefined;
  if (!next) return false;
  next.focus();
  if (select) next.select();
  return true;
}

/** In a text field, only leave it when the caret is already at the edge. */
function canLeaveTextInput(input: HTMLInputElement, direction: 'left' | 'right'): boolean {
  if (input.type !== 'text') return true;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start === null || end === null) return true;
  if (start !== end) return false;
  return direction === 'right' ? start === input.value.length : start === 0;
}

/**
 * Enter in a value field moves to the next value instead of submitting.
 * Arrow keys move across Unit → Expected min → Expected max → Value.
 */
function handleGridKeyDown(event: KeyboardEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (event.key === 'Enter' && target.dataset.valueInput) {
    event.preventDefault();
    focusField(target, 'input[data-value-input]', 1, true);
    return;
  }

  if (event.key === 'Enter' && target.dataset.unitKind) {
    event.preventDefault();
    focusField(target, 'input[data-unit-kind]', 1);
    return;
  }

  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && target.dataset.unitKind) {
    if (focusField(target, 'input[data-unit-kind]', event.key === 'ArrowDown' ? 1 : -1)) {
      event.preventDefault();
    }
    return;
  }

  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  if (!target.dataset.navField) return;

  const direction = event.key === 'ArrowRight' ? 'right' : 'left';
  if (!canLeaveTextInput(target, direction)) return;
  if (focusField(target, 'input[data-nav-field]', direction === 'right' ? 1 : -1)) {
    event.preventDefault();
  }
}

function handleGridClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest<HTMLButtonElement>('[data-custom-archive]');
  if (!button) return;
  const id = button.dataset.customArchive;
  if (id) archiveCustomTest(id);
}

// === Custom tests ===
function addCustomTest(): void {
  const nameInput = elementById<HTMLInputElement>('thyroid-new-test-name');
  const unitInput = elementById<HTMLInputElement>('thyroid-new-test-unit');
  const lowInput = elementById<HTMLInputElement>('thyroid-new-test-low');
  const highInput = elementById<HTMLInputElement>('thyroid-new-test-high');

  const name = nameInput?.value.trim() ?? '';
  const unit = unitInput?.value.trim() ?? '';
  const low = parseOptionalNumber(lowInput?.value ?? '');
  const high = parseOptionalNumber(highInput?.value ?? '');

  if (!name) {
    setStatus('thyroid-add-test-status', 'Enter a test name.');
    nameInput?.focus();
    return;
  }
  if (!unit) {
    setStatus('thyroid-add-test-status', 'Enter the unit used by your lab.');
    unitInput?.focus();
    return;
  }
  if (state.customTests.some((definition) => definition.name.toLowerCase() === name.toLowerCase())) {
    setStatus('thyroid-add-test-status', `${name} already exists. Archived tests still keep their history under that name.`);
    return;
  }
  if (!isValidRange({ low, high })) {
    setStatus('thyroid-add-test-status', 'The expected range must have min ≤ max.');
    return;
  }

  flushUnitInputs();
  const definition: CustomTestDefinition = {
    id: `custom-${uid()}`,
    name,
    unit,
    refLow: low,
    refHigh: high,
    archived: false,
    createdAt: Date.now(),
  };
  state.customTests = [...state.customTests, definition];
  customTestRepository.save(state.customTests);
  state.draft.custom[definition.id] = { name, value: null, unit };

  if (nameInput) nameInput.value = '';
  if (unitInput) unitInput.value = '';
  if (lowInput) lowInput.value = '';
  if (highInput) highInput.value = '';

  setStatus('thyroid-add-test-status', `Added ${name}. Enter its value in the table above.`);
  renderFieldGrid(customInputId(definition.id));
}

function archiveCustomTest(id: string): void {
  const definition = state.customTests.find((item) => item.id === id);
  if (!definition) return;
  if (!window.confirm(`Archive “${definition.name}”? Existing state.records keep their values.`)) return;

  flushUnitInputs();
  state.customTests = state.customTests.map((item) => (item.id === id ? { ...item, archived: true } : item));
  customTestRepository.save(state.customTests);
  delete state.draft.custom[id];
  renderFieldGrid();
  renderRecords();
  setFormStatus(`Archived ${definition.name}.`);
}

// === Submit / import ===
function submitForm(event: SubmitEvent): void {
  event.preventDefault();
  const dateInput = elementById<HTMLInputElement>('thyroid-date-input');
  const isoDate = dateInput?.value ? dmyToIso(dateInput.value) : null;
  if (!isoDate) {
    setFormStatus('Enter the test date as DD/MM/YYYY.');
    dateInput?.focus();
    return;
  }

  flushUnitInputs();
  const error = validateDraft();
  if (error) {
    setFormStatus(error);
    return;
  }

  const units = collectUnits();
  const ranges = collectRanges();
  const custom = collectCustom();
  const now = Date.now();

  if (state.editingId) {
    const existing = state.records.find((record) => record.id === state.editingId);
    if (existing) {
      Object.assign(existing, state.draft.values, {
        date: isoDate,
        units,
        ranges,
        custom: { ...custom, ...preserveArchivedCustom(existing) },
        updatedAt: now,
      });
    }
  } else {
    state.records.push({
      ...state.draft.values,
      id: uid(),
      date: isoDate,
      units,
      ranges,
      custom,
      createdAt: now,
      updatedAt: now,
    });
  }

  repository.save(state.records);
  clearForm('Result saved.');
  renderRecords();
  refreshAppointmentCard();
  renderTshDashboard();
}

async function scanFile(file: File): Promise<void> {
  const status = document.getElementById('thyroid-scan-status');
  if (status) status.textContent = 'Preparing OCR...';

  const worker = await createWorker(['eng'], 1, {
    logger: (progress) => {
      if (status && progress.status === 'recognizing text') {
        status.textContent = `Scanning: ${Math.round(progress.progress * 100)}%`;
      }
    },
  });

  try {
    const result = await worker.recognize(file);
    const text = result.data.text || '';
    const parsed = parseBloodResult(text, state.customTests);
    const date = parseBloodDate(text);

    state.draft.values = parsed.values;
    for (const key of FIELD_KEYS) {
      const unit = parsed.units[key];
      if (unit) state.draft.units[key] = unit;
    }
    for (const [id, entry] of Object.entries(parsed.custom)) {
      const definition = state.customTests.find((item) => item.id === id);
      if (!definition) continue;
      state.draft.custom[id] = {
        name: definition.name,
        value: entry.value,
        unit: entry.unit ?? definition.unit,
      };
    }

    const dateInput = elementById<HTMLInputElement>('thyroid-date-input');
    if (dateInput) dateInput.value = formatDateDMY(date);
    const picker = elementById<HTMLInputElement>('thyroid-date-picker');
    if (picker) picker.value = date;
    renderFieldGrid();

    const preview = elementById<HTMLTextAreaElement>('thyroid-ocr-preview');
    if (preview) preview.value = text;
    if (status) status.textContent = 'Scan complete. Review the values before saving.';
  } finally {
    await worker.terminate();
  }
}

function importRecords(textarea: HTMLTextAreaElement): void {
  const parsed = JSON.parse(textarea.value) as unknown;
  const payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const recordList = Array.isArray(parsed) ? parsed : payload?.records;

  if (!Array.isArray(recordList)) throw new Error('Invalid thyroid data');
  state.records = recordList
    .map(normalizeThyroidRecord)
    .filter((record): record is ThyroidBloodRecord => record !== null);

  const importedDefinitions = Array.isArray(payload?.customTests)
    ? payload.customTests
      .map(normalizeCustomTestDefinition)
      .filter((definition): definition is CustomTestDefinition => definition !== null)
    : [];

  if (importedDefinitions.length) {
    const known = new Set(state.customTests.map((definition) => definition.id));
    const added = importedDefinitions.filter((definition) => !known.has(definition.id));
    if (added.length) {
      state.customTests = [...state.customTests, ...added];
      customTestRepository.save(state.customTests);
    }
  }

  const missing: CustomTestDefinition[] = [];
  for (const record of state.records) {
    for (const [id, measurement] of Object.entries(record.custom ?? {})) {
      if (state.customTests.some((definition) => definition.id === id)) continue;
      if (missing.some((definition) => definition.id === id)) continue;
      missing.push({
        id,
        name: measurement.name,
        unit: measurement.unit,
        refLow: null,
        refHigh: null,
        archived: false,
        createdAt: Date.now(),
      });
    }
  }
  if (missing.length) {
    state.customTests = [...state.customTests, ...missing];
    customTestRepository.save(state.customTests);
    renderFieldGrid();
  }

  repository.save(state.records);
  renderRecords();
  renderTshDashboard();
  refreshAppointmentCard();
  clearForm('Import complete.');
}

// === Setup ===
export function setupThyroidChecker(): void {
  state.customTests = customTestRepository.load();
  state.records = repository.load();
  state.appointments = appointmentRepository.load();
  state.appointmentFrequency = appointmentRepository.loadFrequency();
  state.draft = createDraft();
  renderFieldGrid();
  renderRecords();
  clearForm();
  refreshAppointmentCard();
  renderTshDashboard();

  const form = document.getElementById('thyroid-record-form') as HTMLFormElement | null;
  form?.addEventListener('submit', submitForm);

  document.getElementById('thyroid-form-clear')?.addEventListener('click', () => clearForm());

  elementById<HTMLInputElement>('thyroid-date-input')?.addEventListener('change', handleDateChange);

  const pickerBtn = document.getElementById('thyroid-date-picker-btn');
  const picker = elementById<HTMLInputElement>('thyroid-date-picker');
  pickerBtn?.addEventListener('click', () => picker?.showPicker?.() ?? picker?.click());
  picker?.addEventListener('change', () => {
    const iso = picker.value;
    if (!iso) return;
    const textInput = elementById<HTMLInputElement>('thyroid-date-input');
    if (textInput) textInput.value = formatDateDMY(iso);
    textInput?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Appointment modal date picker
  const apptPickerBtn = document.getElementById('thyroid-appt-date-picker-btn');
  const apptPicker = elementById<HTMLInputElement>('thyroid-appt-date-picker');
  apptPickerBtn?.addEventListener('click', () => apptPicker?.showPicker?.() ?? apptPicker?.click());
  apptPicker?.addEventListener('change', () => {
    const iso = apptPicker.value;
    if (!iso) return;
    const textInput = elementById<HTMLInputElement>('thyroid-appt-date');
    if (textInput) textInput.value = formatDateDMY(iso);
  });

  const grid = document.getElementById('thyroid-field-grid');
  grid?.addEventListener('change', handleGridChange);
  grid?.addEventListener('click', handleGridClick);
  grid?.addEventListener('keydown', handleGridKeyDown);

  document.getElementById('thyroid-add-test-btn')?.addEventListener('click', addCustomTest);

  for (const inputIdOfAddTest of [
    'thyroid-new-test-name',
    'thyroid-new-test-unit',
    'thyroid-new-test-low',
    'thyroid-new-test-high',
  ]) {
    elementById<HTMLInputElement>(inputIdOfAddTest)?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      addCustomTest();
    });
  }

  document.getElementById('thyroid-record-body')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('[data-thyroid-act]');
    const row = target.closest<HTMLTableRowElement>('tr[data-record-id]');
    if (!button || !row) return;
    const id = row.getAttribute('data-record-id');
    if (!id) return;
    const record = state.records.find((item) => item.id === id);
    if (!record) return;

    if (button.dataset.thyroidAct === 'edit') fillForm(record);
    if (button.dataset.thyroidAct === 'delete') {
      state.records = state.records.filter((item) => item.id !== id);
      repository.save(state.records);
      if (state.editingId === id) clearForm();
      renderRecords();
      refreshAppointmentCard();
      renderTshDashboard();
    }
  });

  const fileInput = elementById<HTMLInputElement>('thyroid-scan-input');
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void scanFile(file).catch((error) => {
      setStatus('thyroid-scan-status', `Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  document.getElementById('thyroid-export')?.addEventListener('click', () => {
    const textarea = elementById<HTMLTextAreaElement>('thyroid-export-text');
    if (!textarea) return;
    textarea.value = JSON.stringify({ version: 2, records: state.records, customTests: state.customTests }, null, 2);
    textarea.hidden = false;
    textarea.focus();
    textarea.select();
  });

  document.getElementById('thyroid-import')?.addEventListener('click', () => {
    const textarea = elementById<HTMLTextAreaElement>('thyroid-export-text');
    if (!textarea?.value) return;
    try {
      importRecords(textarea);
    } catch (error) {
      setStatus('thyroid-scan-status', `Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Appointment events
  onClick('thyroid-appt-add-btn', () => {
    const existing = state.appointments.find((a) => !a.completed && a.date >= todayIso());
    openAppointmentModal(existing?.date);
  });
  onClick('thyroid-appt-edit-freq-btn', openFrequencyModal);
  onClick('thyroid-appt-save-btn', saveAppointment);
  onClick('thyroid-appt-cancel-btn', closeAppointmentModal);
  onClick('thyroid-appt-cancel-btn2', closeAppointmentModal);
  onClick('thyroid-freq-save-btn', saveFrequency);
  onClick('thyroid-freq-cancel-btn', closeFrequencyModal);
  onClick('thyroid-freq-cancel-btn2', closeFrequencyModal);
  onClick('thyroid-first-run-continue', submitFirstRun);

  // Banner dismiss
  onClick('thyroid-appt-banner-dismiss', () => {
    const banner = document.getElementById('thyroid-appt-banner');
    if (banner) banner.hidden = true;
  });

  // First-run prompt after a short delay so the view is ready
  setTimeout(runFirstRunPromptIfNeeded, 400);
  wireDashboardControls();
}
