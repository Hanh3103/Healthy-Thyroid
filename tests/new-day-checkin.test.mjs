import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isCheckInLocked, normalizeState } from '../src/features/planner/model.ts';

const stateOn = (today, energyDay, history, checkIns = {}) => normalizeState({
  tasks: [],
  energy: 2,
  energyDay,
  energyHistory: history,
  checkIns,
  log: {},
  habits: [],
  plan: null,
}, new Date(`${today}T12:00:00`));

test('yesterday\'s saved check-in does not lock today\'s form', () => {
  const yesterday = '2026-11-22';
  const today = '2026-11-23';
  const state = stateOn(today, yesterday, { [yesterday]: 1 }, {
    [yesterday]: { symptoms: 'Headache', level: 1, source: 'manual', at: 123 },
  });

  assert.ok(state);
  assert.equal(isCheckInLocked(state, yesterday), true);
  assert.equal(isCheckInLocked(state, today), false);
  assert.equal(state.checkIns[today], undefined);
  assert.equal(state.energy, 2);
});

test('a new day resets energy and the check-in form when checkDay runs', () => {
  const usePlanner = readFileSync(new URL('../src/features/planner/usePlanner.ts', import.meta.url), 'utf8');
  const checkDay = usePlanner.slice(usePlanner.indexOf('function checkDay()'));
  assert.match(checkDay, /if \(key !== shownDay\)/);
  assert.match(checkDay, /todayKey\.value = key/);
  assert.match(checkDay, /state\.value\.energy = state\.value\.energyHistory\[key\] \?\? 2/);
  assert.match(checkDay, /syncCheckInForm\(\)/);
});

test('the planner view checks the day on mount as well as on focus and timer', () => {
  const plannerView = readFileSync(new URL('../src/views/PlannerView.vue', import.meta.url), 'utf8');
  const mounted = plannerView.slice(plannerView.indexOf('onMounted('), plannerView.indexOf('onUnmounted('));
  assert.match(mounted, /await planner\.init\(\)/);
  assert.match(mounted, /planner\.checkDay\(\)/);
  assert.match(mounted, /visibilitychange/);
  assert.match(mounted, /setInterval\(\(\) => planner\.checkDay\(\)/);
});
