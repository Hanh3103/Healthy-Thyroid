import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const app = read('../src/App.vue');
const popover = read('../src/shared/layout/AiStatusButton.vue');
const router = read('../src/router/index.ts');
const css = read('../src/assets/main.css');
const statusApi = read('../src/shared/ai/aiStatus.ts');
const tracker = read('../src/shared/ai/useAiStatus.ts');
const limits = read('../src-tauri/src/ai/limits.rs');
const config = read('../src-tauri/src/ai/config.rs');
const aiModule = read('../src-tauri/src/ai/mod.rs');
const lib = read('../src-tauri/src/lib.rs');

test('the header right slot holds 40px AI and Settings ghost buttons', () => {
  const header = app.match(/<header class="top">([\s\S]*?)<\/header>/)[1];
  assert.match(header, /<div class="app-actions">/);
  assert.doesNotMatch(header, /app-actions[^>]*aria-hidden/);
  assert.match(header, /<AiStatusButton \/>/);
  assert.match(header, /class="icon-btn header-icon-btn settings-btn"/);
  assert.match(header, /:aria-label="settingsLabel"/);
  assert.match(header, /:aria-pressed="isSettings"/);
  assert.match(css, /\.header-icon-btn\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/);
  assert.match(css, /\.header-icon-btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  assert.match(css, /\.header-icon-btn\[aria-pressed="true"\]/);
});

test('settings are routes outside the four pill tabs and highlight no tab', () => {
  assert.match(router, /path: '\/settings'/);
  assert.match(router, /path: '\/settings\/ai'/);
  assert.match(router, /component: \(\) => import\('\.\.\/views\/SettingsView\.vue'\)/);
  const tabs = router.match(/export const TABS[\s\S]*?\n\];/)[0];
  assert.doesNotMatch(tabs, /settings/);
  assert.equal((tabs.match(/icon:\s*\[/g) || []).length, 4);
  assert.match(app, /return typeof route\.meta\.title === 'string' \? route\.meta\.title : 'Energy Planner'/);
  assert.match(app, /const isSettings = computed\(\(\) => route\.path\.startsWith\('\/settings'\)\)/);
  const settingsView = read('../src/views/SettingsView.vue');
  assert.match(settingsView, /class="settings-layout"/);
  assert.match(settingsView, /SETTINGS_SECTIONS/);
  assert.match(settingsView, /Back to \{\{ backLabel \}\}/);
});

test('the AI button exposes its state through aria-label, tooltip, dot and spinner', () => {
  assert.match(popover, /class="icon-btn header-icon-btn ai-status-btn"/);
  assert.match(popover, /:aria-label="tooltip"/);
  assert.match(popover, /:title="tooltip"/);
  assert.match(popover, /:aria-expanded="open"/);
  assert.match(popover, /aria-controls="ai-status-popover"/);
  assert.match(popover, /:class="dotClass"/);
  assert.match(popover, /class="ai-spinner ai-btn-spinner"/);
  for (const word of ['Configured', 'Not set up', 'Switched off', 'Last request failed']) {
    assert.match(tracker, new RegExp(`'${word}'`));
  }
  assert.match(css, /\.ai-dot--amber\s*\{[^}]*background/);
  assert.match(css, /\.ai-dot--red\s*\{[^}]*var\(--danger\)/);
  assert.match(css, /\.ai-dot--gray\s*\{[^}]*var\(--ink-2\)/);
  assert.match(css, /@keyframes ai-spin/);
});

test('the popover is a 320px region with all requested sections and no forms', () => {
  assert.match(popover, /id="ai-status-popover" ref="popover" class="ai-popover"/);
  assert.match(popover, /role="region"/);
  assert.doesNotMatch(popover, /role="dialog"|<form|apiKeyMasked|apiKey/);
  assert.match(popover, /\{\{ providerAndModel \}\}/);
  assert.match(popover, /providerLabel\(status\.value\.provider\)\}, \$\{status\.value\.model\}/);
  assert.match(statusApi, /gemini-3\.5-flash-lite/);
  assert.match(statusApi, /gemini: 'Gemini'/);
  assert.match(popover, /AI suggestions/);
  assert.match(popover, /\{\{ status\.callCount \}\} of \{\{ status\.dailyLimit \}\} calls/);
  assert.match(popover, /Generating your meal plan\.\.\./);
  assert.match(popover, /'Cancelling\.\.\.' : 'Cancel'/);
  assert.match(popover, /Test connection/);
  assert.match(popover, /Set up AI to get suggestions/);
  assert.match(popover, /to="\/settings\/ai"/);
  assert.match(popover, /Open AI settings/);
  assert.match(css, /\.ai-popover\s*\{[^}]*width:\s*320px/);
});

