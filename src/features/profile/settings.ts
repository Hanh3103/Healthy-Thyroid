/**
 * Shared, Profile-owned diet settings.
 *
 * A module-level ref (the same pattern used by the other feature ViewModels)
 * lets the Diet tab react immediately when settings are saved in Profile,
 * without adding a second Pinia store.
 */
import { ref } from 'vue';
import { loadDietSettings, saveDietSettings } from './api.ts';
import { DEFAULT_DIET_SETTINGS, normalizeDietSettings, type DietSettings } from './model.ts';

export const dietSettings = ref<DietSettings>({ ...DEFAULT_DIET_SETTINGS });
let loaded = false;

export async function loadSettings(): Promise<DietSettings> {
  if (!loaded) {
    dietSettings.value = await loadDietSettings();
    loaded = true;
  }
  return dietSettings.value;
}

export async function saveSettings(next: DietSettings): Promise<DietSettings> {
  const normalized = normalizeDietSettings(next);
  await saveDietSettings(normalized);
  dietSettings.value = normalized;
  loaded = true;
  return normalized;
}

export function resetSettings(): DietSettings {
  dietSettings.value = { ...DEFAULT_DIET_SETTINGS };
  return dietSettings.value;
}
