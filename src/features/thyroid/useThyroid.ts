/**
 * Thyroid ViewModel.
 *
 * The refs below are module-level singletons so unsaved drafts and UI state
 * survive component unmounts. Commands are the only way to mutate state; every
 * persistent mutation funnels through `persist()`.
 */
import { computed, reactive, ref } from 'vue';
import { createWorker } from 'tesseract.js';
import { uid } from '../../shared/utils';
import {
  loadThyroid,
  normalizeAppointment,
  normalizeCustomTestDefinition,
  normalizeThyroidRecord,
  saveThyroid,
  type ThyroidData,
} from './api';
import {
  FIELD_DEFINITIONS,
  FIELD_KEYS,
  activeCustomTests as selectActiveCustomTests,
  applyBuiltInUnit,
  applyCustomUnit,
  buildAppointmentCard,
  buildDashboard,
  buildHistory,
  builtInPlaceholder,
  builtInUnit,
  cloneCustom,
  cloneRanges,
  collectCustom,
  collectRanges,
  collectUnits,
  createDraft,
  createEmptyValues,
  customPlaceholder,
  customUnit,
  dmyToIso,
  formatAppointmentDate,
  formatDateDMY,
  formatNumber,
  isValidRange,
  parseBloodDate,
  parseBloodResult,
  parseOptionalNumber,
  preserveArchivedCustom,
  setBuiltInRange as applyBuiltInRange,
  setCustomRange as applyCustomRange,
  setCustomValue as applyCustomValue,
  suggestedAppointmentDate,
  todayIso,
  unitOptions,
  validateDraft,
  type CustomTestDefinition,
  type DashboardRange,
  type Draft,
  type OverlayKey,
  type ThyroidAppointment,
  type ThyroidBloodRecord,
  type ThyroidFieldKey,
} from './model';

// --- module-level reactive state -------------------------------------------

const records = ref<ThyroidBloodRecord[]>([]);
const customTests = ref<CustomTestDefinition[]>([]);
const appointments = ref<ThyroidAppointment[]>([]);
const appointmentFrequency = ref<number | null>(null);
const firstRunDone = ref(false);

const draft = ref<Draft>(createDraft());
const editingId = ref<string | null>(null);
const formDateIso = ref(todayIso());
const formDateText = ref(formatDateDMY(todayIso()));
const formStatus = ref('');
const addTestStatus = ref('');
const scanStatus = ref('');
const ocrText = ref('');
const editRequestId = ref(0);

const dashboardRange = ref<DashboardRange>('all');
const overlays = ref<OverlayKey[]>([]);

const bannerOverride = ref<string | null>(null);
const bannerDismissed = ref(false);

const dialogs = reactive({ appointment: false, frequency: false, firstRun: false });
const appointmentForm = reactive({ date: '', time: '', note: '' });
const frequencyInput = ref(2);
const firstRunFrequency = ref(2);
const firstRunHasAppointment = ref(false);

let initialized = false;

// --- computed getters -------------------------------------------------------

const formHeading = computed(() => editingId.value ? 'Edit blood result' : 'Add blood result');

const activeCustomTests = computed(() => selectActiveCustomTests(customTests.value));

const appointmentCard = computed(() => buildAppointmentCard(
  records.value,
  appointments.value,
  appointmentFrequency.value,
  bannerDismissed.value ? null : bannerOverride.value,
));

const dashboard = computed(() => buildDashboard(records.value, dashboardRange.value, overlays.value));

const history = computed(() => buildHistory(records.value, customTests.value));

// --- persistence ------------------------------------------------------------

function snapshot(): ThyroidData {
  return {
    records: records.value,
    customTests: customTests.value,
    appointments: appointments.value,
    appointmentFrequency: appointmentFrequency.value,
    firstRunDone: firstRunDone.value,
  };
}

function persist(): void {
  void saveThyroid(snapshot());
}

// --- commands ---------------------------------------------------------------

async function init(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const data = await loadThyroid();
  records.value = data.records;
  customTests.value = data.customTests;
  appointments.value = data.appointments;
  appointmentFrequency.value = data.appointmentFrequency;
  firstRunDone.value = data.firstRunDone;

  if (!data.firstRunDone && data.appointmentFrequency !== null) {
    firstRunDone.value = true;
    persist();
  } else if (!data.firstRunDone && data.appointmentFrequency === null) {
    dialogs.firstRun = true;
  }
}

