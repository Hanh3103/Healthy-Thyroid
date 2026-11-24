/**
 * Full AI status boundary for the header popover.
 *
 * Rust owns the API key, the on/off flag and the daily call counter. This
 * module only reads the key-free status and toggles the switch, so the raw
 * key is never fetched into Vue.
 */
import { isTauri, tauriInvoke } from '../../shared/platform.ts';
import { AI_PROVIDER_OPTIONS, type AIProvider } from './model.ts';

export interface AiStatus {
  configured: boolean;
  enabled: boolean;
  hasKey: boolean;
  provider: AIProvider;
  model: string;
  endpoint: string;
  callCount: number;
  dailyLimit: number;
}

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_LIMIT = 30;

const PROVIDER_LABELS: Record<AIProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  claude: 'Claude',
  mistral: 'Mistral',
  ollama: 'Ollama',
  custom: 'Custom',
};

/** Browser preview status: shows the example model and a 30-call allowance. */
export function defaultAiStatus(): AiStatus {
  return {
    configured: false,
    enabled: true,
    hasKey: false,
    provider: 'gemini',
    model: GEMINI_MODEL,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    callCount: 0,
    dailyLimit: DEFAULT_LIMIT,
  };
}

function isBool(value: unknown): boolean {
  return value === true || value === 'true';
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function asProvider(value: unknown): AIProvider {
  if (typeof value === 'string' && AI_PROVIDER_OPTIONS.some((option) => option.value === value)) {
    return value as AIProvider;
  }
  return 'gemini';
}

/** Accepts both the Rust camelCase status and older partial payloads. */
export function normalizeAiStatus(raw: unknown): AiStatus {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const fallback = defaultAiStatus();
  const model = typeof value.model === 'string' && value.model.trim()
    ? value.model.trim()
    : fallback.model;
  return {
    configured: isBool(value.configured) || isBool(value.hasStoredKey),
    enabled: value.enabled !== false && value.enabled !== 'false',
    hasKey: isBool(value.hasKey) || isBool(value.hasStoredKey),
    provider: asProvider(value.provider),
    model,
    endpoint: typeof value.endpoint === 'string' ? value.endpoint : fallback.endpoint,
    callCount: numberOr(value.callCount, 0),
    dailyLimit: numberOr(value.dailyLimit, DEFAULT_LIMIT),
  };
}

export async function getAiStatus(): Promise<AiStatus> {
  if (!isTauri()) return defaultAiStatus();
  return normalizeAiStatus(await tauriInvoke<unknown>('ai_status', {}));
}

/** The switch is saved as soon as it changes; no Save button in the popover. */
export async function setAiEnabled(enabled: boolean): Promise<AiStatus> {
  if (!isTauri()) return { ...defaultAiStatus(), enabled };
  return normalizeAiStatus(await tauriInvoke<unknown>('set_ai_enabled', { enabled }));
}

export async function setAiDailyLimit(limit: number): Promise<AiStatus> {
  const bounded = Math.min(1000, Math.max(1, Math.round(limit)));
  if (!isTauri()) return { ...defaultAiStatus(), dailyLimit: bounded };
  return normalizeAiStatus(await tauriInvoke<unknown>('set_ai_daily_limit', { limit: bounded }));
}

export async function cancelAiRequest(): Promise<void> {
  if (!isTauri()) return;
  await tauriInvoke('cancel_ai_request', {});
}

export function providerLabel(provider: AIProvider): string {
  return PROVIDER_LABELS[provider] ?? 'Custom';
}
