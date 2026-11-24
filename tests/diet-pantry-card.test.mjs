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

test('removing a pantry item never re-adds a shopping line it had hidden', async () => {
  const diet = seed();
  await diet.addPantryMany(['rice']);
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's2').status, 'removed');
  const rice = diet.pantry.value.find((entry) => entry.name === 'rice');
  await diet.removePantry(rice.id);
  // Deleting from At home must not push anything back onto the shopping list.
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's2').status, 'removed');
});

test('removing a running-low pantry item keeps the shopping row open and offers Undo', async () => {
  const diet = seed();
  await diet.setPantryLow('p1', true);
  const row = diet.shopping.value.find((entry) => entry.runningLow && entry.name === 'oats');
  assert.ok(row, 'the running-low row exists');
  await diet.removePantry('p1');
  assert.equal(diet.pantry.value.some((entry) => entry.id === 'p1'), false);
  assert.equal(diet.shopping.value.find((entry) => entry.id === row.id).status, 'open');
  assert.equal(diet.pantryNotice.value, 'Removed from At home. Still on your shopping list.');
  await diet.undoPantryRemoval();
  assert.equal(diet.pantry.value.some((entry) => entry.id === 'p1'), true);
  assert.equal(diet.pantryNotice.value, '');
});

test('removing a pantry item that is not on the shopping list adds nothing', async () => {
  const diet = seed();
  const before = diet.shopping.value.length;
  await diet.removePantry('p1');
  assert.equal(diet.shopping.value.length, before);
  assert.equal(diet.pantryNotice.value, 'Removed from At home.');
});

test('removing a pantry item bought today keeps the bought row', async () => {
  const diet = seed();
  await diet.buyShopping('s1');
  const bought = diet.pantry.value.find((entry) => entry.name === 'lentils');
  assert.ok(bought);
  await diet.removePantry(bought.id);
  assert.equal(diet.pantry.value.some((entry) => entry.name === 'lentils'), false);
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's1').status, 'bought');
});

test('removing a running-low shopping row turns Running low off and keeps the pantry item', async () => {
  const diet = seed();
  await diet.setPantryLow('p1', true);
  const row = diet.shopping.value.find((entry) => entry.runningLow && entry.name === 'oats');
  await diet.removeShopping(row.id);
  assert.equal(diet.shopping.value.find((entry) => entry.id === row.id).status, 'removed');
  const oats = diet.pantry.value.find((entry) => entry.id === 'p1');
  assert.ok(oats, 'the pantry item stays');
  assert.equal(oats.low, undefined);
  await diet.undoShoppingRemoval();
  assert.equal(diet.shopping.value.find((entry) => entry.id === row.id).status, 'open');
  assert.equal(diet.pantry.value.find((entry) => entry.id === 'p1').low, true);
});

test('removing a normal shopping row leaves the pantry untouched', async () => {
  const diet = seed();
  const before = JSON.parse(JSON.stringify(diet.pantry.value));
  await diet.removeShopping('s1');
  assert.deepEqual(JSON.parse(JSON.stringify(diet.pantry.value)), before);
});

test('buying an item adds it to At home and switches Running low off', async () => {
  const diet = seed();
  await diet.setPantryLow('p1', true);
  const row = diet.shopping.value.find((entry) => entry.runningLow && entry.name === 'oats');
  await diet.buyShopping(row.id);
  const oats = diet.pantry.value.find((entry) => entry.id === 'p1');
  assert.equal(oats.low, undefined);
  assert.equal(oats.source, 'shopping');
  assert.equal(diet.shopping.value.find((entry) => entry.id === row.id).status, 'bought');
});

test('Running low reuses an existing open row and unticking keeps that row', async () => {
  const diet = seed();
  await diet.addShopping('oats');
  const before = diet.shopping.value.filter((entry) => entry.name.toLowerCase() === 'oats');
  assert.equal(before.length, 1);

  await diet.setPantryLow('p1', true);
  const rows = diet.shopping.value.filter((entry) => entry.name.toLowerCase() === 'oats');
  assert.equal(rows.length, 1, 'no second row for the same ingredient');
  assert.equal(rows[0].runningLow, true);
  assert.equal(rows[0].status, 'open');

  await diet.setPantryLow('p1', false);
  const after = diet.shopping.value.filter((entry) => entry.name.toLowerCase() === 'oats');
  assert.equal(after.length, 1, 'the pre-existing row is not removed');
  assert.equal(after[0].runningLow, undefined);
});

