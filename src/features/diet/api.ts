/**
 * Diet persistence and AI boundary.
 *
 * In Tauri, meal suggestions are generated in Rust: the API key is read from
 * the device there and never crosses the webview boundary. In plain browser
 * mode there is no Rust command, so the existing shared AI provider is used
 * for development only.
 */
import { invoke } from '@tauri-apps/api/core';
import { createAITextProvider } from '../../shared/ai/client';
import { isTauri, localLoad, localRemove, localSave, tauriLoad, tauriSave } from '../../shared/platform';
import { useAiStore } from '../../stores/ai';
import {
  buildDietPrompt,
  buildRangeInput,
  buildRangePrompt,
  normalizeDietData,
  normalizePlan,
  type ConsentChoice,
  type DietData,
  type DietInput,
  type DietPlan,
  type DietPreferences,
  type RangeInput,
  type RangeRequest,
  type ThyroidFact,
} from './model';

const STORAGE_KEY = 'diet-advisor-v1';
const MIGRATION_KEY = 'diet-advisor-migrated-v1';

function readLocal(facts: ThyroidFact[]): DietData | null {
  const raw = localLoad<unknown>(STORAGE_KEY);
  return raw ? normalizeDietData(raw, facts) : null;
}

function writeLocal(data: DietData): void {
  localSave(STORAGE_KEY, data);
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error('The AI took too long. Try again.')), 90_000);
    promise.then(
      (value) => { window.clearTimeout(id); resolve(value); },
      (error: unknown) => { window.clearTimeout(id); reject(error); },
    );
  });
}

/** Loads pantry, wants, plans, log and consent, migrating legacy browser data once. */
export async function loadDiet(facts: ThyroidFact[]): Promise<DietData> {
  if (!isTauri()) return readLocal(facts) ?? normalizeDietData({}, facts);

  const stored = await tauriLoad<unknown>('load_diet');
  if (stored) return normalizeDietData(stored, facts);

  const legacy = readLocal(facts) ?? normalizeDietData({}, facts);
  if (await tauriSave('save_diet', legacy)) {
    localRemove(STORAGE_KEY);
    localRemove(MIGRATION_KEY);
  }
  return legacy;
}

/** Full-state save, used for first-run migration and every local mutation. */
export async function saveDiet(data: DietData): Promise<void> {
  if (isTauri()) { await tauriSave('save_diet', data); return; }
  writeLocal(data);
}

export async function savePreferences(preferences: DietPreferences): Promise<void> {
  if (isTauri()) {
    await invoke('save_preferences', { json: JSON.stringify(preferences) });
    return;
  }
  const current = readLocal([]) ?? normalizeDietData({}, []);
  writeLocal({ ...current, preferences });
}

export async function getLastPlan(facts: ThyroidFact[]): Promise<DietPlan | null> {
  if (isTauri()) {
    const raw = await tauriLoad<unknown>('get_last_plan');
    return raw ? normalizePlan(raw, facts, '') : null;
  }
  return readLocal(facts)?.lastPlan ?? null;
}

export async function saveLastPlan(plan: DietPlan): Promise<void> {
  if (isTauri()) {
    await invoke('save_last_plan', { json: JSON.stringify(plan) });
    return;
  }
  const current = readLocal([]) ?? normalizeDietData({}, []);
  writeLocal({ ...current, lastPlan: plan });
}

export async function setConsent(
  granted: boolean,
  choice: ConsentChoice = granted ? 'allowed' : 'declined',
): Promise<void> {
  if (isTauri()) {
    await invoke('save_consent', { granted });
    return;
  }
  const current = readLocal([]) ?? normalizeDietData({}, []);
  writeLocal({ ...current, consentGiven: granted, consentChoice: choice });
}

/** Legacy single-day request, kept for the saved-plan compatibility path. */
export async function requestSuggestion(input: DietInput, facts: ThyroidFact[]): Promise<string> {
  if (isTauri()) {
    return invoke<string>('suggest_meals', { input: JSON.stringify({ ...input, facts }) });
  }
  const store = useAiStore();
  await store.load();
  if (!store.isComplete) throw new Error('AI is not configured in browser mode.');
  return withTimeout(createAITextProvider(store.config).complete(buildDietPrompt(input, facts)));
}

