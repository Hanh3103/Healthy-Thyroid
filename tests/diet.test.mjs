import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DIET_SYSTEM_PROMPT,
  DEFAULT_PREFERENCES,
  buildDietContext,
  buildDietInput,
  buildDietPrompt,
  buildTimingNotes,
  computeBusyness,
  detectAlarmingSymptoms,
  heuristicDietPlan,
  normalizeDietData,
  normalizePreferences,
  parseDietPlan,
} from '../src/features/diet/model.ts';

const facts = JSON.parse(readFileSync(new URL('../src/features/diet/knowledge/thyroidFacts.json', import.meta.url), 'utf8'));
const lowPacked = { date: '2026-11-21', energy: 'low', busyness: 'packed', totalMinutes: 360, taskCount: 9 };
const highLight = { date: '2026-11-21', energy: 'high', busyness: 'light', totalMinutes: 45, taskCount: 2 };

test('curated library has the expected shape and verification flags', () => {
  assert.deepEqual(facts.map((fact) => fact.id), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']);
  for (const fact of facts) {
    assert.match(fact.text, /\S/);
    assert.ok(['strong', 'moderate', 'limited'].includes(fact.evidence));
    assert.match(fact.source.url, /^https:\/\//);
    assert.match(fact.lastReviewed, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof fact.verified, 'boolean');
  }
  assert.equal(facts.filter((fact) => fact.verified).length, 1);
  assert.equal(facts.find((fact) => fact.id === 'T8').verified, true);
});

test('busyness uses the 2h and 5h boundaries', () => {
  assert.equal(computeBusyness(0), 'light');
  assert.equal(computeBusyness(119), 'light');
  assert.equal(computeBusyness(120), 'normal');
  assert.equal(computeBusyness(300), 'normal');
  assert.equal(computeBusyness(301), 'packed');
});

test('context counts today tasks plus habit minutes without Profile overrides', () => {
  const state = {
    energy: 2,
    tasks: [
      { id: 'a', imp: 4, min: 30, done: false },
      { id: 'b', imp: 4, min: 20, done: false },
      { id: 'c', imp: 4, min: 90, done: true },
    ],
    habits: [{ id: 'walk', name: 'Walk', by: { 1: { min: 10, txt: '' }, 2: { min: 15, txt: '' }, 3: { min: 25, txt: '' } } }],
    log: {},
  };
  const now = new Date(2026, 10, 21, 12);
  const context = buildDietContext(state, 2, DEFAULT_PREFERENCES, now);

  assert.equal(context.date, '2026-11-21');
  assert.equal(context.energy, 'medium');
  assert.equal(context.taskCount, 2);
  assert.equal(context.totalMinutes, 65);
  assert.equal(context.busyness, 'light');
  const withStaleOverrides = buildDietContext(state, 2, {
    ...DEFAULT_PREFERENCES,
    energyOverride: 'high',
    busynessOverride: 'packed',
  }, now);
  assert.equal(withStaleOverrides.energy, 'medium', 'energy comes from Daily Check-in, not Profile');
  assert.equal(withStaleOverrides.busyness, 'light', 'busyness comes from tasks and habits, not Profile');
});

test('prompt carries the rules, curated facts and only the needed inputs', () => {
  const input = buildDietInput(lowPacked, {
    ...DEFAULT_PREFERENCES,
    allergies: 'peanuts',
    avoidFoods: 'sesame',
    dietPreferences: 'vegetarian',
    cookingMinutes: 20,
  }, false);
  const prompt = buildDietPrompt(input, facts);

  assert.ok(prompt.startsWith(DIET_SYSTEM_PROMPT));
  assert.match(prompt, /never give medical advice/);
  assert.match(prompt, /factIds/);
  assert.match(prompt, /"id":"T8"/);
  assert.match(prompt, /"energy":"low"/);
  assert.match(prompt, /"allergies":"peanuts"/);
  assert.match(prompt, /"avoidFoods":"sesame"/);
  assert.match(prompt, /"dietPreferences":"vegetarian"/);
  assert.match(prompt, /"cookingMinutes":20/);
  const today = JSON.parse(prompt.split('\nTODAY:\n')[1]);
  assert.deepEqual(Object.keys(today), [
    'date', 'energy', 'busyness', 'totalMinutes', 'taskCount', 'preferences', 'alarmingSymptoms',
  ]);
  assert.deepEqual(today.preferences, input.preferences);
  assert.equal(today.alarmingSymptoms, false);
});

test('AI JSON is validated: fences stripped, unknown facts dropped, meals completed', () => {
  const raw = '```json\n' + JSON.stringify({
    summary: 'Packed day, low energy: keep it simple.',
    meals: [
      { slot: 'breakfast', idea: 'Yoghurt and oats', prepMinutes: 5, why: 'Quick protein and fibre.', factIds: ['T1', 'ZZ9'] },
      { slot: 'snack', idea: 'Apple and nuts', prepMinutes: 3, why: 'Easy to pack.', factIds: ['T1'] },
      { slot: 'snack', idea: 'Cottage cheese', prepMinutes: 3, why: 'Easy to pack.', factIds: [] },
      { slot: 'snack', idea: 'Third snack', prepMinutes: 3, why: 'Too many.', factIds: [] },
    ],
    timingNotes: [{ text: 'Keep coffee away from the dose.', factIds: ['T2', 'NOPE'] }],
    urgent: false,
  }) + '\n```';

  const result = parseDietPlan(raw, facts, lowPacked, DEFAULT_PREFERENCES);
  assert.equal(result.plan.source, 'ai');
  assert.deepEqual(result.plan.meals.map((meal) => meal.slot), ['breakfast', 'snack', 'snack', 'lunch', 'dinner']);
  assert.equal(result.plan.meals.filter((meal) => meal.slot === 'snack').length, 2);
  assert.deepEqual(result.plan.meals[0].factIds, ['T1']);
  const coffeeNote = result.plan.timingNotes.find((note) => /coffee/i.test(note.text));
  assert.deepEqual(coffeeNote.factIds, ['T2']);
  assert.ok(result.plan.timingNotes.some((note) =>
    /^Breakfast: 08:00$/.test(note.text) && note.factIds.length === 0));
  assert.equal(result.plan.timingNotes.some((note) => note.factIds.includes('T1')), false);
});

test('medical claims are rejected and alarming symptoms force an urgent plan', () => {
  const bad = JSON.stringify({
    summary: 'This meal plan cures thyroid disease.',
    meals: [],
    timingNotes: [],
    urgent: false,
  });
  const result = parseDietPlan(bad, facts, lowPacked, DEFAULT_PREFERENCES);
  assert.equal(result.plan, null);
  assert.match(result.error, /medical claim/);

  const urgent = parseDietPlan('{}', facts, lowPacked, DEFAULT_PREFERENCES, true).plan;
  assert.equal(urgent.urgent, true);
  assert.equal(urgent.meals.length, 0);
  assert.match(urgent.summary, /emergency services/);
  assert.ok(detectAlarmingSymptoms('I had chest pain this morning'));
  assert.ok(detectAlarmingSymptoms('very fast heartbeat'));
  assert.equal(detectAlarmingSymptoms('tired but fine'), false);
});

test('urgent AI responses replace the meals with emergency guidance', () => {
  const plan = parseDietPlan('{"summary":"","urgent":true}', facts, lowPacked, DEFAULT_PREFERENCES).plan;
  assert.equal(plan.urgent, true);
  assert.equal(plan.meals.length, 0);
  assert.match(plan.summary, /doctor or emergency services/);
});

test('packed/low fallback keeps every meal at 10 minutes or less', () => {
  const plan = heuristicDietPlan(lowPacked, { ...DEFAULT_PREFERENCES, cookingMinutes: 60 });
  assert.equal(plan.source, 'offline');
  assert.deepEqual(plan.meals.map((meal) => meal.slot), ['breakfast', 'lunch', 'dinner', 'snack']);
  assert.ok(plan.meals.every((meal) => meal.prepMinutes <= 10));
  assert.match(plan.summary, /Packed day, low energy: keep it simple/);
  assert.match(plan.summary, /water/);
  const timing = buildTimingNotes(DEFAULT_PREFERENCES);
  assert.deepEqual(timing.map((note) => note.text), [
    'Breakfast: 08:00', 'Lunch: 12:30', 'Dinner: 18:30',
  ]);
  assert.ok(timing.every((note) => note.factIds.length === 0));
  assert.ok(timing.every((note) => !/supplement|vitamin|dose|advice|doctor/i.test(note.text)));
});

test('light/high fallback allows cooking and adds a meal-prep idea', () => {
  const plan = heuristicDietPlan(highLight, DEFAULT_PREFERENCES);
  assert.match(plan.summary, /Light day, high energy/);
  assert.match(plan.summary, /Meal-prep for tomorrow/);
});

test('allergies and preferences are respected in fallback ideas', () => {
  const noPeanuts = heuristicDietPlan(lowPacked, { ...DEFAULT_PREFERENCES, avoidFoods: 'peanuts' });
  assert.ok(noPeanuts.meals.every((meal) => !/peanut/i.test(meal.idea)));
  const vegetarian = heuristicDietPlan(highLight, {
    ...DEFAULT_PREFERENCES, dietPreferences: 'vegetarian',
  });
  assert.ok(vegetarian.meals.every((meal) => !/\b(fish|chicken|turkey|salmon)\b/i.test(meal.idea)));
});

test('stored preferences and plans are normalized safely', () => {
  const prefs = normalizePreferences({
    medicationTime: '7:00', allergies: 'peanuts', cookingMinutes: 9999,
  });
  assert.equal(prefs.medicationTime, '07:00');
  assert.equal(prefs.allergies, 'peanuts');
  assert.equal(prefs.cookingMinutes, 240);
  assert.equal('energyOverride' in prefs, false);
  assert.equal('busynessOverride' in prefs, false);
  const legacy = normalizePreferences({ diet: 'vegetarian', avoid: 'sesame', maxCookMinutes: 45 });
  assert.equal(legacy.dietPreferences, 'vegetarian');
  assert.equal(legacy.allergies, 'sesame');
  assert.equal(legacy.avoidFoods, 'sesame');
  assert.equal(legacy.cookingMinutes, 45);

  const stored = normalizeDietData({
    preferences: prefs,
    consentGiven: true,
    lastPlan: { summary: 'Saved plan', meals: [{ slot: 'lunch', idea: 'Soup', why: 'Warm', prepMinutes: 10, factIds: ['T1', 'BAD'] }], timingNotes: [], urgent: false },
  }, facts);
  assert.equal(stored.consentGiven, true);
  assert.deepEqual(stored.lastPlan.meals[0].factIds, ['T1']);
});
