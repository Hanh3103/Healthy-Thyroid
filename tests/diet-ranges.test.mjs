import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DIET_SYSTEM_PROMPT,
  DEFAULT_PREFERENCES,
  RANGE_LABELS,
  WANT_CHIPS,
  buildContextsForDates,
  buildRangeInput,
  buildRangePrompt,
  buildShoppingList,
  datesForRange,
  emergencyRangePlan,
  heuristicRangePlan,
  legacyRangePlan,
  markBought,
  markMeal,
  normalizeDietData,
  parseRangePlan,
  remainingPantry,
  remainingSlots,
  restrictToRemainingMeals,
} from '../src/features/diet/model.ts';
import { deleteActualConfirm as confirmCopy } from '../src/features/diet/confirmCopy.ts';
import { normalizeDietSettings, DEFAULT_DIET_SETTINGS } from '../src/features/profile/dietSettings.ts';

const facts = JSON.parse(readFileSync(new URL('../src/features/diet/knowledge/thyroidFacts.json', import.meta.url), 'utf8'));
const today = { date: '2026-11-21', energy: 'medium', busyness: 'light', totalMinutes: 0, taskCount: 0 };
const days = [
  { date: '2026-11-21', energy: 'low', busyness: 'packed', totalMinutes: 360, taskCount: 9 },
  { date: '2026-11-22', energy: 'medium', busyness: 'normal', totalMinutes: 150, taskCount: 3 },
];

function request(overrides = {}) {
  return {
    range: 'tomorrow',
    dates: days.map((day) => day.date),
    contexts: days,
    wants: ['lentil soup'],
    pantry: ['oats', 'rice'],
    preferences: DEFAULT_PREFERENCES,
    log: [],
    alarmingSymptoms: false,
    hint: today,
    ...overrides,
  };
}

test('the three ranges cover today, tomorrow and the coming seven days', () => {
  const now = new Date(2026, 10, 21, 12);
  assert.deepEqual(datesForRange('today', now).map((date) => date.getDate()), [21]);
  assert.deepEqual(datesForRange('tomorrow', now).map((date) => date.getDate()), [22]);
  assert.deepEqual(datesForRange('week', now).map((date) => date.getDate()), [22, 23, 24, 25, 26, 27, 28]);
  assert.deepEqual(Object.values(RANGE_LABELS), ['Today', 'Tomorrow', 'Next week']);
  assert.ok(WANT_CHIPS.includes('leftovers'));
});

test('future contexts use tasks and habits for each exact date', () => {
  const state = {
    energy: 2,
    tasks: [
      { id: 'tomorrow', due: '2026-11-22', min: 90, done: false, imp: 2 },
      { id: 'later', due: '2026-11-23', min: 30, done: false, imp: 1 },
    ],
    habits: [{ id: 'walk', name: 'Walk', by: { 1: { min: 10, txt: '' }, 2: { min: 20, txt: '' }, 3: { min: 30, txt: '' } } }],
    log: {},
  };
  const contexts = buildContextsForDates(
    state,
    [new Date(2026, 10, 22, 12), new Date(2026, 10, 23, 12)],
    DEFAULT_PREFERENCES,
    today,
  );
  assert.equal(contexts[0].taskCount, 1);
  assert.equal(contexts[0].totalMinutes, 110);
  assert.equal(contexts[0].busyness, 'light');
  assert.equal(contexts[1].totalMinutes, 50);
  assert.equal(contexts[1].date, '2026-11-23');
  assert.ok(contexts.every((context) => context.energyIsHint === true));
});