/** Asks for a Today / Tomorrow / Next week plan. Only sanitised context is sent. */
export async function requestRangeSuggestion(request: RangeRequest, facts: ThyroidFact[]): Promise<string> {
  const input: RangeInput = buildRangeInput(request);
  if (isTauri()) {
    return invoke<string>('suggest_meals', { input: JSON.stringify({ ...input, facts }) });
  }
  const store = useAiStore();
  await store.load();
  if (!store.isComplete) throw new Error('AI is not configured in browser mode.');
  return withTimeout(createAITextProvider(store.config).complete(buildRangePrompt(input, facts)));
}

export interface ShoppingUpdateInput {
  edits: Array<{ oldMeal: { idea: string; ingredients: string[] }; newMeal: { idea: string; ingredients: string[] } }>;
  pantry: string[];
  currentShopping: { name: string; status: 'open' | 'bought' | 'removed'; inPlan: boolean }[];
  allergies: string[];
  avoidFoods: string[];
}

export interface ShoppingUpdateResult {
  add: string[];
  remove: string[];
}

const SHOPPING_UPDATE_PROMPT = `You update a grocery shopping list after the user edits one or more meals.
Reply only with JSON: {"add":["item"],"remove":["item"]}.
Add only items the new meals need that are not in the pantry and not already present as open/bought in the current list.
Remove only items that were needed only because of the old meals and are no longer needed.
Never add items the user already has in the pantry. Never suggest items the user already bought or removed.
Never add pantry basics: salt, pepper or water are assumed at home.
Respect allergies and avoid-foods. Keep names short and practical.`;

export async function requestShoppingUpdate(input: ShoppingUpdateInput): Promise<ShoppingUpdateResult> {
  const prompt = `${SHOPPING_UPDATE_PROMPT}\n\nINPUT:\n${JSON.stringify(input)}`;
  const raw = isTauri()
    ? await invoke<string>('update_shopping_list', { input: JSON.stringify(input) })
    : await (async () => {
      const store = useAiStore();
      await store.load();
      if (!store.isComplete) throw new Error('AI is not configured in browser mode.');
      return withTimeout(createAITextProvider(store.config).complete(prompt));
    })();
  const parsed = JSON.parse(raw) as { add?: unknown; remove?: unknown };
  const clean = (value: unknown) => Array.isArray(value)
    ? value.map((item) => String(item ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean)
    : [];
  return { add: clean(parsed.add).slice(0, 40), remove: clean(parsed.remove).slice(0, 40) };
}

export interface MealAlternativeInput {
  slot: string;
  currentIdea: string;
  currentIngredients: string[];
  allergies: string[];
  avoidFoods: string[];
  pantry: string[];
}

export async function requestMealAlternative(input: MealAlternativeInput): Promise<{ idea: string; ingredients: string[]; prepMinutes: number }> {
  const prompt = `Suggest one different ${input.slot} idea. Reply only JSON: {"idea":string,"ingredients":string[],"prepMinutes":number}.
Do not suggest the same meal: ${input.currentIdea}. Respect allergies and avoid-foods. Keep it practical.
INPUT:\n${JSON.stringify(input)}`;
  const raw = isTauri()
    ? await invoke<string>('suggest_meal_alternative', { input: JSON.stringify(input) })
    : await (async () => {
      const store = useAiStore();
      await store.load();
      if (!store.isComplete) throw new Error('AI is not configured in browser mode.');
      return withTimeout(createAITextProvider(store.config).complete(prompt));
    })();
  const parsed = JSON.parse(raw) as { idea?: unknown; ingredients?: unknown; prepMinutes?: unknown };
  const idea = String(parsed.idea ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients.map((i) => String(i ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean).slice(0, 24) : [];
  const prepMinutes = Math.max(0, Math.min(240, Math.round(Number(parsed.prepMinutes ?? 10))));
  if (!idea) throw new Error('No suggestion returned');
  return { idea, ingredients, prepMinutes };
}