/** Called by the date text field; converts DD/MM/YYYY to an ISO date. */
function setDateText(text: string): void {
  const iso = dmyToIso(text);
  if (!iso) {
    formDateIso.value = '';
    formDateText.value = text;
    formStatus.value = 'Enter the date as DD/MM/YYYY.';
    return;
  }
  setDate(iso);
}

/** Changing the date starts a fresh entry unless an existing record is being edited. */
function setDate(iso: string): void {
  formDateIso.value = iso;
  formDateText.value = iso ? formatDateDMY(iso) : '';
  if (!iso) {
    formStatus.value = 'Enter the date as DD/MM/YYYY.';
    return;
  }
  if (editingId.value) {
    formStatus.value = `Date changed to ${formDateText.value}.`;
    return;
  }
  draft.value = createDraft();
  formStatus.value = `Cleared the form for ${formDateText.value}.`;
}

function setBuiltInValue(key: ThyroidFieldKey, value: number | null): void {
  draft.value.values[key] = value;
}

function setBuiltInUnit(key: ThyroidFieldKey, rawUnit: string): void {
  applyBuiltInUnit(draft.value, key, rawUnit);
}

function setBuiltInRange(key: ThyroidFieldKey, low: number | null, high: number | null): void {
  applyBuiltInRange(draft.value, key, low, high);
}

function setCustomValue(id: string, value: number | null): void {
  const definition = customTests.value.find((item) => item.id === id);
  if (!definition) return;
  applyCustomValue(draft.value, definition, value);
}

function setCustomUnit(id: string, rawUnit: string): void {
  const definition = customTests.value.find((item) => item.id === id);
  if (!definition) return;
  applyCustomUnit(draft.value, definition, rawUnit);
}

function setCustomRange(id: string, low: number | null, high: number | null): void {
  const definition = customTests.value.find((item) => item.id === id);
  if (!definition) return;
  applyCustomRange(draft.value, definition, low, high);
}

function addCustomTest(input: { name: string; unit: string; low: number | null; high: number | null }): void {
  const name = input.name.trim();
  const unit = input.unit.trim();
  const low = input.low;
  const high = input.high;

  if (!name) {
    addTestStatus.value = 'Enter a test name.';
    return;
  }
  if (!unit) {
    addTestStatus.value = 'Enter the unit used by your lab.';
    return;
  }
  if (customTests.value.some((definition) => definition.name.toLowerCase() === name.toLowerCase())) {
    addTestStatus.value = `${name} already exists. Archived tests still keep their history under that name.`;
    return;
  }
  if (!isValidRange({ low, high })) {
    addTestStatus.value = 'The expected range must have min ≤ max.';
    return;
  }

  const definition: CustomTestDefinition = {
    id: `custom-${uid()}`,
    name,
    unit,
    refLow: low,
    refHigh: high,
    archived: false,
    createdAt: Date.now(),
  };
  customTests.value = [...customTests.value, definition];
  draft.value.custom[definition.id] = { name, value: null, unit };
  persist();
  addTestStatus.value = `Added ${name}. Enter its value in the table above.`;
}

function archiveCustomTest(id: string): void {
  const definition = customTests.value.find((item) => item.id === id);
  if (!definition) return;
  customTests.value = customTests.value.map((item) => (item.id === id ? { ...item, archived: true } : item));
  delete draft.value.custom[id];
  persist();
  formStatus.value = `Archived ${definition.name}.`;
}

function submitForm(): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(formDateIso.value)) {
    formStatus.value = 'Enter the test date as DD/MM/YYYY.';
    return;
  }
  const error = validateDraft(draft.value, customTests.value);
  if (error) {
    formStatus.value = error;
    return;
  }

  const units = collectUnits(draft.value);
  const ranges = collectRanges(draft.value);
  const custom = collectCustom(draft.value, customTests.value);
  const now = Date.now();
  const isoDate = formDateIso.value;

  if (editingId.value) {
    const existing = records.value.find((record) => record.id === editingId.value);
    if (existing) {
      Object.assign(existing, draft.value.values, {
        date: isoDate,
        units,
        ranges,
        custom: { ...custom, ...preserveArchivedCustom(existing, customTests.value) },
        updatedAt: now,
      });
    }
  } else {
    records.value.push({
      ...draft.value.values,
      id: uid(),
      date: isoDate,
      units,
      ranges,
      custom,
      createdAt: now,
      updatedAt: now,
    });
  }

  persist();
  clearForm('Result saved.');
}

