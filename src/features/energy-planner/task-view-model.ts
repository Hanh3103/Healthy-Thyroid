import type { Task } from '../../shared/domain-types';
import { daysUntil } from '../../shared/utils';

export type DumpFilter = 'all' | 'tomorrow' | 'week' | 'later';

export function isTodayTask(task: Task): boolean {
  if (task.imp === 4) return true;
  const days = daysUntil(task.due);
  return days !== null && days <= 0;
}

export function matchesDumpFilter(task: Task, filter: DumpFilter, today = new Date()): boolean {
  if (filter === 'all') return true;
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
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

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + ((7 - weekEnd.getDay()) % 7));
  if (filter === 'later') {
    const dueTomorrow = dueDate?.getTime() === tomorrow.getTime();
    const dueThisWeek = !!dueDate && dueDate > tomorrow && dueDate <= weekEnd;
    return task.imp === 1 && !dueTomorrow && !dueThisWeek;
  }

  const dueThisWeek = !!dueDate && dueDate > tomorrow && dueDate <= weekEnd;
  return task.imp === 3 || dueThisWeek;
}
