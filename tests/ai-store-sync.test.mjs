import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const aiStore = read('../src/stores/ai.ts');
const aiSection = read('../src/features/settings/AiSettingsSection.vue');
const popover = read('../src/shared/layout/AiStatusButton.vue');
const tracker = read('../src/shared/ai/useAiStatus.ts');
const rustConfig = read('../src-tauri/src/ai/config.rs');
const rustLimits = read('../src-tauri/src/ai/limits.rs');
const rustMod = read('../src-tauri/src/ai/mod.rs');
const platform = read('../src/shared/platform.ts');

test('ONE SOURCE OF TRUTH: useAiStore holds all required fields', () => {
  // Required fields in store state:
  assert.match(aiStore, /enabled:\s*true/);
  assert.match(aiStore, /provider:\s*'gemini'/);
  assert.match(aiStore, /model:\s*'gemini-3\.5-flash-lite'/);
  assert.match(aiStore, /hasKey:\s*false/);
  assert.match(aiStore, /dailyLimit:\s*30/);
  assert.match(aiStore, /usageToday:\s*0/);
  assert.match(aiStore, /lastError:\s*''/);

  // useAiStatus delegates directly to useAiStore
  assert.match(tracker, /import\s*\{[^}]*useAiStore[^}]*\}\s*from\s*'\.\.\/\.\.\/stores\/ai(?:\.ts)?'/);
  assert.match(tracker, /const store = getStore\(\)/);
  assert.match(tracker, /storeToRefs\(store\)/);
});

test('THE SWITCH SAVES IMMEDIATELY, EVERYWHERE', () => {
  // Popover binds directly to store and triggers setEnabled immediately
  assert.match(popover, /:checked="status\.enabled"/);
  assert.match(popover, /@change="onSwitch"/);
  assert.match(popover, /await setEnabled\(input\.checked\)/);

  // Settings page binds directly to store and triggers setEnabled immediately
  assert.match(aiSection, /:checked="store\.enabled"/);
  assert.match(aiSection, /@change="onSwitch"/);
  assert.match(aiSection, /await store\.setEnabled\(input\.checked\)/);

  // The switch is NOT part of the draft fields or dirty tracking
  assert.doesNotMatch(aiSection, /enabledDraft/);
  assert.doesNotMatch(aiSection, /interface DraftFields\s*\{[^}]*enabled/);
});

test('DRAFT FIELDS CANNOT BE STALE: unedited fields update from store, save sends only changed', () => {
  // Draft fields include provider, model, daily limit, endpoint
  assert.match(aiSection, /interface DraftFields\s*\{[\s\S]*?provider: AIProvider;[\s\S]*?endpoint: string;[\s\S]*?model: string;[\s\S]*?dailyLimit: number;[\s\S]*?\}/);

  // Active edit tracking with editedFields
  assert.match(aiSection, /const editedFields = ref\(new Set/);
  assert.match(aiSection, /function markEdited/);

  // Watcher updates unedited fields from store
  assert.match(aiSection, /!editedFields\.value\.has\('provider'\)/);
  assert.match(aiSection, /!editedFields\.value\.has\('model'\)/);
  assert.match(aiSection, /!editedFields\.value\.has\('endpoint'\)/);
  assert.match(aiSection, /!editedFields\.value\.has\('dailyLimit'\)/);

  // Save sends only the partial changed fields
  assert.match(aiSection, /const partial: SaveAiConfigPartialInput = \{\}/);
  assert.match(aiSection, /if \(isProviderDirty\.value\) partial\.provider = draft\.value\.provider/);
  assert.match(aiSection, /if \(isModelDirty\.value\) partial\.model = draft\.value\.model/);
  assert.match(aiSection, /if \(isEndpointDirty\.value\) partial\.endpoint = draft\.value\.endpoint/);
  assert.match(aiSection, /if \(isLimitDirty\.value\) partial\.dailyLimit = draft\.value\.dailyLimit/);
  assert.match(aiSection, /await store\.savePartial\(partial\)/);
});

test('TELL THE FRONTEND WHEN RUST CHANGES: emit ai-config-changed and store listens', () => {
  // Tauri event listener helper in platform.ts
  assert.match(platform, /export async function tauriListen<T = unknown>/);
  assert.match(platform, /listen<T>\(event, \(ev\) => handler\(ev\.payload\)\)/);

  // Store listens to ai-config-changed and refreshes
  assert.match(aiStore, /tauriListen\('ai-config-changed'/);
  assert.match(aiStore, /void this\.refresh\(\)/);

  // Rust emits ai-config-changed
  assert.match(rustConfig, /pub fn notify_ai_config_changed/);
  assert.match(rustConfig, /app\.emit\("ai-config-changed", \(\)\)/);
  assert.match(rustConfig, /notify_ai_config_changed\(app\)/);
  assert.match(rustLimits, /notify_ai_config_changed\(app\)/);
  assert.match(rustMod, /pub async fn save_ai_config/);
});
