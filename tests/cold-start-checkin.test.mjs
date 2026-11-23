import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import test, { mock } from 'node:test';

import { isCheckInLocked, normalizeState } from '../src/features/planner/model.ts';

// Let the runtime part import usePlanner.ts (its local imports omit extensions).
register('./ts-resolve-loader.mjs', import.meta.url);

const NOW = new Date('2026-11-23T09:00:00');
const savedState = (energyDay = '2026-11-23', checkIns = {}, energyHistory = { '2026-11-22': 1 }) => ({
  tasks: [{ id: 't1', title: 'Plan the day', imp: 4, due: '', done: false, createdAt: 1 }],
  energy: 2,
  energyDay,
  energyHistory,
  checkIns,
  log: {},
  habits: [],
  plan: null,
});

test('a cold start with today as energyDay does not invent a check-in', () => {
  const state = normalizeState(savedState(), NOW);
  assert.ok(state);
  assert.equal(state.checkIns['2026-11-23'], undefined);
  assert.equal(isCheckInLocked(state, '2026-11-23'), false);
  assert.equal(state.energyHistory['2026-11-23'], undefined);
  assert.equal(state.energy, 2);
  // Yesterday's real check-in is still preserved.
  assert.equal(state.checkIns['2026-11-22'].level, 1);
});

test('a saved energy value for today alone does not lock the form', () => {
  const state = normalizeState(savedState('2026-11-22', {}, { '2026-11-22': 1, '2026-11-23': 3 }), NOW);
  assert.ok(state);
  assert.equal(state.checkIns['2026-11-23'], undefined);
  assert.equal(isCheckInLocked(state, '2026-11-23'), false);
});

test('an explicit check-in for today is still locked after a cold start', () => {
  const state = normalizeState(savedState('2026-11-23', {
    '2026-11-23': { symptoms: 'Headache', level: 1, source: 'manual', at: 123 },
  }), NOW);
  assert.ok(state);
  assert.equal(isCheckInLocked(state, '2026-11-23'), true);
  assert.equal(state.checkIns['2026-11-23'].level, 1);
});

test('the check-in card renders the form whenever the day is unlocked', () => {
  const card = readFileSync(new URL('../src/features/planner/DailyCheckIn.vue', import.meta.url), 'utf8');
  assert.match(card, /<div v-if="checkInLocked && checkIn" class="checkin-summary">/);
  assert.match(card, /<CheckInForm\s+v-else/);
});

/* Real cold start through loadPlanner -> normalizeState -> usePlanner state. */
class MemoryStorage {
  constructor(values) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(NOW.getTime()); else super(...args); }
  static now() { return NOW.getTime(); }
}

globalThis.Date = FakeDate;
globalThis.window = {};
globalThis.localStorage = new MemoryStorage({
  'energy-planner-v1': JSON.stringify(savedState()),
});
mock.module('@tauri-apps/api/core', { namedExports: { invoke: async () => null } });

const { usePlanner } = await import('../src/features/planner/usePlanner.ts');

test('the app opens with an unlocked, empty check-in form on a new day', async () => {
  const planner = usePlanner();
  await planner.init();

  assert.equal(planner.checkIn.value, null);
  assert.equal(planner.checkInLocked.value, false);
  assert.equal(planner.checkInForm.value.symptoms, '');
  assert.equal(planner.checkInForm.value.level, 2);

  planner.checkInForm.value.symptoms = 'Slept well';
  planner.checkInForm.value.level = 3;
  planner.saveCheckIn();
  assert.equal(planner.checkInLocked.value, true);
  assert.equal(planner.checkIn.value.level, 3);
});
