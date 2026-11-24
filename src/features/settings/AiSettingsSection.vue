<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import AppInput from '../../shared/ui/AppInput.vue';
import AppNumberInput from '../../shared/ui/AppNumberInput.vue';
import { requestConfirm } from '../../shared/ui/useConfirm';
import { useAiStatus } from '../../shared/ai/useAiStatus';
import {
  MODEL_SUGGESTIONS,
  endpointError,
  type AIProvider,
} from '../profile/model';
import { useProfile } from '../profile/useProfile';
import { registerSettingsDraft } from './unsaved';

const profile = useProfile();
const ai = useAiStatus();
const busy = ai.busy;
const failureReason = ai.failureReason;
const { draft, apiKeyInput, credentials, status, options, replacingKey } = profile;

const advancedOpen = ref(false);
const testMessage = ref('');
const enabledDraft = ref(ai.status.value.enabled);
const limitDraft = ref(ai.status.value.dailyLimit);

interface DraftSnapshot {
  provider: AIProvider;
  endpoint: string;
  model: string;
  enabled: boolean;
  dailyLimit: number;
  apiKey: string;
  replacingKey: boolean;
}

function snapshot(): DraftSnapshot {
  return {
    provider: draft.value.provider,
    endpoint: draft.value.endpoint,
    model: draft.value.model,
    enabled: enabledDraft.value,
    dailyLimit: limitDraft.value,
    apiKey: apiKeyInput.value,
    replacingKey: replacingKey.value,
  };
}

const saved = ref<DraftSnapshot>(snapshot());
const dirty = computed(() => JSON.stringify(snapshot()) !== JSON.stringify(saved.value));
const modelSuggestions = computed(() => MODEL_SUGGESTIONS[draft.value.provider]);
const endpointIssue = computed(() => endpointError(draft.value.provider, draft.value.endpoint));
const limitIssue = computed(() =>
  limitDraft.value >= 1 && limitDraft.value <= 1000 ? '' : 'Choose a limit between 1 and 1000 calls.');

function restoreDraft(message?: string): void {
  draft.value = {
    provider: saved.value.provider,
    endpoint: saved.value.endpoint,
    model: saved.value.model,
  };
  enabledDraft.value = saved.value.enabled;
  limitDraft.value = saved.value.dailyLimit;
  apiKeyInput.value = '';
  profile.cancelReplaceKey();
  if (message) status.value = message;
}

function selectProvider(provider: AIProvider): void {
  profile.selectProvider(provider);
  advancedOpen.value = false;
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
  await profile.save();
  if (enabledDraft.value !== ai.status.value.enabled) await ai.setEnabled(enabledDraft.value);
  if (limitDraft.value !== ai.status.value.dailyLimit) await ai.setDailyLimit(limitDraft.value);
  await ai.refresh();
  testMessage.value = ai.testResult.value;
  saved.value = snapshot();
}

async function test(): Promise<void> {
  try {
    await ai.testConnection();
  } catch {
    // The inline result and header dot already explain the failure.
  }
  testMessage.value = ai.testResult.value;
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
  await profile.deleteKey();
  await ai.refresh();
  saved.value = snapshot();
  status.value = 'API key removed from OS keychain.';
}

watch(() => ai.status.value, (next) => {
  if (dirty.value) return;
  enabledDraft.value = next.enabled;
  limitDraft.value = next.dailyLimit;
});

const unregister = registerSettingsDraft('ai', {
  isDirty: () => dirty.value,
  discard: () => restoreDraft(),
});

onMounted(async () => {
  await profile.init();
  await ai.refresh();
  enabledDraft.value = ai.status.value.enabled;
  limitDraft.value = ai.status.value.dailyLimit;
  saved.value = snapshot();
});

onUnmounted(unregister);
</script>

<template>
  <div class="settings-section">
    <div class="sec-head">
      <h2>AI settings</h2>
      <span class="chip" :class="{ 'chip-ok': credentials?.configured }">
        {{ credentials?.configured ? 'Configured' : 'Not configured' }}
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
        />
        <datalist id="ai-model-suggestions">
          <option v-for="model in modelSuggestions" :key="model" :value="model"></option>
        </datalist>

        <div v-if="draft.provider === 'ollama'" class="key-saved-container">
          <span class="muted">Ollama runs locally and does not require an API key.</span>
        </div>
        <div v-else-if="credentials?.hasStoredKey && !replacingKey" class="key-saved-container">
          <span class="key-saved-line">Key saved in OS keychain</span>
          <div class="key-btn-group">
            <AppButton size="sm" @click="profile.startReplaceKey">Replace</AppButton>
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
          />
          <AppButton v-if="credentials?.hasStoredKey" size="sm" @click="profile.cancelReplaceKey">
            Cancel replacement
          </AppButton>
        </div>

        <label class="ai-switch-row settings-switch-row">
          <span>AI suggestions</span>
          <input v-model="enabledDraft" class="ai-switch" type="checkbox"
            aria-label="AI suggestions" />
        </label>

        <AppNumberInput
          id="ai-daily-limit"
          v-model="limitDraft"
          label="Daily call limit"
          :min="1"
          :max="1000"
          :step="1"
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
