import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDietAiPrompt,
  buildDietAiRequest,
  buildTimingTimeline,
  normalizeDietAiReply,
} from '../src/features/diet/ai.ts';
import { DIET_SYSTEM_PROMPT } from '../src/features/diet/model.ts';
import { normalizeDietSettings } from '../src/features/profile/dietSettings.ts';

const TODAY = '2026-11-22';
const TOMORROW = '2026-11-23';
const now = new Date(2026, 10, 22, 9, 0);
const facts = [{
  id: 'T1',
  text: 'Fibre supports regularity.',
  evidence: 'moderate',
  source: { title: 'Curated fact', url: 'https://example.org/fact' },
  lastReviewed: '2026-01-01',
  verified: true,
}];
const preferences = normalizeDietSettings({
  medicationTime: '07:30',
  breakfastTime: '08:00',
  lunchTime: '12:30',
  dinnerTime: '18:30',
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
});
const state = {
  energy: 2,
  tasks: [
    {
      id: 't1', title: 'PRIVATE_TASK_NAME', imp: 4, min: 360,
      due: TODAY, done: false, ex: false, est: true, locked: false, reason: '',
    },
    {
      id: 't2', title: 'PRIVATE_TASK_TOMORROW', imp: 4, min: 20,
      due: TOMORROW, done: false, ex: false, est: true, locked: false, reason: '',
    },
  ],
  habits: [{ id: 'h1', name: 'PRIVATE_HABIT_NAME', by: { 2: { min: 30, txt: '' } } }],
  log: {},
  checkIns: {
    [TODAY]: {
      symptoms: 'PRIVATE_NOTE',
      symptomEntries: [{ name: 'fatigue', severity: 'mild', note: 'PRIVATE_NOTE' }],
      level: 1,
      suggested: null,
      aiReason: null,
      source: 'manual',
      at: 1,
    },
  },
};

function contexts() {
  return [
    { date: TODAY, energy: 'low', busyness: 'packed', totalMinutes: 360, taskCount: 9 },
    {
      date: TOMORROW, energy: 'high', busyness: 'light', totalMinutes: 30,
      taskCount: 1, energyIsHint: true,
    },
  ];
}

function sources(overrides = {}) {
  return {
    contexts: contexts(),
    state,
    preferences,
    pantry: ['oats', 'rice'],
    recentMeals: [{ date: '2026-11-21', meal: 'lunch', status: 'ate', name: 'Soup' }],
    keepMeals: [],
    shoppingNames: ['Oats', 'Lentils'],
    facts,
    wantsByDate: { [TODAY]: ['soup', 'peanuts'], [TOMORROW]: ['salad'] },
    appetiteByDate: { [TODAY]: 'low' },
    now,
    ...overrides,
  };
}

function request(mode = 'generate', overrides = {}) {
  return buildDietAiRequest({ mode, sources: sources(overrides) });
}

function reply(overrides = {}) {
  return JSON.stringify({
    summary: 'Simple meals.',
    meals: [
      {
        day: TODAY, slot: 'breakfast', kind: 'main', idea: 'Oats with berries',
        prepMinutes: 5, why: 'Quick.', ingredients: ['oats', 'berries', 'salt'], factIds: ['T1', 'FAKE'],
      },
      {
        day: TOMORROW, slot: 'dinner', kind: 'main', idea: 'Rice bowl',
        prepMinutes: 10, why: 'Filling.', ingredients: ['rice', 'pepper'], factIds: [],
      },
    ],
    foodAdvice: [{ text: 'Fibre matters.', factIds: ['T1'] }],
    neededIngredients: ['berries', 'rice', 'water'],
    notes: [],
    urgent: false,
    ...overrides,
  });
}

function validated(raw, req) {
  return JSON.parse(normalizeDietAiReply(raw, req));
}

