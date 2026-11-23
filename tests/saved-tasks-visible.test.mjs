import assert from 'node:assert/strict';
import { register } from 'node:module';
import test, { mock } from 'node:test';

register('./ts-resolve-loader.mjs', import.meta.url);

class MemoryStorage {
  constructor(values) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const RealDate = Date;
const NOW = new RealDate('2026-11-23T09:00:00');
class FakeDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(NOW.getTime()); else super(...args); }
  static now() { return NOW.getTime(); }
}

globalThis.Date = FakeDate;
globalThis.window = {};
globalThis.localStorage = new MemoryStorage({
  'energy-planner-v1': JSON.stringify({
    tasks: [
      { id: 'light', title: 'Light admin', imp: 4, due: '', done: false, est: true, fit: 'fits', min: 20 },
      { id: 'deep', title: 'Deep project work', imp: 4, due: '', done: false, est: true, fit: 'too_hard', min: 90 },
      { id: 'dump', title: 'Someday task', imp: 2, due: '', done: false, est: true, min: 30 },
    ],
    energy: 2,
    energyDay: '2026-11-23',
    energyHistory: {},
    checkIns: {},
    log: {}, habits: [], plan: null,
  }),
});
mock.module('@tauri-apps/api/core', { namedExports: { invoke: async () => null } });

const { usePlanner } = await import('../src/features/planner/usePlanner.ts');

test('every saved task is visible on cold start, even with an old energy estimate', async () => {
  const planner = usePlanner();
  await planner.init();

  const visible = [...planner.nowTasks.value, ...planner.filteredDumps.value].map((task) => task.id).sort();
  assert.deepEqual(visible, ['deep', 'dump', 'light']);
  assert.deepEqual(planner.nowTasks.value.map((task) => task.id), ['light']);

  // The stale "too_hard" estimate moved the task to Dumps with an explanation.
  const parked = planner.filteredDumps.value.find((task) => task.id === 'deep');
  assert.ok(parked);
  assert.equal(parked.movedFromToday, true);
  assert.equal(parked.imp, 3);
  assert.match(planner.movedToDumpsNote.value, /Deep project work/);

  // Bringing it back clears the stale estimate so it stays visible in Today.
  planner.taskAction('deep', 'today');
  assert.deepEqual(planner.nowTasks.value.map((task) => task.id).sort(), ['deep', 'light']);
  assert.equal(planner.movedToDumpsNote.value, '');
});

test('a lower-energy check-in parks tasks whose saved fit no longer matches', () => {
  const planner = usePlanner();
  planner.state.value.tasks.push({
    id: 'stretch',
    title: 'Focused writing',
    imp: 4,
    due: '',
    done: false,
    est: true,
    fit: 'stretch',
    min: 45,
  });
  assert.ok(planner.nowTasks.value.some((task) => task.id === 'stretch'));

  planner.checkInForm.value.symptoms = 'Low energy today';
  planner.checkInForm.value.level = 1;
  planner.saveCheckIn();

  const parked = planner.filteredDumps.value.find((task) => task.id === 'stretch');
  assert.ok(parked, 'stretch work should be parked when energy drops to Low');
  assert.equal(parked.movedFromToday, true);
  assert.ok(!planner.nowTasks.value.some((task) => task.id === 'stretch'));
});
