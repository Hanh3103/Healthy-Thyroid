/**
 * Profile ViewModel.
 *
 * Profile owns diet settings only. AI configuration lives in Settings and the
 * shared AI store.
 */
import { computed, ref } from 'vue';
import { dietSettings, loadSettings, saveSettings as persistSettings } from './settings';
import type { DietSettings } from './model';

const settingsStatus = ref('');
const settingsDraft = ref<DietSettings>({ ...dietSettings.value });
let initialised = false;
let settingsInitialised = false;

function seedSettingsDraft(): void {
  settingsDraft.value = { ...dietSettings.value };
  settingsStatus.value = '';
  settingsInitialised = true;
}

export function useProfile() {
  function resetDietSettings(): void {
    seedSettingsDraft();
    settingsStatus.value = 'Diet settings reset to saved values.';
  }

  async function saveDiet(): Promise<void> {
    settingsDraft.value = await persistSettings(settingsDraft.value);
    settingsStatus.value = 'Diet settings saved. The Diet Advisor will use them on its next plan.';
  }

  async function init(): Promise<void> {
    await loadSettings();
    initialised = true;
    if (!settingsInitialised) seedSettingsDraft();
  }

  return {
    settingsDraft,
    settingsStatus,
    savedSettings: computed(() => dietSettings.value),
    initialised: computed(() => initialised),
    resetDietSettings,
    saveDiet,
    init,
  };
}
