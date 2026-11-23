import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { cycleTaskUrgency, fitsEnergy, moveTaskToToday, tasksForEnergy } from '../src/features/planner/model.ts';

const task = (id, fit) => ({
  id, title: id, fit, imp: 4, due: '', done: false, ex: false,
  est: true, locked: false, min: 30, reason: '', movedFromToday: true,
});

test('moving a parked task back to Today clears the stale energy estimate', () => {
  const parked = task('deep work', 'too_hard');
  assert.equal(fitsEnergy(parked.fit, 1), false);
  assert.deepEqual(tasksForEnergy([parked], 1), []);

  moveTaskToToday(parked);
  assert.equal(parked.imp, 4);
  assert.equal(parked.movedFromToday, false);
  assert.equal(parked.fit, undefined);
  assert.deepEqual(tasksForEnergy([parked], 1), [parked]);
});

test('cycling urgency back to Today also clears the parked marker', () => {
  const parked = { ...task('deep work', 'too_hard'), imp: 3 };
  assert.equal(cycleTaskUrgency(parked), 4);
  assert.equal(parked.movedFromToday, false);
  assert.equal(parked.fit, undefined);
});

test('prioritization moves not-fit tasks to Dumps and reports the move', () => {
  const usePlanner = readFileSync(new URL('../src/features/planner/usePlanner.ts', import.meta.url), 'utf8');
  const applyResult = usePlanner.slice(usePlanner.indexOf('function applyResult'), usePlanner.indexOf('/** Local prioritization'));
  assert.match(applyResult, /function applyResult\(result: PrioritizeResult\): Task\[\]/);
  assert.match(applyResult, /if \(fitsEnergy\(ranked\.fit, result\.energy\)\)/);
  assert.match(applyResult, /const moved = parkEnergyMismatchedTasks\(\)/);

  const park = usePlanner.slice(usePlanner.indexOf('function parkEnergyMismatchedTasks'), usePlanner.indexOf('/* Daily check-in'));
  assert.match(park, /task\.imp = 3/);
  assert.match(park, /task\.due = ''/);
  assert.match(park, /task\.movedFromToday = true/);
  assert.match(usePlanner.slice(usePlanner.indexOf('async function init')), /parkEnergyMismatchedTasks\(\)/);

  const finish = usePlanner.slice(usePlanner.indexOf('function finishPrioritization'), usePlanner.indexOf('/**\n * Tries the configured desktop AI'));
  assert.match(finish, /const moved = applyResult\(/);
  assert.match(finish, /moved to Dumps: \$\{moved\.map/);
  const prioritize = usePlanner.slice(usePlanner.indexOf('async function prioritize'));
  assert.match(prioritize, /finishPrioritization\(/);

  const plannerView = readFileSync(new URL('../src/views/PlannerView.vue', import.meta.url), 'utf8');
  assert.match(plannerView, /id="moved-to-dumps-note"/);
  assert.match(plannerView, /movedToDumpsNote/);

  const taskItem = readFileSync(new URL('../src/features/planner/TaskItem.vue', import.meta.url), 'utf8');
  assert.match(taskItem, /v-if="task\.movedFromToday"/);
  assert.match(taskItem, /Moved from Today/);
});
