import type { Task, Plan, MailSlot } from './types';
import { state } from './state';
import { keyOf, daysUntil } from './utils';
import { MAIL_SLOTS } from './constants';

/** Computes priority score for a task matching current energy level. */
export function score(t: Task): number {
  let s = t.imp * 10;
  const n = daysUntil(t.due);
  if (n !== null) {
    if (n <= 0) s += 20;
    else if (n <= 2) s += 10;
  }
  return s;
}

/** Checks if a cached AI plan was generated today for the active energy tier. */
export function planFresh(p: Plan | null, E: number): boolean {
  return !!(p && p.energy === E && p.at && keyOf(new Date(p.at)) === keyOf(new Date()));
}

/** Sorts eligible tasks for the "Do now" view using fresh AI plans or priority scoring. */
export function orderNow(list: Task[], E: number): Task[] {
  const plan = state.plan;
  if (planFresh(plan, E) && plan && Array.isArray(plan.order)) {
    const idx: Record<string, number> = {};
    plan.order.forEach((id, i) => {
      idx[id] = i;
    });
    return list.sort((a, b) => {
      const ia = a.id in idx ? idx[a.id] : 1e6;
      const ib = b.id in idx ? idx[b.id] : 1e6;
      if (ia !== ib) return ia - ib;
      return score(b) - score(a);
    });
  }
  return list.sort((a, b) => score(b) - score(a));
}

/**
 * Calculates current consecutive streak count for a habit.
 * Includes weekend bridging for weekday-only routines like 'mail'.
 */
export function streak(id: string): number {
  let n = 0;
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const l = state.log;
  const skip = () => {
    if (id === 'mail') {
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    }
  };
  skip();
  if (!(l[keyOf(d)] && l[keyOf(d)][id])) {
    d.setDate(d.getDate() - 1);
    skip();
  }
  while (l[keyOf(d)] && l[keyOf(d)][id]) {
    n++;
    d.setDate(d.getDate() - 1);
    skip();
  }
  return n;
}

/** Returns the checklist slots applicable for the given day of the week. */
export function todaySlots(d: Date): MailSlot[] {
  const wd = d.getDay();
  if (wd === 0 || wd === 6) return [];
  return MAIL_SLOTS.filter((s) => !s.fri || wd === 5);
}

/** Toggles completion of an email routine slot and syncs overall habit completion. */
export function toggleSlot(sid: string, onUpdate: () => void): void {
  const d = new Date();
  const k = keyOf(d);
  state.log[k] = state.log[k] || {};
  const key = 'mail_' + sid;
  state.log[k][key] = !state.log[k][key];
  state.log[k].mail = todaySlots(d).every((s) => state.log[k]['mail_' + s.id]);
  onUpdate();
}
