import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const router = read('../src/router/index.ts');
const settingsView = read('../src/views/SettingsView.vue');
const css = read('../src/assets/main.css');
const unsaved = read('../src/features/settings/unsaved.ts');
const aiSection = read('../src/features/settings/AiSettingsSection.vue');
const appearanceSection = read('../src/features/settings/AppearanceSettingsSection.vue');
const languageSection = read('../src/features/settings/LanguageSettingsSection.vue');
const privacySection = read('../src/features/settings/PrivacySettingsSection.vue');
const aboutSection = read('../src/features/settings/AboutSettingsSection.vue');
const profileView = read('../src/views/ProfileView.vue');
const useProfile = read('../src/features/profile/useProfile.ts');
const aiModel = read('../src/shared/ai/model.ts');
const aiStatus = read('../src/shared/ai/aiStatus.ts');
const useAiStatus = read('../src/shared/ai/useAiStatus.ts');
const preferences = read('../src/features/settings/preferences.ts');
const settingsModel = read('../src/features/settings/model.ts');
const consent = read('../src/features/settings/consent.ts');
const setupLink = read('../src/shared/ui/SetupAiLink.vue');
const plannerView = read('../src/views/PlannerView.vue');
const dayPlanQuestions = read('../src/features/diet/DayPlanQuestions.vue');
const limits = read('../src-tauri/src/ai/limits.rs');
const aiModule = read('../src-tauri/src/ai/mod.rs');
const lib = read('../src-tauri/src/lib.rs');
const prompts = read('../src-tauri/src/ai/prompts.rs');

test('settings has nested routes for every section and no settings pill tab', () => {
  const tabs = router.match(/export const TABS[\s\S]*?\n\];/)[0];
  assert.doesNotMatch(tabs, /settings/);
  for (const section of ['ai', 'appearance', 'language', 'privacy', 'about']) {
    assert.match(router, new RegExp(`path: '${section}'`));
  }
  assert.match(router, /name: 'settings'[\s\S]*?children:/);
  assert.match(router, /path: '', redirect: \{ name: 'ai-settings' \}/);
  assert.match(router, /component: \(\) => import\('\.\.\/features\/settings\/AiSettingsSection\.vue'\)/);
  assert.match(router, /component: \(\) => import\('\.\.\/features\/settings\/AboutSettingsSection\.vue'\)/);
  assert.match(router, /export const SETTINGS_SECTIONS/);
  assert.match(router, /export const settingsBackPath/);
  assert.match(router, /sessionStorage\.setItem\('settings-back-path', to\.path\)/);
});

