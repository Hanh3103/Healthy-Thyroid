import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCheckInPrompt,
  heuristicEnergySuggestion,
  parseEnergySuggestion,
  parseSymptomChips,
  recommendedAiReason,
} from '../src/features/planner/checkin.ts';
import {
  isCheckInLocked,
  normalizeState,
  seedState,
  tasksForEnergy,
} from '../src/features/planner/model.ts';

test('buildCheckInPrompt includes symptoms and asks for a bounded JSON level', () => {
  const prompt = buildCheckInPrompt('Poor sleep and a headache');
  assert.match(prompt, /Poor sleep and a headache/);
  assert.match(prompt, /"level": 1\|2\|3/);
  assert.match(prompt, /valid JSON only/i);
});

test('parseEnergySuggestion accepts AI JSON variants', () => {
  assert.deepEqual(parseEnergySuggestion('```json\n{"level":1,"reason":"Rest today."}\n```'), {
    level: 1,
    reason: 'Rest today.',
    source: 'ai',
  });
  assert.deepEqual(parseEnergySuggestion('{"energy":"High"}'), {
    level: 3,
    reason: '',
    source: 'ai',
  });
  assert.equal(parseEnergySuggestion('{"level":9}'), null);
  assert.equal(parseEnergySuggestion('not json'), null);
});

test('heuristicEnergySuggestion downgrades symptom-heavy days', () => {
  assert.equal(heuristicEnergySuggestion('exhausted and poor sleep').level, 1);
  assert.equal(heuristicEnergySuggestion('rested, focused, no pain').level, 3);
  assert.equal(heuristicEnergySuggestion('a normal day').level, 2);
});

test('parseSymptomChips turns a note into wrapping chips', () => {
  assert.deepEqual(
    parseSymptomChips('Tired - Mild, Poor sleep; headache'),
    ['Tired - Mild', 'Poor sleep', 'headache'],
  );
  assert.deepEqual(parseSymptomChips('   '), []);
});

test('recommendedAiReason gives the saved card a one-sentence quote', () => {
  assert.equal(recommendedAiReason(3), 'good sleep and no symptoms point to a strong day.');
  assert.equal(recommendedAiReason(1), 'your symptoms point to a lighter day.');
});

test('normalizeState keeps valid check-ins and locks saved days', () => {
  const today = new Date('2026-11-21T12:00:00');
  const normalized = normalizeState({
    tasks: [],
    energyHistory: { '2026-11-21': 2 },
    checkIns: {
      '2026-11-21': {
        symptoms: 'A little tired',
        level: 2,
        suggested: 1,
        source: 'manual',
        at: 123,
      },
      'bad-key': { symptoms: 'ignored', level: 3, source: 'ai', at: 1 },
    },
    log: {},
    habits: [],
    plan: null,
  }, today);

  assert.ok(normalized);
  assert.deepEqual(normalized.checkIns['2026-11-21'], {
    symptoms: 'A little tired',
    symptomEntries: [{ name: 'fatigue', severity: 'mild' }],
    level: 2,
    suggested: 1,
    aiReason: null,
    source: 'manual',
    at: 123,
  });
  assert.equal(normalized.checkIns['bad-key'], undefined);
  assert.equal(isCheckInLocked(normalized, '2026-11-21'), true);
  assert.equal(isCheckInLocked(normalized, '2026-11-22'), false);
});

test('normalizeState backfills a legacy check-in from saved energy history', () => {
  const normalized = normalizeState({
    tasks: [],
    energy: 3,
    energyDay: '2026-11-18',
    energyHistory: { '2026-11-18': 3 },
    log: {},
    habits: [],
    plan: null,
  }, new Date('2026-11-21T12:00:00'));

  assert.ok(normalized);
  assert.deepEqual(normalized.checkIns['2026-11-18'], {
    symptoms: '',
    level: 3,
    suggested: null,
    aiReason: null,
    source: 'legacy',
    at: 0,
  });
  assert.deepEqual(seedState().checkIns, {});
});

test('tasksForEnergy hides too-hard work but keeps unestimated work', () => {
  const task = (id, fit) => ({ id, fit, title: id, imp: 4, min: 30, due: '', done: false, ex: false, est: true, locked: false, reason: '' });
  const tasks = [
    task('fits', 'fits'),
    task('stretch', 'stretch'),
    task('hard', 'too_hard'),
    task('unknown', undefined),
  ];

  assert.deepEqual(tasksForEnergy(tasks, 1).map((item) => item.id), ['fits', 'unknown']);
  assert.deepEqual(tasksForEnergy(tasks, 2).map((item) => item.id), ['fits', 'stretch', 'unknown']);
  assert.deepEqual(tasksForEnergy(tasks, 3).map((item) => item.id), ['fits', 'stretch', 'hard', 'unknown']);
});
