/**
 * Planner ViewModel.
 *
 * Owns reactive state and all commands. Module-level refs make it a singleton
 * shared by every component that calls `usePlanner()`. Components stay passive.
 */
import { computed, ref } from 'vue';
import {
  EN_NAMES,
  buildHabitItems,
  createTask,
  cycleTaskUrgency,
  DEFAULT_HABITS,
  editTask,
  isTodayTask,
  matchesDumpFilter,
  moveTaskToToday,
  normalizeState,
  orderNow,
  planFresh,
  removeTask,
  seedState,
  toggleTaskDone,
  todaySlots,
  type AppState,
  type DumpFilter,
  type EnergyLevel,
  type Habit,
  type Task,
} from './model';
import { loadPlanner, savePlanner } from './api';
import { keyOf } from '../../shared/utils';
import { createAITextProvider } from '../../shared/ai/client';
import { useAiStore } from '../../stores/ai';
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
const aiStatus = ref('');
const backupStatus = ref('');
const backupText = ref('');
const taskAddOpen = ref(false);
const habitAddOpen = ref(false);
const taskDialogOpen = ref(false);

const taskForm = ref({ title: '', due: '', minutes: undefined as number | undefined });
const taskDueStatus = ref('No due date');
let editingTaskId: string | null = null;
let shownDay = keyOf(new Date());

/* -------------------------------------------------------------------------- */
/* Derived data                                                               */
/* -------------------------------------------------------------------------- */

const energy = computed(() => state.value.energy);
const habitView = computed(() => buildHabitItems(state.value.habits, state.value.log, new Date(), state.value.energy));

const openTasks = computed(() => state.value.tasks.filter((task) => !task.done));
const todayTasks = computed(() => openTasks.value.filter(isTodayTask));
const nowTasks = computed(() => orderNow([...todayTasks.value], state.value.plan, state.value.energy, new Date()));
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
  if (state.value.energy === 1) return `Low: ${count} light ${word} queued.`;
  if (state.value.energy === 2) return `Medium: ${count} steady ${word} queued.`;
  return `High: ${count} ${word} queued — tackle the hardest first.`;
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

async function init(): Promise<void> {
  if (initialised.value) return;
  state.value = await loadPlanner();
  initialised.value = true;
}

function persist(): void {
  void savePlanner(state.value);
}

/* -------------------------------------------------------------------------- */
/* Energy / habits                                                            */
/* -------------------------------------------------------------------------- */

function setEnergy(level: EnergyLevel): void {
  state.value.energy = level;
  state.value.energyDay = keyOf(new Date());
  persist();
}

function toggleHabit(habitId: string): void {
  const key = keyOf(new Date());
  const dayLog = (state.value.log[key] ||= {});
  dayLog[habitId] = !dayLog[habitId];
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

function addHabit(name: string, minutes: number, description: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const duration = Math.max(1, Math.min(360, minutes || 15));
  const text = description.trim();
  const habit: Habit = {
    id: 'h' + Date.now().toString(36),
    name: trimmed,
    by: {
      1: { min: duration, txt: text || 'Light version – keep it short and low-effort.' },
      2: { min: duration, txt: text || 'Standard version – steady, comfortable effort.' },
      3: { min: duration, txt: text || 'Deep version – give this your full focus.' },
    },
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

function applyResult(result: PrioritizeResult): void {
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
  });
  state.value.plan = {
    energy: result.energy,
    order: result.ranked.map((ranked) => ranked.id),
    at: Date.now(),
  };
  persist();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The AI took too long. Try again.')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function prioritize(): Promise<void> {
  const energyValue = state.value.energy as Energy;
  const today = keyOf(new Date());
  const todayOpen = state.value.tasks.filter(
    (task) => !task.done && (task.imp === 4 || (!!task.due && task.due <= today)),
  );
  if (!todayOpen.length) {
    aiStatus.value = 'No tasks marked for today.';
    return;
  }

  const inputs: TaskInput[] = todayOpen.map((task) => ({
    id: task.id,
    title: task.title,
    due: task.due || '',
  }));

  const store = useAiStore();
  const config = store.config;
  const configured = !!config.endpoint && !!config.model
    && (config.provider === 'ollama' || !!config.apiKey);

  if (!configured) {
    applyResult(rankTasks(inputs, new Map(), energyValue, today));
    aiStatus.value = 'Heuristic estimates used: AI is not configured. Add your key in Profile > AI Settings.';
    return;
  }

  aiStatus.value = 'Asking AI...';
  try {
    const weekday = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
    const raw = await withTimeout(
      createAITextProvider(config).complete(buildPrompt(inputs, energyValue, today, weekday)),
      90_000,
    );
    const { estimates, missing } = parseEstimates(raw, inputs.map((task) => task.id));
    missing.forEach((id) => {
      const task = inputs.find((item) => item.id === id);
      if (task) estimates.set(id, estimateHeuristic(task));
    });
    applyResult(rankTasks(inputs, estimates, energyValue, today));
    aiStatus.value = missing.length
      ? `Heuristic estimates used for ${missing.length} task(s): the AI skipped them.`
      : 'AI estimates used. Today tasks prioritized.';
  } catch (error) {
    console.error('AI prioritization error:', error);
    applyResult(rankTasks(inputs, new Map(), energyValue, today));
    aiStatus.value = `Heuristic estimates used: ${error instanceof Error ? error.message : String(error)}.`;
  }
}

/* -------------------------------------------------------------------------- */
/* Day rollover                                                               */
/* -------------------------------------------------------------------------- */

function checkDay(): void {
  const key = keyOf(new Date());
  if (key !== shownDay) {
    shownDay = key;
    state.value.energy = 2;
    state.value.energyDay = key;
    persist();
  }
}

export function usePlanner() {
  return {
    // state
    state,
    energy,
    dumpFilter,
    aiStatus,
    backupStatus,
    backupText,
    taskAddOpen,
    habitAddOpen,
    taskDialogOpen,
    taskForm,
    taskDueStatus,
    // derived
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
    setEnergy,
    toggleHabit,
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
    checkDay,
  };
}
