/**
 * Pinia store for the one piece of state shared across features: the AI config.
 * Profile owns/edits it; Planner consumes it when prioritising tasks.
 */
import { defineStore } from 'pinia';
import { loadAiConfig, saveAiConfig } from '../features/profile/api';
import { emptyConfig, isConfigComplete, type AIConfig } from '../features/profile/model';

function envConfig(): AIConfig {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const geminiKey = env?.VITE_GEMINI_API_KEY?.trim();
  return {
    provider: (env?.VITE_AI_PROVIDER?.trim()
      || (geminiKey ? 'gemini' : '')
      || 'custom') as AIConfig['provider'],
    apiKey: env?.VITE_AI_API_KEY?.trim() || geminiKey || '',
    endpoint: env?.VITE_AI_ENDPOINT?.trim() || '',
    model: env?.VITE_AI_MODEL?.trim() || '',
  };
}

/** Environment values fill in blanks left by persisted config. */
function mergeWithEnv(persisted: AIConfig): AIConfig {
  const env = envConfig();
  return {
    provider: persisted.provider !== 'custom' ? persisted.provider : env.provider,
    apiKey: persisted.apiKey || env.apiKey,
    endpoint: persisted.endpoint || env.endpoint,
    model: persisted.model || env.model,
  };
}

export const useAiStore = defineStore('ai', {
  state: () => ({
    config: emptyConfig() as AIConfig,
    loaded: false,
  }),
  getters: {
    isComplete: (state): boolean => isConfigComplete(state.config),
  },
  actions: {
    /** Loads persisted config once and merges environment fallbacks. */
    async load(): Promise<void> {
      if (this.loaded) return;
      this.config = mergeWithEnv(await loadAiConfig());
      this.loaded = true;
    },
    /** Saves a new config (also updates the shared reactive state). */
    async save(config: AIConfig): Promise<void> {
      await saveAiConfig(config);
      this.config = mergeWithEnv(config);
    },
    /** Reverts the in-memory config to the last persisted value. */
    async reload(): Promise<void> {
      this.loaded = false;
      await this.load();
    },
  },
});
