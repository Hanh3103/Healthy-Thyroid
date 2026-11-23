/**
 * Profile persistence boundary.
 *
 * `profile.json` holds one document: { ai: local marker, diet: DietSettings }.
 * The AI marker is kept only for older saved profiles; no key is read, stored
 * or exposed. The Diet Advisor's key lives in the Rust process environment.
 */
import { isTauri, tauriLoad, tauriSave, localLoad, localSave, localRemove } from '../../shared/platform.ts';
import { emptyConfig, normalizeConfig, type AIConfig } from './model.ts';
import { DEFAULT_DIET_SETTINGS, normalizeDietSettings, type DietSettings } from './dietSettings.ts';

const LEGACY_KEYS = {
  provider: 'ai_provider',
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
  /* A bare local AI marker is the legacy shape. */
  if (isRecord(value) && ('provider' in value || 'endpoint' in value || 'model' in value)) {
    return { ai: normalizeConfig(value), diet: normalizeDietSettings(localLoad(DIET_SETTINGS_KEY)) };
  }
  return { ai: emptyConfig(), diet: DEFAULT_DIET_SETTINGS };
}

function hasAiConfig(config: AIConfig): boolean {
  return config.provider !== 'custom' || !!config.endpoint || !!config.model;
}

/** Loads both the local marker and the diet settings, migrating legacy data once. */
export async function loadProfileData(): Promise<ProfileData> {
  if (isTauri()) {
    const stored = await tauriLoad<unknown>('load_profile');
    if (stored) {
      const parsed = parseProfile(stored);
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
  localSave(LEGACY_KEYS.provider, normalized.ai.provider);
  if (normalized.ai.endpoint) localSave(LEGACY_KEYS.endpoint, normalized.ai.endpoint);
  else localRemove(LEGACY_KEYS.endpoint);
  if (normalized.ai.model) localSave(LEGACY_KEYS.model, normalized.ai.model);
  else localRemove(LEGACY_KEYS.model);
}

/** Loads the local-only AI marker (no key; retained for compatibility). */
export async function loadAiConfig(): Promise<AIConfig> {
  return (await loadProfileData()).ai;
}

/** Persists the local-only AI marker without disturbing diet settings. */
export async function saveAiConfig(config: AIConfig): Promise<void> {
  const current = await loadProfileData();
  await saveProfileData({ ...current, ai: config });
}

export interface SaveAiCredentialsInput extends AIConfig {
  apiKey?: string;
}

export async function getAiCredentialsStatus(): Promise<import('./model.ts').AiCredentialsStatus> {
  if (!isTauri()) {
    return {
      configured: false,
      source: 'none',
      provider: 'openai',
      endpoint: '',
      model: '',
      apiKeyMasked: '',
      hasStoredKey: false,
    };
  }
  const raw = await (await import('@tauri-apps/api/core')).invoke<string>('get_ai_credentials_status');
  const parsed = JSON.parse(raw) as import('./model.ts').AiCredentialsStatus;
  return parsed;
}

export async function saveAiCredentials(input: SaveAiCredentialsInput): Promise<import('./model.ts').AiCredentialsStatus> {
  if (!isTauri()) throw new Error('AI credentials can be saved only in the desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  const raw = await invoke<string>('save_ai_credentials', {
    json: JSON.stringify({
      provider: input.provider,
      endpoint: input.endpoint,
      model: input.model,
      apiKey: input.apiKey ?? '',
    }),
  });
  return JSON.parse(raw) as import('./model.ts').AiCredentialsStatus;
}

/** Loads the Profile-owned diet settings used by the Diet Advisor. */
export async function loadDietSettings(): Promise<DietSettings> {
  return (await loadProfileData()).diet;
}

/** Persists diet settings without disturbing the local marker. */
export async function saveDietSettings(settings: DietSettings): Promise<void> {
  const current = await loadProfileData();
  await saveProfileData({ ...current, diet: settings });
}
