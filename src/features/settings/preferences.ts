/**
 * Shared, device-local display preferences.
 *
 * A module-level ref keeps every section and calendar in sync without another
 * state library. Persistence uses the same localStorage boundary as the other
 * browser-mode features, so it works in both Vite dev and the Tauri webview.
 */
import { ref } from 'vue';
import { localLoad, localSave } from '../../shared/platform.ts';
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type GeneralPreferences,
} from './model.ts';

const STORAGE_KEY = 'settings_v1';

export const preferences = ref<GeneralPreferences>({ ...DEFAULT_PREFERENCES });

export function loadPreferences(): GeneralPreferences {
  const saved = localLoad<unknown>(STORAGE_KEY);
  preferences.value = normalizePreferences(saved ?? DEFAULT_PREFERENCES);
  return preferences.value;
}

export function savePreferences(next: GeneralPreferences): GeneralPreferences {
  const normalized = normalizePreferences(next);
  localSave(STORAGE_KEY, normalized);
  preferences.value = normalized;
  applyPreferences();
  return normalized;
}

/** Applies theme, document language and locale to the root element. */
export function applyPreferences(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const { theme, language } = preferences.value;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.lang = language;
}
