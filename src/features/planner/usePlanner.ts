/**
 * Planner ViewModel.
 *
 * Owns reactive state and all commands. Module-level refs make it a singleton
 * shared by every component that calls `usePlanner()`. Components stay passive.
 */
import { computed, ref } from 'vue';
import {
  CALENDAR_MODE_KEY,
  EN_NAMES,
  buildEnergyCalendar,
  buildEnergyWeek,
  buildHabitItems,
  createTask,
  cycleTaskUrgency,
  DEFAULT_HABITS,
  editTask,
  fitsEnergy,
  isCheckInLocked,
  isTodayTask,
  matchesDumpFilter,
  moveTaskToToday,
  normalizeCalendarMode,
  normalizeState,
  orderNow,
  planFresh,
  removeTask,
  seedState,
  summarizeEnergyMonth,
  tasksForEnergy,
  toggleTaskDone,
  todaySlots,
  type AppState,
  type CalendarMode,
  type DailyCheckIn,
  type DumpFilter,
  type EnergyLevel,
  type Habit,
  type Task,
} from './model';
import { recommendedAiReason } from './checkin';
import { requestCheckInSuggestion } from './checkinAi';
import { describeAiConfig, unknownAiConfig, type AiConfigView } from './aiConfigStatus';
import { loadPlanner, requestAiPrioritization, savePlanner } from './api';
import { isTauri, localLoad, localSave } from '../../shared/platform';
import { useAiStatus } from '../../shared/ai/useAiStatus';
import { keyOf } from '../../shared/utils';
import { requestConfirm } from '../../shared/ui/useConfirm';
import { removeHabitConfirm } from '../../shared/ui/confirmCopy';
import { getAiStatus } from '../../shared/ai/aiStatus';
import {
  buildPrompt,
  estimateHeuristic,
  parseEstimates,
  rankTasks,
  type Energy,
  type PrioritizeResult,
  type TaskInput,
} from './prioritize';

/* -------------------------------------------------------------------------- */
/* Shared reactive state                                                      */
/* -------------------------------------------------------------------------- */

const state = ref<AppState>(seedState());
const initialised = ref(false);

const dumpFilter = ref<DumpFilter>('all');
const ai = useAiStatus();
const aiConfig = ref<AiConfigView>(unknownAiConfig());
const aiStatus = ref('');
const backupStatus = ref('');
const backupText = ref('');
const taskAddOpen = ref(false);
const habitAddOpen = ref(false);
const taskDialogOpen = ref(false);

interface CheckInForm {
  symptoms: string;
  level: EnergyLevel;
  suggestion: DailyCheckIn['suggested'];
  suggestionReason: string;
  suggestionSource: 'ai' | 'heuristic' | null;
  status: string;
  loading: boolean;
  editing: boolean;
}
const checkInForm = ref<CheckInForm>({
  symptoms: '',
  level: 2,
  suggestion: null,
  suggestionReason: '',
  suggestionSource: null,
  status: '',
  loading: false,
  editing: false,
});

const now = new Date();
const todayKey = ref(keyOf(now));
const calendarCursor = ref({ year: now.getFullYear(), month: now.getMonth() });
const calendarMode = ref<CalendarMode>(normalizeCalendarMode(localLoad<unknown>(CALENDAR_MODE_KEY)));
const weekOffset = ref(0);

const taskForm = ref({ title: '', due: '', minutes: undefined as number | undefined });
const taskDueStatus = ref('No due date');
let editingTaskId: string | null = null;
let shownDay = keyOf(new Date());

/* -------------------------------------------------------------------------- */
/* Derived data                                                               */
/* -------------------------------------------------------------------------- */

const energy = computed(() => state.value.energy);
const habitView = computed(() => buildHabitItems(state.value.habits, state.value.log, new Date(), state.value.energy));
const checkIn = computed(() => state.value.checkIns[todayKey.value] ?? null);
const checkInLocked = computed(() => isCheckInLocked(state.value, todayKey.value) && !checkInForm.value.editing);

