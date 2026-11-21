import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHabitItems } from '../src/features/planner/model.ts';

const habit = {
  id: 'walk',
  name: 'Walk',
  by: {
    1: { min: 10, txt: '' },
    2: { min: 15, txt: '' },
    3: { min: 25, txt: '' },
  },
};

test('habit row has seven compact day states and the current streak', () => {
  const today = new Date(2026, 10, 21, 12);
  const log = {
    '2026-11-20': { walk: true },
    '2026-11-21': { walk: true },
  };
  const { items } = buildHabitItems([habit], log, today, 2);

  assert.equal(items[0].days.length, 7);
  assert.deepEqual(items[0].days.map((day) => day.className), [
    'missed',
    'missed',
    'missed',
    'missed',
    'missed',
    'done',
    'today done',
  ]);
  assert.equal(items[0].streak, 2);
  assert.ok(items[0].days[6].title);
});

test('mail weekends are marked off instead of missed', () => {
  const mailHabit = { ...habit, id: 'mail', name: 'Email routine', slots: true };
  const today = new Date(2026, 10, 21, 12);
  const { items } = buildHabitItems([mailHabit], {}, today, 2);

  assert.equal(items[0].days[0].className, 'off');
  assert.equal(items[0].days[6].className, 'off');
});
