import type { Task, UrgencyLevel } from '../../shared/domain-types';
import { uid } from '../../shared/utils';

export function createTask(title: string, due = '', minutes = 0): Task {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error('Task title is required');
  const estimatedMinutes = Math.max(0, Math.min(360, Math.round(minutes / 5) * 5));
  return {
    id: uid(),
    title: trimmedTitle.slice(0, 140),
    imp: 2,
    min: estimatedMinutes,
    due,
    done: false,
    ex: false,
    est: estimatedMinutes > 0,
    locked: false,
    reason: ''
  };
}

export function editTask(task: Task, title: string, due: string, minutes: number): void {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error('Task title is required');
  task.title = trimmedTitle.slice(0, 140);
  task.due = due;
  task.min = minutes > 0
    ? Math.max(5, Math.min(360, Math.round(minutes / 5) * 5))
    : 0;
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