const todayDate = computed(() => {
  const [year, month, day] = todayKey.value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
});
const energyCalendar = computed(() => buildEnergyCalendar(
  calendarCursor.value.year,
  calendarCursor.value.month,
  state.value.energyHistory,
  todayDate.value,
));
const energyWeek = computed(() => buildEnergyWeek(
  state.value.energyHistory,
  todayDate.value,
  weekOffset.value,
));
const energySummary = computed(() => summarizeEnergyMonth(energyCalendar.value));
const canGoForwardWeek = computed(() => weekOffset.value < 0);
const canGoForward = computed(() => {
  const cursor = calendarCursor.value;
  const today = todayDate.value;
  return cursor.year < today.getFullYear()
    || (cursor.year === today.getFullYear() && cursor.month < today.getMonth());
});

const openTasks = computed(() => state.value.tasks.filter((task) => !task.done));
const todayTasks = computed(() => openTasks.value.filter(isTodayTask));
const visibleTodayTasks = computed(() => tasksForEnergy(todayTasks.value, state.value.energy));
const deferredTaskCount = computed(() => todayTasks.value.length - visibleTodayTasks.value.length);
const movedToDumps = computed(() => state.value.tasks.filter((task) => task.movedFromToday && !task.done));
const movedToDumpsNote = computed(() => {
  const count = movedToDumps.value.length;
  if (!count) return '';
  const single = count === 1;
  const names = movedToDumps.value.map((task) => task.title).join(', ');
  return `${single ? 'This task was' : 'These tasks were'} moved here because ${single ? 'it needs' : 'they need'} more energy than today's level: ${names}. Use Move to Today to bring ${single ? 'it' : 'them'} back.`;
});
const nowTasks = computed(() => orderNow(
  [...visibleTodayTasks.value],
  state.value.plan,
  state.value.energy,
  new Date(),
));
const dumps = computed(() => {
  const todayIds = new Set(todayTasks.value.map((task) => task.id));
  return openTasks.value.filter((task) => !todayIds.has(task.id));
});
const filteredDumps = computed(() => dumps.value.filter((task) => matchesDumpFilter(task, dumpFilter.value)));
const doneTasks = computed(() => state.value.tasks.filter((task) => task.done));
const hasExamples = computed(() => state.value.tasks.some((task) => task.ex));

const planNote = computed(() => {
  let note = '';
  if (planFresh(state.value.plan, state.value.energy, new Date())) {
    note = `Order optimized for ${EN_NAMES[state.value.energy].toLowerCase()} energy.`;
  }
  const pending = openTasks.value.filter((task) => !task.est).length;
  if (pending) {
    note += `${note ? ' ' : ''}${pending} task${pending === 1 ? ' has' : 's have'} not been estimated yet.`;
  }
  return note;
});

const energyHint = computed(() => {
  const count = nowTasks.value.length;
  const word = count === 1 ? 'task' : 'tasks';
  const parked = deferredTaskCount.value
    ? ` ${deferredTaskCount.value} high-focus task${deferredTaskCount.value === 1 ? '' : 's'} parked for a higher-energy day.`
    : '';
  if (state.value.energy === 1) return `Low: ${count} light ${word} queued.${parked}`;
  if (state.value.energy === 2) return `Medium: ${count} steady ${word} queued.${parked}`;
  return `High: ${count} ${word} queued — tackle the hardest first.${parked}`;
});

const nowMeta = computed(() => {
  const count = nowTasks.value.length;
  const word = count === 1 ? 'task' : 'tasks';
  const minutes = nowTasks.value.reduce((total, task) => total + (task.min || 0), 0);
  return `${count} ${word}${minutes ? ' · about ' + minutes + ' min' : ''}`;
});

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/** Keeps the AI Prioritize chip in sync with the key-free credentials status. */
async function refreshAiConfig(): Promise<AiConfigView> {
  if (!isTauri()) {
    aiConfig.value = describeAiConfig(null, false);
    return aiConfig.value;
  }
  try {
    aiConfig.value = describeAiConfig(await getAiStatus(), true);
  } catch {
    aiConfig.value = unknownAiConfig();
  }
  return aiConfig.value;
}

async function init(): Promise<void> {
  if (initialised.value) return;
  state.value = await loadPlanner();
  // Saved tasks can carry an old energy estimate. Park mismatches on load so
  // they appear in Dumps instead of vanishing from both lists.
  if (parkEnergyMismatchedTasks().length) persist();
  syncCheckInForm();
  await refreshAiConfig();
  initialised.value = true;
}

function persist(): void {
  void savePlanner(state.value);
}

