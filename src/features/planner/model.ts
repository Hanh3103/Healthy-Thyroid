/**
 * Planner model: types, constants and pure rules.
 * No Vue, no persistence, no DOM.
 */
import { keyOf, daysUntil } from '../../shared/utils';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Energy level: 1 = Low, 2 = Medium, 3 = High. */
export type EnergyLevel = 1 | 2 | 3;
/** Urgency level: 1 = Later, 2 = Tomorrow, 3 = This week, 4 = Today. */
export type UrgencyLevel = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  title: string;
  imp: UrgencyLevel;
  min: number;
  due: string;
  done: boolean;
  ex: boolean;
  est: boolean;
  locked: boolean;
  reason: string;
  estimateSource?: 'ai' | 'heuristic';
  fit?: 'fits' | 'stretch' | 'too_hard';
  confidence?: 'low' | 'medium' | 'high';
  firstStep?: { title: string; minutes: number };
  subtasks?: { title: string; minutes: number; energy: EnergyLevel }[];
}

export interface HabitByEnergy {
  min: number;
  txt: string;
}

export interface Habit {
  id: string;
  name: string;
  slots?: boolean;
  by: Record<number, HabitByEnergy>;
}

export interface MailSlot {
  id: string;
  time: string;
  label: string;
  fri?: boolean;
}

export interface Plan {
  energy: EnergyLevel;
  order: string[];
  at: number;
}

