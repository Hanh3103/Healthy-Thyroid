/**
 * Planner model: types, constants and pure rules.
 * No Vue, no persistence, no DOM.
 */
import { keyOf, daysUntil } from '../../shared/utils/index.ts';
import { weekStartOffset } from '../settings/model.ts';
import { preferences } from '../settings/preferences.ts';
import { symptomsFromNote } from './checkin.ts';

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
  /** Set when prioritization moved the task back to Dumps for energy reasons. */
  movedFromToday?: boolean;
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

export type SymptomSeverity = 'mild' | 'moderate' | 'severe';

export interface SymptomEntry {
  /** Short, controlled symptom name. The free check-in note is never shared. */
  name: string;
  severity: SymptomSeverity;
}

export interface DailyCheckIn {
  /** Symptoms the user entered when saving or editing the day. */
  symptoms: string;
  /** Structured, shareable symptom names; derived from the note on legacy data. */
  symptomEntries?: SymptomEntry[];
  level: EnergyLevel;
  /** Level the AI suggested, kept for reference when editing. */
  suggested: EnergyLevel | null;
  /** One-sentence AI rationale, shown only when an AI suggestion was accepted. */
  aiReason?: string | null;
  source: 'ai' | 'manual' | 'legacy';
  at: number;
}

export interface AppState {
  energy: EnergyLevel;
  energyDay: string;
  /** One saved level per day the user chose, keyed by YYYY-MM-DD. */
  energyHistory: Record<string, EnergyLevel>;
  /** Daily symptom check-ins keyed by YYYY-MM-DD. */
  checkIns: Record<string, DailyCheckIn>;
  log: Record<string, Record<string, boolean>>;
  plan: Plan | null;
  habits: Habit[];
  tasks: Task[];
}

export interface EnergyCalendarDay {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  level: EnergyLevel | null;
}

export interface EnergyCalendarMonth {
  year: number;
  /** Zero-based month index, as used by Date. */
  month: number;
  label: string;
  weeks: EnergyCalendarDay[][];
  counts: Record<EnergyLevel, number>;
  recordedDays: number;
}

export interface EnergyCalendarWeek {
  /** Zero for the current week; -1 for last week, and so on. */
  offset: number;
  /** Machine-readable Monday–Sunday range. */
  range: string;
  /** Human-readable range shown in the card header. */
  label: string;
  days: EnergyCalendarDay[];
}

export interface EnergySummary {
  logged: number;
  average: number | null;
  mostCommon: EnergyLevel | null;
}

export type CalendarMode = 'week' | 'month';

/** Validates the persisted calendar mode; anything unknown falls back to week. */
export function normalizeCalendarMode(raw: unknown): CalendarMode {
  return raw === 'month' ? 'month' : 'week';
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Key used for legacy browser storage (migrated into Tauri on first run). */
export const STORAGE_KEY = 'energy-planner-v1';
/** Migration marker for the urgency renumbering. */
export const URGENCY_MIGRATION_KEY = 'energy-planner-urgency-v2';
/** Persisted UI preference for the calendar view. */
export const CALENDAR_MODE_KEY = 'energy-planner-calendar-mode-v1';

export const EN_NAMES: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };
export const IM_NAMES: Record<number, string> = { 1: 'Later', 2: 'Tomorrow', 3: 'This week', 4: 'Today' };
export const HINTS: Record<number, string> = {
  1: 'Low: keep it light and finish small things.',
  2: 'Medium: steady, routine work.',
  3: 'High: spend it on the hardest, most important task first.',
};

/** Returns true for a valid YYYY-MM-DD local calendar date. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Keeps only valid dates with valid energy levels from persisted data. */
export function normalizeEnergyHistory(raw: unknown): Record<string, EnergyLevel> {
  const result: Record<string, EnergyLevel> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;

  for (const [key, value] of Object.entries(raw)) {
    if (isDateKey(key) && (value === 1 || value === 2 || value === 3)) {
      result[key] = value;
    }
  }
  return result;
}

function isEnergyLevel(value: unknown): value is EnergyLevel {
  return value === 1 || value === 2 || value === 3;
}

