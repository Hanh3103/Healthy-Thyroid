import assert from 'node:assert/strict';
import test from 'node:test';

import { applyMealShoppingDelta, normalizeDietData } from '../src/features/diet/model.ts';

function item(overrides = {}) {
  return {
    id: overrides.id ?? `id-${Math.random()}`,
    name: 'Item',
    source: 'ai',
    status: 'open',
    inPlan: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test('meal edit delta keeps user/bought/removed, marks removed-needed as no longer in plan, adds new', () => {
  const existing = [
    item({ id: 'u1', name: 'Yogurt', source: 'user', inPlan: false }),
    item({ id: 'b1', name: 'Oats', source: 'ai', status: 'bought' }),
    item({ id: 'r1', name: 'Rice', source: 'ai', status: 'removed' }),
    item({ id: 'a1', name: 'Old pasta', source: 'ai', status: 'open', inPlan: true }),
  ];
  const { items, summary } = applyMealShoppingDelta(existing, ['Tomatoes', 'Oats'], ['Old pasta'], ['cheese']);
  const byName = Object.fromEntries(items.map((i) => [i.name, i]));

  assert.equal(byName['Yogurt'].source, 'user');
  assert.equal(byName['Oats'].status, 'bought'); // bought unchanged, not re-added
  assert.equal(byName['Rice'].status, 'removed');
  assert.equal(byName['Old pasta'].inPlan, false);
  assert.equal(byName['Tomatoes'].isNew, true);
  assert.equal(byName['Tomatoes'].status, 'open');
  assert.equal(byName['cheese'], undefined); // pantry item never added
  assert.deepEqual(summary, { added: 1, noLongerNeeded: 1 });
});

test('meal edit adds the affected day to an existing running-low row', () => {
  const day = '2026-11-23';
  const existing = [item({
    id: 'low', name: 'Oats', source: 'pantry', runningLow: true,
    inPlan: false, forDays: ['2026-11-21'],
  })];

  const { items, summary } = applyMealShoppingDelta(existing, ['oats'], [], [], [day]);
  const rows = items.filter((entry) => entry.name.toLowerCase() === 'oats');

  assert.equal(rows.length, 1, 'still one row for oats');
  assert.deepEqual(rows[0].forDays, ['2026-11-21', day]);
  assert.equal(rows[0].source, 'pantry');
  assert.equal(rows[0].runningLow, true);
  assert.equal(summary.added, 0, 'no duplicate was counted as added');
});

test('meal edit does not add items already in pantry or already present/removed', () => {
  const existing = [
    item({ id: 'r1', name: 'Rice', source: 'ai', status: 'removed' }),
    item({ id: 'o1', name: 'Beans', source: 'ai', status: 'open', inPlan: true }),
  ];
  const { items, summary } = applyMealShoppingDelta(existing, ['Rice', 'Beans', 'Eggs'], [], ['eggs']);
  const names = items.map((i) => i.name);
  assert.deepEqual(names.sort(), ['Beans', 'Rice']);
  assert.deepEqual(summary, { added: 0, noLongerNeeded: 0 });
});

test('normalized planned meal keeps source and editedAt', () => {
  const data = normalizeDietData({
    dayPlans: {
      '2026-11-21': {
        date: '2026-11-21',
        summary: 's',
        meals: [{ id: 'm1', day: '2026-11-21', slot: 'lunch', kind: 'main', idea: 'Soup', prepMinutes: 10, why: 'easy', ingredients: ['lentils'], factIds: [], status: 'planned', source: 'user', editedAt: 123 }],
        timingNotes: [], urgent: false,
        context: { date: '2026-11-21', energy: 'medium', busyness: 'normal', totalMinutes: 0, taskCount: 0 },
        source: 'offline', generatedAt: 1, shoppingList: [], range: 'today',
      },
    },
  }, []);
  const meal = data.dayPlans['2026-11-21'].meals[0];
  assert.equal(meal.source, 'user');
  assert.equal(meal.editedAt, 123);
  assert.deepEqual(meal.ingredients, ['lentils']);
});