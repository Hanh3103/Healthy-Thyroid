import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-resolve-loader.mjs', import.meta.url);

import { suggestEnergy, prioritizeTasks } from '../src/features/planner/api.ts';
import { updateShopping, requestDietPlan } from '../src/features/diet/api.ts';
import { saveAiCredentials, deleteAiKey, testAiConnection } from '../src/features/profile/api.ts';

test('AI features module exports typed command wrappers', () => {
  assert.equal(typeof suggestEnergy, 'function');
  assert.equal(typeof prioritizeTasks, 'function');
  assert.equal(typeof updateShopping, 'function');
  assert.equal(typeof requestDietPlan, 'function');
  assert.equal(typeof saveAiCredentials, 'function');
  assert.equal(typeof deleteAiKey, 'function');
  assert.equal(typeof testAiConnection, 'function');
});

test('suggestEnergy rejects in browser mode without tauri runtime', async () => {
  await assert.rejects(
    async () => suggestEnergy('Feeling low energy today'),
    /available only in the desktop app/
  );
});

test('prioritizeTasks rejects in browser mode without tauri runtime', async () => {
  await assert.rejects(
    async () => prioritizeTasks({
      energy: 2,
      today: '2026-11-23',
      weekday: 'Monday',
      tasks: [{ id: '1', title: 'Task 1' }],
    }),
    /available only in the desktop app/
  );
});

test('updateShopping rejects in browser mode without tauri runtime', async () => {
  await assert.rejects(
    async () => updateShopping({
      changedMeal: {
        date: '2026-11-23',
        slot: 'lunch',
        old: { idea: 'Salad', ingredients: ['lettuce'], prepMinutes: 5 },
        new: { idea: 'Curry', ingredients: ['rice', 'curry paste'], prepMinutes: 20 },
      },
      pantry: ['rice'],
      currentShoppingList: [],
    }),
    /available in the desktop app/
  );
});
