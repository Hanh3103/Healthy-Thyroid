import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import './helpers/node-ts-hooks.mjs';
import { parse } from '@vue/compiler-sfc';

const filename = new URL('../src/features/diet/DayPlanQuestions.vue', import.meta.url);
const source = readFileSync(filename, 'utf8');

/** Evaluates only the component's <script setup> with real Vue refs. */
async function loadComponent() {
  const { descriptor, errors } = parse(source, { filename: filename.pathname });
  assert.deepEqual(errors, []);

  const script = descriptor.scriptSetup.content
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/: string\[\]/g, '')
    .replace(/: string\b/g, '')
    .replace(/: number\b/g, '')
    .replace(/: boolean\b/g, '')
    .replace(/: void\b/g, '')
    .replace(/\(value\)/g, '(value)')
    .replace(/\btype\s+Appetite\s*=[^;]+;/m, '')
    .replace(/\(event:\s*KeyboardEvent\)/g, '(event)')
    .replace(/\(event:\s*ClipboardEvent\)/g, '(event)')
    .replace(/: Array<\{ value: ; label \}>/g, '')
    .replace(/const APPETITE_OPTIONS[^=]*=/g, 'const APPETITE_OPTIONS =')
    .replace(/:\s*Appetite\b/g, '')
    .replace(/:\s*PlanScope\b/g, '')
    .replace(/:\s*ConsentChoice\b/g, '')
    .replace(/:\s*PlanBasis\b/g, '')
    .replace(/:\s*NonNullable<[^>]+>/g, '')
    .replace(/as\s+NonNullable<[^>]+>/g, '')
    .replace(/<Appetite>/g, '')
    .replace(/<PlanScope>/g, '')
    .replace(/new Set<string>\(\)/g, 'new Set()')
    .replace(/: string\|undefined/g, '')
    .replace(/\( \| undefined\)/g, '()')
    .replace(/ref<[^>]*undefined[^>]*>\(undefined\)/g, 'ref(undefined)')
    .replace(/\bAppetite\b/g, '')
    .replace(/const props = defineProps<\{[\s\S]*?\}>\(\);/, 'const props = _props;')
    .replace(/const emit = defineEmits<\{[\s\S]*?\}>\(\);/, 'const emit = _emit;')
    .replace(/defineExpose\(\{[\s\S]*?\}\);/, 'return { pantryItems, pantryDraft, pantryDirty, resetDirty, addPantry, addPantryText, addPantryDraft, onPantryKeydown, onPantryPaste, removePantry };');

  const { ref, watch } = await import('vue');
  const helpers = await import('../src/features/diet/pantryInput.ts');
  const factory = new Function(
    'ref',
    'watch',
    'PANTRY_SEPARATOR',
    'addPantryNames',
    'cleanPantryItem',
    '_props',
    '_emit',
    script,
  );
  return (_props, _emit = () => {}) => factory(
    ref,
    watch,
    helpers.PANTRY_SEPARATOR,
    helpers.addPantryNames,
    helpers.cleanPantryItem,
    _props,
    _emit,
  );
}

const makeComponent = await loadComponent();
const props = {
  pantry: [], wants: [], fieldId: 'test', question: 'What do you want?',
  showScope: false, scope: 'day', consentChoice: 'allowed', wantChips: [],
};

const key = (value) => ({ key: value, preventDefault() {} });
const paste = (value) => ({ clipboardData: { getData: () => value }, preventDefault() {} });

test('typed text becomes a chip on Enter and on comma', () => {
  const vm = makeComponent(props);
  vm.pantryDraft.value = '  oats  ';
  vm.addPantryDraft(); // Enter handler calls this
  assert.deepEqual(vm.pantryItems.value, ['oats']);
  assert.equal(vm.pantryDraft.value, '');

  vm.pantryDraft.value = 'rice,';
  vm.onPantryKeydown(key(','));
  assert.deepEqual(vm.pantryItems.value, ['oats', 'rice']);
});

test('blur adds leftover text and pasted lists add every item', () => {
  const vm = makeComponent(props);
  vm.pantryDraft.value = '  eggs  ';
  vm.addPantryDraft(); // blur handler
  assert.deepEqual(vm.pantryItems.value, ['eggs']);

  vm.onPantryPaste(paste('oats, rice, eggs'));
  assert.deepEqual(vm.pantryItems.value, ['eggs', 'oats', 'rice']);

  vm.onPantryPaste(paste('lentils\nfrozen veg\nleftovers'));
  assert.deepEqual(vm.pantryItems.value, [
    'eggs', 'oats', 'rice', 'lentils', 'frozen veg', 'leftovers',
  ]);
});

test('duplicates are ignored case-insensitively and spaces are trimmed', () => {
  const vm = makeComponent({ ...props, pantry: ['Oats'] });
  vm.onPantryPaste(paste('oats,  OATS  , rice , rice'));
  assert.deepEqual(vm.pantryItems.value, ['Oats', 'rice']);
});

test('backspace on an empty field removes the last chip and x removes a named chip', () => {
  const vm = makeComponent({ ...props, pantry: ['oats', 'rice'] });
  vm.onPantryKeydown(key('Backspace'));
  assert.deepEqual(vm.pantryItems.value, ['oats']);
  vm.removePantry(0);
  assert.deepEqual(vm.pantryItems.value, []);
});

test('local edits mark the draft dirty and resetDirty clears the flag', () => {
  const vm = makeComponent({ ...props, pantry: ['oats'] });
  assert.equal(vm.pantryDirty.value, false);
  vm.addPantry('rice');
  assert.equal(vm.pantryDirty.value, true);
  assert.deepEqual(vm.pantryItems.value, ['oats', 'rice']);
  vm.resetDirty();
  assert.equal(vm.pantryDirty.value, false);
  assert.deepEqual(vm.pantryItems.value, ['oats', 'rice']);
});

test('the day panel resets the dirty flag and keeps unsaved answers on pantry changes', () => {
  const day = readFileSync(new URL('../src/features/diet/DayMeals.vue', import.meta.url), 'utf8');
  assert.match(day, /ref="questionsRef"/);
  assert.match(day, /questionsRef\.value\?\.resetDirty\(\)/);
  assert.match(day, /answers\.value = \{ \.\.\.answers\.value, pantry: pantry\.value\.map\(\(item\) => item\.name\) \}/);
});

test('the pantry field has no Add button and explains how to add items', () => {
  assert.doesNotMatch(source, /<AppButton[^>]*>\s*Add\s*<\/AppButton>/);
  assert.match(source, /enterkeyhint="done"/);
  assert.match(source, /placeholder="Type an item and press Enter or comma"/);
  assert.match(source, /Press Enter or comma to add/);
  assert.match(source, /\{\{ pantryItems\.length \}\} \{\{ pantryItems\.length === 1 \? 'item' : 'items' \}\} at home/);
  assert.match(source, /class="answer-input pantry-input"/);
  assert.match(source, /\.pantry-input\s*\{[\s\S]*?width:\s*100%/);
  assert.match(source, /\.answer-chips[\s\S]*?margin-top:\s*8px/);
  assert.match(source, /Save changes to my pantry/);
  assert.match(source, /\+ \{\{ chip \}\}/);
});
