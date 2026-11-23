import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { mock } from 'node:test';

import './helpers/node-ts-hooks.mjs';

globalThis.window ??= globalThis;
globalThis.localStorage ??= {
  _d: {},
  getItem(key) { return this._d[key] ?? null; },
  setItem(key, value) { this._d[key] = String(value); },
  removeItem(key) { delete this._d[key]; },
};
globalThis.navigator ??= { onLine: true };

let savedData = null;
mock.module(new URL('../src/features/diet/api.ts', import.meta.url).href, {
  exports: {
    loadDiet: async () => { throw new Error('loadDiet was not stubbed'); },
    saveDiet: async (data) => { savedData = data; },
    savePreferences: async () => {},
    getLastPlan: async () => null,
    saveLastPlan: async () => {},
    setConsent: async () => {},
    requestDietPlan: async () => { throw new Error('requestDietPlan was not stubbed'); },
    requestMealEditIngredients: async () => { throw new Error('not stubbed'); },
  },
});

const { normalizeDietData, markBought } = await import('../src/features/diet/model.ts');
const { clearPantryConfirm, deleteMyDataConfirm } = await import('../src/features/diet/confirmCopy.ts');
const { useDiet } = await import('../src/features/diet/useDiet.ts');

const TODAY = new Date().toISOString().slice(0, 10);
const item = (overrides) => ({
  id: 'x', name: 'x', forDays: [], source: 'ai', status: 'open',
  inPlan: true, createdAt: 1, updatedAt: 1, ...overrides,
});

function seed() {
  savedData = null;
  const diet = useDiet();
  diet.data.value = normalizeDietData({
    consentChoice: 'allowed',
    pantry: [{ id: 'p1', name: 'oats', addedAt: 1 }],
    shopping: [
      item({ id: 's1', name: 'lentils', forDays: [TODAY] }),
      item({ id: 's2', name: 'rice', status: 'removed', fromPantry: true }),
    ],
    dayAnswers: {
      [TODAY]: {
        pantry: ['stale answer'], wants: [], scope: 'day', savePantry: false, updatedAt: 1,
      },
    },
  }, []);
  return diet;
}

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('pantry metadata survives normalization and bought items get a shopping source/date', () => {
  const data = normalizeDietData({
    pantry: [{
      id: 'p1', name: 'Oats', addedAt: 5, low: true, source: 'shopping', boughtAt: 12345,
    }],
  }, []);
  assert.equal(data.pantry[0].low, true);
  assert.equal(data.pantry[0].source, 'shopping');
  assert.equal(data.pantry[0].boughtAt, 12345);

  const bought = markBought(
    [],
    [item({ id: 's1', name: 'olive oil' })],
    's1',
  );
  assert.equal(bought.pantry[0].source, 'shopping');
  assert.ok(bought.pantry[0].boughtAt > 0);
});

test('the question reads the canonical pantry, not its saved answer snapshot', () => {
  const diet = seed();
  assert.deepEqual(diet.answersForDate(TODAY).pantry, ['oats']);
});

test('adding pantry items trims, dedupes and removes matching open shopping lines', async () => {
  const diet = seed();
  await diet.addPantryMany(['  lentils ', 'LENTILS', 'rice', 'salt', '']);
  assert.deepEqual(diet.pantryNames.value, ['oats', 'lentils', 'rice']);
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's1').status, 'removed');
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's1').fromPantry, true);
  assert.equal(savedData.pantry.length, 3);
});

test('removing a pantry item restores the shopping line it had hidden', async () => {
  const diet = seed();
  await diet.addPantryMany(['rice']);
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's2').status, 'removed');
  const rice = diet.pantry.value.find((entry) => entry.name === 'rice');
  await diet.removePantry(rice.id);
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's2').status, 'open');
});

test('running-low items stay in the pantry but count as missing in requests and shopping', async () => {
  const diet = seed();
  await diet.setPantryLow('p1', true);
  assert.deepEqual(diet.pantryNames.value, ['oats']);
  assert.deepEqual(diet.availablePantry.value, []);
  const lowLine = diet.shopping.value.find((entry) => entry.runningLow && entry.name === 'oats');
  assert.ok(lowLine, 'a running-low item appears on the shopping list');
  assert.equal(lowLine.status, 'open');

  await diet.setPantryLow('p1', false);
  assert.deepEqual(diet.availablePantry.value, ['oats']);
  assert.equal(diet.shopping.value.some((entry) => entry.runningLow && entry.name === 'oats'), false);
});