function normalizeSymptomEntries(value: unknown): SymptomEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: SymptomEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<SymptomEntry>;
    const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (!name) continue;
    const severity = raw.severity === 'severe' || raw.severity === 'moderate'
      ? raw.severity
      : 'mild';
    if (!entries.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
      entries.push({ name, severity });
    }
  }
  return entries.slice(0, 8);
}

/** Keeps valid check-ins and backfills legacy saved energy days. */
export function normalizeCheckIns(
  raw: unknown,
  history: Record<string, EnergyLevel>,
  today = keyOf(new Date()),
): Record<string, DailyCheckIn> {
  const result: Record<string, DailyCheckIn> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (!isDateKey(key) || !value || typeof value !== 'object') continue;
      const item = value as Partial<DailyCheckIn>;
      if (!isEnergyLevel(item.level)) continue;
      const source = item.source === 'ai' || item.source === 'manual'
        ? item.source
        : 'legacy';
      const note = typeof item.symptoms === 'string' ? item.symptoms.slice(0, 1000) : '';
      result[key] = {
        symptoms: note,
        symptomEntries: normalizeSymptomEntries(item.symptomEntries) ?? symptomsFromNote(note),
        level: item.level,
        suggested: isEnergyLevel(item.suggested) ? item.suggested : null,
        aiReason: typeof item.aiReason === 'string' ? item.aiReason.slice(0, 200) : null,
        source,
        at: typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : 0,
      };
    }
  }

  for (const [key, level] of Object.entries(history)) {
    // A saved energy value is not the same as an answered check-in. Opening the
    // app sets energyDay to today, so backfilling today would lock the form
    // before the user has answered it ("Medium" on first open). Legacy
    // backfill remains available for past days only.
    if (key >= today) continue;
    result[key] ??= { symptoms: '', level, suggested: null, aiReason: null, source: 'legacy', at: 0 };
  }
  return result;
}

/** True when the day already has a saved check-in. */
export function isCheckInLocked(state: AppState, date: string): boolean {
  return !!state.checkIns[date];
}

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
  if (task.imp === 4) {
    task.movedFromToday = false;
    task.fit = undefined;
  }
  return task.imp;
}

export function moveTaskToToday(task: Task): void {
  task.imp = 4;
  task.locked = true;
  task.movedFromToday = false;
  // Clear the stale estimate so the energy-aware Today list shows it again.
  task.fit = undefined;
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

/** True when a task's AI/heuristic energy fit works at the given energy level. */
export function fitsEnergy(fit: Task['fit'], energy: EnergyLevel): boolean {
  if (!fit || fit === 'fits') return true;
  if (fit === 'stretch') return energy >= 2;
  return energy === 3;
}

/**
 * Today's list is energy-aware: unestimated work stays visible, estimated
 * "too hard" work is parked until the user records a higher-energy day.
 */
export function tasksForEnergy(tasks: Task[], energy: EnergyLevel): Task[] {
  return tasks.filter((task) => fitsEnergy(task.fit, energy));
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

/** Builds a Monday-first month grid annotated with the saved energy levels. */
export function buildEnergyCalendar(
  year: number,
  month: number,
  history: Record<string, EnergyLevel>,
  now = new Date(),
): EnergyCalendarMonth {
  const todayKey = keyOf(now);
  const first = new Date(year, month, 1, 12);
  const weekOffset = weekStartOffset(first, preferences.value);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((weekOffset + daysInMonth) / 7) * 7;

  const days: EnergyCalendarDay[] = [];
  for (let index = 0; index < cellCount; index++) {
    const date = new Date(year, month, 1 - weekOffset + index, 12);
    const key = keyOf(date);
    days.push({
      key,
      day: date.getDate(),
      inMonth: date.getFullYear() === year && date.getMonth() === month,
      isToday: key === todayKey,
      isPast: key < todayKey,
      isFuture: key > todayKey,
      level: history[key] ?? null,
    });
  }

  const weeks: EnergyCalendarDay[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));

  const counts: Record<EnergyLevel, number> = { 1: 0, 2: 0, 3: 0 };
  let recordedDays = 0;
  for (const day of days) {
    if (day.inMonth && day.level !== null) {
      counts[day.level]++;
      recordedDays++;
    }
  }

  return {
    year,
    month,
    label: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    weeks,
    counts,
    recordedDays,
  };
}

/** Formats a Monday–Sunday range for the calendar header. */
function weekRangeLabel(first: Date, last: Date): string {
  const shortMonth = (date: Date) => date.toLocaleDateString(undefined, { month: 'short' });
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${first.getDate()}–${last.getDate()} ${shortMonth(first)} ${first.getFullYear()}`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${first.getDate()} ${shortMonth(first)} – ${last.getDate()} ${shortMonth(last)} ${last.getFullYear()}`;
  }
  return `${first.getDate()} ${shortMonth(first)} ${first.getFullYear()} – ${last.getDate()} ${shortMonth(last)} ${last.getFullYear()}`;
}

