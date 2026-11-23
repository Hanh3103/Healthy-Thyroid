/**
 * Profile ViewModel.
 *
 * Exposes AI provider configuration and Profile-owned diet settings.
 * The API key is entered here but saved only through Tauri to Rust app-data;
 * Vue never stores or displays the raw key, only masked status from Rust.
 */
import { computed, ref } from 'vue';
import { isTauri } from '../../shared/platform';
import {
  AI_PROVIDER_OPTIONS,
  emptyConfig,
  isConfigComplete,
  presetFor,
  type AIConfig,
  type AIProvider,
  type AiCredentialsStatus,
} from './model';
import { loadSettings, saveSettings as persistSettings } from './settings';
import { dietSettings } from './settings';
import type { DietSettings } from './dietSettings';
import { deleteAiKey, getAiCredentialsStatus, saveAiCredentials, testAiConnection } from './api';

const status = ref('');
const settingsStatus = ref('');
const draft = ref<AIConfig>(emptyConfig());
const apiKeyInput = ref('');
const replacingKey = ref(false);
const testingConnection = ref(false);
const credentials = ref<AiCredentialsStatus | null>(null);
const settingsDraft = ref<DietSettings>({ ...dietSettings.value });
let initialised = false;
let settingsInitialised = false;

function seedSettingsDraft(): void {
  settingsDraft.value = { ...dietSettings.value };
  settingsStatus.value = '';
  settingsInitialised = true;
}

function applyStatus(next: AiCredentialsStatus): void {
  credentials.value = next;
  draft.value = {
    provider: next.provider || draft.value.provider,
    endpoint: next.endpoint || draft.value.endpoint,
    model: next.model || draft.value.model,
  };
}

export function useProfile() {
  const complete = computed(() => isConfigComplete(draft.value));
  const providerLabel = computed(() =>
    AI_PROVIDER_OPTIONS.find((option) => option.value === draft.value.provider)?.label ?? 'Custom');

  function selectProvider(provider: AIProvider): void {
    const preset = presetFor(provider);
    draft.value = {
      ...draft.value,
      provider,
      ...(preset ? { endpoint: preset.endpoint, model: preset.model } : {}),
    };
  }

  async function refreshCredentials(): Promise<void> {
    if (!isTauri()) {
      credentials.value = {
        configured: false,
        source: 'none',
        provider: draft.value.provider,
        endpoint: draft.value.endpoint,
        model: draft.value.model,
        apiKeyMasked: '',
        hasStoredKey: false,
      };
      return;
    }
    applyStatus(await getAiCredentialsStatus());
  }

  function reset(): void {
    apiKeyInput.value = '';
    replacingKey.value = false;
    if (credentials.value) applyStatus(credentials.value);
    status.value = 'AI settings reset to saved values.';
  }

  function startReplaceKey(): void {
    replacingKey.value = true;
    apiKeyInput.value = '';
  }

  function cancelReplaceKey(): void {
    replacingKey.value = false;
    apiKeyInput.value = '';
  }

  async function deleteKey(): Promise<void> {
    if (!isTauri()) return;
    const next = await deleteAiKey();
    applyStatus(next);
    replacingKey.value = false;
    apiKeyInput.value = '';
    status.value = 'API key removed from OS keychain.';
  }

  async function testConnection(): Promise<void> {
    if (!isTauri()) {
      status.value = 'Connection test is available only in the desktop app.';
      return;
    }
    testingConnection.value = true;
    status.value = 'Testing connection to AI provider...';
    try {
      const msg = await testAiConnection();
      status.value = msg;
    } catch (e) {
      status.value = `Connection test failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      testingConnection.value = false;
    }
  }

  async function save(): Promise<void> {
    if (!isTauri()) {
      status.value = 'AI credentials can be saved only in the desktop app (npm run tauri dev).';
      return;
    }
    const next = await saveAiCredentials({ ...draft.value, apiKey: apiKeyInput.value });
    applyStatus(next);
    apiKeyInput.value = '';
    replacingKey.value = false;
    status.value = next.configured
      ? `AI configuration saved${next.apiKeyMasked ? ` (${next.apiKeyMasked})` : ''}.`
      : 'AI configuration saved, but an API key is still required.';
  }

  function resetDietSettings(): void {
    seedSettingsDraft();
    settingsStatus.value = 'Diet settings reset to saved values.';
  }

  async function saveDiet(): Promise<void> {
    settingsDraft.value = await persistSettings(settingsDraft.value);
    settingsStatus.value = 'Diet settings saved. The Diet Advisor will use them on its next plan.';
  }

  async function init(): Promise<void> {
    await refreshCredentials();
    initialised = true;
    await loadSettings();
    if (!settingsInitialised) seedSettingsDraft();
  }

  return {
    draft,
    apiKeyInput,
    credentials,
    status,
    complete,
    providerLabel,
    options: AI_PROVIDER_OPTIONS,
    settingsDraft,
    settingsStatus,
    savedSettings: computed(() => dietSettings.value),
    initialised: computed(() => initialised),
    selectProvider,
    reset,
    save,
    startReplaceKey,
    cancelReplaceKey,
    deleteKey,
    testConnection,
    replacingKey: computed(() => replacingKey.value),
    testingConnection: computed(() => testingConnection.value),
    resetDietSettings,
    saveDiet,
    init,
  };
}
