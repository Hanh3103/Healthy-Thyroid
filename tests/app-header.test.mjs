import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const app = read('../src/App.vue');
const tabs = read('../src/shared/layout/AppTabs.vue');
const router = read('../src/router/index.ts');
const css = read('../src/assets/main.css');

function rule(selector) {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `CSS rule ${selector} exists`);
  return match[1];
}

test('the header is a single 64px row aligned to the content edge', () => {
  assert.match(app, /<header class="top">/);
  const header = app.match(/<header class="top">([\s\S]*?)<\/header>/)[1];
  assert.match(header, /<RouterLink class="app-brand"/);
  assert.match(header, /<AppTabs \/>/);
  assert.match(header, /<div class="app-actions"/);
  assert.ok(
    header.indexOf('app-brand') < header.indexOf('AppTabs')
      && header.indexOf('AppTabs') < header.indexOf('app-actions'),
    'brand, tabs, then actions appear in one row',
  );
  assert.doesNotMatch(header, /top-heading/, 'page heading is outside the header');

  const top = rule('\\.top');
  assert.match(top, /height:\s*64px/);
  assert.match(top, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/);
  assert.match(top, /border-bottom:\s*1px solid var\(--line\)/);
  assert.match(css, /\.app-actions\s*\{[^}]*min-width:\s*96px/);
  assert.match(css, /\.app-nav\s*\{[^}]*grid-column:\s*2/);
});

test('the brand is one link with a 32px logo and the 16px semibold app name', () => {
  assert.match(app, /<RouterLink class="app-brand" :to="plannerPath"/);
  assert.match(app, /<img class="brand-logo" :src="appLogo" alt="" \/>\s*<span>(Healthy|Happy) Thyroid<\/span>/);
  assert.match(rule('\\.app-brand'), /font-size:\s*16px/);
  assert.match(rule('\\.app-brand'), /font-weight:\s*var\(--font-weight-semibold\)/);
  assert.match(rule('\\.brand-logo'), /width:\s*32px/);
  assert.match(rule('\\.brand-logo'), /height:\s*32px/);
});

test('the tab bar is a nav landmark of router links with aria-current and tooltips', () => {
  assert.match(tabs, /<nav ref="nav" class="app-nav" aria-label="App views">/);
  assert.match(tabs, /<RouterLink/);
  assert.match(tabs, /:aria-current="route\.path === tab\.path \? 'page' : undefined"/);
  assert.match(tabs, /:title="tab\.label"/);
  assert.match(tabs, /:aria-label="tab\.label"/);
  assert.match(tabs, /class="app-tab-label"/);
  assert.match(tabs, /class="app-tab-icon"/);
  assert.match(css, /\.app-nav\s*\{[^}]*grid-auto-columns:\s*1fr/);
  assert.match(css, /\.app-nav \[data-app-view\]:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
});

test('all four tabs have labels and icon paths', () => {
  const tabBlock = router.match(/export const TABS[\s\S]*?\n\];/)[0];
  for (const label of ['Energy Planner', 'Thyroid Checker', 'Diet Advisor', 'Profile']) {
    assert.match(tabBlock, new RegExp(`label: '${label}'`));
  }
  assert.equal((tabBlock.match(/icon:\s*\[/g) || []).length, 4);
});

test('under 720px tabs become icon-only with tooltips and the brand is symbol-only', () => {
  const compact = css.match(/@media \(max-width: 719px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(compact, /\.app-brand span\s*\{\s*display:\s*none/);
  assert.match(compact, /\.app-tab-label\s*\{\s*display:\s*none/);
  assert.match(compact, /\.app-tab-icon\s*\{\s*display:\s*block/);
  assert.match(compact, /\.app-nav\s*\{\s*width:\s*min\(200px,\s*100%\)/);
});

test('header and tabs use theme variables so light and dark mode both work', () => {
  assert.match(rule('\\.top'), /border-bottom:\s*1px solid var\(--line\)/);
  assert.match(rule('\\.app-brand'), /color:\s*var\(--ink\)/);
  assert.match(rule('\\.app-nav-indicator'), /var\(--surface\)/);
  assert.match(css, /:root\[data-theme="dark"\][\s\S]*?--line:\s*#262626/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\)[\s\S]*?--ink:\s*#f5f5f5/);
});
