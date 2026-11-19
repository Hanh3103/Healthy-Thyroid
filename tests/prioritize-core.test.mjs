import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPrompt,
  dueState,
  estimateHeuristic,
  fitOf,
  parseEstimates,
  rankTasks,
} from '../src/prioritize-core.ts';

const TODAY = '2026-11-18';

test('due dates use the app priority states', () => {
  assert.equal(dueState('2026-11-17', TODAY), 'overdue');
  assert.equal(dueState('2026-11-18', TODAY), 'today');
  assert.equal(dueState('2026-11-19', TODAY), 'tomorrow');
  assert.equal(dueState('2026-11-21', TODAY), 'week');
  assert.equal(dueState('2026-11-25', TODAY), 'later');
  assert.equal(dueState('', TODAY), 'none');
});

test('energy fit is consistent', () => {
  assert.equal(fitOf(1, 2), 'fits');
  assert.equal(fitOf(2, 2), 'fits');
  assert.equal(fitOf(3, 2), 'stretch');
  assert.equal(fitOf(3, 1), 'too_hard');
});

test('heuristics distinguish quick, mixed, and deep tasks', () => {
  const quick = estimateHeuristic({ id: 'q', title: 'Reply to emails', due: '' });
  assert.equal(quick.minutes, 15);
  assert.equal(quick.energy, 1);

  const mixed = estimateHeuristic({ id: 'm', title: 'Follow up on application', due: '' });
  assert.equal(mixed.minutes, 30);
  assert.equal(mixed.energy, 2);

  const deep = estimateHeuristic({ id: 'd', title: 'Write portfolio README', due: '' });
  assert.equal(deep.minutes, 60);
  assert.equal(deep.energy, 3);
});

test('prompt includes date, energy, and task names without user estimates', () => {
  const prompt = buildPrompt(
    [{ id: 't1', title: 'Reply to recruiter', due: '' }],
    2,
    TODAY,
    'Wednesday',
  );

  assert.match(prompt, /Wednesday 2026-11-18/);
  assert.match(prompt, /energy today is 2 of 3 \(Medium\)/);
  assert.match(prompt, /Reply to recruiter/);
  assert.doesNotMatch(prompt, /userEstimate/i);
});

test('AI JSON is parsed, clamped, and duplicate IDs are ignored', () => {
  const raw = `Here is the result:
\`\`\`json
{
  "tasks": [
    {"id":"a","minutes":47,"energy":2,"confidence":"high","reason":"ok","subtasks":[],"firstStep":null},
    {"id":"b","minutes":9999,"energy":3,"confidence":"low","reason":"deep","subtasks":[{"title":"s1","minutes":10,"energy":1},{"title":"","minutes":5,"energy":1}],"firstStep":{"title":"start","minutes":99,"energy":1}},
    {"id":"c","minutes":"invalid","energy":2},
    {"id":"a","minutes":5,"energy":1}
  ]
}
\`\`\``;

  const { estimates, missing } = parseEstimates(raw, ['a', 'b', 'c', 'd']);

  assert.equal(estimates.get('a')?.minutes, 45);
  assert.equal(estimates.get('a')?.energy, 2);
  assert.equal(estimates.get('b')?.minutes, 360);
  assert.equal(estimates.get('b')?.firstStep?.minutes, 30);
  assert.equal(estimates.get('b')?.subtasks?.length, 1);
  assert.deepEqual(missing, ['c', 'd']);
});

test('plain arrays and alternate response containers are accepted', () => {
  const arrayResult = parseEstimates(
    '[{"id":"a","minutes":20,"energy":1,"confidence":"high","reason":"quick"}]',
    ['a'],
  );
  assert.equal(arrayResult.estimates.get('a')?.minutes, 20);
  assert.deepEqual(arrayResult.missing, []);

  const rankedResult = parseEstimates(
    '{"ranked":[{"id":"a","minutes":25,"energy":2,"confidence":"medium","reason":"steady"}]}',
    ['a'],
  );
  assert.equal(rankedResult.estimates.get('a')?.minutes, 25);
});

test('invalid AI responses throw clear shape errors', () => {
  assert.throws(() => parseEstimates('not json', ['a']), /no JSON object/i);
  assert.throws(() => parseEstimates('{"nope":1}', ['a']), /Invalid AI response shape/i);
});

test('ranker prioritizes overdue/today tasks and returns totals and ranks', () => {
  const tasks = [
    { id: 'easy', title: 'Tidy tracker', due: '' },
    { id: 'hard-due', title: 'Send applications', due: TODAY },
  ];
  const estimate = (id, minutes, energy) => ({
    id,
    minutes,
    energy,
    confidence: 'high',
    reason: '',
    source: 'ai',
  });
  const result = rankTasks(
    tasks,
    new Map([
      ['easy', estimate('easy', 10, 1)],
      ['hard-due', estimate('hard-due', 60, 3)],
    ]),
    1,
    TODAY,
  );

  assert.deepEqual(result.ranked.map((task) => task.id), ['hard-due', 'easy']);
  assert.equal(result.ranked[0].fit, 'too_hard');
  assert.equal(result.totalMinutes, 70);
  assert.deepEqual(result.ranked.map((task) => task.rank), [1, 2]);
});