export interface AppState {
  energy: EnergyLevel;
  energyDay: string;
  log: Record<string, Record<string, boolean>>;
  plan: Plan | null;
  habits: Habit[];
  tasks: Task[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Key used for legacy browser storage (migrated into Tauri on first run). */
export const STORAGE_KEY = 'energy-planner-v1';
/** Migration marker for the urgency renumbering. */
export const URGENCY_MIGRATION_KEY = 'energy-planner-urgency-v2';

export const EN_NAMES: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };
export const IM_NAMES: Record<number, string> = { 1: 'Later', 2: 'Tomorrow', 3: 'This week', 4: 'Today' };
export const HINTS: Record<number, string> = {
  1: 'Low: keep it light and finish small things.',
  2: 'Medium: steady, routine work.',
  3: 'High: spend it on the hardest, most important task first.',
};

export const DEFAULT_HABITS: Habit[] = [
  {
    id: 'en',
    name: 'English · IELTS',
    by: {
      1: { min: 30, txt: 'Listening: one full IELTS section (about 30 min), check answers and note paraphrases missed. Then review vocabulary.' },
      2: { min: 60, txt: 'Reading: one full passage set under time (60 min for full test), then analyse wrong answers. Add 5 phrases.' },
      3: { min: 90, txt: 'Writing Task 2 essay (250 words in 40 min), then Task 1 (150 words in 20 min). Correct yourself, then record a 2 min Speaking Part 2.' },
    },
  },
  {
    id: 'de',
    name: 'German · Goethe C1',
    by: {
      1: { min: 30, txt: 'Hören: one Goethe C1 Modelltest part, then Tagesschau or Deutschlandfunk. Write down 5 new Wendungen.' },
      2: { min: 60, txt: 'Lesen: one Modelltest part under time, then a Zeit or FAZ article summarised in 5 sentences. Practise Konnektoren.' },
      3: { min: 90, txt: 'Schreiben: one full Modelltest task (Forumsbeitrag or formelle E-Mail), then correct it. Finish with 5 min Sprechen out loud.' },
    },
  },
  {
    id: 'mail',
    name: 'Email routine',
    slots: true,
    by: {
      1: { min: 20, txt: 'Two quick checks (about 9:00 and 16:30): read, reply right away, update application tracker.' },
      2: { min: 30, txt: 'Both checks, plus write 1 outgoing email (application or recruiter) and schedule for 9:00 tomorrow.' },
      3: { min: 45, txt: 'Both checks, plus 1 or 2 carefully tailored outgoing emails. On Fridays, follow up on older applications.' },
    },
  },
];

export const MAIL_SLOTS: MailSlot[] = [
  { id: 'c1', time: '09:00', label: 'Check 1: read, reply, send drafted mails' },
  { id: 'w', time: '09:15', label: 'Write 1 outgoing email (application, recruiter or former colleague)' },
  { id: 'f', time: '09:25', label: 'Follow up on applications from 5 to 7 days ago', fri: true },
  { id: 'c2', time: '16:30', label: 'Check 2: reply, draft tomorrow’s mails, schedule them for 9:00' },
];

/* -------------------------------------------------------------------------- */
/* Task operations                                                            */
/* -------------------------------------------------------------------------- */

function newId(): string {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function createTask(title: string, due = '', minutes = 0): Task {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error('Task title is required');
  const estimatedMinutes = Math.max(0, Math.min(360, Math.round(minutes / 5) * 5));
  return {
    id: newId(),
    title: trimmedTitle.slice(0, 140),
    imp: 2,
    min: estimatedMinutes,
    due,
    done: false,
    ex: false,
    est: estimatedMinutes > 0,
    locked: false,
    reason: '',
  };
}

export function editTask(task: Task, title: string, due: string, minutes: number): void {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error('Task title is required');
  task.title = trimmedTitle.slice(0, 140);
  task.due = due;
  task.min = minutes > 0 ? Math.max(5, Math.min(360, Math.round(minutes / 5) * 5)) : 0;
  task.est = minutes > 0;
}

export function toggleTaskDone(task: Task): void {
  task.done = !task.done;
}

export function cycleTaskUrgency(task: Task): UrgencyLevel {
  task.imp = ((task.imp % 4) + 1) as UrgencyLevel;
  task.locked = true;
  return task.imp;
}

export function moveTaskToToday(task: Task): void {
  task.imp = 4;
  task.locked = true;
}

export function removeTask(tasks: Task[], id: string): void {
  const index = tasks.findIndex((task) => task.id === id);
  if (index >= 0) tasks.splice(index, 1);
}

/* -------------------------------------------------------------------------- */
/* Scoring / planning                                                         */
/* -------------------------------------------------------------------------- */

export function score(task: Task, now: Date): number {
  let value = task.imp * 10;
  const days = daysUntil(task.due, now);
  if (days !== null) {
    if (days <= 0) value += 20;
    else if (days <= 2) value += 10;
  }
  return value;
}

export function planFresh(plan: Plan | null, energy: number, now: Date): boolean {
  return !!(plan && plan.energy === energy && plan.at && keyOf(new Date(plan.at)) === keyOf(now));
}

export function orderNow(list: Task[], plan: Plan | null, energy: number, now: Date): Task[] {
  if (planFresh(plan, energy, now) && plan && Array.isArray(plan.order)) {
    const index: Record<string, number> = {};
    plan.order.forEach((id, i) => {
      index[id] = i;
    });
    return list.sort((a, b) => {
      const ia = a.id in index ? index[a.id] : 1e6;
      const ib = b.id in index ? index[b.id] : 1e6;
      if (ia !== ib) return ia - ib;
      return score(b, now) - score(a, now);
    });
  }
  return list.sort((a, b) => score(b, now) - score(a, now));
}

export function streak(id: string, log: AppState['log'], now: Date): number {
  let count = 0;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const skipWeekend = () => {
    if (id === 'mail') {
      while (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() - 1);
    }
  };
  skipWeekend();
  if (!(log[keyOf(day)] && log[keyOf(day)][id])) {
    day.setDate(day.getDate() - 1);
    skipWeekend();
  }
  while (log[keyOf(day)] && log[keyOf(day)][id]) {
    count++;
    day.setDate(day.getDate() - 1);
    skipWeekend();
  }
  return count;
}

export function todaySlots(date: Date): MailSlot[] {
  const weekday = date.getDay();
  if (weekday === 0 || weekday === 6) return [];
  return MAIL_SLOTS.filter((slot) => !slot.fri || weekday === 5);
}

/* -------------------------------------------------------------------------- */
/* View selectors                                                             */
/* -------------------------------------------------------------------------- */

export type DumpFilter = 'all' | 'tomorrow' | 'week' | 'later';

export function isTodayTask(task: Task): boolean {
  if (task.imp === 4) return true;
  const days = daysUntil(task.due);
  return days !== null && days <= 0;
}

export function matchesDumpFilter(task: Task, filter: DumpFilter, today = new Date()): boolean {
  if (filter === 'all') return true;
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  const tomorrow = new Date(base);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let dueDate: Date | null = null;
  if (task.due) {
    const [year, month, day] = task.due.split('-').map(Number);
    dueDate = new Date(year, month - 1, day);
    dueDate.setHours(0, 0, 0, 0);
  }

  if (filter === 'tomorrow') {
    return task.imp === 2 || dueDate?.getTime() === tomorrow.getTime();
  }

  const weekEnd = new Date(base);
  weekEnd.setDate(weekEnd.getDate() + ((7 - weekEnd.getDay()) % 7));
  const dueThisWeek = !!dueDate && dueDate > tomorrow && dueDate <= weekEnd;
  const dueTomorrow = dueDate?.getTime() === tomorrow.getTime();

  if (filter === 'later') {
    return task.imp === 1 && !dueTomorrow && !dueThisWeek;
  }
  return task.imp === 3 || dueThisWeek;
}

/* -------------------------------------------------------------------------- */
/* Habit view models                                                          */
/* -------------------------------------------------------------------------- */

export interface HabitDayView {
  index: number;
  date: Date;
  letter: string;
  done: boolean;
  off: boolean;
  className: string;
  title: string;
}

export interface HabitSlotView {
  id: string;
  time: string;
  label: string;
  done: boolean;
  next: boolean;
}

export interface HabitItemView {
  id: string;
  name: string;
  habit: Habit;
  isMail: boolean;
  weekendMail: boolean;
  detail: HabitByEnergy;
  done: boolean;
  streak: number;
  days: HabitDayView[];
  slots: HabitSlotView[];
  doneCount: number;
  energyName: string;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function dotClass(day: { done: boolean; off: boolean }, index: number, isMail: boolean): string {
  const isToday = index === 6;
  const isMissed = !isToday && !day.done && !day.off;
  if (isMail && day.off) return 'off';
  if (isToday && day.done) return 'today done';
  if (day.done) return 'done';
  if (isToday) return 'today';
  if (isMissed) return 'missed';
  return day.off ? 'off' : 'future';
}

function dayTitle(day: { date: Date; done: boolean; off: boolean }, index: number, isMail: boolean): string {
  const base = day.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const isToday = index === 6;
  if (isMail && day.off) return base + ': not scheduled';
  if (day.done) return base + ': done';
  if (isToday) return base + ': today';
  return base + ': missed';
}

export function buildHabitItems(
  habits: Habit[],
  log: AppState['log'],
  today: Date,
  energy: EnergyLevel,
): { items: HabitItemView[]; doneHabits: number; expectedHabits: number } {
  const key = keyOf(today);
  let doneHabits = 0;
  let expectedHabits = 0;

  const items = habits.map((habit) => {
    const slots = habit.slots ? todaySlots(today) : [];
    const isMail = !!habit.slots;
    const weekendMail = isMail && slots.length === 0;

    if (!(isMail && weekendMail)) {
      expectedHabits++;
      if (log[key]?.[habit.id]) doneHabits++;
    }

    const detail = habit.by[energy] || habit.by[2] || { min: 15, txt: '' };
    const dayLog = log[key] || {};

    let nextSlotId: string | null = null;
    if (isMail) {
      for (const slot of slots) {
        if (!dayLog['mail_' + slot.id]) {
          nextSlotId = slot.id;
          break;
        }
      }
    }

    const days: HabitDayView[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i, 12, 0, 0);
      const done = !!(log[keyOf(date)] && log[keyOf(date)][habit.id]);
      const off = isMail ? isWeekend(date) : false;
      const dot = { date, done, off };
      const index = days.length;
      days.push({
        index,
        date,
        letter: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
        done,
        off,
        className: dotClass(dot, index, isMail),
        title: dayTitle(dot, index, isMail),
      });
    }

    return {
      id: habit.id,
      name: habit.name,
      habit,
      isMail,
      weekendMail,
      detail,
      done: !!(log[key] && log[key][habit.id]),
      streak: streak(habit.id, log, today),
      days,
      slots: slots.map((slot) => ({
        ...slot,
        done: !!dayLog['mail_' + slot.id],
        next: slot.id === nextSlotId,
      })),
      doneCount: slots.filter((slot) => dayLog['mail_' + slot.id]).length,
      energyName: EN_NAMES[energy],
    };
  });

  return { items, doneHabits, expectedHabits };
}

/* -------------------------------------------------------------------------- */
/* Seed / normalisation                                                       */
/* -------------------------------------------------------------------------- */

export function seedState(): AppState {
  const example = (title: string, imp: UrgencyLevel, min: number, reason: string): Task => ({
    id: newId(),
    title,
    imp,
    min,
    due: '',
    done: false,
    ex: true,
    est: true,
    locked: false,
    reason,
  });

  return {
    energy: 2,
    energyDay: keyOf(new Date()),
    log: {},
    plan: null,
    habits: [...DEFAULT_HABITS],
    tasks: [
      example('Reply to emails (9:00 check)', 4, 15, 'Quick win that unblocks other people.'),
      example('Send 2 tailored job applications', 4, 60, 'Needs focus to tailor each one well.'),
      example('Follow up on last week’s applications', 2, 15, 'Short messages, little thinking.'),
      example('Update the application tracker', 2, 10, 'Routine admin.'),
      example('Build one portfolio project step', 2, 90, 'Deep work, best done at peak energy.'),
      example('Improve CV bullet points', 2, 30, 'Steady editing, moderate focus.'),
      example('Message two former colleagues', 1, 20, 'Useful, but not time sensitive.'),
    ],
  };
}

export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Partial<AppState>;
  if (!Array.isArray(parsed.tasks)) return null;

  const today = keyOf(new Date());
  const log = parsed.log && typeof parsed.log === 'object' ? parsed.log : {};
  const habits = Array.isArray(parsed.habits) && parsed.habits.length ? parsed.habits : [...DEFAULT_HABITS];
  const energy = (parsed.energy === 1 || parsed.energy === 2 || parsed.energy === 3
    ? parsed.energy
    : 2) as EnergyLevel;

  const tasks = parsed.tasks
    .filter((task): task is Task => !!task && typeof task === 'object' && typeof task.id === 'string')
    .map((task) => ({
      ...task,
      due: task.due ?? '',
      min: task.min ?? 0,
      est: task.est ?? (task.min ?? 0) > 0,
      locked: task.locked ?? false,
      reason: task.reason ?? '',
    }));

  return {
    energy,
    energyDay: parsed.energyDay === today ? parsed.energyDay : today,
    log,
    plan: parsed.plan ?? null,
    habits,
    tasks,
  };
}
