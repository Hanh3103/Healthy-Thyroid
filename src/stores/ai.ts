/**
 * Pinia store: One Source of Truth for all AI settings and live state.
 *
 * Holds: enabled, provider, model, hasKey, dailyLimit, usageToday, lastError,
 * plus connection status and request tracking.
 * Listens for the "ai-config-changed" event emitted by Tauri in Rust.
 */
import { defineStore } from 'pinia';
import {
  cancelAiRequest,
  deleteAiKeyCommand,
  getAiStatus,
  providerLabel,
  saveAiConfigCommand,
  setAiDailyLimit as persistAiDailyLimit,
  setAiEnabled as persistAiEnabled,
  type AiStatus,
  type SaveAiConfigPartialInput,
} from '../shared/ai/aiStatus.ts';
import { testAiConnection } from '../shared/ai/api.ts';
import type { AIProvider } from '../shared/ai/model.ts';
import { tauriListen } from '../shared/platform.ts';

export type AiDot = 'none' | 'amber' | 'red' | 'gray';

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type AiStateFields = {
  busy: boolean;
  configured: boolean;
  enabled: boolean;
  lastError: string;
};

function aiStateLabel(state: AiStateFields): string {
  if (state.busy) return 'Working';
  if (!state.configured) return 'Not set up';
  if (!state.enabled) return 'Switched off';
  if (state.lastError) return 'Last request failed';
  return 'Configured';
}

function friendlyReason(error: unknown): string {
  const text = detail(error);
  if (/401|403|unauthor|api key|invalid key|rejected/i.test(text)) {
    return 'The API key was rejected. Check it in AI settings.';
  }
  if (/429|daily ai call limit|limit reached/i.test(text)) {
    return 'The daily AI call limit was reached. It resets tomorrow.';
  }
  if (/turned off|disabled/i.test(text)) return 'AI suggestions are switched off.';
  if (/cancel/i.test(text)) return 'The request was cancelled.';
  if (/network|timeout|connect|unreachable/i.test(text)) return 'The AI provider could not be reached.';
  return `The last request failed: ${text}`;
}

export const useAiStore = defineStore('ai', {
  state: () => ({
    // Core fields:
    enabled: true,
    provider: 'gemini' as AIProvider,
    model: 'gemini-3.5-flash-lite',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    hasKey: false,
    configured: false,
    dailyLimit: 30,
    usageToday: 0,
    lastError: '',
    apiKeyMasked: '',

    // Live state:
    busy: false,
    busyLabel: '',
    cancelRequested: false,
    testResult: '',
    lastResult: '',

    loaded: false,
    listening: false,
  }),

  getters: {
    dot: (state): AiDot => {
      if (state.busy) return 'none';
      if (!state.configured) return 'amber';
      if (!state.enabled) return 'gray';
      if (state.lastError) return 'red';
      return 'none';
    },

    stateLabel: (state): string => aiStateLabel(state),

    tooltip: (state): string => {
      return `AI: ${aiStateLabel(state)}. ${providerLabel(state.provider)}, ${state.model}.`;
    },

    providerAndModel: (state): string => {
      return `${providerLabel(state.provider)}, ${state.model}`;
    },

    usagePercent: (state): number => {
      return state.dailyLimit > 0
        ? Math.min(100, Math.round((state.usageToday / state.dailyLimit) * 100))
        : 0;
    },

    // Compatibility getters
    callCount: (state): number => state.usageToday,
    failureReason: (state): string => state.lastError,
    status: (state): AiStatus => ({
      configured: state.configured,
      enabled: state.enabled,
      hasKey: state.hasKey,
      provider: state.provider,
      model: state.model,
      endpoint: state.endpoint,
      apiKeyMasked: state.apiKeyMasked,
      callCount: state.usageToday,
      dailyLimit: state.dailyLimit,
    }),
  },

  actions: {
    applyStatus(s: AiStatus) {
      this.enabled = s.enabled;
      this.provider = s.provider;
      this.model = s.model;
      this.endpoint = s.endpoint;
      this.hasKey = s.hasKey;
      this.configured = s.configured;
      this.dailyLimit = s.dailyLimit;
      this.usageToday = s.callCount;
      this.apiKeyMasked = s.apiKeyMasked;
      this.loaded = true;
    },

    async initEventListener(): Promise<void> {
      if (this.listening) return;
      this.listening = true;
      await tauriListen('ai-config-changed', () => {
        void this.refresh();
      });
    },

    async load(): Promise<void> {
      await this.initEventListener();
      try {
        const s = await getAiStatus();
        this.applyStatus(s);
      } catch (e) {
        console.error('Failed to load AI status:', e);
      }
    },

    async refresh(): Promise<void> {
      await this.initEventListener();
      try {
        const s = await getAiStatus();
        this.applyStatus(s);
      } catch {
        // Keep last known status if command is unavailable
      }
    },

    async setEnabled(next: boolean): Promise<void> {
      const prev = this.enabled;
      this.enabled = next;
      this.testResult = '';
      try {
        const s = await persistAiEnabled(next);
        this.applyStatus(s);
        this.lastError = '';
        this.lastResult = next ? 'AI suggestions turned on.' : 'AI suggestions turned off.';
      } catch (error) {
        this.enabled = prev;
        this.lastError = `Could not save the AI setting: ${detail(error)}`;
      }
    },

    async setDailyLimit(limit: number): Promise<void> {
      const bounded = Math.min(1000, Math.max(1, Math.round(limit)));
      this.dailyLimit = bounded;
      try {
        const s = await persistAiDailyLimit(bounded);
        this.applyStatus(s);
      } catch (error) {
        this.lastError = `Could not save the daily limit: ${detail(error)}`;
        await this.refresh();
      }
    },

    async savePartial(fields: SaveAiConfigPartialInput): Promise<AiStatus> {
      try {
        const s = await saveAiConfigCommand(fields);
        this.applyStatus(s);
        this.lastError = '';
        return s;
      } catch (error) {
        this.lastError = `Failed to save AI settings: ${detail(error)}`;
        throw error;
      }
    },

    async deleteKey(): Promise<void> {
      try {
        const s = await deleteAiKeyCommand();
        this.applyStatus(s);
        this.lastError = '';
        this.lastResult = 'API key removed from OS keychain.';
      } catch (error) {
        this.lastError = `Failed to delete API key: ${detail(error)}`;
        throw error;
      }
    },

    async testConnection(): Promise<string> {
      try {
        const message = await this.runAi('Testing connection', testAiConnection);
        this.testResult = message;
        return message;
      } catch (error) {
        this.testResult = `Connection test failed: ${detail(error)}`;
        throw error;
      }
    },

    async cancel(): Promise<void> {
      this.cancelRequested = true;
      try {
        await cancelAiRequest();
      } catch {
        // Handled locally
      }
    },

    /** Wraps one AI request so the header reflects busy, success and failure. */
    async runAi<T>(label: string, task: () => Promise<T>): Promise<T> {
      this.busy = true;
      this.busyLabel = label;
      this.cancelRequested = false;
      try {
        const result = await task();
        this.lastError = '';
        this.lastResult = 'Last AI request succeeded.';
        return result;
      } catch (error) {
        this.lastError = friendlyReason(error);
        this.lastResult = '';
        throw error;
      } finally {
        this.busy = false;
        this.busyLabel = '';
        this.cancelRequested = false;
        await this.refresh();
      }
    },
  },
});