/**
 * Returns the Monday-to-Sunday week `offset` weeks from the current one.
 * Negative offsets move into the past; 0 is the current week.
 */
export function buildEnergyWeek(
  history: Record<string, EnergyLevel>,
  now = new Date(),
  offset = 0,
): EnergyCalendarWeek {
  const todayKey = keyOf(now);
  const weekOffset = weekStartOffset(now, preferences.value);
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - weekOffset + offset * 7,
    12,
  );

  const days: EnergyCalendarDay[] = [];
  for (let index = 0; index < 7; index++) {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index, 12);
    const key = keyOf(date);
    days.push({
      key,
      day: date.getDate(),
      inMonth: true,
      isToday: key === todayKey,
      isPast: key < todayKey,
      isFuture: key > todayKey,
      level: history[key] ?? null,
    });
  }

  const first = new Date(`${days[0].key}T12:00:00`);
  const last = new Date(`${days[6].key}T12:00:00`);
  return {
    offset,
    range: `${days[0].key} – ${days[6].key}`,
    label: weekRangeLabel(first, last),
    days,
  };
}

/** Returns the current Monday-to-Sunday week. */
export function buildCurrentWeek(
  history: Record<string, EnergyLevel>,
  now = new Date(),
): EnergyCalendarWeek {
  return buildEnergyWeek(history, now, 0);
}

/** Summarises a month's logged energy levels for the expanded calendar. */
export function summarizeEnergyMonth(month: EnergyCalendarMonth): EnergySummary {
  const logged = month.recordedDays;
  if (!logged) return { logged: 0, average: null, mostCommon: null };

  const levels: EnergyLevel[] = [1, 2, 3];
  let total = 0;
  let mostCommon: EnergyLevel = 1;
  for (const level of levels) {
    total += month.counts[level] * level;
    if (month.counts[level] > month.counts[mostCommon]) mostCommon = level;
  }

  return {
    logged,
    average: Math.round((total / logged) * 10) / 10,
    mostCommon,
  };
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
    energyHistory: {},
    checkIns: {},
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

export function normalizeState(raw: unknown, now = new Date()): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Partial<AppState>;
  if (!Array.isArray(parsed.tasks)) return null;

  const today = keyOf(now);
  const log = parsed.log && typeof parsed.log === 'object' ? parsed.log : {};
  // An empty array is a valid state (all habits removed); only reseed when missing.
  const habits = Array.isArray(parsed.habits) ? parsed.habits : [...DEFAULT_HABITS];
  const energy = (parsed.energy === 1 || parsed.energy === 2 || parsed.energy === 3
    ? parsed.energy
    : 2) as EnergyLevel;

  const energyHistory = normalizeEnergyHistory(parsed.energyHistory);
  const storedDay = isDateKey(parsed.energyDay) ? parsed.energyDay : '';
  // Older saves stored only the last active day. Keep that single data point.
  // Only backfill a *past* day: today's energyDay is written on app open and
  // must not turn into a saved energy value or a locked check-in.
  if (storedDay && storedDay < today && energyHistory[storedDay] === undefined) {
    energyHistory[storedDay] = energy;
  }
  const currentEnergy = energyHistory[today] ?? (storedDay === today ? energy : 2);
  const checkIns = normalizeCheckIns(parsed.checkIns, energyHistory, today);

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
    energy: currentEnergy,
    energyDay: today,
    energyHistory,
    checkIns,
    log,
    plan: parsed.plan ?? null,
    habits,
    tasks,
  };
}
