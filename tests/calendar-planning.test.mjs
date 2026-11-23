import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PLAN_AHEAD_DAYS,
  basisLine,
  buildRangePlanFromDays,
  canAdvanceMonth,
  isDatePlannable,
  lastPlannableDate,
  maxPlannableWeekOffset,
  clippedPlanMessage,
  clearMealDataForDates,
  dayPlansFromRangePlans,
  normalizeDietData,
  planningWeekFor,
  storeRangePlanInDays,
  toDietLogEntries,
} from '../src/features/diet/model.ts';
import { keyOf } from '../src/shared/utils/index.ts';

const now = new Date(2026, 10, 21, 12);
const today = keyOf(now);
const context = {
  date: today,
  energy: 'medium',
  busyness: 'light',
  totalMinutes: 0,
  taskCount: 0,
};
const meal = {
  id: 'm1',
  day: today,
  slot: 'lunch',
  kind: 'main',
  idea: 'Lentil soup',
  prepMinutes: 10,
  why: 'Steady energy.',
  factIds: [],
  ingredients: ['lentils'],
  status: 'planned',
};
const day = {
  date: today,
  summary: 'Simple meals for today.',
  meals: [meal],
  timingNotes: [],
  urgent: false,
  context,
  source: 'offline',
  generatedAt: 1,
};
const shopping = [{ id: 's1', name: 'lentils', quantity: undefined, source: 'ai', status: 'open', inPlan: true, isNew: undefined, forDays: [today], createdAt: 1, updatedAt: 1 }];
const rangePlan = {
  range: 'today',
  days: [day],
  shopping,
  source: 'offline',
  generatedAt: 1,
};

test('planning horizon is a single constant with past days always allowed', () => {
  assert.equal(PLAN_AHEAD_DAYS, 14);
  assert.equal(keyOf(lastPlannableDate(now)), '2026-12-05');
  assert.equal(isDatePlannable('2026-11-20', now), true);
  assert.equal(isDatePlannable(today, now), true);
  assert.equal(isDatePlannable('2026-12-05', now), true);
  assert.equal(isDatePlannable('2026-12-06', now), false);
  assert.equal(isDatePlannable('not-a-date', now), false);
});

test('week and month navigation stop at the last week inside the horizon', () => {
  assert.equal(maxPlannableWeekOffset(now), 2);
  assert.equal(canAdvanceMonth(2026, 10, now), true);
  assert.equal(canAdvanceMonth(2026, 11, now), false);
});

