import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('a square 1024px app icon is available at the project root', () => {
  const icon = new URL('../app-icon.png', import.meta.url);
  assert.equal(existsSync(icon), true);
  const png = readFileSync(icon);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
});

test('the Tauri window title is Happy Thyroid', () => {
  const config = JSON.parse(read('../src-tauri/tauri.conf.json'));
  assert.equal(config.app.windows[0].title, 'Happy Thyroid');
});

test('all bundled Tauri icon sizes were generated and configured', () => {
  const config = read('../src-tauri/tauri.conf.json');
  for (const path of [
    'src-tauri/icons/32x32.png',
    'src-tauri/icons/128x128.png',
    'src-tauri/icons/128x128@2x.png',
    'src-tauri/icons/icon.icns',
    'src-tauri/icons/icon.ico',
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path} exists`);
    assert.match(config, new RegExp(`"${path.replace('src-tauri/', '')}"`));
  }
});

test('the favicon uses the generated app icon', () => {
  assert.equal(existsSync(new URL('../public/favicon.png', import.meta.url)), true);
  assert.match(read('../index.html'), /<link rel="icon" type="image\/png" href="\/favicon\.png" \/>/);
});

test('the application header shows the logo beside the app name', () => {
  const app = read('../src/App.vue');
  assert.match(app, /import appLogo from '\.\/assets\/logo\.svg'/);
  assert.match(app, /class="app-brand"/);
  assert.match(app, /<img class="brand-logo" :src="appLogo" alt="" \/>/);
  assert.match(app, /<span>Happy Thyroid<\/span>/);
  assert.match(read('../src/assets/main.css'), /\.brand-logo \{[\s\S]*?width: 32px;/);
  assert.match(read('../src/assets/main.css'), /\.brand-logo \{[\s\S]*?height: 32px;/);
});