test('the popover closes on Escape or outside click and restores focus', () => {
  assert.match(popover, /document\.addEventListener\('pointerdown', onPointerDown\)/);
  assert.match(popover, /document\.addEventListener\('keydown', onKeydown\)/);
  assert.match(popover, /event\.key === 'Escape' && open\.value/);
  assert.match(popover, /!root\.value\.contains\(event\.target as Node\)/);
  assert.match(popover, /querySelector<HTMLElement>\('input, button, a'\)\?\.focus\(\)/);
  assert.match(popover, /nextTick\(\(\) => button\.value\?\.focus\(\)\)/);
  assert.match(popover, /watch\(\(\) => route\.fullPath, \(\) => close\(false\)\)/);
});

test('full status, immediate switch, usage and cancel are backed by Tauri commands', () => {
  assert.match(statusApi, /tauriInvoke<unknown>\('ai_status', \{\}\)/);
  assert.match(statusApi, /tauriInvoke<unknown>\('set_ai_enabled', \{ enabled \}\)/);
  assert.match(statusApi, /tauriInvoke\('cancel_ai_request', \{\}\)/);
  assert.match(lib, /ai::ai_status/);
  assert.match(lib, /ai::set_ai_enabled/);
  assert.match(lib, /ai::cancel_ai_request/);
  assert.match(limits, /DEFAULT_DAILY_LIMIT: u32 = 30/);
  assert.match(limits, /pub fn request_cancel\(\)/);
  assert.match(limits, /pub fn get_usage/);
  assert.match(config, /pub call_count: u32/);
  assert.match(config, /pub daily_limit: u32/);
  assert.match(aiModule, /cancellation_requested\(\)/);
  assert.match(tracker, /async function setEnabled/);
  assert.match(tracker, /async function cancel/);
  assert.match(tracker, /async function testConnection/);
});

test('every AI caller updates the shared live status', () => {
  const planner = read('../src/features/planner/usePlanner.ts');
  const diet = read('../src/features/diet/useDiet.ts');
  const checkIn = read('../src/features/planner/checkinAi.ts');
  const aiSection = read('../src/features/settings/AiSettingsSection.vue');
  const dietApi = read('../src/features/diet/api.ts');
  assert.match(tracker, /export function useAiStatus\(\)/);
  assert.match(tracker, /async function runAi<T>/);
  assert.match(planner, /ai\.runAi\(\s*'Prioritizing your tasks'/);
  assert.match(diet, /ai\.runAi\(\s*'Generating your meal plan'/);
  assert.match(checkIn, /ai\.runAi\(\s*'Generating an energy suggestion'/);
  assert.match(aiSection, /store\.testConnection\(\)/);
  assert.match(dietApi, /useAiStatus\(\)\.runAi\(\s*'Updating your shopping list'/);
  assert.match(popover, /role="status" aria-live="polite"/);
});

test('the popover becomes a full-width sheet under 720px and works in both themes', () => {
  const compact = css.match(/@media \(max-width: 719px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(compact, /\.ai-popover\s*\{[\s\S]*?position:\s*fixed[\s\S]*?top:\s*64px[\s\S]*?left:\s*0[\s\S]*?right:\s*0[\s\S]*?width:\s*auto/);
  assert.match(css, /\.ai-popover\s*\{[^}]*background:\s*var\(--surface\)/);
  assert.match(css, /\.ai-popover\s*\{[^}]*color:\s*var\(--ink\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});
