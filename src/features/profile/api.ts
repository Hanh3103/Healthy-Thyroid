/**
 * Profile persistence boundary.
 *
 * In Tauri the AI config is stored in `profile.json` via the `load_profile` /
 * `save_profile` commands. On first run, legacy localStorage keys are migrated
 * into that file. In the browser we keep using localStorage so `npm run dev`
 * needs no Rust backend.
 */
import { isTauri, tauriLoad, tauriSave, localLoad, localSave, localRemove } from '../../shared/platform';
import { emptyConfig, normalizeConfig, type AIConfig } from './model';

const LEGACY_KEYS = {
  provider: 'ai_provider',
  apiKey: 'ai_api_key',
  endpoint: 'ai_endpoint',
  model: 'ai_model',
} as const;

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

/** Loads the shared AI config, migrating legacy browser data on first Tauri run. */
export async function loadAiConfig(): Promise<AIConfig> {
  if (!isTauri()) return readLegacyConfig();

  const stored = await tauriLoad<unknown>('load_profile');
  if (stored) return normalizeConfig(stored);

  const legacy = readLegacyConfig();
  if (legacy.provider !== 'custom' || legacy.apiKey || legacy.endpoint || legacy.model) {
    if (await tauriSave('save_profile', legacy)) {
      removeLegacyKeys();
    }
    return legacy;
  }
  return emptyConfig();
}

/** Persists the shared AI config. */
export async function saveAiConfig(config: AIConfig): Promise<void> {
  const normalized = normalizeConfig(config);
  if (isTauri()) {
    await tauriSave('save_profile', normalized);
    return;
  }
  localSave(LEGACY_KEYS.provider, normalized.provider);
  if (normalized.apiKey) localSave(LEGACY_KEYS.apiKey, normalized.apiKey);
  else localRemove(LEGACY_KEYS.apiKey);
  if (normalized.endpoint) localSave(LEGACY_KEYS.endpoint, normalized.endpoint);
  else localRemove(LEGACY_KEYS.endpoint);
  if (normalized.model) localSave(LEGACY_KEYS.model, normalized.model);
  else localRemove(LEGACY_KEYS.model);
}
