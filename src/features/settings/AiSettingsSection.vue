<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import AppInput from '../../shared/ui/AppInput.vue';
import AppNumberInput from '../../shared/ui/AppNumberInput.vue';
import { requestConfirm } from '../../shared/ui/useConfirm';
import { useAiStatus } from '../../shared/ai/useAiStatus';
import { useAiStore } from '../../stores/ai';
import {
  AI_PROVIDER_OPTIONS,
  MODEL_SUGGESTIONS,
  endpointError,
  presetFor,
  type AIProvider,
} from '../../shared/ai/model';
import { registerSettingsDraft } from './unsaved';
import type { SaveAiConfigPartialInput } from '../../shared/ai/aiStatus';

const store = useAiStore();
const ai = useAiStatus();

const busy = ai.busy;
const failureReason = ai.failureReason;

const status = ref('');
const advancedOpen = ref(false);
const testMessage = ref('');
const apiKeyInput = ref('');
const replacingKey = ref(false);
const options = AI_PROVIDER_OPTIONS;

// Draft fields that require Save: provider, model, daily limit, endpoint
interface DraftFields {
  provider: AIProvider;
  endpoint: string;
  model: string;
  dailyLimit: number;
}

const baseline = ref<DraftFields>({
  provider: store.provider,
  endpoint: store.endpoint,
  model: store.model,
  dailyLimit: store.dailyLimit,
});

const draft = ref<DraftFields>({
  provider: store.provider,
  endpoint: store.endpoint,
  model: store.model,
  dailyLimit: store.dailyLimit,
});

// Set of field names that the user has actively edited
const editedFields = ref(new Set<keyof DraftFields | 'apiKey'>());

function markEdited(field: keyof DraftFields | 'apiKey'): void {
  editedFields.value.add(field);
}

function selectProvider(provider: AIProvider): void {
  const preset = presetFor(provider);
  draft.value.provider = provider;
  markEdited('provider');
  if (preset) {
    draft.value.endpoint = preset.endpoint;
    draft.value.model = preset.model;
    markEdited('endpoint');
    markEdited('model');
  }
  advancedOpen.value = false;
}

// Keep unedited draft fields in sync if the store changes while the page is open
watch(
  () => [store.provider, store.endpoint, store.model, store.dailyLimit],
  ([p, ep, m, dl]) => {
    if (!editedFields.value.has('provider')) {
      draft.value.provider = p as AIProvider;
      baseline.value.provider = p as AIProvider;
    }
    if (!editedFields.value.has('endpoint')) {
      draft.value.endpoint = ep as string;
      baseline.value.endpoint = ep as string;
    }
    if (!editedFields.value.has('model')) {
      draft.value.model = m as string;
      baseline.value.model = m as string;
    }
    if (!editedFields.value.has('dailyLimit')) {
      draft.value.dailyLimit = dl as number;
      baseline.value.dailyLimit = dl as number;
    }
  }
);

const isProviderDirty = computed(() =>
  editedFields.value.has('provider') && draft.value.provider !== baseline.value.provider);
const isModelDirty = computed(() =>
  editedFields.value.has('model') && draft.value.model !== baseline.value.model);
const isEndpointDirty = computed(() =>
  editedFields.value.has('endpoint') && draft.value.endpoint !== baseline.value.endpoint);
const isLimitDirty = computed(() =>
  editedFields.value.has('dailyLimit') && draft.value.dailyLimit !== baseline.value.dailyLimit);
const isKeyDirty = computed(() =>
  apiKeyInput.value.trim().length > 0 || replacingKey.value);

const dirty = computed(() =>
  isProviderDirty.value || isModelDirty.value || isEndpointDirty.value || isLimitDirty.value || isKeyDirty.value);

const modelSuggestions = computed(() => MODEL_SUGGESTIONS[draft.value.provider]);
const endpointIssue = computed(() => endpointError(draft.value.provider, draft.value.endpoint));
const limitIssue = computed(() =>
  draft.value.dailyLimit >= 1 && draft.value.dailyLimit <= 1000
    ? ''
    : 'Choose a limit between 1 and 1000 calls.');

function startReplaceKey(): void {
  replacingKey.value = true;
  apiKeyInput.value = '';
  markEdited('apiKey');
}

function cancelReplaceKey(): void {
  replacingKey.value = false;
  apiKeyInput.value = '';
  editedFields.value.delete('apiKey');
}

function restoreDraft(message?: string): void {
  draft.value = {
    provider: store.provider,
    endpoint: store.endpoint,
    model: store.model,
    dailyLimit: store.dailyLimit,
  };
  baseline.value = { ...draft.value };
  apiKeyInput.value = '';
  replacingKey.value = false;
  editedFields.value.clear();
  if (message) status.value = message;
}

async function onSwitch(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  await store.setEnabled(input.checked);
}

async function save(): Promise<void> {
  if (endpointIssue.value) {
    status.value = `AI settings not saved: ${endpointIssue.value}`;
    advancedOpen.value = true;
    return;
  }
  if (limitIssue.value) {
    status.value = `AI settings not saved: ${limitIssue.value}`;
    return;
  }

  const partial: SaveAiConfigPartialInput = {};
  if (isProviderDirty.value) partial.provider = draft.value.provider;
  if (isModelDirty.value) partial.model = draft.value.model;
  if (isEndpointDirty.value) partial.endpoint = draft.value.endpoint;
  if (isLimitDirty.value) partial.dailyLimit = draft.value.dailyLimit;
  if (apiKeyInput.value.trim()) partial.key = apiKeyInput.value.trim();

  if (Object.keys(partial).length > 0) {
    await store.savePartial(partial);
  }

  baseline.value = {
    provider: store.provider,
    endpoint: store.endpoint,
    model: store.model,
    dailyLimit: store.dailyLimit,
  };
  draft.value = { ...baseline.value };
  apiKeyInput.value = '';
  replacingKey.value = false;
  editedFields.value.clear();

  testMessage.value = store.testResult;
  status.value = store.configured
    ? 'AI configuration saved.'
    : 'AI configuration saved, but an API key is still required.';
}

