import type { AppState, Task } from './types';
import { STORAGE_KEY, DEFAULT_HABITS } from './constants';
import { keyOf, uid } from './utils';

/** Factory function creating a new Task. */
export function newTask(title: string, due?: string, minutes?: number): Task {
  const estimatedMinutes = Math.max(0, Math.min(360, Math.round((minutes || 0) / 5) * 5));
  return {
    id: uid(),
    title,
    imp: 2,
    min: estimatedMinutes,
    due: due || '',
    done: false,
    ex: false,
    est: estimatedMinutes > 0,
    locked: false,
    reason: ''
  };
}

/** Generates initial seed data containing sample starter tasks and default habits. */
export function seedState(): AppState {
  function ex(title: string, imp: 1 | 2 | 3 | 4, min: number, reason: string): Task {
    return {
      id: uid(),
      title,
      imp,
      min,
      due: '',
      done: false,
      ex: true,
      est: true,
      locked: false,
      reason
    };
  }

  return {
    energy: 2,
    energyDay: keyOf(new Date()),
    log: {},
    plan: null,
    habits: [...DEFAULT_HABITS],
    tasks: [
      ex('Reply to emails (9:00 check)', 4, 15, 'Quick win that unblocks other people.'),
      ex('Send 2 tailored job applications', 4, 60, 'Needs focus to tailor each one well.'),
      ex('Follow up on last week’s applications', 2, 15, 'Short messages, little thinking.'),
      ex('Update the application tracker', 2, 10, 'Routine admin.'),
      ex('Build one portfolio project step', 2, 90, 'Deep work, best done at peak energy.'),
      ex('Improve CV bullet points', 2, 30, 'Steady editing, moderate focus.'),
      ex('Message two former colleagues', 1, 20, 'Useful, but not time sensitive.')
    ]
  };
}

/** Loads application state from local storage. */
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      if (parsed && Array.isArray(parsed.tasks)) {
        parsed.log = parsed.log || {};
        parsed.energy = parsed.energy || 2;
        parsed.plan = parsed.plan || null;
        if (!Array.isArray(parsed.habits) || parsed.habits.length === 0) {
          parsed.habits = [...DEFAULT_HABITS];
        }
        if (parsed.energyDay !== keyOf(new Date())) {
          parsed.energy = 2;
          parsed.energyDay = keyOf(new Date());
        }
        const urgencyMigrated = localStorage.getItem('energy-planner-urgency-v2') === '1';
        parsed.tasks.forEach((t) => {
          if (!urgencyMigrated) {
            if (t.imp === 3) t.imp = 4;
            else if (t.imp === 2) t.imp = 3;
          }
          if (t.est === undefined) t.est = (t.min || 0) > 0;
          if (t.due === undefined) t.due = '';
          if (t.min === undefined) t.min = 0;
          if (t.locked === undefined) t.locked = false;
          if (t.reason === undefined) t.reason = '';
        });
        if (!urgencyMigrated) localStorage.setItem('energy-planner-urgency-v2', '1');
        return parsed as AppState;
      }
    }
  } catch (e) {
    console.error('Failed to load state from localStorage:', e);
  }
  return seedState();
}

/** Global in-memory application state singleton. */
export const state: AppState = loadState();

/** Persists the current state to localStorage. */
export function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state to localStorage:', e);
  }
}