/**
 * Moves Today tasks whose saved estimate does not fit the current energy back
 * to Dumps. Called on load, day rollover, check-in and prioritization so no
 * saved task is ever hidden by an energy filter.
 */
function parkEnergyMismatchedTasks(): Task[] {
  const moved: Task[] = [];
  state.value.tasks.forEach((task) => {
    if (task.done || !isTodayTask(task) || fitsEnergy(task.fit, state.value.energy)) return;
    // "Not Today" means out of the Today selector: not urgent and not dated.
    task.imp = 3;
    task.due = '';
    task.movedFromToday = true;
    moved.push(task);
  });
  return moved;
}

/* -------------------------------------------------------------------------- */
/* Daily check-in / energy                                                    */
/* -------------------------------------------------------------------------- */

function syncCheckInForm(): void {
  const saved = state.value.checkIns[todayKey.value];
  checkInForm.value = {
    symptoms: saved?.symptoms ?? '',
    level: saved?.level ?? state.value.energy,
    suggestion: saved?.suggested ?? null,
    suggestionReason: saved?.aiReason ?? '',
    suggestionSource: saved?.aiReason ? 'ai' : null,
    status: '',
    loading: false,
    editing: false,
  };
}

async function suggestCheckInEnergy(): Promise<void> {
  const symptoms = checkInForm.value.symptoms.trim();
  if (!symptoms) {
    checkInForm.value.status = 'Describe your symptoms first, then ask for a suggestion.';
    return;
  }

  checkInForm.value.loading = true;
  checkInForm.value.status = 'Asking AI...';
  try {
    const result = await requestCheckInSuggestion(symptoms);
    checkInForm.value.suggestion = result.suggestion.level;
    checkInForm.value.suggestionReason = result.suggestion.reason;
    checkInForm.value.suggestionSource = result.suggestion.source;
    checkInForm.value.status = result.status;
  } finally {
    checkInForm.value.loading = false;
  }
}

function acceptCheckInSuggestion(): void {
  const level = checkInForm.value.suggestion;
  if (level === null) return;
  checkInForm.value.level = level;
  checkInForm.value.status = `Using ${EN_NAMES[level]}. You can still change it before saving.`;
}

function saveCheckIn(): void {
  if (checkInLocked.value) return;
  const symptoms = checkInForm.value.symptoms.trim();
  if (!symptoms) {
    checkInForm.value.status = 'Add a short symptom note before saving.';
    return;
  }

  const key = todayKey.value;
  const level = checkInForm.value.level;
  state.value.energy = level;
  state.value.energyDay = key;
  state.value.energyHistory[key] = level;
  const acceptedAi = checkInForm.value.suggestionSource === 'ai'
    && checkInForm.value.suggestion === level;
  state.value.checkIns[key] = {
    symptoms,
    level,
    suggested: checkInForm.value.suggestion,
    aiReason: acceptedAi
      ? (checkInForm.value.suggestionReason.trim() || recommendedAiReason(level))
      : null,
    source: acceptedAi ? 'ai' : 'manual',
    at: Date.now(),
  };
  parkEnergyMismatchedTasks();
  persist();
  syncCheckInForm();
  checkInForm.value.status = 'Saved. Today is locked — use Edit check-in to change it.';
}

function editCheckIn(): void {
  const saved = state.value.checkIns[todayKey.value];
  if (!saved) return;
  checkInForm.value.editing = true;
  checkInForm.value.symptoms = saved.symptoms;
  checkInForm.value.level = saved.level;
  checkInForm.value.suggestion = saved.suggested;
  checkInForm.value.suggestionReason = saved.aiReason ?? '';
  checkInForm.value.suggestionSource = saved.aiReason ? 'ai' : null;
  checkInForm.value.status = 'Editing today’s check-in.';
}

function cancelCheckInEdit(): void {
  syncCheckInForm();
}

function shiftEnergyCalendar(delta: number): void {
  if (delta > 0 && !canGoForward.value) return;
  const date = new Date(calendarCursor.value.year, calendarCursor.value.month + delta, 1, 12);
  calendarCursor.value = { year: date.getFullYear(), month: date.getMonth() };
}

function goToCurrentEnergyMonth(): void {
  const today = todayDate.value;
  calendarCursor.value = { year: today.getFullYear(), month: today.getMonth() };
}