test('request is an exact whitelist with no free notes or planner names', () => {
  const req = request('generate', {
    freeNote: 'SECRET_FREE_NOTE',
    contexts: [{ ...contexts()[0], note: 'SECRET_CONTEXT_NOTE' }, contexts()[1]],
  });
  assert.deepEqual(Object.keys(req), [
    'mode', 'days', 'profile', 'pantry', 'recentMeals', 'keepMeals',
    'changedMeal', 'currentShoppingList', 'factLibrary',
  ]);
  assert.deepEqual(Object.keys(req.days[0]), [
    'date', 'weekday', 'energyLevel', 'symptoms', 'busyness',
    'wantToEat', 'appetite', 'mealsLeft',
  ]);
  assert.deepEqual(Object.keys(req.profile), [
    'medicationTime', 'mealTimes', 'dietPreferences', 'allergies', 'avoidFoods',
    'cookingMinutes', 'equipment', 'servings', 'cuisinePreference', 'shopping', 'budget',
  ]);
  assert.deepEqual(Object.keys(req.profile.mealTimes), ['breakfast', 'lunch', 'dinner']);
  assert.deepEqual(Object.keys(req.profile.servings), ['people', 'leftovers']);
  assert.deepEqual(req.profile, {
    medicationTime: '07:30',
    mealTimes: { breakfast: '08:00', lunch: '12:30', dinner: '18:30' },
    dietPreferences: 'vegetarian',
    allergies: ['peanuts'],
    avoidFoods: ['sesame'],
    cookingMinutes: 25,
    equipment: ['pan', 'oven'],
    servings: { people: 2, leftovers: true },
    cuisinePreference: 'Thai',
    shopping: 'Corner shop',
    budget: 'low',
  });
  assert.deepEqual(req.days[0].symptoms, [{ name: 'fatigue', severity: 'mild' }]);
  assert.deepEqual(req.recentMeals, [
    { date: '2026-11-21', meal: 'lunch', status: 'ate', name: 'Soup' },
  ]);

  const json = JSON.stringify(req);
  for (const secret of [
    'SECRET_FREE_NOTE', 'SECRET_CONTEXT_NOTE', 'PRIVATE_TASK_NAME',
    'PRIVATE_HABIT_NAME', 'PRIVATE_NOTE',
  ]) {
    assert.equal(json.includes(secret), false, `${secret} must not reach the AI`);
  }
  const prompt = buildDietAiPrompt(req);
  assert.ok(prompt.startsWith(DIET_SYSTEM_PROMPT));
  assert.ok(prompt.includes('"mode":"generate"'));
  assert.equal(prompt.includes('SECRET_FREE_NOTE'), false);
});

test('energyLevel comes from check-ins and busyness from planner tasks and habits', () => {
  const req = request();
  assert.equal(req.days[0].date, TODAY);
  assert.equal(req.days[0].energyLevel, 'low', 'level 1 check-in maps to low');
  assert.equal(req.days[0].busyness, 'packed', '360 minutes of tasks make today packed');
  assert.equal(req.days[1].date, TOMORROW);
  assert.equal(req.days[1].energyLevel, null, 'a day without a check-in has no saved energy');
  assert.equal(req.days[1].busyness, 'light', '20 minutes of tasks keep tomorrow light');
});

test('currentShoppingList contains names only', () => {
  const req = request();
  assert.deepEqual(req.currentShoppingList, ['Oats', 'Lentils']);
  assert.ok(req.currentShoppingList.every((name) => typeof name === 'string'));
});

test('changedMeal is null except in editMeal mode', () => {
  const changedMeal = {
    date: TODAY,
    slot: 'dinner',
    old: { idea: 'Old bowl', ingredients: ['pasta'], prepMinutes: 15 },
    new: { idea: 'New bowl', ingredients: ['rice'], prepMinutes: 10 },
  };
  assert.equal(request('generate', { changedMeal }).changedMeal, null);
  assert.equal(request('regenerate', { changedMeal }).changedMeal, null);
  const edit = request('editMeal', { changedMeal });
  assert.deepEqual(edit.changedMeal, changedMeal);
  assert.deepEqual(Object.keys(edit.changedMeal), ['date', 'slot', 'old', 'new']);
  assert.deepEqual(Object.keys(edit.changedMeal.new), ['idea', 'ingredients', 'prepMinutes']);
});

test('unknown fact ids are dropped and urgent replies replace every meal', () => {
  const req = request();
  const result = validated(reply(), req);
  assert.deepEqual(result.meals[0].factIds, ['T1']);
  assert.deepEqual(result.foodAdvice, [{ text: 'Fibre matters.', factIds: ['T1'] }]);
  assert.deepEqual(result.shopping, result.neededIngredients);

  const urgent = validated(JSON.stringify({
    summary: 'ignore this',
    meals: [{ day: TODAY, slot: 'breakfast', idea: 'Ignore', why: 'x', ingredients: [], factIds: [] }],
    neededIngredients: ['berries'],
    urgent: true,
  }), req);
  assert.equal(urgent.urgent, true);
  assert.deepEqual(urgent.meals, []);
  assert.deepEqual(urgent.foodAdvice, []);
  assert.deepEqual(urgent.neededIngredients, []);
  assert.deepEqual(urgent.shopping, []);
  assert.match(urgent.summary, /emergency services/);
});