test('clear pantry and Profile delete-my-data both wipe the saved list', async () => {
  const diet = seed();
  await diet.clearPantry();
  assert.equal(diet.pantry.value.length, 0);
  assert.equal(savedData.pantry.length, 0);

  const second = seed();
  await second.clearAllDietData();
  assert.equal(second.pantry.value.length, 0);
  assert.equal(second.shopping.value.length, 0);
  assert.equal(Object.keys(second.data.value.dayAnswers).length, 0);
  assert.equal(savedData.pantry.length, 0);
});

test('clear confirm names the exact number of items', () => {
  assert.equal(clearPantryConfirm(12).title, 'Remove all 12 items?');
  assert.equal(deleteMyDataConfirm().confirmLabel, 'Delete my data');
});

test('the bought tag uses a stable day-month label regardless of locale', async () => {
  const { make } = await loadPantryCard();
  const vm = make({ pantry: [] });
  const at = new Date(2026, 10, 22, 12).getTime();
  assert.equal(vm.boughtLabel(at), '22 Nov');
  assert.equal(vm.boughtLabel(new Date(2026, 0, 5, 12).getTime()), '5 Jan');
});

test('undoing a bought item restores prior pantry metadata instead of deleting it', async () => {
  savedData = null;
  const diet = useDiet();
  diet.data.value = normalizeDietData({
    consentChoice: 'allowed',
    pantry: [{ id: 'p1', name: 'oats', addedAt: 1, source: 'manual', low: true }],
    shopping: [item({ id: 's1', name: 'oats', forDays: [TODAY] })],
  }, []);
  await diet.buyShopping('s1');
  const bought = diet.data.value.pantry.find((p) => p.id === 'p1');
  assert.equal(bought.source, 'shopping');
  assert.ok(bought.boughtAt > 0);
  assert.equal(diet.lastBought.value.previousPantry.name, 'oats');
  await diet.undoBought();
  const restored = diet.data.value.pantry.find((p) => p.id === 'p1');
  assert.equal(restored.source, 'manual');
  assert.equal(restored.low, true);
  assert.equal(restored.boughtAt, undefined);
  assert.equal(diet.data.value.pantry.length, 1);
});

test('an empty single-plan pantry draft does not fall back to the saved list', () => {
  const vm = source('../src/features/diet/useDiet.ts');
  assert.match(vm, /drafts === undefined \? pantryNamesView\.value : cleanNames\(drafts, 40\)/);
});

test('clearing all diet data also drops transient undo/merge state', async () => {
  const diet = seed();
  await diet.buyShopping('s1');
  assert.ok(diet.lastBought.value);
  await diet.clearAllDietData();
  assert.equal(diet.lastBought.value, null);
  assert.equal(diet.shoppingMerge.value, null);
  const vm = source('../src/features/diet/useDiet.ts');
  assert.match(vm, /lastBought\.value = null;\s*shoppingMerge\.value = null;\s*pendingGeneration\.value = null;\s*lastFailedAiRequest = null;/);
});

/** Evaluates only the PantryCard script with its dependencies injected. */
async function loadPantryCard() {
  const { parse } = await import('@vue/compiler-sfc');
  const filename = new URL('../src/features/diet/PantryCard.vue', import.meta.url);
  const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname });
  assert.deepEqual(errors, []);
  const script = descriptor.scriptSetup.content
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/: KeyboardEvent\b/g, '')
    .replace(/: ClipboardEvent\b/g, '')
    .replace(/: string\b/g, '')
    .replace(/: number\b/g, '')
    .replace(/: Promise<void>/g, '')
    .replace(/: void\b/g, '')
    + '\nreturn { draft, filterText, showFilter, visibleItems, addDraft, onPantryKeydown, onPantryPaste, onClear, boughtLabel };';
  const { computed, ref } = await import('vue');
  const helpers = await import('../src/features/diet/pantryInput.ts');
  const factory = new Function(
    'computed', 'ref', 'useDiet', 'requestConfirm', 'clearPantryConfirm',
    'PANTRY_SEPARATOR', 'splitPantryText', script,
  );
  return {
    make: ({ pantry, addPantryMany = async () => {}, removePantry = async () => {}, setPantryLow = async () => {}, clearPantry = async () => {}, confirm = true }) => {
      const requestConfirm = async () => confirm;
      return factory(
        computed, ref,
        () => ({ pantry: { value: pantry }, addPantryMany, removePantry, setPantryLow, clearPantry }),
        requestConfirm,
        clearPantryConfirm,
        helpers.PANTRY_SEPARATOR,
        helpers.splitPantryText,
      );
    },
  };
}

