/**
 * Profile persistence boundary.
 *
 * `profile.json` holds only the Profile document: { diet: DietSettings }.
 * AI configuration and credentials are owned by the shared AI feature and are
 * never stored here.
 */
import { isTauri, tauriLoad, tauriSave, localLoad, localSave, localRemove } from '../../shared/platform.ts';
import { DEFAULT_DIET_SETTINGS, normalizeDietSettings, type DietSettings } from './model.ts';

const PROFILE_KEY = 'profile_v1';
const DIET_SETTINGS_KEY = 'profile_diet_settings_v1';

export interface ProfileData {
  diet: DietSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProfile(value: unknown): ProfileData {
  if (isRecord(value) && isRecord(value.diet)) {
    return { diet: normalizeDietSettings(value.diet) };
  }
  /* Older profiles were either a bare diet object or a { ai, diet } document. */
  if (isRecord(value) && 'ai' in value) {
    return { diet: normalizeDietSettings(value.diet) };
  }
  return { diet: normalizeDietSettings(value) };
}

/** True when the stored document still has the old AI marker or a non-canonical shape. */
function needsMigration(stored: unknown): boolean {
  return !isRecord(stored) || !isRecord(stored.diet) || 'ai' in stored;
}

/** Loads the Profile document, migrating legacy data once. */
export async function loadProfileData(): Promise<ProfileData> {
  if (isTauri()) {
    const stored = await tauriLoad<unknown>('load_profile');
    if (stored) {
      const parsed = parseProfile(stored);
      if (needsMigration(stored)) await tauriSave('save_profile', parsed);
      return parsed;
    }
    const legacyDiet = localLoad<unknown>(DIET_SETTINGS_KEY);
    const migrated = { diet: legacyDiet ? normalizeDietSettings(legacyDiet) : DEFAULT_DIET_SETTINGS };
    if (legacyDiet) {
      await tauriSave('save_profile', migrated);
      localRemove(DIET_SETTINGS_KEY);
    }
    return migrated;
  }

  const stored = localLoad<unknown>(PROFILE_KEY);
  if (stored) {
    const parsed = parseProfile(stored);
    if (needsMigration(stored)) localSave(PROFILE_KEY, parsed);
    return parsed;
  }
  const legacyDiet = localLoad<unknown>(DIET_SETTINGS_KEY);
  const migrated = { diet: legacyDiet ? normalizeDietSettings(legacyDiet) : DEFAULT_DIET_SETTINGS };
  localSave(PROFILE_KEY, migrated);
  localRemove(DIET_SETTINGS_KEY);
  return migrated;
}

/** Persists the whole Profile document. */
export async function saveProfileData(data: ProfileData): Promise<void> {
  const normalized: ProfileData = { diet: normalizeDietSettings(data.diet) };
  if (isTauri()) {
    await tauriSave('save_profile', normalized);
    return;
  }
  localSave(PROFILE_KEY, normalized);
}

/** Loads the Profile-owned diet settings used by the Diet Advisor. */
export async function loadDietSettings(): Promise<DietSettings> {
  return (await loadProfileData()).diet;
}

/** Persists diet settings without disturbing any other Profile data. */
export async function saveDietSettings(settings: DietSettings): Promise<void> {
  const current = await loadProfileData();
  await saveProfileData({ ...current, diet: settings });
}
