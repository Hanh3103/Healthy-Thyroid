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

/** Exact count is shown in the title so the destructive scope is obvious. */
export function clearPantryConfirm(count: number): ConfirmRequest {
  return {
    title: `Remove all ${count} items?`,
    description: 'This empties your saved At home list. Shopping suggestions will change.',
    subject: 'At home',
    warning: 'This cannot be undone.',
    confirmLabel: 'Remove all',
    cancelLabel: 'Cancel',
    tone: 'danger',
  };
}

/** Profile data deletion includes the pantry because it is part of diet data. */
export function deleteMyDataConfirm(): ConfirmRequest {
  return {
    title: 'Delete my data?',
    description: 'Your saved pantry, plans, shopping list and food log will be removed from this device.',
    subject: 'All saved diet data',
    warning: 'This cannot be undone. AI provider settings stay in the desktop app.',
    confirmLabel: 'Delete my data',
    cancelLabel: 'Cancel',
    tone: 'danger',
  };
}