test('AI input carries only wanted foods, pantry, canonical settings, actual food and shopping names', () => {
  const log = [{
    id: 'e1', date: '2026-11-21', slot: 'lunch', status: 'ate',
    text: 'lentil soup', createdAt: 1, updatedAt: 1,
  }];
  const preferences = {
    ...DEFAULT_PREFERENCES,
    medicationTime: '07:30',
    dietPreferences: 'vegetarian',
    allergies: 'peanuts',
    avoidFoods: 'sesame',
    cookingMinutes: 25,
    equipment: 'pan, oven',
    servings: 2,
    leftovers: true,
    cuisinePreference: 'Thai',
    shopping: 'Corner shop',
    budget: 'low',
  };
  const input = buildRangeInput(request({
    log,
    alarmingSymptoms: true,
    pantry: ['oats'],
    preferences,
    currentShopping: [
      { name: 'Lentils', status: 'bought', inPlan: true, source: 'ai' },
      { name: 'Rice', status: 'open', inPlan: false, source: 'user' },
    ],
  }));
  assert.deepEqual(Object.keys(input), [
    'range', 'days', 'wants', 'pantry', 'settings', 'actual', 'shoppingList', 'todayHint', 'alarmingSymptoms',
  ]);
  assert.deepEqual(input.wants, ['lentil soup']);
  assert.deepEqual(input.pantry, ['oats']);
  assert.deepEqual(input.actual, [{ date: '2026-11-21', slot: 'lunch', status: 'ate', text: 'lentil soup' }]);
  assert.deepEqual(input.todayHint, { date: '2026-11-21', energy: 'medium' });
  assert.equal(input.alarmingSymptoms, true);
  assert.deepEqual(input.settings, {
    medicationTime: '07:30',
    mealTimes: { breakfast: '08:00', lunch: '12:30', dinner: '18:30' },
    dietPreferences: 'vegetarian',
    allergies: ['peanuts'],
    avoidFoods: ['sesame'],
    cookingMinutes: 25,
    equipment: ['pan', 'oven'],
    servings: 2,
    leftovers: true,
    cuisinePreference: 'Thai',
    shopping: 'Corner shop',
    budget: 'low',
  });
  assert.deepEqual(input.shoppingList, ['Lentils', 'Rice']);
  assert.ok(input.shoppingList.every((name) => typeof name === 'string'));
  assert.ok(!JSON.stringify(input.shoppingList).includes('status'));
  assert.ok(!JSON.stringify(input.shoppingList).includes('inPlan'));
  assert.ok(!JSON.stringify(input.shoppingList).includes('source'));
  assert.equal(JSON.stringify(input).includes('symptoms":'), false);
  assert.equal(JSON.stringify(input).includes('checkIn'), false);

  const prompt = buildRangePrompt(input, facts);
  assert.ok(prompt.startsWith(DIET_SYSTEM_PROMPT));
  assert.match(prompt, /fallback meal/);
  assert.match(prompt, /shopping list/);
  assert.match(prompt, /"id":"T8"/);
});

test('range response is validated: facts filtered, fallback added, pantry removed from shopping', () => {
  const raw = JSON.stringify({
    summary: 'Two steady-energy days using what you have.',
    meals: [
      {
        day: '2026-11-21', slot: 'breakfast', kind: 'main', idea: 'Oats with berries',
        prepMinutes: 8, why: 'Quick and filling.', ingredients: ['oats', 'berries'], factIds: ['T1', 'FAKE'],
      },
      {
        day: '2026-11-22', slot: 'dinner', kind: 'main', idea: 'Lentil soup',
        prepMinutes: 20, why: 'Uses pantry lentils.', ingredients: ['lentils', 'oats'], factIds: ['T8'],
      },
    ],
    timingNotes: [{ text: 'Keep timing steady.', factIds: ['T1'] }],
    shopping: ['oats', 'lentils', 'lentils'],
    urgent: false,
  });
  const result = parseRangePlan(raw, facts, request(), DEFAULT_PREFERENCES);
  assert.equal(result.error, undefined);
  assert.equal(result.plan.source, 'ai');
  assert.equal(result.plan.days.length, 2);
  assert.deepEqual(result.plan.days[0].meals[0].factIds, ['T1']);
  assert.ok(result.plan.days[1].meals.some((meal) => meal.kind === 'fallback' && meal.prepMinutes <= 10));
  const shoppingNames = result.plan.shopping.map((item) => item.name);
  assert.ok(shoppingNames.includes('berries'));
  assert.ok(shoppingNames.includes('lentils'));
  assert.ok(shoppingNames.every((name) => !['oats', 'rice'].includes(name.toLowerCase())));
  assert.equal(shoppingNames.length, new Set(shoppingNames.map((name) => name.toLowerCase())).size);
});

