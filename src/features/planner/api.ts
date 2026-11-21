/**
 * Planner persistence boundary.
 * Tauri: `planner.json` via load/save commands. Browser: localStorage.
 * Legacy browser state is migrated to Tauri storage once, then removed.
 */
import { isTauri, tauriLoad, tauriSave, localLoad, localSave, localRemove } from '../../shared/platform';
import {
  STORAGE_KEY,
  URGENCY_MIGRATION_KEY,
  normalizeState,
  seedState,
  type AppState,
} from './model';

/** Applies the legacy urgency renumbering to old persisted tasks. */
function applyUrgencyMigration(state: AppState): void {
  const migrated = localLoad<string>(URGENCY_MIGRATION_KEY) === '1';
  if (!migrated) {
    state.tasks.forEach((task) => {
      if (task.imp === 3) task.imp = 4;
      else if (task.imp === 2) task.imp = 3;
    });
    localSave(URGENCY_MIGRATION_KEY, '1');
  }
}

function readLegacy(): AppState {
  const raw = localLoad<unknown>(STORAGE_KEY);
  const normalized = normalizeState(raw);
  if (!normalized) return seedState();
  if (raw) applyUrgencyMigration(normalized);
  return normalized;
}

/** Loads planner state, migrating legacy localStorage data on first Tauri run. */
export async function loadPlanner(): Promise<AppState> {
  if (!isTauri()) return readLegacy();

  const stored = await tauriLoad<unknown>('load_planner');
  if (stored) return normalizeState(stored) ?? seedState();

  const legacy = readLegacy();
  if (await tauriSave('save_planner', legacy)) {
    localRemove(STORAGE_KEY);
    localRemove(URGENCY_MIGRATION_KEY);
  }
  return legacy;
}

/** Persists planner state. */
export async function savePlanner(state: AppState): Promise<void> {
  if (isTauri()) {
    await tauriSave('save_planner', state);
    return;
  }
  localSave(STORAGE_KEY, state);
}
