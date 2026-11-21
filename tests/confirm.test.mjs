import assert from 'node:assert/strict';
import test from 'node:test';

import {
  archiveThyroidTestConfirm,
  deleteThyroidResultConfirm,
  removeHabitConfirm,
} from '../src/shared/ui/confirmCopy.ts';
import {
  getConfirmState,
  requestConfirm,
  settleConfirm,
} from '../src/shared/ui/useConfirm.ts';

test('remove habit confirm names the habit and warns it cannot be undone', () => {
  assert.deepEqual(removeHabitConfirm('  Morning routine  '), {
    title: 'Remove habit?',
    description: 'This habit and its logged history will be removed.',
    subject: 'Morning routine',
    warning: 'This cannot be undone.',
    confirmLabel: 'Remove habit',
    cancelLabel: 'Cancel',
    tone: 'danger',
  });
});

test('other confirmations use the same dialog shape with their own copy', () => {
  assert.deepEqual(archiveThyroidTestConfirm('TSH'), {
    title: 'Archive test?',
    description: 'This custom test will be archived.',
    subject: 'TSH',
    warning: 'Existing results keep their values.',
    confirmLabel: 'Archive test',
    cancelLabel: 'Cancel',
    tone: 'primary',
  });
  assert.deepEqual(deleteThyroidResultConfirm('2026-11-21'), {
    title: 'Delete blood result?',
    description: 'This result will be deleted from your history.',
    subject: '2026-11-21',
    warning: 'This cannot be undone.',
    confirmLabel: 'Delete result',
    cancelLabel: 'Cancel',
    tone: 'danger',
  });
});

test('requestConfirm opens shared state and resolves to the chosen button', async () => {
  const state = getConfirmState();
  const request = removeHabitConfirm('Evening stretch');

  const cancelled = requestConfirm(request);
  assert.equal(state.open, true);
  assert.deepEqual(state.request, request);
  settleConfirm(false);
  assert.equal(await cancelled, false);
  assert.equal(state.open, false);

  const confirmed = requestConfirm(request);
  settleConfirm(true);
  assert.equal(await confirmed, true);
  assert.equal(state.open, false);
});
