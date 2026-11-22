import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyMealShoppingDelta,
  combineQuantities,
  countShoppingForDate,
  isBasicShoppingItem,
  markBought,
  mergeShoppingList,
  normalizeDietData,
  storeRangePlanInDays,
} from '../src/features/diet/model.ts';

const today = '2026-11-21';
const monday = '2026-11-24';
const now = new Date(2026, 10, 21, 12);

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

function context(date) {
  return { date, energy: 'medium', busyness: 'normal', totalMinutes: 0, taskCount: 0 };
}

function plan(dates, shopping) {
  return {
    range: 'week',
    days: dates.map((date) => ({
      date,
      summary: 's',
      meals: [{
        id: `m-${date}`, day: date, slot: 'lunch', kind: 'main', idea: 'Soup',
        prepMinutes: 10, why: 'easy', ingredients: [], factIds: [], status: 'planned',
      }],
      timingNotes: [],
      urgent: false,
      context: context(date),
      source: 'offline',
      generatedAt: 1,
    })),
    shopping,
    source: 'offline',
    generatedAt: 1,
  };
}

test('quantities add up when units match and stay readable otherwise', () => {
  assert.equal(combineQuantities('200 g', '150 g'), '350 g');
  assert.equal(combineQuantities('2', '3', '4'), '9');
  assert.equal(combineQuantities('1 cup', '250 ml'), '1 cup + 250 ml');
  assert.equal(combineQuantities(undefined, '1 tbsp'), '1 tbsp');
  assert.equal(combineQuantities('200 g', '200 g'), '400 g', 'known quantities always add up');
});

test('same ingredient on several days is one line with unioned days and summed quantity', () => {
  const existing = [item({ id: 's1', name: 'salmon fillet', quantity: '200 g', forDays: [today] })];
  const generated = [item({ id: 's2', name: 'salmon fillet', quantity: '150 g', forDays: [monday] })];

  const { items } = mergeShoppingList(existing, generated, [monday]);

  const salmon = items.filter((entry) => entry.name === 'salmon fillet');
  assert.equal(salmon.length, 1, 'one line per ingredient');
  assert.deepEqual(salmon[0].forDays, [today, monday]);
  assert.equal(salmon[0].quantity, '350 g');
});

test('legacy per-day lists migrate into one line with unioned days and summed quantity', () => {
  const dayPlan = (date, shoppingList) => ({
    date, summary: 's', meals: [], timingNotes: [], urgent: false,
    context: context(date), source: 'offline', generatedAt: 1, range: 'today', shoppingList,
  });

  const loaded = normalizeDietData({
    dayPlans: {
      [today]: dayPlan(today, [item({ id: 's1', name: 'salmon fillet', quantity: '200 g' })]),
      [monday]: dayPlan(monday, [item({ id: 's2', name: 'salmon fillet', quantity: '150 g' })]),
    },
  }, []);

  const salmon = loaded.shopping.filter((entry) => entry.name === 'salmon fillet');
  assert.equal(salmon.length, 1, 'one line across old day lists');
  assert.deepEqual(salmon[0].forDays, [today, monday]);
  assert.equal(salmon[0].quantity, '350 g');
});

test('regenerating the same day replaces rather than doubles a known quantity', () => {
  const existing = [item({ id: 's1', name: 'oats', quantity: '200 g', forDays: [today] })];
  const regenerated = [item({ id: 's2', name: 'oats', quantity: '250 g', forDays: [today] })];

  const { items } = mergeShoppingList(existing, regenerated, [today]);

  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, '250 g', 'the new AI total replaces the old day total');
  assert.deepEqual(items[0].forDays, [today]);
});

test('generation unions days for a repeated ingredient across a week', () => {
  const data = normalizeDietData({}, []);
  storeRangePlanInDays(
    data,
    plan([today, monday], [item({ id: 'a1', name: 'oats', quantity: '100 g' })]),
    'week',
    undefined,
    now,
  );

  const oats = data.shopping.filter((entry) => entry.name === 'oats');
  assert.equal(oats.length, 1);
  assert.deepEqual(oats[0].forDays, [today, monday]);
});

test('day counts include self-added items assigned to that day only', () => {
  const items = [
    item({ id: 'ai', name: 'lentils', forDays: [today] }),
    item({ id: 'mine', name: 'avocado', source: 'user', inPlan: false, forDays: [today] }),
    item({ id: 'open', name: 'coffee', source: 'user', inPlan: false, forDays: [] }),
    item({ id: 'gone', name: 'pasta', inPlan: false, forDays: [today] }),
    item({ id: 'bought', name: 'oats', status: 'bought', forDays: [today] }),
    item({ id: 'removed', name: 'rice', status: 'removed', forDays: [today] }),
  ];

  assert.equal(countShoppingForDate(items, today), 2, 'AI and my own item for the day both count');
  assert.equal(countShoppingForDate(items, monday), 0, 'open items do not claim a specific day');
});