function clearForm(message = ''): void {
  editingId.value = null;
  draft.value = createDraft();
  formDateIso.value = todayIso();
  formDateText.value = formatDateDMY(formDateIso.value);
  formStatus.value = message;
  addTestStatus.value = '';
}

function fillForm(record: ThyroidBloodRecord): void {
  editingId.value = record.id;
  const values = createEmptyValues();
  for (const key of FIELD_KEYS) values[key] = record[key];
  draft.value = {
    values,
    units: { ...(record.units ?? {}) },
    ranges: cloneRanges(record.ranges),
    custom: cloneCustom(record.custom),
  };
  for (const definition of activeCustomTests.value) {
    const entry = draft.value.custom[definition.id];
    if (entry) {
      draft.value.custom[definition.id] = {
        ...entry,
        name: definition.name,
        unit: entry.unit || definition.unit,
      };
    }
  }
  formDateIso.value = record.date;
  formDateText.value = formatDateDMY(record.date);
  formStatus.value = '';
  editRequestId.value += 1;
}

function deleteRecord(id: string): void {
  records.value = records.value.filter((record) => record.id !== id);
  if (editingId.value === id) clearForm();
  persist();
}

async function scanFile(file: File): Promise<void> {
  scanStatus.value = 'Preparing OCR...';
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker(['eng'], 1, {
      logger: (progress) => {
        if (progress.status === 'recognizing text') {
          scanStatus.value = `Scanning: ${Math.round(progress.progress * 100)}%`;
        }
      },
    });
    const result = await worker.recognize(file);
    const text = result.data.text || '';
    const parsed = parseBloodResult(text, customTests.value);
    const date = parseBloodDate(text);

    draft.value.values = parsed.values;
    for (const key of FIELD_KEYS) {
      const unit = parsed.units[key];
      if (unit) draft.value.units[key] = unit;
    }
    for (const [id, entry] of Object.entries(parsed.custom)) {
      const definition = customTests.value.find((item) => item.id === id);
      if (!definition) continue;
      draft.value.custom[id] = {
        name: definition.name,
        value: entry.value,
        unit: entry.unit ?? definition.unit,
      };
    }

    formDateIso.value = date;
    formDateText.value = formatDateDMY(date);
    ocrText.value = text;
    scanStatus.value = 'Scan complete. Review the values before saving.';
  } catch (error) {
    scanStatus.value = `Scan failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (worker) await worker.terminate();
  }
}

function exportJson(): string {
  return JSON.stringify({ version: 2, ...snapshot() }, null, 2);
}

function importJson(text: string): void {
  const parsed: unknown = JSON.parse(text);
  const payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const recordList = Array.isArray(parsed) ? parsed : payload?.records;
  if (!Array.isArray(recordList)) throw new Error('Invalid thyroid data');

  records.value = recordList
    .map(normalizeThyroidRecord)
    .filter((record): record is ThyroidBloodRecord => record !== null);

  const importedDefinitions = Array.isArray(payload?.customTests)
    ? payload.customTests
      .map(normalizeCustomTestDefinition)
      .filter((definition): definition is CustomTestDefinition => definition !== null)
    : [];

  if (importedDefinitions.length) {
    const known = new Set(customTests.value.map((definition) => definition.id));
    const added = importedDefinitions.filter((definition) => !known.has(definition.id));
    if (added.length) customTests.value = [...customTests.value, ...added];
  }

  const missing: CustomTestDefinition[] = [];
  for (const record of records.value) {
    for (const [id, measurement] of Object.entries(record.custom ?? {})) {
      if (customTests.value.some((definition) => definition.id === id)) continue;
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
  if (missing.length) customTests.value = [...customTests.value, ...missing];

  if (payload && Array.isArray(payload.appointments)) {
    appointments.value = payload.appointments
      .map(normalizeAppointment)
      .filter((appointment): appointment is ThyroidAppointment => appointment !== null);
  }
  if (payload && payload.appointmentFrequency !== undefined) {
    const value = Number(payload.appointmentFrequency);
    appointmentFrequency.value = Number.isFinite(value) && value > 0 ? value : null;
  }
  if (payload && payload.firstRunDone !== undefined) {
    firstRunDone.value = payload.firstRunDone === true || payload.firstRunDone === 1 || payload.firstRunDone === '1';
  }

  persist();
  clearForm('Import complete.');
  scanStatus.value = 'Import complete.';
}

function openAppointmentDialog(prefillDate?: string): void {
  const suggested = suggestedAppointmentDate(records.value, appointmentFrequency.value ?? 2);
  appointmentForm.date = prefillDate
    ?? appointments.value.find((item) => !item.completed && item.date >= todayIso())?.date
    ?? suggested;
  appointmentForm.time = '';
  appointmentForm.note = '';
  dialogs.appointment = true;
}

function closeAppointmentDialog(): void {
  dialogs.appointment = false;
}

function setAppointmentDateText(text: string): void {
  appointmentForm.date = dmyToIso(text) ?? '';
}

function saveAppointment(input: { date: string; time?: string; note?: string }): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return;
  const appointment: ThyroidAppointment = {
    id: uid(),
    date: input.date,
    time: input.time?.trim() || undefined,
    note: input.note?.trim() || undefined,
    createdAt: Date.now(),
  };
  // Replace any existing upcoming appointment instead of duplicating.
  appointments.value = appointments.value
    .filter((item) => item.completed || item.date < todayIso())
    .concat(appointment);
  persist();
  closeAppointmentDialog();
  formStatus.value = `Appointment saved for ${formatAppointmentDate(input.date)}.`;
}

function openFrequencyDialog(): void {
  frequencyInput.value = appointmentFrequency.value ?? 2;
  dialogs.frequency = true;
}

function closeFrequencyDialog(): void {
  dialogs.frequency = false;
}

function setFrequency(value: number): void {
  if (!Number.isFinite(value) || value <= 0) return;
  appointmentFrequency.value = value;
  persist();
  closeFrequencyDialog();
}

function completeFirstRun(frequency: number, hasAppointment: boolean): void {
  const value = Number.isFinite(frequency) && frequency > 0 ? frequency : 2;
  appointmentFrequency.value = value;
  firstRunDone.value = true;
  persist();
  dialogs.firstRun = false;
  bannerDismissed.value = false;

  const suggested = suggestedAppointmentDate(records.value, value);
  if (hasAppointment) {
    openAppointmentDialog(suggested);
  } else {
    bannerOverride.value = `Please book a blood control appointment around ${formatAppointmentDate(suggested)}.`;
  }
}

function dismissBanner(): void {
  bannerDismissed.value = true;
}

function setDashboardRange(range: DashboardRange): void {
  dashboardRange.value = range;
}

function toggleOverlay(key: OverlayKey): void {
  overlays.value = overlays.value.includes(key)
    ? overlays.value.filter((item) => item !== key)
    : [...overlays.value, key];
}

export function useThyroid() {
  return {
    // reactive state
    records,
    customTests,
    appointments,
    appointmentFrequency,
    firstRunDone,
    draft,
    editingId,
    formDateIso,
    formDateText,
    formStatus,
    addTestStatus,
    scanStatus,
    ocrText,
    editRequestId,
    dashboardRange,
    overlays,
    dialogs,
    appointmentForm,
    frequencyInput,
    firstRunFrequency,
    firstRunHasAppointment,

    // computed getters
    formHeading,
    activeCustomTests,
    appointmentCard,
    dashboard,
    history,

    // pure helpers exposed for templates
    fields: FIELD_DEFINITIONS,
    formatDate: formatDateDMY,
    formatNumber,
    parseNumber: parseOptionalNumber,
    unitOptions,
    builtInUnit: (key: ThyroidFieldKey) => builtInUnit(draft.value, key),
    customUnit: (definition: CustomTestDefinition) => customUnit(draft.value, definition),
    builtInPlaceholder,
    customPlaceholder,

    // commands
    init,
    setDate,
    setDateText,
    setBuiltInValue,
    setBuiltInUnit,
    setBuiltInRange,
    setCustomValue,
    setCustomUnit,
    setCustomRange,
    addCustomTest,
    archiveCustomTest,
    submitForm,
    clearForm,
    fillForm,
    deleteRecord,
    scanFile,
    exportJson,
    importJson,
    saveAppointment,
    setFrequency,
    completeFirstRun,
    setDashboardRange,
    toggleOverlay,
    openAppointmentDialog,
    closeAppointmentDialog,
    setAppointmentDateText,
    openFrequencyDialog,
    closeFrequencyDialog,
    dismissBanner,
  };
}