test('the settings page uses two columns, section list, card and a Back link', () => {
  assert.match(settingsView, /class="settings-view app-view is-active"/);
  assert.match(settingsView, /class="settings-back" :to="settingsBackPath"/);
  assert.match(settingsView, /Back to \{\{ backLabel \}\}/);
  assert.match(settingsView, /<nav class="settings-nav" aria-label="Settings sections">/);
  assert.match(settingsView, /v-for="section in SETTINGS_SECTIONS"/);
  assert.match(settingsView, /:aria-current="route\.path === section\.path \? 'page' : undefined"/);
  assert.match(settingsView, /class="panel settings-card"/);
  assert.match(settingsView, /<RouterView v-slot="\{ Component \}">/);
  assert.match(css, /\.settings-layout\s*\{[^}]*grid-template-columns:\s*220px minmax\(0, 1fr\)/);
  const compact = css.match(/@media \(max-width: 719px\) \{[\s\S]*?\n\}/g).at(-1);
  assert.match(compact, /\.settings-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(compact, /\.settings-nav\s*\{[^}]*flex-direction:\s*row/);
});

test('leaving a dirty section asks first and discarded drafts are reset', () => {
  assert.match(unsaved, /export function registerSettingsDraft/);
  assert.match(unsaved, /export function hasUnsavedSettings/);
  assert.match(unsaved, /export function discardSettingsDrafts/);
  assert.match(unsaved, /title: 'Leave with unsaved changes\?'/);
  assert.match(router, /router\.beforeEach\(async \(to, from\) =>/);
  assert.match(router, /await confirmLeaveSettings\(\)/);
  assert.match(router, /discardSettingsDrafts\(\)/);
  for (const section of [aiSection, appearanceSection, languageSection]) {
    assert.match(section, /registerSettingsDraft\(/);
    assert.match(section, /<AppFormActions>/);
    assert.match(section, /variant="ghost"[^>]*>Cancel<\/AppButton>/);
    assert.match(section, /variant="primary" type="submit"/);
  }
});

test('AI settings contain provider, model suggestions, keychain actions and endpoint allowlist', () => {
  assert.match(aiSection, /<h2>AI settings<\/h2>/);
  assert.match(aiSection, /id="ai-provider"/);
  assert.match(aiSection, /id="ai-model"/);
  assert.match(aiSection, /list="ai-model-suggestions"/);
  assert.match(aiSection, /<datalist id="ai-model-suggestions">/);
  assert.match(aiModel, /export const MODEL_SUGGESTIONS/);
  assert.match(aiModel, /gemini-3\.5-flash-lite/);
  assert.match(aiSection, /Key saved in OS keychain/);
  assert.match(aiSection, />Replace<\/AppButton>/);
  assert.match(aiSection, /@click="deleteKey"/);
  assert.match(aiSection, /type="password"/);
  assert.match(aiSection, /<details class="settings-advanced"/);
  assert.match(aiSection, /id="ai-endpoint"/);
  assert.match(aiModel, /export function endpointError/);
  assert.match(aiModel, /generativelanguage\.googleapis\.com/);
  assert.match(aiSection, /Your key is stored in the OS keychain\. It is never kept in the app's browser storage\./);
  assert.doesNotMatch(aiSection, /apiKeyMasked/);
  assert.match(aiSection, /Save AI settings/);
  assert.match(aiSection, /Test connection/);
  assert.match(aiSection, /variant="text"[^>]*>Reset<\/AppButton>/);
});

test('deleting the saved key uses the custom confirm dialog', () => {
  assert.match(aiSection, /requestConfirm\(\{/);
  assert.match(aiSection, /title: 'Remove the saved key\?'/);
  assert.match(aiSection, /tone: 'danger'/);
  assert.match(aiSection, /apiKeyInput\.value = '';/);
});

test('the daily limit and enabled switch are saved and reflected in the header', () => {
  assert.match(aiSection, /Daily call limit/);
  assert.match(aiSection, /:checked="store\.enabled"/);
  assert.match(aiSection, /store\.setEnabled/);
  assert.match(aiSection, /dailyLimit/);
  assert.match(aiStatus, /set_ai_daily_limit/);
  assert.match(useAiStatus, /setDailyLimit/);
  assert.match(limits, /daily_limit: u32/);
  assert.match(limits, /pub fn set_daily_limit/);
  assert.match(aiModule, /pub async fn set_ai_daily_limit/);
  assert.match(lib, /ai::set_ai_daily_limit/);
});

test('the old AI provider card is gone from Profile', () => {
  assert.doesNotMatch(profileView, /AI provider/);
  assert.doesNotMatch(profileView, /ai-settings-heading/);
  assert.doesNotMatch(profileView, /Save AI settings/);
  assert.match(profileView, /Application settings live in <RouterLink to="\/settings">Settings/);
  assert.doesNotMatch(useProfile, /AIConfig|AIProvider|apiKey|useAiStatus/);
});

test('appearance and language sections save shared, whole-app preferences', () => {
  assert.match(appearanceSection, /<h2>Appearance<\/h2>/);
  for (const label of ['Light', 'Dark', 'System']) {
    assert.match(settingsModel, new RegExp(`label: '${label}'`));
  }
  assert.match(appearanceSection, /THEME_OPTIONS/);
  assert.match(settingsModel, /export type ThemeMode/);
  assert.match(settingsModel, /export function normalizePreferences/);
  assert.match(settingsModel, /export function formatDate/);
  assert.match(settingsModel, /export function formatTime/);
  assert.match(settingsModel, /export function weekStartOffset/);
  assert.match(preferences, /root\.setAttribute\('data-theme', theme\)/);
  assert.match(preferences, /root\.removeAttribute\('data-theme'\)/);
  assert.match(preferences, /root\.lang = language/);
  assert.match(languageSection, /<h2>Language and formats<\/h2>/);
  assert.match(languageSection, /id="pref-language"/);
  assert.match(languageSection, /id="pref-date"/);
  assert.match(languageSection, /id="pref-time"/);
  assert.match(languageSection, /Week starts on Monday/);
  assert.match(languageSection, /One language and one set of formats are used across the whole screen/);
});

test('privacy section lists storage, reuses the consent notice, exports and deletes', () => {
  assert.match(privacySection, /<h2>Data and privacy<\/h2>/);
  assert.match(privacySection, /What is stored on this device/);
  assert.match(privacySection, /View what is sent to the AI/);
  assert.match(privacySection, /Before the first AI call, this is sent:/);
  assert.match(consent, /export const AI_CONSENT_ITEMS/);
  assert.match(consent, /No names, free notes, task\/habit names, or medical records/);
  assert.match(privacySection, /Export my data/);
  assert.match(privacySection, /Delete my data/);
  assert.match(privacySection, /requestConfirm\(deleteMyDataConfirm\(\)\)/);
  assert.match(privacySection, /URL\.createObjectURL\(blob\)/);
});

test('about section reports app version, prompt version and licenses', () => {
  assert.match(aboutSection, /App version/);
  assert.match(aboutSection, /AI prompt version/);
  assert.match(aboutSection, /Licenses/);
  assert.match(aboutSection, /getAppInfo\(\)/);
  assert.match(lib, /fn app_info\(\)/);
  assert.match(lib, /prompt_version: ai::prompts::PROMPT_VERSION/);
  assert.match(prompts, /PROMPT_VERSION/);
  assert.match(lib, /app_info,/);
});

test('every Set up AI message links to /settings/ai', () => {
  assert.match(setupLink, /<RouterLink[^>]*to="\/settings\/ai">\{\{ label \}\}<\/RouterLink>/);
  assert.match(setupLink, /label: 'Set up AI'/);
  assert.match(plannerView, /<SetupAiLink v-if="aiConfig\.state !== 'ready'" \/>/);
  assert.match(dayPlanQuestions, /<SetupAiLink \/>/);
  const popover = read('../src/shared/layout/AiStatusButton.vue');
  assert.match(popover, /router\.push\('\/settings\/ai'\)/);
  assert.match(popover, /to="\/settings\/ai"/);
});
