import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

// Vite-style resolution plus JSON loading for TS modules imported by this test.
import './helpers/node-ts-hooks.mjs';

// Minimal browser globals for module imports in node
globalThis.window ??= globalThis;
const elem = () => ({ style: {}, setAttribute(){}, appendChild(){}, removeChild(){}, addEventListener(){}, removeEventListener(){}, querySelector:()=>null, querySelectorAll:()=>[], innerHTML:'', textContent:'', childNodes:[], classList:{add(){},remove(){},toggle(){},contains:()=>false}, ownerDocument: globalThis.document });
globalThis.document ??= { getElementById: () => null, createElement: () => elem(), createTextNode: (t)=>({textContent:t}), createComment: (t)=>({textContent:t}), body: elem(), head: elem(), documentElement: elem(), addEventListener(){}, removeEventListener(){} };
globalThis.localStorage ??= { _d: {}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
globalThis.navigator ??= { onLine: true };

let shoppingUpdateImpl;
let alternativeImpl;

// useDiet imports `* as api` and ESM namespaces are read-only, so mock the
// module itself before importing the composable.
mock.module(new URL('../src/features/diet/api.ts', import.meta.url).href, {
  exports: {
    loadDiet: async () => { throw new Error('loadDiet was not stubbed'); },
    saveDiet: async () => {},
    savePreferences: async () => {},
    getLastPlan: async () => null,
    saveLastPlan: async () => {},
    setConsent: async () => {},
    requestSuggestion: async () => { throw new Error('requestSuggestion was not stubbed'); },
    requestRangeSuggestion: async () => { throw new Error('requestRangeSuggestion was not stubbed'); },
    requestShoppingUpdate: (input) => shoppingUpdateImpl(input),
    requestMealAlternative: (input) => alternativeImpl(input),
  },
});

const { normalizeDietData } = await import('../src/features/diet/model.ts');
const { useDiet } = await import('../src/features/diet/useDiet.ts');

const today = new Date().toISOString().slice(0, 10);
const todayNoon = new Date(`${today}T12:00:00`);
const otherDayNoon = new Date(todayNoon.getFullYear(), todayNoon.getMonth(), todayNoon.getDate() + 3, 12);
const otherDay = [
  otherDayNoon.getFullYear(),
  String(otherDayNoon.getMonth() + 1).padStart(2, '0'),
  String(otherDayNoon.getDate()).padStart(2, '0'),
].join('-');

const shopping = (diet) => JSON.parse(JSON.stringify(diet.data.value.shopping));
const findItem = (diet, name) => shopping(diet).find((item) => item.name === name);

function seedDay() {
  shoppingUpdateImpl = async () => {
    throw new Error('requestShoppingUpdate was not stubbed');
  };
  alternativeImpl = async () => {
    throw new Error('requestMealAlternative was not stubbed');
  };

  const diet = useDiet();
  diet.data.value = normalizeDietData({
    consentChoice: 'allowed',
    dayPlans: {
      [today]: {
        date: today, summary: 's',
        meals: [
          { id: 'm1', day: today, slot: 'lunch', kind: 'main', idea: 'Old soup', prepMinutes: 10, why: 'easy', ingredients: ['lentils'], factIds: ['F1'], status: 'ate', source: 'ai' },
          { id: 'm2', day: today, slot: 'dinner', kind: 'main', idea: 'Pasta', prepMinutes: 15, why: 'easy', ingredients: ['pasta', 'tomato'], factIds: ['F2'], status: 'planned', source: 'ai' },
          { id: 'm3', day: today, slot: 'snack', kind: 'main', idea: 'Apple', prepMinutes: 1, why: 'easy', ingredients: ['apple'], factIds: [], status: 'planned', source: 'ai' },
        ],
        timingNotes: [], urgent: false,
        context: { date: today, energy: 'medium', busyness: 'normal', totalMinutes: 0, taskCount: 0 },
        source: 'offline', generatedAt: 1,
        range: 'today',
      },
    },
    shopping: [
      { id: 's1', name: 'pasta', source: 'ai', status: 'open', inPlan: true, forDays: [today], createdAt: 1, updatedAt: 1 },
      { id: 's2', name: 'my yogurt', source: 'user', status: 'open', inPlan: false, forDays: [], createdAt: 1, updatedAt: 1 },
    ],
    log: [{ id: 'l1', date: today, slot: 'lunch', status: 'ate', text: 'Old soup', mealId: 'm1', createdAt: 1, updatedAt: 1 }],
  }, []);
  diet.shoppingUpdateStatus.value = 'idle';
  diet.shoppingUpdateError.value = '';
  diet.lastBought.value = null;
  diet.shoppingFilter.value = 'all';
  return diet;
}

test('editing an Ate this meal updates logged text and does not queue shopping update', async () => {
  const diet = seedDay();
  const before = shopping(diet);
  await diet.editMealForDate(today, 'm1', { idea: 'New soup', ingredients: ['beans'], prepMinutes: 12 });
  const meal = diet.data.value.dayPlans[today].meals.find((m) => m.id === 'm1');
  assert.equal(meal.idea, 'New soup');
  assert.equal(meal.source, 'user');
  assert.deepEqual(meal.factIds, []);
  assert.ok(meal.editedAt > 0);
  assert.equal(diet.data.value.log.find((e) => e.mealId === 'm1').text, 'New soup');
  assert.deepEqual(shopping(diet), before, 'the unified list is untouched');
  assert.equal(diet.shoppingUpdateStatus.value, 'idle');
});

test('two rapid meal edits batch into one AI call after 1.5s and update shopping with Undo', async () => {
  const diet = seedDay();
  const calls = [];
  shoppingUpdateImpl = async (input) => {
    calls.push(input);
    return { add: ['rice'], remove: ['pasta'] };
  };

  await diet.editMealForDate(today, 'm2', { idea: 'Rice bowl', ingredients: ['rice'], prepMinutes: 10 });
  await diet.editMealForDate(today, 'm3', { idea: 'Banana', ingredients: ['banana'], prepMinutes: 1 });
  assert.equal(calls.length, 0, 'no immediate call');
  assert.equal(diet.shoppingUpdateStatus.value, 'updating');
  await new Promise((r) => setTimeout(r, 1700));

  assert.equal(calls.length, 1, 'one batched call');
  assert.equal(calls[0].edits.length, 2);
  assert.equal(diet.shoppingUpdateStatus.value, 'done');
  assert.ok(findItem(diet, 'rice'), 'new AI item is added to the unified list');
  assert.equal(findItem(diet, 'pasta').inPlan, false, 'removed AI item is no longer needed');
  assert.equal(findItem(diet, 'my yogurt').source, 'user', 'my own item is untouched');

  await diet.undoShoppingUpdate();
  const restored = findItem(diet, 'pasta');
  assert.equal(restored.inPlan, true, 'Undo restores the pre-update item');
  assert.ok(!findItem(diet, 'rice'), 'Undo removes the newly added item');
  assert.equal(diet.shoppingUpdateStatus.value, 'idle');
});

test('failed/offline update keeps list, shows Retry, and adds missing entered ingredients as New fallback', async () => {
  const diet = seedDay();
  let calls = 0;
  shoppingUpdateImpl = async () => {
    calls += 1;
    throw new Error('offline');
  };

  await diet.editMealForDate(today, 'm2', { idea: 'Chickpea salad', ingredients: ['chickpeas', 'cucumber'], prepMinutes: 5 });
  await new Promise((r) => setTimeout(r, 1700));

  assert.equal(calls, 1);
  assert.equal(diet.shoppingUpdateStatus.value, 'error');
  assert.match(diet.shoppingUpdateError.value, /offline|Could not/i);
  assert.ok(findItem(diet, 'chickpeas'), 'entered ingredient is added locally');
  assert.ok(findItem(diet, 'cucumber'), 'entered ingredient is added locally');
  assert.equal(findItem(diet, 'chickpeas').isNew, true, 'fallback item is marked New');
  assert.equal(findItem(diet, 'my yogurt').source, 'user', 'my own item is untouched');
  assert.equal(findItem(diet, 'pasta').inPlan, true, 'existing AI item is kept');
});

test('suggest another idea returns an alternative meal for the slot', async () => {
  const diet = seedDay();
  alternativeImpl = async (input) => {
    assert.equal(input.slot, 'dinner');
    return { idea: 'Quinoa bowl', ingredients: ['quinoa', 'beans'], prepMinutes: 12 };
  };

  const suggestion = await diet.suggestMealAlternative(today, 'm2');
  assert.deepEqual(suggestion, { idea: 'Quinoa bowl', ingredients: ['quinoa', 'beans'], prepMinutes: 12 });
});

test('adding items splits commas, keeps quantity and days, and drops pantry basics', async () => {
  const diet = seedDay();
  await diet.addShopping('oats, SALT, rice, pepper', '1 cup', [today, otherDay]);

  for (const name of ['oats', 'rice']) {
    const added = findItem(diet, name);
    assert.ok(added, `${name} is added`);
    assert.equal(added.source, 'user');
    assert.equal(added.inPlan, false);
    assert.equal(added.quantity, '1 cup');
    assert.deepEqual(added.forDays, [today, otherDay]);
  }
  assert.ok(!findItem(diet, 'salt'), 'salt is never added');
  assert.ok(!findItem(diet, 'pepper'), 'pepper is never added');
});

test('editing an item never lets it become a pantry basic', async () => {
  const diet = seedDay();
  const before = shopping(diet);
  await diet.editShopping('s1', ' WATER ', '1 l');
  assert.deepEqual(shopping(diet), before, 'the item is unchanged');
});

test('ticking an item moves it to pantry and Undo restores both lists', async () => {
  const diet = seedDay();
  await diet.toggleShopping('s1', true);

  assert.equal(findItem(diet, 'pasta').status, 'bought');
  assert.equal(diet.data.value.pantry.length, 1);
  assert.equal(diet.data.value.pantry[0].name, 'pasta');
  assert.equal(diet.lastBought.value?.itemId, 's1');

  await diet.undoBought();
  assert.equal(findItem(diet, 'pasta').status, 'open');
  assert.equal(diet.data.value.pantry.length, 0);
  assert.equal(diet.lastBought.value, null);
});

test('no-longer-needed actions keep or remove only AI items', async () => {
  const diet = seedDay();
  diet.data.value.shopping = diet.data.value.shopping.map((item) =>
    item.id === 's1' ? { ...item, inPlan: false } : item);
  diet.data.value.shopping.push({
    id: 'n1', name: 'cabbage', source: 'ai', status: 'open', inPlan: false,
    forDays: [today], createdAt: 1, updatedAt: 1,
  });

  await diet.keepAllShopping();
  assert.equal(findItem(diet, 'pasta').source, 'user', 'Keep all keeps an item on the list');
  assert.equal(findItem(diet, 'cabbage').source, 'user', 'Keep all keeps every item');
  assert.equal(findItem(diet, 'pasta').status, 'open');

  diet.data.value.shopping.push({
    id: 'n2', name: 'kale', source: 'ai', status: 'open', inPlan: false,
    forDays: [today], createdAt: 1, updatedAt: 1,
  });
  await diet.removeAllNoLongerNeeded();
  assert.equal(findItem(diet, 'kale').status, 'removed', 'Remove all removes unneeded AI items');
  assert.equal(findItem(diet, 'cabbage').status, 'open', 'kept items stay on the list');
  assert.equal(findItem(diet, 'my yogurt').source, 'user', 'my own items are untouched');
});

test('setting a shopping filter never mutates the list', () => {
  const diet = seedDay();
  const before = shopping(diet);
  diet.setShoppingFilter({ date: today });
  assert.deepEqual(diet.shoppingFilter.value, { date: today });
  assert.deepEqual(shopping(diet), before, 'filtering only changes what is shown');
});
