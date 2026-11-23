import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeConfig } from '../src/features/profile/model.ts';
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

test('Profile diet settings normalise canonical fields', () => {
  const settings = normalizeDietSettings({
    medicationTime: '6:05',
    breakfastTime: '08:15',
    lunchTime: 'nonsense',
    dinnerTime: '19:45',
    dietPreferences: '  vegetarian  ',
    allergies: 'peanuts, shellfish',
    avoidFoods: 'sesame',
    cookingMinutes: 9999,
    equipment: 'pan, blender',
    servings: 14,
    leftovers: true,
    cuisinePreference: '  Thai ',
    shopping: 'Corner shop',
    budget: 'bogus',
  });
  assert.equal(settings.medicationTime, '06:05');
  assert.equal(settings.breakfastTime, '08:15');
  assert.equal(settings.lunchTime, DEFAULT_DIET_SETTINGS.lunchTime);
  assert.equal(settings.dinnerTime, '19:45');
  assert.equal(settings.dietPreferences, 'vegetarian');
  assert.equal(settings.allergies, 'peanuts, shellfish');
  assert.equal(settings.avoidFoods, 'sesame');
  assert.equal(settings.cookingMinutes, 240);
  assert.equal(settings.equipment, 'pan, blender');
  assert.equal(settings.servings, 12);
  assert.equal(settings.leftovers, true);
  assert.equal(settings.cuisinePreference, 'Thai');
  assert.equal(settings.shopping, 'Corner shop');
  assert.equal(settings.budget, 'medium');
  assert.equal('energyOverride' in settings, false);
  assert.equal('busynessOverride' in settings, false);
});

test('legacy diet, avoid and maxCookMinutes still migrate', () => {
  const migrated = normalizeDietSettings({
    diet: '  vegetarian  ',
    avoid: 'peanuts, shellfish',
    maxCookMinutes: 9999,
  });
  assert.equal(migrated.dietPreferences, 'vegetarian');
  assert.equal(migrated.allergies, 'peanuts, shellfish');
  assert.equal(migrated.avoidFoods, 'peanuts, shellfish');
  assert.equal(migrated.cookingMinutes, 240);
});

test('AI config keeps only local provider metadata and no API key', () => {
  const config = normalizeConfig({
    provider: 'gemini',
    apiKey: 'never-store-this',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-3.8-flash',
  });
  assert.deepEqual(Object.keys(config), ['provider', 'endpoint', 'model']);
  assert.equal('apiKey' in config, false);
  assert.equal(config.provider, 'gemini');
});

test('profile.json keeps a local AI marker and diet settings with no API key', async () => {
  localStorage.setItem('profile_v1', JSON.stringify({
    ai: { provider: 'ollama', endpoint: 'http://localhost:11434/api/chat', model: 'llama3.2' },
    diet: DEFAULT_DIET_SETTINGS,
  }));
  const loaded = await api.loadProfileData();
  assert.deepEqual(loaded.diet, DEFAULT_DIET_SETTINGS);
  assert.equal('apiKey' in loaded.ai, false);

  await api.saveProfileData({
    ai: { provider: 'ollama', endpoint: 'https://api.openai.com', model: 'gpt-4o-mini' },
    diet: { ...DEFAULT_DIET_SETTINGS, medicationTime: '06:30', allergies: 'peanuts' },
  });
  const raw = JSON.parse(localStorage.getItem('profile_v1'));
  assert.equal('apiKey' in raw.ai, false);
  assert.equal(raw.ai.endpoint, 'https://api.openai.com');
  assert.equal(raw.ai.model, 'gpt-4o-mini');
  assert.equal(raw.diet.medicationTime, '06:30');
  assert.equal(raw.diet.allergies, 'peanuts');

  await api.saveAiConfig({
    provider: 'ollama', endpoint: 'http://localhost:11434/api/chat', model: 'llama3.2',
  });
  const afterAiConfig = await api.loadProfileData();
  assert.equal('apiKey' in afterAiConfig.ai, false);
  assert.equal(afterAiConfig.ai.endpoint, 'http://localhost:11434/api/chat');
  assert.equal((await api.loadDietSettings()).medicationTime, '06:30');

  await api.saveDietSettings({ ...DEFAULT_DIET_SETTINGS, dinnerTime: '20:00' });
  const after = await api.loadProfileData();
  assert.equal(after.ai.endpoint, 'http://localhost:11434/api/chat');
  assert.equal(after.diet.dinnerTime, '20:00');
});

test('the shared diet settings ref updates when Profile saves', async () => {
  await settingsStore.loadSettings();
  assert.equal(settingsStore.dietSettings.value.dietPreferences, '');
  await settingsStore.saveSettings({
    ...DEFAULT_DIET_SETTINGS, dietPreferences: 'vegan', cookingMinutes: 45,
  });
  assert.equal(settingsStore.dietSettings.value.dietPreferences, 'vegan');
  assert.equal(settingsStore.dietSettings.value.cookingMinutes, 45);
  assert.equal((await api.loadDietSettings()).dietPreferences, 'vegan');
});