test('salt, pepper and water are removed from ingredients and shopping', () => {
  const result = validated(reply(), request());
  assert.deepEqual(result.neededIngredients, ['berries']);
  assert.deepEqual(result.meals[0].ingredients, ['berries']);
  assert.deepEqual(result.meals[1].ingredients, []);
});

test('allergies and avoided foods filter meals and ingredients, with a note for blocked wants', () => {
  const raw = reply({
    meals: [
      {
        day: TODAY, slot: 'breakfast', idea: 'Peanuts on toast', prepMinutes: 5,
        why: 'Quick', ingredients: ['bread'], factIds: [],
      },
      {
        day: TODAY, slot: 'lunch', idea: 'Noodle bowl', prepMinutes: 10,
        why: 'Contains peanuts', ingredients: ['noodles'], factIds: [],
      },
      {
        day: TODAY, slot: 'dinner', idea: 'Rice and beans', prepMinutes: 15,
        why: 'Filling', ingredients: ['rice', 'sesame oil', 'lentils'], factIds: [],
      },
      {
        day: TOMORROW, slot: 'dinner', idea: 'Oatmeal', prepMinutes: 5,
        why: 'Warm', ingredients: ['oats', 'berries'], factIds: [],
      },
    ],
    neededIngredients: ['sesame seeds', 'berries'],
  });
  const result = validated(raw, request());
  assert.deepEqual(result.meals.map((meal) => meal.idea), ['Rice and beans', 'Oatmeal']);
  assert.deepEqual(result.meals[0].ingredients, ['lentils']);
  assert.deepEqual(result.neededIngredients, ['berries']);
  assert.ok(result.notes.some((note) =>
    /conflicts with your allergies or avoided foods/.test(note)));
});

test('editMeal replies drop meals and keep only needed ingredients', () => {
  const req = request('editMeal', {
    changedMeal: {
      date: TODAY,
      slot: 'dinner',
      old: { idea: 'Pasta', ingredients: ['pasta'], prepMinutes: 15 },
      new: { idea: 'Rice bowl', ingredients: ['rice'], prepMinutes: 10 },
    },
  });
  const result = validated(reply({
    meals: [{
      day: TODAY, slot: 'dinner', idea: 'Unexpected new idea', prepMinutes: 10,
      why: 'x', ingredients: ['rice'], factIds: [],
    }],
  }), req);
  assert.deepEqual(result.meals, []);
  assert.deepEqual(result.neededIngredients, ['berries']);
});

test('regenerate rejects kept slots and accepts only the slots still ahead', () => {
  const kept = [{ date: TODAY, slot: 'breakfast', idea: 'Old bowl', ingredients: [], status: 'ate' }];
  const req = request('regenerate', { now: new Date(2026, 10, 22, 16, 0), keepMeals: kept });
  assert.deepEqual(req.days[0].mealsLeft, ['dinner', 'snack']);

  const touchingKept = reply({
    meals: [
      {
        day: TODAY, slot: 'breakfast', idea: 'Changed', prepMinutes: 5,
        why: 'x', ingredients: [], factIds: [],
      },
      {
        day: TOMORROW, slot: 'dinner', idea: 'Rice bowl', prepMinutes: 10,
        why: 'x', ingredients: [], factIds: [],
      },
    ],
  });
  assert.throws(() => normalizeDietAiReply(touchingKept, req), /kept meal/);

  const valid = reply({
    meals: [
      {
        day: TODAY, slot: 'dinner', idea: 'Dinner bowl', prepMinutes: 10,
        why: 'x', ingredients: [], factIds: [],
      },
      {
        day: TODAY, slot: 'snack', idea: 'Fruit', prepMinutes: 3,
        why: 'x', ingredients: [], factIds: [],
      },
      {
        day: TOMORROW, slot: 'dinner', idea: 'Rice bowl', prepMinutes: 10,
        why: 'x', ingredients: [], factIds: [],
      },
    ],
  });
  const result = validated(valid, req);
  assert.deepEqual(result.meals.map((meal) => `${meal.day}:${meal.slot}`), [
    `${TODAY}:dinner`, `${TODAY}:snack`, `${TOMORROW}:dinner`,
  ]);
});

test('timing timeline uses Profile clock times and contains no supplement advice', () => {
  const timeline = buildTimingTimeline(preferences);
  assert.deepEqual(timeline.map((entry) => entry.text), [
    'Medication: 07:30',
    'Breakfast: 08:00',
    'Lunch: 12:30',
    'Dinner: 18:30',
  ]);
  assert.ok(timeline.every((entry) => entry.factIds.length === 0));
  assert.ok(timeline.every((entry) => !/supplement|vitamin|dose|advice|doctor/i.test(entry.text)));
});