test('Running low reopens a bought row without creating a duplicate', async () => {
  const diet = seed();
  await diet.addShopping('oats');
  const row = diet.shopping.value.find((entry) => entry.name === 'oats');
  await diet.buyShopping(row.id);
  assert.equal(diet.shopping.value.find((entry) => entry.id === row.id).status, 'bought');

  await diet.setPantryLow('p1', true);
  const rows = diet.shopping.value.filter((entry) => entry.name.toLowerCase() === 'oats');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'open');
  assert.equal(rows[0].runningLow, true);

  await diet.buyShopping(rows[0].id);
  assert.equal(diet.pantry.value.find((entry) => entry.id === 'p1').low, undefined);
  assert.equal(diet.shopping.value.find((entry) => entry.id === rows[0].id).runningLow, undefined);
});

test('Running low reopens a removed row without creating a duplicate', async () => {
  const diet = seed();
  await diet.addShopping('oats');
  const row = diet.shopping.value.find((entry) => entry.name === 'oats');
  await diet.removeShopping(row.id);
  assert.equal(diet.shopping.value.find((entry) => entry.id === row.id).status, 'removed');

  await diet.setPantryLow('p1', true);
  const rows = diet.shopping.value.filter((entry) => entry.name.toLowerCase() === 'oats');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'open');
  assert.equal(rows[0].runningLow, true);
});

test('Running low with no existing row creates one source=pantry row and untick hides it', async () => {
  const diet = seed();
  await diet.setPantryLow('p1', true);
  const rows = diet.shopping.value.filter((entry) => entry.name.toLowerCase() === 'oats');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'pantry');
  assert.equal(rows[0].runningLow, true);

  await diet.setPantryLow('p1', false);
  assert.equal(diet.shopping.value.find((entry) => entry.id === rows[0].id).status, 'removed');
  assert.equal(diet.shopping.value.filter((entry) =>
    entry.name.toLowerCase() === 'oats' && entry.status === 'open').length, 0);
});

test('typing an ingredient reopens its one existing row instead of adding a second', async () => {
  const diet = seed();
  await diet.addShopping('oats');
  const row = diet.shopping.value.find((entry) => entry.name === 'oats');
  await diet.removeShopping(row.id);
  await diet.addShopping('  OATS ');

  const rows = diet.shopping.value.filter((entry) => entry.name.toLowerCase() === 'oats');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'open');
  assert.equal(rows[0].source, 'user');
});

test('the shopping row shows one source tag and no Open day tag', () => {
  const shopping = source('../src/features/diet/ShoppingList.vue');
  assert.match(shopping, /function sourceTag/);
  assert.match(shopping, /if \(item\.runningLow \|\| item\.source === 'pantry'\) return 'Running low'/);
  assert.match(shopping, /if \(item\.source === 'user'\) return 'Added by me'/);
  assert.match(shopping, /if \(item\.isNew\) return 'New'/);
  assert.match(shopping, /v-if="item\.forDays\.length" class="day-tag"/);
  assert.doesNotMatch(shopping, /return 'Open'/);
  assert.match(shopping, /'Any day'/);
  assert.doesNotMatch(shopping, /v-if="item\.source === 'user'" class="chip item-chip"/);
});

test('ticking an item shows brief feedback and a five second Undo notice', async () => {
  const diet = seed();
  await diet.buyShopping('s1');
  assert.equal(diet.boughtNotice.value, 'Moved to At home');
  assert.ok(diet.recentlyBought.value.includes('s1'));
  assert.ok(diet.lastBought.value);
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's1').status, 'bought');

  const vm = source('../src/features/diet/useDiet.ts');
  assert.match(vm, /const BOUGHT_ROW_MS = 1000;/);
  assert.match(vm, /const BOUGHT_NOTICE_MS = 5000;/);
});

test('the ticked row leaves the active list after a second and the notice after five', async () => {
  const diet = seed();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await diet.buyShopping('s1');
    assert.ok(diet.recentlyBought.value.includes('s1'));
    mock.timers.tick(1000);
    assert.equal(diet.recentlyBought.value.includes('s1'), false);
    assert.equal(diet.boughtNotice.value, 'Moved to At home');
    mock.timers.tick(4000);
    assert.equal(diet.boughtNotice.value, '');
    assert.equal(diet.lastBought.value, null);
  } finally {
    mock.timers.reset();
  }
});

