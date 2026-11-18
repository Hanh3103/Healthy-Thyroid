import type { AppState, EnergyLevel, Task } from './types';
import { STORAGE_KEY, DEFAULT_HABITS } from './constants';
import { keyOf, uid } from './utils';

/**
 * Factory function creating a new Task with optional user-specified energy level.
 */
export function newTask(title: string, due?: string, energy?: EnergyLevel): Task {
  const isSpecified = energy === 1 || energy === 2 || energy === 3;
  return {
    id: uid(),
    title,
    energy: isSpecified ? energy : 2,
    imp: 2,
    min: 0,
    due: due || '',
    done: false,
    ex: false,
    est: isSpecified,
    locked: isSpecified,
    reason: ''
  };
}

/** Generates initial seed data containing sample starter tasks and default habits. */
export function seedState(): AppState {
  function ex(title: string, energy: EnergyLevel, imp: 1 | 2 | 3, min: number, reason: string): Task {
    return {
      id: uid(),
      title,
      energy,
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
      ex('Reply to emails (9:00 check)', 1, 3, 15, 'Quick win that unblocks other people.'),
      ex('Send 2 tailored job applications', 3, 3, 60, 'Needs focus to tailor each one well.'),
      ex('Follow up on last week’s applications', 1, 2, 15, 'Short messages, little thinking.'),
      ex('Update the application tracker', 1, 2, 10, 'Routine admin.'),
      ex('Build one portfolio project step', 3, 2, 90, 'Deep work, best done at peak energy.'),
      ex('Improve CV bullet points', 2, 2, 30, 'Steady editing, moderate focus.'),
      ex('Message two former colleagues', 2, 1, 20, 'Useful, but not time sensitive.')
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
        parsed.tasks.forEach((t) => {
          if (t.est === undefined) t.est = true;
          if (t.locked === undefined) t.locked = false;
          if (t.reason === undefined) t.reason = '';
        });
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
