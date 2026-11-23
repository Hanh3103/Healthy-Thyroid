/**
 * Pinia store for the local AI marker.
 *
 * The Diet Advisor's provider, model and API key are configured only in the
 * Rust process environment. This store keeps a small, key-free marker so older
 * saved profiles still load; it never calls an AI provider or reads VITE_* keys.
 */
import { defineStore } from 'pinia';
import { loadAiConfig, saveAiConfig } from '../features/profile/api';
import { emptyConfig, isConfigComplete, type AIConfig } from '../features/profile/model';

export const useAiStore = defineStore('ai', {
  state: () => ({
    config: emptyConfig() as AIConfig,
    loaded: false,
  }),
  getters: {
    isComplete: (state): boolean => isConfigComplete(state.config),
  },
  actions: {
    async load(): Promise<void> {
      if (this.loaded) return;
      this.config = await loadAiConfig();
      this.loaded = true;
    },
    async save(config: AIConfig): Promise<void> {
      await saveAiConfig(config);
      this.config = config;
    },
    async reload(): Promise<void> {
      this.loaded = false;
      await this.load();
    },
  },
});
