/**
 * One confirm dialog for the whole app.
 *
 * Features await `requestConfirm(...)` instead of calling `window.confirm`,
 * so every destructive action gets the same styled dialog and keyboard-safe
 * Cancel default. This is deliberately a module-level service, not Pinia:
 * Pinia is reserved for cross-feature AI config.
 */
import { reactive } from 'vue';
import type { ConfirmRequest } from './confirmCopy';

export interface ConfirmState {
  open: boolean;
  request: ConfirmRequest | null;
}

const state = reactive<ConfirmState>({
  open: false,
  request: null,
});

let resolvePending: ((confirmed: boolean) => void) | null = null;

export function getConfirmState(): ConfirmState {
  return state;
}

export function requestConfirm(request: ConfirmRequest): Promise<boolean> {
  // If a second action opens a dialog, treat the first as cancelled.
  if (resolvePending) {
    const previous = resolvePending;
    resolvePending = null;
    previous(false);
  }

  state.request = request;
  state.open = true;
  return new Promise<boolean>((resolve) => {
    resolvePending = resolve;
  });
}

export function settleConfirm(confirmed: boolean): void {
  const resolve = resolvePending;
  if (!resolve) return;
  resolvePending = null;
  state.open = false;
  resolve(confirmed);
}