test('alarming symptoms produce urgent guidance for each day and no meals', () => {
  const req = request({ alarmingSymptoms: true });
  const plan = emergencyRangePlan(req);
  assert.equal(plan.days.length, 2);
  assert.ok(plan.days.every((day) => day.urgent && day.meals.length === 0));
  assert.match(plan.days[0].summary, /emergency services/);

  const parsed = parseRangePlan('not json', facts, req, DEFAULT_PREFERENCES);
  assert.equal(parsed.plan.days[0].urgent, true);
  assert.equal(parsed.plan.days[0].meals.length, 0);
});

test('next week is seven days with a low-energy fallback and one short shopping list', () => {
  const now = new Date(2026, 10, 21, 12);
  const contexts = buildContextsForDates(
    { energy: 3, tasks: [], habits: [], log: {} },
    datesForRange('week', now),
    DEFAULT_PREFERENCES,
    today,
  );
  const plan = heuristicRangePlan(
    request({ range: 'week', contexts, dates: contexts.map((context) => context.date) }),
    DEFAULT_PREFERENCES,
  );
  assert.equal(plan.days.length, 7);
  assert.ok(plan.days.every((day) => day.meals.some((meal) => meal.kind === 'fallback')));
  assert.ok(plan.days.every((day) => day.meals.filter((meal) => meal.kind === 'fallback').every((meal) => meal.prepMinutes <= 10)));
  assert.ok(plan.days.every((day) => day.meals.some((meal) => meal.kind === 'main')));
  assert.equal(plan.shopping.length, new Set(plan.shopping.map((item) => item.name.toLowerCase())).size);
  assert.ok(plan.shopping.every((item) => !['oats', 'rice'].includes(item.name.toLowerCase())));
});

test('bought items move into the pantry and tick off the list', () => {
  const shopping = buildShoppingList([], ['oats', 'rice'], ['lentils', 'oats', 'rice']);
  assert.deepEqual(shopping.map((item) => item.name), ['lentils']);
  const pantry = [{ id: 'p1', name: 'oats', addedAt: 1 }];
  const result = markBought(pantry, shopping, shopping[0].id);
  assert.deepEqual(result.pantry.map((item) => item.name), ['oats', 'lentils']);
  assert.equal(result.shopping[0].status, 'bought');
});

test('meal statuses and editable actual entries normalize safely', () => {
  const plan = heuristicRangePlan(request(), DEFAULT_PREFERENCES);
  const day = plan.days[0];
  const marked = markMeal(day, day.meals[0].id, 'ate');
  assert.equal(marked.meals[0].status, 'ate');
  assert.equal(day.meals[0].status, 'planned');

  const storedDate = new Date().toISOString().slice(0, 10);
  const stored = normalizeDietData({
    pantry: ['oats', 'OATS', 'lentils'],
    wants: { today: ['soup'], tomorrow: ['salad'], week: ['leftovers'] },
    log: [{ date: storedDate, slot: 'lunch', status: 'ate-other', text: ' Vegetable  soup ' }],
    plans: {
      today: {
        range: 'today', days: [{ ...day, date: storedDate }], shopping: plan.shopping,
      },
    },
  }, facts);
  assert.deepEqual(stored.pantry.map((item) => item.name), ['oats', 'lentils']);
  assert.deepEqual(stored.wants.week, ['leftovers']);
  assert.equal(stored.log[0].text, 'Vegetable soup');
  assert.equal(stored.log[0].status, 'ate-other');
  assert.equal(stored.plans.today.days[0].meals[0].id, day.meals[0].id);
});

test('a legacy saved plan converts into a Today range plan', () => {
  const legacy = {
    summary: 'Old saved plan', meals: [], timingNotes: [], urgent: false,
    context: today, source: 'offline', generatedAt: 1,
  };
  const converted = legacyRangePlan(legacy, ['oats']);
  assert.equal(converted.range, 'today');
  assert.equal(converted.days[0].date, '2026-11-21');
  assert.equal(converted.source, 'offline');
  assert.deepEqual(converted.shopping, []);
});

