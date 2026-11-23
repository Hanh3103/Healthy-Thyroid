import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { describeAiConfig, unsupportedAiConfig, unknownAiConfig } from '../src/features/planner/aiConfigStatus.ts';

const savedStatus = (overrides = {}) => ({
  configured: true,
  source: 'app_data',
  provider: 'ollama',
  endpoint: 'http://localhost:11434/api/chat',
  model: 'llama3.2',
  apiKeyMasked: '••••abcd',
  hasStoredKey: true,
  ...overrides,
});

test('saved AI credentials produce a ready chip and an explicit configured note', () => {
  const view = describeAiConfig(savedStatus(), true);
  assert.equal(view.state, 'ready');
  assert.equal(view.configured, true);
  assert.equal(view.label, 'AI configured');
  assert.match(view.note, /AI configured \(ollama\/llama3\.2\)/);
  assert.doesNotMatch(view.note, /abcd/);
});

test('missing credentials are reported with the exact place to configure them', () => {
  const view = describeAiConfig(savedStatus({ configured: false, hasStoredKey: false, apiKeyMasked: '' }), true);
  assert.equal(view.state, 'missing');
  assert.equal(view.configured, false);
  assert.equal(view.label, 'AI not configured');
  assert.match(view.note, /not configured/);
  assert.match(view.note, /Profile > AI provider/);
});

test('browser mode explains that AI configuration is desktop-only', () => {
  const view = describeAiConfig(null, false);
  assert.deepEqual(view, unsupportedAiConfig());
  assert.equal(view.configured, false);
  assert.match(view.label, /desktop app/);
  assert.match(view.note, /npm run tauri dev/);
  assert.match(view.note, /Profile > AI provider/);
});

test('a failed credentials check reports unknown instead of assuming no config', () => {
  const view = unknownAiConfig();
  assert.equal(view.state, 'unknown');
  assert.equal(view.configured, false);
  assert.match(view.note, /Could not check AI configuration/);
});

test('the AI Prioritize button shows the config chip and reports config on click', () => {
  const plannerView = readFileSync(new URL('../src/views/PlannerView.vue', import.meta.url), 'utf8');
  assert.match(plannerView, /id="ai-config-chip"/);
  assert.match(plannerView, /\{\{ aiConfig\.label \}\}/);
  assert.match(plannerView, /:title="aiConfig\.note\.trim\(\)"/);
  assert.match(plannerView, /id="ai-btn"[\s\S]*?@click="planner\.prioritize"/);
  assert.match(plannerView, /aria-describedby="ai-status"/);
  assert.match(plannerView, /id="ai-status"[\s\S]*?\{\{ aiStatus \}\}/);

  const usePlanner = readFileSync(new URL('../src/features/planner/usePlanner.ts', import.meta.url), 'utf8');
  const prioritize = usePlanner.slice(usePlanner.indexOf('async function prioritize'));
  assert.match(prioritize, /await refreshAiConfig\(\)/);
  assert.match(prioritize, /config\.note/);
  assert.match(usePlanner.slice(usePlanner.indexOf('async function init')), /await refreshAiConfig\(\)/);
});
