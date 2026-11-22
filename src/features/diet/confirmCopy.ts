/** Confirmation copy for deleting an editable diet-log entry. */
import type { ConfirmRequest } from '../../shared/ui/confirmCopy';

export function deleteActualConfirm(text: string): ConfirmRequest {
  return {
    title: 'Delete food entry?',
    description: 'This entry will be removed from your saved diet log.',
    subject: text.trim().slice(0, 80) || 'this entry',
    warning: 'This cannot be undone.',
    confirmLabel: 'Delete entry',
    cancelLabel: 'Cancel',
    tone: 'danger',
  };
}