function shiftEnergyWeek(delta: number): void {
  if (delta > 0 && !canGoForwardWeek.value) return;
  weekOffset.value += delta;
}

function goToCurrentEnergyWeek(): void {
  weekOffset.value = 0;
}

function setCalendarMode(mode: CalendarMode): void {
  if (mode === 'week') {
    goToCurrentEnergyMonth();
    goToCurrentEnergyWeek();
  }
  calendarMode.value = mode;
  localSave(CALENDAR_MODE_KEY, mode);
}

function toggleHabit(habitId: string): void {
  const key = keyOf(new Date());
  const dayLog = (state.value.log[key] ||= {});
  dayLog[habitId] = !dayLog[habitId];
  persist();
}

async function removeHabit(habitId: string): Promise<void> {
  const habit = state.value.habits.find((item) => item.id === habitId);
  if (!habit) return;
  if (!await requestConfirm(removeHabitConfirm(habit.name))) return;

  state.value.habits = state.value.habits.filter((item) => item.id !== habitId);
  for (const dayLog of Object.values(state.value.log)) {
    delete dayLog[habitId];
    // The mail routine logs one entry per slot plus a daily summary.
    if (habit.slots) {
      delete dayLog.mail;
      for (const key of Object.keys(dayLog)) {
        if (key.startsWith('mail_')) delete dayLog[key];
      }
    }
  }
  persist();
}

function toggleSlot(slotId: string): void {
  const today = new Date();
  const key = keyOf(today);
  const dayLog = (state.value.log[key] ||= {});
  const id = 'mail_' + slotId;
  dayLog[id] = !dayLog[id];
  dayLog.mail = todaySlots(today).every((slot) => dayLog['mail_' + slot.id]);
  persist();
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

function taskAction(taskId: string, action: 'done' | 'imp' | 'today' | 'details' | 'del'): void {
  const task = state.value.tasks.find((item) => item.id === taskId);
  if (!task) return;

  if (action === 'done') toggleTaskDone(task);
  else if (action === 'imp') cycleTaskUrgency(task);
  else if (action === 'today') moveTaskToToday(task);
  else if (action === 'details') {
    openTaskDetails(task);
    return;
  } else if (action === 'del') removeTask(state.value.tasks, taskId);

  persist();
}

function addTask(title: string, due = '', minutes = 0): void {
  const trimmed = title.trim();
  if (!trimmed) return;
  state.value.tasks.push(createTask(trimmed, due, minutes));
  persist();
}

function addBulkTasks(lines: string): void {
  lines
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => state.value.tasks.push(createTask(line.slice(0, 140))));
  persist();
}

const DEFAULT_HABIT_TEXT: Record<EnergyLevel, string> = {
  1: 'Light version – keep it short and low-effort.',
  2: 'Standard version – steady, comfortable effort.',
  3: 'Deep version – give this your full focus.',
};

function addHabit(name: string, details: Record<EnergyLevel, { min: number; txt: string }>): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const by: Habit['by'] = {};
  for (const level of [1, 2, 3] as EnergyLevel[]) {
    const detail = details[level];
    by[level] = {
      min: Math.max(1, Math.min(360, detail?.min || 15)),
      txt: detail?.txt?.trim() || DEFAULT_HABIT_TEXT[level],
    };
  }
  const habit: Habit = {
    id: 'h' + Date.now().toString(36),
    name: trimmed,
    by,
  };
  state.value.habits.push(habit);
  persist();
}

function setDumpFilter(filter: DumpFilter): void {
  dumpFilter.value = filter;
}

function clearExamples(): void {
  state.value.tasks = state.value.tasks.filter((task) => !task.ex);
  persist();
}

function clearDone(): void {
  state.value.tasks = state.value.tasks.filter((task) => !task.done);
  persist();
}

/* -------------------------------------------------------------------------- */
/* Task details dialog                                                        */
/* -------------------------------------------------------------------------- */

function openTaskDetails(task: Task): void {
  editingTaskId = task.id;
  taskForm.value = {
    title: task.title,
    due: task.due || '',
    minutes: task.est && task.min ? task.min : undefined,
  };
  taskDueStatus.value = task.due ? 'Due date set' : 'No due date';
  taskDialogOpen.value = true;
}