test('Profile settings are normalised and destructive log copy uses the shared dialog shape', () => {
  const settings = normalizeDietSettings({
    medicationTime: '7:00',
    breakfastTime: '25:99',
    dietPreferences: 'vegetarian',
    allergies: 'peanuts, shellfish',
    avoidFoods: 'sesame',
    cookingMinutes: 9999,
    equipment: 'blender',
    servings: 3,
    leftovers: true,
    cuisinePreference: 'Thai',
    shopping: 'Local shop',
    budget: 'high',
  });
  assert.equal(settings.medicationTime, '07:00');
  assert.equal(settings.breakfastTime, DEFAULT_DIET_SETTINGS.breakfastTime);
  assert.equal(settings.dietPreferences, 'vegetarian');
  assert.equal(settings.allergies, 'peanuts, shellfish');
  assert.equal(settings.avoidFoods, 'sesame');
  assert.equal(settings.cookingMinutes, 240);
  assert.equal(settings.servings, 3);
  assert.equal(settings.leftovers, true);
  assert.equal(settings.budget, 'high');
  assert.equal('energyOverride' in settings, false);
  assert.equal('busynessOverride' in settings, false);

  const copy = confirmCopy('My actual lunch');
  assert.equal(copy.title, 'Delete food entry?');
  assert.equal(copy.subject, 'My actual lunch');
  assert.equal(copy.tone, 'danger');
  assert.equal(copy.confirmLabel, 'Delete entry');
});

test('legacy profile field names still migrate to canonical settings', () => {
  const migrated = normalizeDietSettings({
    diet: 'vegetarian', avoid: 'peanuts, shellfish', maxCookMinutes: 45,
  });
  assert.equal(migrated.dietPreferences, 'vegetarian');
  assert.equal(migrated.allergies, 'peanuts, shellfish');
  assert.equal(migrated.avoidFoods, 'peanuts, shellfish');
  assert.equal(migrated.cookingMinutes, 45);
});

test('remaining slots use Profile meal times and always keep snacks', () => {
  const settings = { ...DEFAULT_PREFERENCES, breakfastTime: '08:00', lunchTime: '13:00', dinnerTime: '19:00' };
  assert.deepEqual(remainingSlots(settings, new Date(2026, 10, 21, 7, 0)), ['breakfast', 'lunch', 'dinner', 'snack']);
  assert.deepEqual(remainingSlots(settings, new Date(2026, 10, 21, 10, 0)), ['lunch', 'dinner', 'snack']);
  assert.deepEqual(remainingSlots(settings, new Date(2026, 10, 21, 16, 0)), ['dinner', 'snack']);
  assert.deepEqual(remainingSlots(settings, new Date(2026, 10, 21, 22, 0)), ['snack']);
});

test('eaten food is removed from what is left at home; skipped food is not', () => {
  const pantry = ['oats', 'lentils', 'rice', 'yoghurt'];
  const log = [
    { date: '2026-11-21', slot: 'breakfast', status: 'ate', text: 'Oats with berries' },
    { date: '2026-11-21', slot: 'lunch', status: 'skipped', text: 'Rice and beans' },
  ];
  assert.deepEqual(remainingPantry(pantry, log, ['2026-11-21']), ['lentils', 'rice', 'yoghurt']);
  assert.deepEqual(remainingPantry(pantry, log, ['2026-11-22']), ['lentils', 'rice', 'yoghurt']);
  assert.deepEqual(remainingPantry(pantry, [], ['2026-11-21']), pantry);
});

test('Today plan keeps only meals still ahead and rebuilds the shopping list', () => {
  const settings = { ...DEFAULT_PREFERENCES, breakfastTime: '08:00', lunchTime: '13:00', dinnerTime: '19:00' };
  const base = heuristicRangePlan(request({ range: 'today' }), settings);
  assert.deepEqual(base.days[0].meals.map((meal) => meal.slot), ['breakfast', 'lunch', 'dinner', 'snack']);

  const later = restrictToRemainingMeals(base, settings, ['oats', 'rice'], new Date(2026, 10, 21, 16, 0));
  assert.deepEqual(later.days[0].meals.map((meal) => meal.slot), ['dinner', 'snack']);
  assert.deepEqual(base.days[0].meals.map((meal) => meal.slot), ['breakfast', 'lunch', 'dinner', 'snack']);
  assert.ok(later.shopping.every((item) => !['oats', 'rice'].includes(item.name.toLowerCase())));

  const unchanged = restrictToRemainingMeals(base, settings, [], new Date(2026, 10, 21, 7, 0));
  assert.equal(unchanged, base);
});
