/**
 * Profile ViewModel.
 *
 * Exposes the shared AI config for editing and the Profile-owned diet
 * settings. The AI config lives in the Pinia store so Planner sees changes
 * immediately; diet settings use a shared module ref (see settings.ts).
 */
import { computed, ref } from 'vue';
import { useAiStore } from '../../stores/ai';
import {
  AI_PROVIDER_OPTIONS,
  emptyConfig,
  isConfigComplete,
  presetFor,
  type AIConfig,
  type AIProvider,
} from './model';
import { loadSettings, saveSettings as persistSettings } from './settings';
import { dietSettings } from './settings';
import type { DietSettings } from './dietSettings';

const status = ref('');
const settingsStatus = ref('');
const draft = ref<AIConfig>(emptyConfig());
const settingsDraft = ref<DietSettings>({ ...dietSettings.value });
let initialised = false;
let settingsInitialised = false;

function seedDraft(): void {
  const store = useAiStore();
  draft.value = { ...store.config };
  status.value = '';
  initialised = true;
}

function seedSettingsDraft(): void {
  settingsDraft.value = { ...dietSettings.value };
  settingsStatus.value = '';
  settingsInitialised = true;
}

export function useProfile() {
  const store = useAiStore();

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

  function reset(): void {
    seedDraft();
    status.value = 'Settings reset to saved values.';
  }

  async function save(): Promise<void> {
    await store.save(draft.value);
    status.value = complete.value
      ? 'AI configuration saved.'
      : 'AI configuration saved, but it may be incomplete.';
  }

  function resetDietSettings(): void {
    seedSettingsDraft();
    settingsStatus.value = 'Diet settings reset to saved values.';
  }

  async function saveDiet(): Promise<void> {
    settingsDraft.value = await persistSettings(settingsDraft.value);
    settingsStatus.value = 'Diet settings saved. The Diet Advisor will use them on its next plan.';
  }

  /** Called when the view mounts; loads both saved config and settings. */
  async function init(): Promise<void> {
    await store.load();
    if (!initialised) seedDraft();
    await loadSettings();
    if (!settingsInitialised) seedSettingsDraft();
  }

  return {
    draft,
    status,
    complete,
    providerLabel,
    options: AI_PROVIDER_OPTIONS,
    savedConfig: computed(() => store.config),
    settingsDraft,
    settingsStatus,
    savedSettings: computed(() => dietSettings.value),
    selectProvider,
    reset,
    save,
    resetDietSettings,
    saveDiet,
    init,
  };
}