function closeTaskDetails(): void {
  editingTaskId = null;
  taskDialogOpen.value = false;
}

function setTaskDue(value: string): void {
  taskForm.value.due = value;
  taskDueStatus.value = value ? 'Due date set' : 'No due date';
}

function applyDuePreset(preset: 'today' | 'tomorrow' | 'week' | 'none'): void {
  if (preset === 'none') {
    taskForm.value.due = '';
    taskDueStatus.value = 'No due date';
    return;
  }
  const date = new Date();
  if (preset === 'tomorrow') date.setDate(date.getDate() + 1);
  if (preset === 'week') {
    const daysUntilSunday = (7 - date.getDay()) % 7;
    date.setDate(date.getDate() + (daysUntilSunday || 7));
  }
  taskForm.value.due = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  taskDueStatus.value = 'Due date set';
}

function saveTaskDetails(): void {
  if (!editingTaskId) return;
  const task = state.value.tasks.find((item) => item.id === editingTaskId);
  if (!task) return;
  const title = taskForm.value.title.trim();
  if (!title) return;
  editTask(task, title, taskForm.value.due, Number(taskForm.value.minutes || 0));
  closeTaskDetails();
  persist();
}

/* -------------------------------------------------------------------------- */
/* Backup                                                                     */
/* -------------------------------------------------------------------------- */

function copyBackup(): void {
  backupText.value = JSON.stringify(state.value, null, 2);
  const fallback = () => {
    backupStatus.value = 'Select and copy the text above.';
  };
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(backupText.value).then(
        () => {
          backupStatus.value = 'Backup copied to clipboard.';
        },
        fallback,
      );
    } else {
      fallback();
    }
  } catch {
    fallback();
  }
}

function restoreBackup(): void {
  try {
    const restored = normalizeState(JSON.parse(backupText.value) as unknown);
    if (!restored) throw new Error('Invalid backup format');
    if (!Array.isArray(restored.habits) || !restored.habits.length) restored.habits = [...DEFAULT_HABITS];
    state.value = restored;
    backupStatus.value = 'Backup restored successfully.';
    persist();
  } catch {
    backupStatus.value = 'The entered text is not a valid backup JSON.';
  }
}

/* -------------------------------------------------------------------------- */
/* AI prioritisation                                                          */
/* -------------------------------------------------------------------------- */

/** Applies estimates and returns tasks moved back to Dumps for energy reasons. */
function applyResult(result: PrioritizeResult): Task[] {
  const byId = new Map(state.value.tasks.map((task) => [task.id, task]));
  result.ranked.forEach((ranked) => {
    const task = byId.get(ranked.id);
    if (!task) return;
    task.min = ranked.minutes;
    task.est = true;
    task.reason = ranked.reason;
    task.estimateSource = ranked.source;
    task.fit = ranked.fit;
    task.confidence = ranked.confidence;
    task.firstStep = ranked.firstStep
      ? { title: ranked.firstStep.title, minutes: ranked.firstStep.minutes }
      : undefined;
    task.subtasks = ranked.subtasks?.map((subtask) => ({
      title: subtask.title,
      minutes: subtask.minutes,
      energy: subtask.energy,
    }));

    if (fitsEnergy(ranked.fit, result.energy)) task.movedFromToday = false;
  });
  state.value.plan = {
    energy: result.energy,
    order: result.ranked
      .filter((ranked) => fitsEnergy(ranked.fit, result.energy))
      .map((ranked) => ranked.id),
    at: Date.now(),
  };
  const moved = parkEnergyMismatchedTasks();
  persist();
  return moved;
}

const taskWord = (count: number): string => (count === 1 ? 'task' : 'tasks');

/** Local estimates are only a fallback; they are never tried before the AI. */
function prioritizeLocally(inputs: TaskInput[], energy: Energy, today: string): PrioritizeResult {
  const estimates = new Map(inputs.map((task) => [task.id, estimateHeuristic(task)]));
  return rankTasks(inputs, estimates, energy, today);
}

/** Applies a result and explains any tasks moved to Dumps for energy reasons. */
function finishPrioritization(result: PrioritizeResult, summary: string): void {
  const moved = applyResult(result);
  const movedNote = moved.length
    ? ` ${moved.length} ${taskWord(moved.length)} needing more energy ${moved.length === 1 ? 'was' : 'were'} moved to Dumps: ${moved.map((task) => task.title).join(', ')}.`
    : '';
  aiStatus.value = `${summary}${movedNote}`;
}

