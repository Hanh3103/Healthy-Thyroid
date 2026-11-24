import assert from 'node:assert/strict';
import { register } from 'node:module';
import test, { mock } from 'node:test';

register('./ts-resolve-loader.mjs', import.meta.url);

class MemoryStorage {
  getItem() { return null; }
  setItem() {}
  removeItem() {}
}

const RealDate = Date;
const NOW = new RealDate('2026-11-23T09:00:00');
class FakeDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(NOW.getTime()); else super(...args); }
  static now() { return NOW.getTime(); }
}

globalThis.Date = FakeDate;
globalThis.window = { __TAURI_INTERNALS__: {} };
globalThis.localStorage = new MemoryStorage();

let aiMode = 'success';
let aiCalls = 0;
let lastPrompt = '';

const aiReply = () => JSON.stringify([
  { id: 'a', minutes: 25, energy: 1, confidence: 'high', reason: 'AI: quick reply' },
  { id: 'b', minutes: 90, energy: 3, confidence: 'high', reason: 'AI: deep work' },
]);

mock.module('@tauri-apps/api/core', {
  namedExports: {
    invoke: async (command, args) => {
      if (command === 'get_ai_credentials_status') {
        return JSON.stringify(aiMode === 'missing'
          ? { configured: false, source: 'none', provider: '', model: '' }
          : { configured: true, source: 'app_data', provider: 'ollama', model: 'llama3.2' });
      }
      if (command === 'load_planner') return null;
      if (command === 'save_planner') return undefined;
      if (command === 'prioritize_with_ai') {
        aiCalls++;
        lastPrompt = String(args?.prompt ?? '');
        if (aiMode === 'error') throw new Error('model retired');
        if (aiMode === 'empty') return '[]';
        if (aiMode === 'partial') {
          return JSON.stringify([{ id: 'a', minutes: 25, energy: 1, confidence: 'high', reason: 'AI: quick reply' }]);
        }
        return aiReply();
      }
      throw new Error(`Unexpected command: ${command}`);
    },
  },
});

const { usePlanner } = await import('../src/features/planner/usePlanner.ts');
const planner = usePlanner();
await planner.init();

function resetTasks() {
  planner.state.value = {
    energy: 2,
    energyDay: '2026-11-23',
    energyHistory: {},
    checkIns: {},
    log: {},
    habits: [],
    plan: null,
    tasks: [
      { id: 'a', title: 'Reply to emails', imp: 4, due: '', done: false, est: false, min: 0 },
      { id: 'b', title: 'Build portfolio project', imp: 4, due: '', done: false, est: false, min: 0 },
    ],
  };
  planner.aiStatus.value = '';
}

test('AI is tried first and its estimates are applied', async () => {
  aiMode = 'success';
  aiCalls = 0;
  resetTasks();

  await planner.prioritize();

  assert.equal(aiCalls, 1);
  assert.match(lastPrompt, /Estimate every task/);
  assert.match(planner.aiStatus.value, /^AI estimates used for 2 of 2 tasks\./);
  const byId = new Map(planner.state.value.tasks.map((task) => [task.id, task]));
  assert.equal(byId.get('a').estimateSource, 'ai');
  assert.equal(byId.get('a').min, 25);
  assert.equal(byId.get('b').estimateSource, 'ai');
  assert.equal(byId.get('b').min, 90);
});

test('a failed AI request falls back to heuristics with the real reason', async () => {
  aiMode = 'error';
  aiCalls = 0;
  resetTasks();

  await planner.prioritize();

  assert.equal(aiCalls, 1);
  assert.match(planner.aiStatus.value, /AI prioritization failed: model retired/);
  assert.match(planner.aiStatus.value, /Local estimates used instead/);
  assert.ok(planner.state.value.tasks.every((task) => task.estimateSource === 'heuristic'));
});

test('unusable AI output falls back with an explicit reason', async () => {
  aiMode = 'empty';
  resetTasks();

  await planner.prioritize();

  assert.match(planner.aiStatus.value, /AI prioritization failed: the AI returned no usable estimates/);
  assert.match(planner.aiStatus.value, /Local estimates used instead/);
  assert.ok(planner.state.value.tasks.every((task) => task.estimateSource === 'heuristic'));
});

test('partial AI output names the tasks that used local estimates', async () => {
  aiMode = 'partial';
  resetTasks();

  await planner.prioritize();

  assert.match(planner.aiStatus.value, /AI estimates used for 1 of 2 tasks/);
  assert.match(planner.aiStatus.value, /1 task had no AI estimate and used local ones/);
  const byId = new Map(planner.state.value.tasks.map((task) => [task.id, task]));
  assert.equal(byId.get('a').estimateSource, 'ai');
  assert.equal(byId.get('b').estimateSource, 'heuristic');
});

test('when AI is not configured it is not called and the user is told why', async () => {
  aiMode = 'missing';
  aiCalls = 0;
  resetTasks();

  await planner.prioritize();

  assert.equal(aiCalls, 0);
  assert.match(planner.aiStatus.value, /AI could not be used:/);
  assert.match(planner.aiStatus.value, /open Settings > AI/);
  assert.match(planner.aiStatus.value, /Local estimates used instead/);
  assert.ok(planner.state.value.tasks.every((task) => task.estimateSource === 'heuristic'));
});