test('a clipped week plans only days inside the horizon and explains the rest', () => {
  const week = planningWeekFor('2026-12-05', now);
  assert.deepEqual(week.dates, ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
  assert.equal(week.clipped, 1);
  assert.equal(
    clippedPlanMessage(week.dates.length, week.total),
    'Planned 6 of 7 days. The rest opens as the days get closer.',
  );
  assert.equal(clippedPlanMessage(7, 7), '');
});

test('range plans migrate into per-date plans and rebuild from saved dates', () => {
  const dayPlans = dayPlansFromRangePlans({ today: rangePlan, tomorrow: null, week: null });
  assert.equal(dayPlans[today].date, today);
  assert.equal(dayPlans[today].range, 'today');
  assert.equal(dayPlans[today].shoppingList, undefined);

  const data = normalizeDietData({ plans: { today: rangePlan } }, []);
  assert.equal(data.shopping.length, 1);
  assert.equal(data.shopping[0].name, 'lentils');
  assert.deepEqual(data.shopping[0].forDays, [today]);

  const rebuilt = buildRangePlanFromDays('today', [today], dayPlans, undefined, data.shopping);
  assert.equal(rebuilt.days.length, 1);
  assert.equal(rebuilt.shopping[0].name, 'lentils');
  assert.equal(buildRangePlanFromDays('today', ['2026-11-22'], dayPlans), null);
});

test('generated plans are saved per date and keep only that day’s shopping items', () => {
  const data = normalizeDietData({}, []);
  storeRangePlanInDays(data, rangePlan, 'today', undefined, now);

  assert.equal(data.dayPlans[today].summary, day.summary);
  assert.equal(data.dayPlans[today].shoppingList, undefined);
  assert.equal(data.shopping.length, 1);
  assert.equal(data.shopping[0].name, 'lentils');
  assert.deepEqual(data.shopping[0].forDays, [today]);
  assert.equal(data.plans.today.days[0].meals[0].status, 'planned');

  data.dayPlans[today].meals[0].status = 'ate';
  const rebuilt = buildRangePlanFromDays('today', [today], data.dayPlans, undefined, data.shopping);
  assert.equal(rebuilt.days[0].meals[0].status, 'ate');
});

test('day answers and consent survive a save and explain the generated plan', () => {
  const data = normalizeDietData({
    consentChoice: 'allowed',
    dayAnswers: {
      [today]: {
        pantry: ['eggs', 'oats', 'rice', 'eggs'],
        wants: ['soup'],
        scope: 'week',
        savePantry: false,
        updatedAt: 42,
      },
    },
  }, []);
  assert.equal(data.consentChoice, 'allowed');
  assert.equal(data.consentGiven, true);
  assert.deepEqual(data.dayAnswers[today].pantry, ['eggs', 'oats', 'rice']);
  assert.equal(data.dayAnswers[today].scope, 'week');
  assert.equal(data.dayAnswers[today].savePantry, false);

  const basis = { pantry: ['eggs', 'oats', 'rice'], wants: ['soup'] };
  assert.equal(
    basisLine(basis),
    'Based on: eggs, oats, rice at home. You wanted: soup.',
  );

  storeRangePlanInDays(data, rangePlan, 'today', undefined, now, basis);
  assert.deepEqual(data.dayPlans[today].basedOn, basis);
  const restored = normalizeDietData({ dayPlans: data.dayPlans }, []);
  assert.deepEqual(restored.dayPlans[today].basedOn, { ...basis, appetite: undefined });
});

test('clearing test dates removes plans, answers and log entries but keeps settings', () => {
  const tomorrow = '2026-11-22';
  const data = normalizeDietData({
    consentChoice: 'allowed',
    pantry: [{ name: 'oats', checked: false, addedAt: 1 }],
    wants: { today: ['soup'], tomorrow: [], week: [] },
  }, []);
  storeRangePlanInDays(data, rangePlan, 'today', undefined, now);
  storeRangePlanInDays(data, {
    ...rangePlan,
    range: 'week',
    days: [{ ...day, date: tomorrow }],
  }, 'week', undefined, now);
  data.dayAnswers[today] = {
    pantry: ['oats'], wants: ['soup'], scope: 'day', savePantry: true, updatedAt: 2,
  };
  data.dayAnswers[tomorrow] = {
    pantry: ['rice'], wants: [], scope: 'day', savePantry: true, updatedAt: 3,
  };
  data.log.push({
    id: 'e1', date: tomorrow, slot: 'lunch', status: 'ate',
    text: 'Soup', createdAt: 1, updatedAt: 1,
  });

  const cleared = clearMealDataForDates(data, [today, tomorrow, '2026-12-06'], now);

  assert.deepEqual(cleared, [today, tomorrow]);
  assert.equal(data.dayPlans[today], undefined);
  assert.equal(data.dayPlans[tomorrow], undefined);
  assert.equal(data.dayAnswers[today], undefined);
  assert.equal(data.dayAnswers[tomorrow], undefined);
  assert.equal(data.log.length, 0);
  assert.equal(data.plans.today, null);
  assert.equal(data.plans.week, null);
  assert.equal(data.consentChoice, 'allowed');
  assert.equal(data.pantry.length, 1);
  assert.equal(data.pantry[0].name, 'oats');
  assert.deepEqual(data.wants.today, ['soup']);
});

test('public diet log entries expose meal, status, text and date', () => {
  const entries = toDietLogEntries([{
    id: 'e1',
    date: today,
    slot: 'lunch',
    status: 'ate',
    text: 'Lentil soup',
    createdAt: 1,
    updatedAt: 1,
  }]);
  assert.deepEqual(entries, [{
    date: today,
    meal: 'lunch',
    status: 'ate',
    text: 'Lentil soup',
  }]);
});
