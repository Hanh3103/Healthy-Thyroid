/**
 * Unsaved-change guard shared by every Settings section.
 *
 * Sections register a dirty check and a way to discard their draft. The router
 * asks once before leaving a section (including switching to another section),
 * using the same custom confirm dialog as destructive actions elsewhere.
 */
import { requestConfirm } from '../../shared/ui/useConfirm';

export interface SettingsDraftGuard {
  isDirty(): boolean;
  discard(): void;
}

const guards = new Map<string, SettingsDraftGuard>();

export function registerSettingsDraft(id: string, guard: SettingsDraftGuard): () => void {
  guards.set(id, guard);
  return () => guards.delete(id);
}

export function hasUnsavedSettings(): boolean {
  return [...guards.values()].some((guard) => guard.isDirty());
}

/** Called after the user explicitly chooses to leave and discard. */
export function discardSettingsDrafts(): void {
  for (const guard of guards.values()) guard.discard();
}

export async function confirmLeaveSettings(): Promise<boolean> {
  if (!hasUnsavedSettings()) return true;
  return requestConfirm({
    title: 'Leave with unsaved changes?',
    description: 'Your changes in this section have not been saved.',
    subject: 'Unsaved settings',
    warning: 'Choose Cancel to stay and save your changes.',
    confirmLabel: 'Leave without saving',
    cancelLabel: 'Stay here',
    tone: 'danger',
  });
}
