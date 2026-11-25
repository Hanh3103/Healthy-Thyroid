/**
 * Shared AI status adapter for the header button and every AI caller.
 *
 * Backed by the single Pinia useAiStore, so the popover, Settings page,
 * AI status dot and AI features all read from and write to the same store.
 * Labels: 'Configured', 'Not set up', 'Switched off', 'Last request failed'.
 */
import { createPinia, getActivePinia, setActivePinia, storeToRefs } from 'pinia';
import { useAiStore, type AiDot } from '../../stores/ai.ts';

export type { AiDot };

function getStore() {
  if (!getActivePinia()) {
    setActivePinia(createPinia());
  }
  return useAiStore();
}

export function useAiStatus() {
  const store = getStore();
  const refs = storeToRefs(store);

  async function refresh(): Promise<void> {
    return store.refresh();
  }

  async function runAi<T>(label: string, task: () => Promise<T>): Promise<T> {
    return store.runAi(label, task);
  }

  async function setEnabled(next: boolean): Promise<void> {
    return store.setEnabled(next);
  }

  async function setDailyLimit(limit: number): Promise<void> {
    return store.setDailyLimit(limit);
  }

  async function cancel(): Promise<void> {
    return store.cancel();
  }

  async function testConnection(): Promise<string> {
    return store.testConnection();
  }

  return {
    store,
    // Core state & computed getters
    enabled: refs.enabled,
    provider: refs.provider,
    model: refs.model,
    endpoint: refs.endpoint,
    hasKey: refs.hasKey,
    configured: refs.configured,
    dailyLimit: refs.dailyLimit,
    usageToday: refs.usageToday,
    lastError: refs.lastError,
    apiKeyMasked: refs.apiKeyMasked,
    busy: refs.busy,
    busyLabel: refs.busyLabel,
    cancelRequested: refs.cancelRequested,
    testResult: refs.testResult,
    lastResult: refs.lastResult,
    dot: refs.dot,
    stateLabel: refs.stateLabel,
    tooltip: refs.tooltip,
    providerAndModel: refs.providerAndModel,
    usagePercent: refs.usagePercent,
    status: refs.status,
    callCount: refs.callCount,
    failureReason: refs.failureReason,

    // Actions
    refresh,
    load: () => store.load(),
    runAi,
    setEnabled,
    setDailyLimit,
    savePartial: (fields: Parameters<typeof store.savePartial>[0]) => store.savePartial(fields),
    deleteKey: () => store.deleteKey(),
    cancel,
    testConnection,
  };
}