test('unticking a bought row reactivates it and removes it from At home', async () => {
  const diet = seed();
  await diet.buyShopping('s1');
  assert.ok(diet.pantry.value.some((entry) => entry.name === 'lentils'));
  await diet.untickBought('s1');
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's1').status, 'open');
  assert.equal(diet.pantry.value.some((entry) => entry.name === 'lentils'), false);
  assert.equal(diet.boughtNotice.value, '');
});

test('clear bought hides the bought rows but keeps At home items', async () => {
  const diet = seed();
  await diet.buyShopping('s1');
  await diet.clearBought();
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's1').status, 'removed');
  assert.ok(diet.pantry.value.some((entry) => entry.name === 'lentils'));
  assert.equal(diet.boughtNotice.value, '');
});

test('bought rows from a previous day are cleared automatically', async () => {
  const diet = seed();
  await diet.buyShopping('s1');
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  diet.data.value.shopping = diet.data.value.shopping.map((entry) => entry.id === 's1'
    ? { ...entry, updatedAt: yesterday }
    : entry);
  diet.clearYesterdayBought();
  assert.equal(diet.shopping.value.find((entry) => entry.id === 's1').status, 'removed');
  assert.ok(diet.pantry.value.some((entry) => entry.name === 'lentils'));
});

test('the shopping UI shows progress, a collapsed Bought section and its controls', () => {
  const shopping = source('../src/features/diet/ShoppingList.vue');
  assert.match(shopping, /\{\{ progress\.bought \}\} of \{\{ progress\.total \}\} bought/);
  assert.match(shopping, /<details class="bought-section">/);
  assert.match(shopping, /Bought \(\{\{ boughtItems\.length \}\}\)/);
  assert.match(shopping, /@click="onClearBought"/);
  assert.match(shopping, /:aria-label="`Untick \$\{item\.name\}`"/);
  assert.match(source('../src/features/diet/useDiet.ts'), /'Moved to At home'/);
  assert.match(shopping, /v-if="item\.status !== 'bought'" class="shopping-meta"/);
  assert.match(shopping, /<s>\{\{ item\.name \}\}<\/s>/);
});

test('the At home card hides Running low for items bought today', () => {
  const card = source('../src/features/diet/PantryCard.vue');
  assert.match(card, /boughtToday\(item\.boughtAt\)/);
  assert.match(card, /keyOf\(new Date\(at\)\) === keyOf\(new Date\(\)\)/);
  assert.match(card, /Bought \{\{ boughtLabel\(item\.boughtAt\) \}\}/);
});

test('neither removal function calls the other store’s delete', () => {
  const vm = source('../src/features/diet/useDiet.ts');
  const pantryBlock = vm.match(/async function removePantry\([\s\S]*?\n}/);
  assert.ok(pantryBlock, 'removePantry exists');
  assert.doesNotMatch(pantryBlock[0], /setShopping|syncRunningLow|hideShoppingForPantry|removeShopping/);

  const shoppingBlock = vm.match(/async function removeShopping\([\s\S]*?\n}/);
  assert.ok(shoppingBlock, 'removeShopping exists');
  assert.doesNotMatch(shoppingBlock[0], /data\.value\.pantry\s*=\s*[^;]*filter|removePantry/);
});

test('both removal messages expose an Undo in the UI', () => {
  const card = source('../src/features/diet/PantryCard.vue');
  assert.match(card, /pantryNotice/);
  assert.match(card, /undoPantryRemoval/);
  const shopping = source('../src/features/diet/ShoppingList.vue');
  assert.match(shopping, /shoppingNotice/);
  assert.match(shopping, /undoShoppingRemoval/);
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
  assert.match(vm, /lastBought\.value = null;/);
  assert.match(vm, /lastPantryRemoval\.value = null;/);
  assert.match(vm, /lastShoppingRemoval\.value = null;/);
  assert.match(vm, /shoppingMerge\.value = null;/);
  assert.match(vm, /pendingGeneration\.value = null;/);
  assert.match(vm, /lastFailedAiRequest = null;/);
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
    .replace(/: boolean\b/g, '')
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