async function test(): Promise<void> {
  try {
    await store.testConnection();
  } catch {
    // The inline result and header dot already explain the failure.
  }
  testMessage.value = store.testResult;
}

async function deleteKey(): Promise<void> {
  const confirmed = await requestConfirm({
    title: 'Remove the saved key?',
    description: 'AI suggestions will stop working until a new key is saved.',
    subject: 'Saved API key',
    warning: 'The key is deleted from the operating system keychain. This cannot be undone.',
    confirmLabel: 'Remove key',
    cancelLabel: 'Cancel',
    tone: 'danger',
  });
  if (!confirmed) return;
  await store.deleteKey();
  apiKeyInput.value = '';
  replacingKey.value = false;
  editedFields.value.delete('apiKey');
  status.value = 'API key removed from OS keychain.';
}

const unregister = registerSettingsDraft('ai', {
  isDirty: () => dirty.value,
  discard: () => restoreDraft(),
});

onMounted(async () => {
  await store.load();
  baseline.value = {
    provider: store.provider,
    endpoint: store.endpoint,
    model: store.model,
    dailyLimit: store.dailyLimit,
  };
  draft.value = { ...baseline.value };
});

onUnmounted(unregister);
</script>

<template>
  <div class="settings-section">
    <div class="sec-head">
      <h2>AI settings</h2>
      <span class="chip" :class="{ 'chip-ok': store.configured }">
        {{ store.configured ? 'Configured' : 'Not configured' }}
      </span>
    </div>
    <p class="muted">
      Choose a provider and model for suggestions in Energy Planner and Diet Advisor.
    </p>

    <form class="settings-form" @submit.prevent="save">
      <div class="settings-grid">
        <label class="budget-field" for="ai-provider">
          <span>Provider</span>
          <select id="ai-provider" class="budget-select" :value="draft.provider"
            @change="selectProvider(($event.target as HTMLSelectElement).value as AIProvider)">
            <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>

        <AppInput
          id="ai-model"
          v-model="draft.model"
          label="Model"
          list="ai-model-suggestions"
          placeholder="e.g. gemini-3.5-flash-lite"
          autocomplete="off"
          @input="markEdited('model')"
        />
        <datalist id="ai-model-suggestions">
          <option v-for="model in modelSuggestions" :key="model" :value="model"></option>
        </datalist>

        <div v-if="draft.provider === 'ollama'" class="key-saved-container">
          <span class="muted">Ollama runs locally and does not require an API key.</span>
        </div>
        <div v-else-if="store.hasKey && !replacingKey" class="key-saved-container">
          <span class="key-saved-line">Key saved in OS keychain</span>
          <div class="key-btn-group">
            <AppButton size="sm" @click="startReplaceKey">Replace</AppButton>
            <AppButton size="sm" @click="deleteKey">Delete</AppButton>
          </div>
        </div>
        <div v-else class="key-field-container">
          <AppInput
            id="ai-key"
            v-model="apiKeyInput"
            label="API key"
            type="password"
            placeholder="Paste your API key"
            autocomplete="off"
            @input="markEdited('apiKey')"
          />
          <AppButton v-if="store.hasKey" size="sm" @click="cancelReplaceKey">
            Cancel replacement
          </AppButton>
        </div>

        <label class="ai-switch-row settings-switch-row">
          <span>AI suggestions</span>
          <input
            class="ai-switch"
            type="checkbox"
            :checked="store.enabled"
            :disabled="store.busy"
            aria-label="AI suggestions"
            @change="onSwitch"
          />
        </label>

        <AppNumberInput
          id="ai-daily-limit"
          v-model="draft.dailyLimit"
          label="Daily call limit"
          :min="1"
          :max="1000"
          :step="1"
          @update:model-value="markEdited('dailyLimit')"
        />
      </div>

      <details class="settings-advanced" :open="advancedOpen" @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open">
        <summary>Advanced</summary>
        <AppInput
          id="ai-endpoint"
          v-model="draft.endpoint"
          label="Endpoint"
          placeholder="https://…"
          inputmode="url"
          @input="markEdited('endpoint')"
        />
        <p v-if="endpointIssue" class="field-error" role="alert">{{ endpointIssue }}</p>
        <p v-else class="muted">Checked against the provider allowlist before every AI call.</p>
      </details>

      <p class="muted key-explanation">
        Your key is stored in the OS keychain. It is never kept in the app's browser storage.
      </p>
      <p v-if="status" class="status" role="status">{{ status }}</p>
      <p v-if="failureReason" class="field-error" role="status">{{ failureReason }}</p>
      <p v-if="testMessage" class="status" role="status">{{ testMessage }}</p>

      <AppFormActions>
        <AppButton variant="text" @click="restoreDraft('AI settings reset to saved values.')">Reset</AppButton>
        <AppButton variant="ghost" :disabled="busy" @click="test">
          {{ busy ? 'Testing...' : 'Test connection' }}
        </AppButton>
        <AppButton variant="ghost" :disabled="!dirty" @click="restoreDraft()">Cancel</AppButton>
        <AppButton variant="primary" type="submit" :disabled="!dirty || !!endpointIssue || !!limitIssue">
          Save AI settings
        </AppButton>
      </AppFormActions>
    </form>
  </div>
</template>
