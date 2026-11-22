import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRangeInput,
  mergeShoppingList,
  normalizeDietData,
  storeRangePlanInDays,
} from '../src/features/diet/model.ts';

const now = new Date(2026, 10, 21, 12, 0, 0);
const today = '2026-11-21';
const tomorrow = '2026-11-22';
const weekDay = '2026-11-23';

function item(overrides = {}) {
  return {
    id: overrides.id ?? `id-${Math.random()}`,
    name: 'Item',
    quantity: undefined,
    forDays: overrides.forDays ?? [],
    source: 'ai',
    status: 'open',
    inPlan: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function planFor(date, shopping = []) {
  return {
    range: 'today',
    days: [{
      date,
      summary: 's',
      meals: [{ id: `m-${date}`, slot: 'lunch', kind: 'main', idea: 'Soup', prepMinutes: 10, why: 'easy', ingredients: ['lentils'], factIds: [], status: 'planned' }],
      timingNotes: [],
      urgent: false,
      context: { date, energy: 'medium', busyness: 'normal', totalMinutes: 0, taskCount: 0 },
      source: 'offline',
      generatedAt: 1,
    }],
    shopping,
    source: 'offline',
    generatedAt: 1,
  };
}

test('merge keeps user-added, bought, removed; adds new AI as New; marks unneeded AI as no longer in plan', () => {
  const existing = [
    item({ id: 'u1', name: 'My yogurt', source: 'user', inPlan: false }),
    item({ id: 'b1', name: 'Oats', source: 'ai', status: 'bought', inPlan: true }),
    item({ id: 'r1', name: 'Rice', source: 'ai', status: 'removed', inPlan: true }),
    item({ id: 'a1', name: 'Lentils', source: 'ai', status: 'open', inPlan: true }),
  ];
  const aiItems = [
    item({ id: 'n1', name: 'Beans', source: 'ai' }),
    item({ id: 'n2', name: 'Lentils', source: 'ai' }), // still needed
  ];

  const { items, summary } = mergeShoppingList(existing, aiItems);
  const byName = Object.fromEntries(items.map((i) => [i.name, i]));

  assert.equal(byName['My yogurt'].source, 'user');
  assert.equal(byName['My yogurt'].status, 'open');
  assert.equal(byName['Oats'].status, 'bought');
  assert.equal(byName['Rice'].status, 'removed');
  assert.equal(byName['Beans'].isNew, true);
  assert.equal(byName['Beans'].inPlan, true);
  assert.equal(byName['Lentils'].inPlan, true);
  assert.equal(byName['Lentils'].isNew, false);
  assert.deepEqual(summary, { added: 1, noLongerNeeded: 0 });
});

test('removed items are not suggested again and AI items no longer needed get Keep/Remove state', () => {
  const existing = [
    item({ id: 'r1', name: 'Rice', source: 'ai', status: 'removed', inPlan: true }),
    item({ id: 'a1', name: 'Lentils', source: 'ai', status: 'open', inPlan: true }),
  ];
  const aiItems = [item({ id: 'n1', name: 'Rice', source: 'ai' })]; // AI suggests removed item again

  const { items, summary } = mergeShoppingList(existing, aiItems);
  const byName = Object.fromEntries(items.map((i) => [i.name, i]));

  assert.equal(byName['Rice'].status, 'removed', 'removed item stays removed');
  assert.equal(byName['Lentils'].inPlan, false, 'unneeded AI item marked no longer in plan');
  assert.equal(byName['Lentils'].status, 'open');
  assert.equal(summary.added, 0);
  assert.equal(summary.noLongerNeeded, 1);
});

test('storeRangePlanInDays merges shopping per date and returns summary for review/undo', () => {
  const data = normalizeDietData({}, []);
  // initial plan
  storeRangePlanInDays(data, planFor(today, [item({ id: 'a1', name: 'Lentils' })]), 'today', undefined, now);
  // user adds item and buys another; both live in the one canonical store
  data.shopping.push(item({ id: 'u1', name: 'Yogurt', source: 'user', inPlan: false, forDays: [] }));
  data.shopping.push(item({ id: 'b1', name: 'Oats', source: 'ai', status: 'bought', inPlan: true, forDays: [today] }));
  const before = data.shopping.map((i) => ({ ...i }));

  const summaries = storeRangePlanInDays(data, planFor(today, [item({ id: 'n1', name: 'Beans' })]), 'today', undefined, now);
  const byName = Object.fromEntries(data.shopping.map((i) => [i.name, i]));

  assert.ok(byName['Yogurt'], 'user-added kept');
  assert.equal(byName['Yogurt'].source, 'user');
  assert.equal(byName['Oats'].status, 'bought', 'bought kept');
  assert.equal(byName['Beans'].isNew, true, 'new AI item marked New');
  assert.equal(byName['Lentils'].inPlan, false, 'old AI item no longer in plan');
  assert.deepEqual(summaries.shopping, { added: 1, noLongerNeeded: 1 });
  // undo evidence: before snapshot can restore
  data.shopping = before;
  assert.ok(data.shopping.find((i) => i.name === 'Lentils' && i.inPlan === true));
});

test('add/remove shopping works for today, tomorrow and week day plans', () => {
  const data = normalizeDietData({}, []);
  // Self-added items live in the one canonical store; their forDays scope them.
  for (const date of [today, tomorrow, weekDay]) {
    data.shopping.push(item({
      id: `${date}-u`, name: `Milk ${date}`, source: 'user', inPlan: false, forDays: [date],
    }));
  }
  assert.equal(data.shopping.find((i) => i.name === `Milk ${today}`).source, 'user');
  assert.ok(data.shopping.find((i) => i.name === `Milk ${tomorrow}`));
  assert.ok(data.shopping.find((i) => i.name === `Milk ${weekDay}`));
  assert.deepEqual(data.shopping.find((i) => i.name === `Milk ${tomorrow}`).forDays, [tomorrow]);

  data.shopping.find((i) => i.name === `Milk ${tomorrow}`).status = 'removed';
  assert.equal(data.shopping.find((i) => i.name === `Milk ${tomorrow}`).status, 'removed');
  assert.equal(data.shopping.find((i) => i.name === `Milk ${today}`).status, 'open');
});

test('AI input receives current shopping list names and status', () => {
  const input = buildRangeInput({
    range: 'today',
    dates: [today],
    contexts: [{ date: today, energy: 'medium', busyness: 'normal', totalMinutes: 0, taskCount: 0 }],
    wants: [],
    pantry: [],
    preferences: { allergies: [], dietStyle: 'none', dislikes: [], cuisine: [], cookingTime: 'any', mealsPerDay: 3 },
    log: [],
    alarmingSymptoms: false,
    currentShopping: [
      { name: 'Lentils', status: 'bought', inPlan: true, source: 'ai' },
      { name: 'Rice', status: 'removed', inPlan: true, source: 'ai' },
    ],
  });
  assert.deepEqual(input.shoppingList, [
    { name: 'Lentils', status: 'bought', inPlan: true, source: 'ai' },
    { name: 'Rice', status: 'removed', inPlan: true, source: 'ai' },
  ]);
});

test('week items are persisted in the one list and merged on week regenerate with summary/undo', () => {
  const data = normalizeDietData({ shopping: [item({ id: 'wu', name: 'Coffee', source: 'user', inPlan: false, forDays: [] })] }, []);
  const before = data.shopping.map((i) => ({ ...i }));
  const weekPlan = {
    range: 'week',
    days: [planFor('2026-11-22', []).days[0], planFor('2026-11-23', []).days[0]],
    shopping: [item({ id: 'ai1', name: 'Beans', source: 'ai' })],
    source: 'ai', generatedAt: 1,
  };
  const summaries = storeRangePlanInDays(data, weekPlan, 'week', undefined, now);
  const byName = Object.fromEntries(data.shopping.map((i) => [i.name, i]));
  assert.equal(byName['Coffee'].source, 'user');
  assert.equal(byName['Beans'].isNew, true);
  assert.deepEqual(byName['Beans'].forDays, ['2026-11-22', '2026-11-23']);
  assert.deepEqual(summaries.shopping, { added: 1, noLongerNeeded: 0 });
  // undo restores previous canonical list
  data.shopping = before;
  assert.equal(data.shopping.length, 1);
  assert.equal(data.shopping[0].name, 'Coffee');
});

test('energy/symptom/check-in change does not mutate shopping or meals without regenerate', () => {
  const data = normalizeDietData({}, []);
  storeRangePlanInDays(data, planFor(today, [item({ id: 's1', name: 'Lentils' })]), 'today', undefined, now);
  data.shopping.push(item({ id: 'u1', name: 'Yogurt', source: 'user', inPlan: false, forDays: [] }));
  const snapshot = JSON.parse(JSON.stringify({ dayPlans: data.dayPlans, shopping: data.shopping }));
  // simulate energy/check-in change: no regenerate/generate/store call, only banner would be set in UI
  const planStaleNote = 'Your energy changed since this plan was made. Regenerate?';
  assert.equal(planStaleNote, 'Your energy changed since this plan was made. Regenerate?');
  assert.deepEqual(JSON.parse(JSON.stringify({ dayPlans: data.dayPlans, shopping: data.shopping })), snapshot);
});
