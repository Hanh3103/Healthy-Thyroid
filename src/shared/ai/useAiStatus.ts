/**
 * Shared AI status for the header button and every AI caller.
 *
 * A single module-level state keeps the popover truthful: any feature can wrap
 * its request in `runAi()` and the dot, busy spinner and failure line update
 * without a parallel status store.
 */
import { computed, ref } from 'vue';
import {
  cancelAiRequest,
  defaultAiStatus,
  getAiStatus,
  providerLabel,
  setAiDailyLimit as persistAiDailyLimit,
  setAiEnabled as persistAiEnabled,
  type AiStatus,
} from '../../features/profile/aiStatus.ts';
import { testAiConnection } from '../../features/profile/api.ts';

const status = ref<AiStatus>(defaultAiStatus());
const busy = ref(false);
const busyLabel = ref('');
const cancelRequested = ref(false);
const failureReason = ref('');
const testResult = ref('');
const lastResult = ref('');

export type AiDot = 'none' | 'amber' | 'red' | 'gray';

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export function useAiStatus() {
  const dot = computed<AiDot>(() => {
    if (busy.value) return 'none';
    if (!status.value.configured) return 'amber';
    if (!status.value.enabled) return 'gray';
    if (failureReason.value) return 'red';
    return 'none';
  });

  const stateLabel = computed(() => {
    if (busy.value) return 'Working';
    if (!status.value.configured) return 'Not set up';
    if (!status.value.enabled) return 'Switched off';
    if (failureReason.value) return 'Last request failed';
    return 'Configured';
  });

  const tooltip = computed(() =>
    `AI: ${stateLabel.value}. ${providerLabel(status.value.provider)}, ${status.value.model}.`);

  async function refresh(): Promise<void> {
    try {
      status.value = await getAiStatus();
    } catch {
      // Keep the last known status when the desktop command is unavailable.
    }
  }

  /** Wraps one AI request so the header reflects busy, success and failure. */
  async function runAi<T>(label: string, task: () => Promise<T>): Promise<T> {
    busy.value = true;
    busyLabel.value = label;
    cancelRequested.value = false;
    try {
      const result = await task();
      failureReason.value = '';
      lastResult.value = 'Last AI request succeeded.';
      return result;
    } catch (error) {
      failureReason.value = friendlyReason(error);
      lastResult.value = '';
      throw error;
    } finally {
      busy.value = false;
      busyLabel.value = '';
      cancelRequested.value = false;
      await refresh();
    }
  }

  async function setEnabled(next: boolean): Promise<void> {
    const previous = status.value.enabled;
    status.value = { ...status.value, enabled: next };
    testResult.value = '';
    try {
      status.value = await persistAiEnabled(next);
      failureReason.value = '';
      lastResult.value = next ? 'AI suggestions turned on.' : 'AI suggestions turned off.';
    } catch (error) {
      status.value = { ...status.value, enabled: previous };
      failureReason.value = `Could not save the AI setting: ${detail(error)}`;
    }
  }

  async function setDailyLimit(limit: number): Promise<void> {
    const bounded = Math.min(1000, Math.max(1, Math.round(limit)));
    status.value = { ...status.value, dailyLimit: bounded };
    try {
      status.value = await persistAiDailyLimit(bounded);
    } catch (error) {
      failureReason.value = `Could not save the daily limit: ${detail(error)}`;
      await refresh();
    }
  }

  async function cancel(): Promise<void> {
    cancelRequested.value = true;
    try {
      await cancelAiRequest();
    } catch {
      // The request still finishes locally, but the user's intent is recorded.
    }
  }

  async function testConnection(): Promise<string> {
    try {
      const message = await runAi('Testing connection', testAiConnection);
      testResult.value = message;
      return message;
    } catch (error) {
      testResult.value = `Connection test failed: ${detail(error)}`;
      throw error;
    }
  }

  return {
    status,
    busy,
    busyLabel,
    cancelRequested,
    failureReason,
    testResult,
    lastResult,
    dot,
    stateLabel,
    tooltip,
    refresh,
    runAi,
    setEnabled,
    setDailyLimit,
    cancel,
    testConnection,
  };
}