test('pantry basics are never stored, generated, added or suggested', () => {
  for (const name of ['salt', 'Salt', 'pepper', ' WATER ']) {
    assert.equal(isBasicShoppingItem(name), true, `${name} is a basic`);
  }

  const loaded = normalizeDietData({
    shopping: [item({ name: 'salt' }), item({ name: 'Pepper' }), item({ name: 'olive oil' })],
    weekShopping: [item({ name: 'water' }), item({ name: 'rice' })],
    dayPlans: {
      [today]: {
        date: today, summary: 's', meals: [], timingNotes: [], urgent: false,
        context: context(today), source: 'offline', generatedAt: 1, range: 'today',
        shoppingList: [item({ name: 'Salt' })],
      },
    },
  }, []);
  assert.deepEqual(loaded.shopping.map((entry) => entry.name), ['olive oil'], 'stored basics dropped');

  const data = normalizeDietData({}, []);
  storeRangePlanInDays(
    data,
    plan([today], [item({ name: 'salt' }), item({ name: 'pepper' }), item({ name: 'lentils' })]),
    'today',
    undefined,
    now,
  );
  assert.deepEqual(data.shopping.map((entry) => entry.name), ['lentils'], 'generated basics dropped');

  const delta = applyMealShoppingDelta([], ['salt', 'water', 'tomatoes'], [], [], [today]);
  assert.deepEqual(delta.items.map((entry) => entry.name), ['tomatoes'], 'suggested basics dropped');
});

test('items I added myself are never marked no longer needed or removed by regeneration', () => {
  const data = normalizeDietData({}, []);
  data.shopping.push(item({ id: 'av', name: 'avocado', source: 'user', inPlan: false, forDays: [] }));

  storeRangePlanInDays(data, plan([today], [item({ name: 'oats' })]), 'today', undefined, now);

  const avocado = data.shopping.find((entry) => entry.name === 'avocado');
  assert.equal(avocado.source, 'user');
  assert.equal(avocado.status, 'open');
  assert.equal(avocado.inPlan, false, 'my own open items are not marked no longer needed');
});

test('bought and removed items stay bought and removed through regeneration', () => {
  const data = normalizeDietData({}, []);
  data.shopping.push(item({ id: 'b', name: 'oats', status: 'bought', forDays: [today] }));
  data.shopping.push(item({ id: 'r', name: 'rice', status: 'removed', forDays: [today] }));

  storeRangePlanInDays(
    data,
    plan([today], [item({ name: 'oats' }), item({ name: 'rice' }), item({ name: 'beans' })]),
    'today',
    undefined,
    now,
  );

  assert.equal(data.shopping.find((entry) => entry.name === 'oats').status, 'bought');
  assert.equal(data.shopping.find((entry) => entry.name === 'rice').status, 'removed');
  assert.equal(data.shopping.find((entry) => entry.name === 'beans').status, 'open');
});

test('only AI items become no longer needed; items still needed on other days stay active', () => {
  const existing = [
    item({ id: 'n', name: 'pasta', source: 'ai', forDays: [today] }),
    item({ id: 'k', name: 'beans', source: 'ai', forDays: [monday] }),
    item({ id: 'u', name: 'avocado', source: 'user', inPlan: false, forDays: [] }),
    item({ id: 'b', name: 'oats', source: 'ai', status: 'bought', forDays: [today] }),
  ];

  const { items, summary } = mergeShoppingList(existing, [], [today]);
  const byName = Object.fromEntries(items.map((entry) => [entry.name, entry]));

  assert.equal(byName.pasta.inPlan, false, 'unneeded AI item moves to No longer needed');
  assert.equal(byName.pasta.status, 'open');
  assert.deepEqual(byName.pasta.forDays, [], 'the regenerated day no longer needs it');
  assert.equal(byName.beans.inPlan, true, 'a different day still needs its item');
  assert.deepEqual(byName.beans.forDays, [monday]);
  assert.equal(byName.avocado.inPlan, false, 'my item stays open and out of the section');
  assert.equal(byName.oats.status, 'bought');
  assert.equal(summary.noLongerNeeded, 1);
});

test('buying moves an item to the pantry without duplicating an existing pantry entry', () => {
  const shopping = [item({ id: 's1', name: 'olive oil', forDays: [today] })];
  const first = markBought([], shopping, 's1');
  assert.equal(first.pantry.length, 1);
  assert.equal(first.shopping[0].status, 'bought');

  const second = markBought(first.pantry, first.shopping, 's1');
  assert.equal(second.pantry.length, 1, 'no duplicate pantry item');
});
