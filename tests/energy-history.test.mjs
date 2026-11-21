import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCurrentWeek,
  buildEnergyCalendar,
  buildEnergyWeek,
  normalizeCalendarMode,
  normalizeEnergyHistory,
  normalizeState,
  summarizeEnergyMonth,
} from '../src/features/planner/model.ts';

test('normalizeEnergyHistory keeps only valid dates and levels', () => {
  const result = normalizeEnergyHistory({
    '2026-11-01': 1,
    '2026-11-02': 2,
    '2026-11-03': 3,
    '2026-11-04': 9,
    '2026-02-30': 1,
    'not-a-date': 2,
    '2026-11-05': '3',
  });

  assert.deepEqual(result, {
    '2026-11-01': 1,
    '2026-11-02': 2,
    '2026-11-03': 3,
  });
});

test('normalizeState backfills the legacy day and resets stale energy', () => {
  const today = new Date('2026-11-21T12:00:00');
  const normalized = normalizeState({
    tasks: [],
    energy: 3,
    energyDay: '2026-11-18',
    log: {},
    habits: [],
    plan: null,
  }, today);

  assert.ok(normalized);
  assert.equal(normalized.energy, 2);
  assert.equal(normalized.energyDay, '2026-11-21');
  assert.deepEqual(normalized.energyHistory, { '2026-11-18': 3 });
});

test('normalizeState restores today from saved history', () => {
  const today = new Date('2026-11-21T12:00:00');
  const normalized = normalizeState({
    tasks: [],
    energy: 3,
    energyDay: '2026-11-21',
    energyHistory: { '2026-11-21': 3 },
    log: {},
    habits: [],
    plan: null,
  }, today);

  assert.ok(normalized);
  assert.equal(normalized.energy, 3);
  assert.deepEqual(normalized.energyHistory, { '2026-11-21': 3 });
});

test('buildEnergyCalendar returns a Monday-first month with saved levels', () => {
  const today = new Date('2026-11-21T12:00:00');
  const calendar = buildEnergyCalendar(2026, 10, {
    '2026-10-31': 1,
    '2026-11-01': 1,
    '2026-11-02': 2,
    '2026-11-05': 3,
  }, today);

  assert.equal(calendar.weeks.length, 6);
  assert.equal(calendar.weeks[0][6].key, '2026-11-01');
  assert.equal(calendar.weeks[0][6].level, 1);
  assert.equal(calendar.weeks[0][0].inMonth, false);
  assert.equal(calendar.weeks[1][0].key, '2026-11-02');
  assert.equal(calendar.recordedDays, 3);
  assert.deepEqual(calendar.counts, { 1: 1, 2: 1, 3: 1 });

  const day = (key) => calendar.weeks.flat().find((item) => item.key === key);
  assert.equal(day('2026-11-20').isPast, true);
  assert.equal(day('2026-11-21').isToday, true);
  assert.equal(day('2026-11-22').isFuture, true);
});

test('buildCurrentWeek always returns Monday to Sunday around today', () => {
  const today = new Date('2026-11-21T12:00:00');
  const week = buildCurrentWeek({
    '2026-11-16': 1,
    '2026-11-18': 2,
    '2026-11-21': 3,
  }, today);

  assert.equal(week.days.length, 7);
  assert.equal(week.days[0].key, '2026-11-16');
  assert.equal(week.days[6].key, '2026-11-22');
  assert.deepEqual(week.days.map((day) => day.level), [1, null, 2, null, null, 3, null]);
  assert.equal(week.days[5].isToday, true);
  assert.equal(week.days[6].isFuture, true);
  assert.equal(week.offset, 0);
  assert.equal(week.range, '2026-11-16 – 2026-11-22');
  assert.match(week.label, /16/);
  assert.match(week.label, /22/);
  assert.match(week.label, /2026/);
});

test('buildEnergyWeek moves back one Monday-to-Sunday week per offset', () => {
  const today = new Date('2026-11-21T12:00:00');
  const week = buildEnergyWeek({
    '2026-11-10': 2,
    '2026-11-18': 3,
  }, today, -1);

  assert.equal(week.offset, -1);
  assert.equal(week.range, '2026-11-09 – 2026-11-15');
  assert.deepEqual(week.days.map((day) => day.key), [
    '2026-11-09',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
    '2026-11-15',
  ]);
  assert.deepEqual(week.days.map((day) => day.level), [null, 2, null, null, null, null, null]);
  assert.equal(week.days.every((day) => day.isPast), true);
  assert.equal(week.days.some((day) => day.isToday || day.isFuture), false);
});

test('summarizeEnergyMonth reports logged days, average and most common level', () => {
  const calendar = buildEnergyCalendar(2026, 10, {
    '2026-10-31': 1,
    '2026-11-01': 1,
    '2026-11-02': 2,
    '2026-11-05': 3,
    '2026-11-06': 3,
  }, new Date('2026-11-21T12:00:00'));

  assert.deepEqual(summarizeEnergyMonth(calendar), {
    logged: 4,
    average: 2.3,
    mostCommon: 3,
  });
  assert.deepEqual(summarizeEnergyMonth(buildEnergyCalendar(2026, 9, {}, new Date('2026-11-21T12:00:00'))), {
    logged: 0,
    average: null,
    mostCommon: null,
  });
});

test('normalizeCalendarMode defaults unknown values to week', () => {
  assert.equal(normalizeCalendarMode('month'), 'month');
  assert.equal(normalizeCalendarMode('week'), 'week');
  assert.equal(normalizeCalendarMode('unknown'), 'week');
  assert.equal(normalizeCalendarMode(null), 'week');
});
