/**
 * Profile feature model.
 *
 * Owns the AI provider presets and the shape/validation of the shared AI
 * configuration. Pure data + rules only — no persistence and no Vue.
 */

export type AIProvider = 'custom' | 'openai' | 'gemini' | 'claude' | 'mistral' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  endpoint: string;
  model: string;
}

export interface ProviderPreset {
  endpoint: string;
  model: string;
}

/** Built-in presets; `custom` has no preset because the user supplies everything. */
export const AI_ENDPOINTS: Record<Exclude<AIProvider, 'custom'>, ProviderPreset> = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-3.5-flash' },
  claude: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-haiku-latest' },
  mistral: { endpoint: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' },
  ollama: { endpoint: 'http://localhost:11434/api/chat', model: 'llama3.2' },
};

export const AI_PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: 'custom', label: 'Custom' },
  { value: 'openai', label: 'OpenAI / GPT' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'claude', label: 'Anthropic Claude' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'ollama', label: 'Ollama' },
];

export function emptyConfig(): AIConfig {
  return { provider: 'custom', apiKey: '', endpoint: '', model: '' };
}

/** Returns the preset for a known provider, or null for `custom`. */
export function presetFor(provider: AIProvider): ProviderPreset | null {
  return provider === 'custom' ? null : AI_ENDPOINTS[provider];
}

/** Applies a provider preset to a config, leaving `custom` untouched. */
export function withPreset(config: AIConfig, provider: AIProvider): AIConfig {
  const preset = presetFor(provider);
  return preset
    ? { ...config, provider, endpoint: preset.endpoint, model: preset.model }
    : { ...config, provider };
}

/** Coerces persisted/user input into a valid config. */
export function normalizeConfig(value: unknown): AIConfig {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const provider = typeof raw.provider === 'string' && raw.provider in AI_ENDPOINTS
    ? raw.provider as AIProvider
    : raw.provider === 'custom' ? 'custom' : 'custom';
  return {
    provider,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
    endpoint: typeof raw.endpoint === 'string' ? raw.endpoint.trim() : '',
    model: typeof raw.model === 'string' ? raw.model.trim() : '',
  };
}

/** True when a config has everything required to make an AI request. */
export function isConfigComplete(config: AIConfig): boolean {
  if (!config.endpoint || !config.model) return false;
  return config.provider === 'ollama' || config.apiKey.length > 0;
}
