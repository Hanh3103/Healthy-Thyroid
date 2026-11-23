import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue']);
/** Only the diet Tauri invoke boundary is allowed to reach a text AI provider. */
const ALLOWED_AI_BOUNDARIES = new Set(['src/features/diet/api.ts']);

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return SOURCE_EXTENSIONS.has(path.extname(entry)) ? [full] : [];
  });
}

const files = sourceFiles(SRC).map((file) => ({
  relative: path.relative(path.dirname(SRC), file).replace(/\\/g, '/'),
  text: readFileSync(file, 'utf8'),
}));

test('only the diet Tauri boundary can import an AI client or create a provider', () => {
  const offenders = files.flatMap(({ relative, text }) => {
    if (ALLOWED_AI_BOUNDARIES.has(relative)) return [];
    const importsClient = /['"][^'"]*shared\/ai\/client['"]/.test(text);
    // The client module may declare the factory; other files must not call it.
    const createsProvider = /(?<!function\s)\bcreateAITextProvider\s*\(/.test(text);
    return importsClient || createsProvider ? [relative] : [];
  });
  assert.deepEqual(offenders, []);
});

test('no VITE_*_API_KEY env var is read from src', () => {
  const offenders = files
    .filter(({ text }) => /\bVITE_[A-Z0-9_]*API_KEY\b/.test(text))
    .map(({ relative }) => relative);
  assert.deepEqual(offenders, []);
});
