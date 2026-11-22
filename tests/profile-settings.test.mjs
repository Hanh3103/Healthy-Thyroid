import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_DIET_SETTINGS, normalizeDietSettings } from '../src/features/profile/dietSettings.ts';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();

const api = await import('../src/features/profile/api.ts');
const settingsStore = await import('../src/features/profile/settings.ts');

test('Profile diet settings normalise times, text and cooking time', () => {
  const settings = normalizeDietSettings({
    medicationTime: '6:05',
    breakfastTime: '08:15',
    lunchTime: 'nonsense',
    dinnerTime: '19:45',
    diet: '  vegetarian  ',
    avoid: 'peanuts, shellfish',
    maxCookMinutes: 9999,
  });
  assert.equal(settings.medicationTime, '06:05');
  assert.equal(settings.breakfastTime, '08:15');
  assert.equal(settings.lunchTime, DEFAULT_DIET_SETTINGS.lunchTime);
  assert.equal(settings.dinnerTime, '19:45');
  assert.equal(settings.diet, 'vegetarian');
  assert.equal(settings.avoid, 'peanuts, shellfish');
  assert.equal(settings.maxCookMinutes, 240);
});

test('profile.json keeps AI config and diet settings in one document', async () => {
  const loaded = await api.loadProfileData();
  assert.deepEqual(loaded.diet, DEFAULT_DIET_SETTINGS);

  await api.saveProfileData({
    ai: { provider: 'openai', apiKey: 'local-key', endpoint: 'https://api.openai.com', model: 'gpt-4o-mini' },
    diet: { ...DEFAULT_DIET_SETTINGS, medicationTime: '06:30', avoid: 'peanuts' },
  });
  const raw = JSON.parse(localStorage.getItem('profile_v1'));
  assert.equal(raw.ai.provider, 'openai');
  assert.equal(raw.diet.medicationTime, '06:30');
  assert.equal(raw.diet.avoid, 'peanuts');

  await api.saveAiConfig({ provider: 'ollama', apiKey: '', endpoint: 'http://localhost:11434/api/chat', model: 'llama3.2' });
  assert.equal((await api.loadDietSettings()).medicationTime, '06:30');

  await api.saveDietSettings({ ...DEFAULT_DIET_SETTINGS, dinnerTime: '20:00' });
  const after = await api.loadProfileData();
  assert.equal(after.ai.provider, 'ollama');
  assert.equal(after.diet.dinnerTime, '20:00');
});

test('the shared diet settings ref updates when Profile saves', async () => {
  await settingsStore.loadSettings();
  assert.equal(settingsStore.dietSettings.value.diet, '');
  await settingsStore.saveSettings({ ...DEFAULT_DIET_SETTINGS, diet: 'vegan', maxCookMinutes: 45 });
  assert.equal(settingsStore.dietSettings.value.diet, 'vegan');
  assert.equal(settingsStore.dietSettings.value.maxCookMinutes, 45);
  assert.equal((await api.loadDietSettings()).diet, 'vegan');
});
