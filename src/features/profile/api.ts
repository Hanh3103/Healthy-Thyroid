/**
 * Profile persistence boundary.
 *
 * `profile.json` holds one document: { ai: AIConfig, diet: DietSettings }.
 * Legacy files that stored a bare AI config are migrated on first load; in the
 * browser the same values live in localStorage so `npm run dev` needs no Rust.
 */
import { isTauri, tauriLoad, tauriSave, localLoad, localSave, localRemove } from '../../shared/platform.ts';
import { emptyConfig, normalizeConfig, type AIConfig } from './model.ts';
import { DEFAULT_DIET_SETTINGS, normalizeDietSettings, type DietSettings } from './dietSettings.ts';

const LEGACY_KEYS = {
  provider: 'ai_provider',
  apiKey: 'ai_api_key',
  endpoint: 'ai_endpoint',
  model: 'ai_model',
} as const;
const DIET_SETTINGS_KEY = 'profile_diet_settings_v1';

export interface ProfileData {
  ai: AIConfig;
  diet: DietSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readLegacyConfig(): AIConfig {
  return normalizeConfig({
    provider: localLoad<string>(LEGACY_KEYS.provider),
    apiKey: localLoad<string>(LEGACY_KEYS.apiKey),
    endpoint: localLoad<string>(LEGACY_KEYS.endpoint),
    model: localLoad<string>(LEGACY_KEYS.model),
  });
}

function removeLegacyKeys(): void {
  Object.values(LEGACY_KEYS).forEach((key) => localRemove(key));
}

function parseProfile(value: unknown): ProfileData {
  if (isRecord(value) && isRecord(value.ai)) {
    return { ai: normalizeConfig(value.ai), diet: normalizeDietSettings(value.diet) };
  }
  /* A bare AI config is the legacy shape. */
  if (isRecord(value) && ('provider' in value || 'apiKey' in value || 'endpoint' in value || 'model' in value)) {
    return { ai: normalizeConfig(value), diet: normalizeDietSettings(localLoad(DIET_SETTINGS_KEY)) };
  }
  return { ai: emptyConfig(), diet: DEFAULT_DIET_SETTINGS };
}

function hasAiConfig(config: AIConfig): boolean {
  return config.provider !== 'custom' || !!config.apiKey || !!config.endpoint || !!config.model;
}

/** Loads both AI config and diet settings, migrating legacy browser data once. */
export async function loadProfileData(): Promise<ProfileData> {
  if (isTauri()) {
    const stored = await tauriLoad<unknown>('load_profile');
    if (stored) {
      const parsed = parseProfile(stored);
      /* Rewrite the old bare-config document into the versioned shape. */
      if (!isRecord(stored) || !isRecord(stored.ai)) await tauriSave('save_profile', parsed);
      return parsed;
    }
    const legacy = parseProfile({ ...readLegacyConfig(), diet: localLoad(DIET_SETTINGS_KEY) });
    if (hasAiConfig(legacy.ai) || localLoad(DIET_SETTINGS_KEY)) {
      await tauriSave('save_profile', legacy);
      removeLegacyKeys();
      localRemove(DIET_SETTINGS_KEY);
    }
    return legacy;
  }

  const stored = localLoad<unknown>('profile_v1');
  if (stored) return parseProfile(stored);
  const legacy = parseProfile({ ...readLegacyConfig(), diet: localLoad(DIET_SETTINGS_KEY) });
  localSave('profile_v1', legacy);
  removeLegacyKeys();
  localRemove(DIET_SETTINGS_KEY);
  return legacy;
}

/** Persists the whole profile document. */
export async function saveProfileData(data: ProfileData): Promise<void> {
  const normalized: ProfileData = {
    ai: normalizeConfig(data.ai),
    diet: normalizeDietSettings(data.diet),
  };
  if (isTauri()) {
    await tauriSave('save_profile', normalized);
    return;
  }
  localSave('profile_v1', normalized);
  /* Keep the legacy keys in sync for older dev builds that still read them. */
  localSave(LEGACY_KEYS.provider, normalized.ai.provider);
  if (normalized.ai.apiKey) localSave(LEGACY_KEYS.apiKey, normalized.ai.apiKey);
  else localRemove(LEGACY_KEYS.apiKey);
  if (normalized.ai.endpoint) localSave(LEGACY_KEYS.endpoint, normalized.ai.endpoint);
  else localRemove(LEGACY_KEYS.endpoint);
  if (normalized.ai.model) localSave(LEGACY_KEYS.model, normalized.ai.model);
  else localRemove(LEGACY_KEYS.model);
}

/** Loads the shared AI config (used by the existing Pinia store). */
export async function loadAiConfig(): Promise<AIConfig> {
  return (await loadProfileData()).ai;
}

/** Persists the shared AI config without disturbing diet settings. */
export async function saveAiConfig(config: AIConfig): Promise<void> {
  const current = await loadProfileData();
  await saveProfileData({ ...current, ai: config });
}

/** Loads the Profile-owned diet settings used by the Diet Advisor. */
export async function loadDietSettings(): Promise<DietSettings> {
  return (await loadProfileData()).diet;
}

/** Persists diet settings without disturbing the AI config. */
export async function saveDietSettings(settings: DietSettings): Promise<void> {
  const current = await loadProfileData();
  await saveProfileData({ ...current, diet: settings });
}