/**
 * Tries the configured desktop AI first. Local estimates are used only when AI
 * is unavailable, fails, or returns incomplete data, and the status always
 * says which path ran and why.
 */
async function prioritize(): Promise<void> {
  aiStatus.value = 'Checking AI configuration...';
  const config = await refreshAiConfig();
  const energyValue = state.value.energy as Energy;
  const today = keyOf(new Date());
  const todayOpen = state.value.tasks.filter(
    (task) => !task.done && (task.imp === 4 || (!!task.due && task.due <= today)),
  );

  if (!todayOpen.length) {
    aiStatus.value = `No tasks marked for today.${config.note}`;
    return;
  }

  const inputs: TaskInput[] = todayOpen.map((task) => ({
    id: task.id,
    title: task.title,
    due: task.due || '',
  }));

  if (!config.configured) {
    finishPrioritization(
      prioritizeLocally(inputs, energyValue, today),
      `AI could not be used: ${config.note.trim()} Local estimates used instead.`,
    );
    return;
  }

  try {
    const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' });
    const raw = await ai.runAi(
      'Prioritizing your tasks',
      () => requestAiPrioritization(buildPrompt(inputs, energyValue, today, weekday)),
    );
    const { estimates, missing } = parseEstimates(raw, inputs.map((task) => task.id));
    if (!estimates.size) throw new Error('the AI returned no usable estimates');

    const partial = missing.length
      ? ` ${missing.length} ${taskWord(missing.length)} had no AI estimate and used local ones.`
      : '';
    finishPrioritization(
      rankTasks(inputs, estimates, energyValue, today),
      `AI estimates used for ${estimates.size} of ${inputs.length} ${taskWord(inputs.length)}.${config.note}${partial}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    finishPrioritization(
      prioritizeLocally(inputs, energyValue, today),
      `AI prioritization failed: ${reason} Local estimates used instead.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Day rollover                                                               */
/* -------------------------------------------------------------------------- */

function checkDay(): void {
  const key = keyOf(new Date());
  if (key !== shownDay) {
    shownDay = key;
    todayKey.value = key;
    if (calendarMode.value === 'week') {
      goToCurrentEnergyMonth();
      goToCurrentEnergyWeek();
    }
    state.value.energy = state.value.energyHistory[key] ?? 2;
    state.value.energyDay = key;
    parkEnergyMismatchedTasks();
    syncCheckInForm();
    persist();
  }
}

export function usePlanner() {
  return {
    // state
    state,
    energy,
    dumpFilter,
    aiConfig,
    aiStatus,
    backupStatus,
    backupText,
    taskAddOpen,
    habitAddOpen,
    taskDialogOpen,
    taskForm,
    taskDueStatus,
    checkInForm,
    // derived
    checkIn,
    checkInLocked,
    deferredTaskCount,
    movedToDumps,
    movedToDumpsNote,
    energyCalendar,
    energyWeek,
    energySummary,
    calendarMode,
    weekOffset,
    canGoForward,
    canGoForwardWeek,
    habitItems: computed(() => habitView.value.items),
    habitDoneHabits: computed(() => habitView.value.doneHabits),
    habitExpectedHabits: computed(() => habitView.value.expectedHabits),
    nowTasks,
    filteredDumps,
    doneTasks,
    hasExamples,
    planNote,
    energyHint,
    nowMeta,
    // commands
    init,
    suggestCheckInEnergy,
    acceptCheckInSuggestion,
    saveCheckIn,
    editCheckIn,
    cancelCheckInEdit,
    shiftEnergyCalendar,
    goToCurrentEnergyMonth,
    shiftEnergyWeek,
    goToCurrentEnergyWeek,
    setCalendarMode,
    toggleHabit,
    removeHabit,
    toggleSlot,
    taskAction,
    addTask,
    addBulkTasks,
    addHabit,
    setDumpFilter,
    clearExamples,
    clearDone,
    closeTaskDetails,
    setTaskDue,
    applyDuePreset,
    saveTaskDetails,
    copyBackup,
    restoreBackup,
    prioritize,
    refreshAiConfig,
    checkDay,
  };
}