test('the card turns typed, comma and pasted text into chips and clears after confirmation', async () => {
  const { make } = await loadPantryCard();
  const added = [];
  let cleared = false;
  const pantry = [
    { id: '1', name: 'oats', addedAt: 1 },
    { id: '2', name: 'rice', addedAt: 1 },
  ];
  const vm = make({
    pantry,
    addPantryMany: async (names) => { added.push(...names); },
    clearPantry: async () => { cleared = true; },
  });
  const key = (value) => ({ key: value, preventDefault() {} });

  vm.draft.value = 'eggs';
  vm.addDraft();
  vm.draft.value = 'oats, rice';
  vm.onPantryKeydown(key(','));
  vm.onPantryPaste({ clipboardData: { getData: () => 'lentils\nbeans' }, preventDefault() {} });
  assert.deepEqual(added, ['eggs', 'oats', 'rice', 'lentils', 'beans']);
  assert.equal(vm.draft.value, '');

  vm.onPantryKeydown(key('Backspace'));
  assert.equal(vm.filterText.value, '');
  await vm.onClear();
  assert.equal(cleared, true);
});

test('the card filters once there are more than 12 items', async () => {
  const { make } = await loadPantryCard();
  const many = Array.from({ length: 13 }, (_, index) => ({
    id: String(index), name: `food ${index}`, addedAt: index,
  }));
  const vm = make({ pantry: many });
  assert.equal(vm.showFilter.value, true);
  assert.equal(vm.visibleItems.value.length, 13);
  vm.filterText.value = 'food 1';
  assert.deepEqual(vm.visibleItems.value.map((item) => item.name), ['food 1', 'food 10', 'food 11', 'food 12']);
});

test('the permanent card, day summary and Profile deletion are wired into the UI', () => {
  const card = source('../src/features/diet/PantryCard.vue');
  assert.match(card, /id="pantry-card"/);
  assert.match(card, /<h2 id="pantry-heading">At home<\/h2>/);
  assert.match(card, /Nothing saved yet\. Add what you have to keep the shopping list short\./);
  assert.match(card, /placeholder="Type an item and press Enter or comma"/);
  assert.match(card, /Press Enter or comma to add/);
  assert.match(card, /enterkeyhint="done"/);
  assert.match(card, /@paste="onPantryPaste"/);
  assert.match(card, /@blur="addDraft\(\)"/);
  assert.match(card, /:aria-label="`Remove \$\{item\.name\}`"/);
  assert.match(card, /Running low/);
  assert.match(card, /Bought \{\{ boughtLabel\(item\.boughtAt\) \}\}/);
  assert.match(card, /pantry\.value\.length > 12/);
  assert.match(card, /Clear all/);

  const view = source('../src/views/DietView.vue');
  assert.match(view, /<PantryCard \/>/);
  assert.match(view, /<ShoppingList \/>/);
  assert.match(view, /diet-list-cards/);
  assert.match(view, /getElementById\('pantry-card'\)/);

  const day = source('../src/features/diet/DayMeals.vue');
  assert.match(day, /@click="emit\('show-pantry'\)"/);
  assert.match(day, /\{\{ pantry\.length \}\} item\{\{ pantry\.length === 1 \? '' : 's' \}\} at home/);

  const profile = source('../src/views/ProfileView.vue');
  assert.match(profile, /Delete my data/);
  assert.match(profile, /diet\.clearAllDietData\(\)/);
});
