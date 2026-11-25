/**
 * Shared AI configuration model.
 *
 * The API key is entered in Settings but is stored only in Rust app-data
 * and never returned to Vue. The frontend only handles provider/endpoint/model
 * and a masked status.
 */
export type AIProvider = 'custom' | 'openai' | 'gemini' | 'claude' | 'mistral' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
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
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-3.5-flash-lite' },
  claude: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-haiku-latest' },
  mistral: { endpoint: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' },
  ollama: { endpoint: 'http://localhost:11434/api/chat', model: 'llama3.2' },
};

export const AI_PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: 'openai', label: 'OpenAI / compatible' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'claude', label: 'Anthropic Claude' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'custom', label: 'Custom' },
];

/** Examples offered as a datalist while still allowing any model name. */
export const MODEL_SUGGESTIONS: Record<AIProvider, readonly string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  gemini: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.5-pro'],
  claude: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
  mistral: ['mistral-small-latest', 'mistral-medium-latest'],
  ollama: ['llama3.2', 'mistral', 'gemma2'],
  custom: [],
};

/**
 * Front-end mirror of the Rust endpoint allowlist. The Rust client validates
 * again before every request; this gives immediate feedback in Settings.
 */
export function endpointError(provider: AIProvider, endpoint: string): string {
  const value = endpoint.trim();
  if (!value) return 'Enter an endpoint URL.';
  const local = value.startsWith('http://localhost') || value.startsWith('http://127.0.0.1');
  if (provider === 'gemini') {
    return value.startsWith('https://generativelanguage.googleapis.com')
      ? ''
      : 'Gemini endpoints must be on https://generativelanguage.googleapis.com.';
  }
  if (provider === 'claude') {
    return value.startsWith('https://api.anthropic.com')
      ? ''
      : 'Claude endpoints must be on https://api.anthropic.com.';
  }
  if (provider === 'ollama') {
    return local || value.startsWith('https://')
      ? ''
      : 'Ollama endpoints must be local (localhost or 127.0.0.1) or use HTTPS.';
  }
  return value.startsWith('https://') || local
    ? ''
    : 'Remote endpoints must use HTTPS. Localhost is allowed for testing.';
}

export interface AiCredentialsStatus {
  configured: boolean;
  source: 'app_data' | 'environment' | 'none';
  provider: AIProvider;
  endpoint: string;
  model: string;
  apiKeyMasked: string;
  hasStoredKey: boolean;
}

export function emptyConfig(): AIConfig {
  return { provider: 'openai', endpoint: AI_ENDPOINTS.openai.endpoint, model: AI_ENDPOINTS.openai.model };
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

/** Complete when endpoint/model present and provider not custom-empty; key checked separately in Rust. */
export function isConfigComplete(config: AIConfig): boolean {
  return !!config.endpoint.trim() && !!config.model.trim();
}

/** Coerces persisted/user input into a valid config. Never includes an API key. */
export function normalizeConfig(value: unknown): AIConfig {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const provider = typeof raw.provider === 'string' && raw.provider in AI_ENDPOINTS
    ? raw.provider as AIProvider
    : raw.provider === 'custom' ? 'custom' : 'openai';
  const base = emptyConfig();
  return {
    provider,
    endpoint: typeof raw.endpoint === 'string' && raw.endpoint.trim() ? raw.endpoint.trim() : base.endpoint,
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : base.model,
  };
}
