/**
 * Profile ViewModel.
 *
 * Exposes the shared AI config for editing. The config is stored in the Pinia
 * store so Planner sees changes immediately; persistence lives in `api.ts`.
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

const status = ref('');
const draft = ref<AIConfig>(emptyConfig());
let initialised = false;

function seedDraft(): void {
  const store = useAiStore();
  draft.value = { ...store.config };
  status.value = '';
  initialised = true;
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

  /** Called when the view mounts; loads the store if needed and seeds the form. */
  async function init(): Promise<void> {
    await store.load();
    if (!initialised) seedDraft();
  }

  return {
    draft,
    status,
    complete,
    providerLabel,
    options: AI_PROVIDER_OPTIONS,
    savedConfig: computed(() => store.config),
    selectProvider,
    reset,
    save,
    init,
  };
}
