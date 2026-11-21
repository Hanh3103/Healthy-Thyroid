/**
 * Copy for confirmations. Framework-free so wording can be unit tested and
 * every destructive action uses the same shape.
 */
export type ConfirmTone = 'danger' | 'primary';

export interface ConfirmRequest {
  title: string;
  description: string;
  /** Called out in bold so the thing being changed is unambiguous. */
  subject?: string;
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

function named(value: string, fallback: string): string {
  return value.trim() || fallback;
}

export function removeHabitConfirm(name: string): ConfirmRequest {
  return {
    title: 'Remove habit?',
    description: 'This habit and its logged history will be removed.',
    subject: named(name, 'Untitled habit'),
    warning: 'This cannot be undone.',
    confirmLabel: 'Remove habit',
    cancelLabel: 'Cancel',
    tone: 'danger',
  };
}

export function archiveThyroidTestConfirm(name: string): ConfirmRequest {
  return {
    title: 'Archive test?',
    description: 'This custom test will be archived.',
    subject: named(name, 'Untitled test'),
    warning: 'Existing results keep their values.',
    confirmLabel: 'Archive test',
    cancelLabel: 'Cancel',
    tone: 'primary',
  };
}

export function deleteThyroidResultConfirm(date: string): ConfirmRequest {
  return {
    title: 'Delete blood result?',
    description: 'This result will be deleted from your history.',
    subject: named(date, 'this date'),
    warning: 'This cannot be undone.',
    confirmLabel: 'Delete result',
    cancelLabel: 'Cancel',
    tone: 'danger',
  };
}
