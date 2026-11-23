/**
 * Diet persistence and AI boundary.
 *
 * Meal generation runs only in Rust through `generate_diet_plan`. The API key
 * is read there and never crosses the webview boundary; browser mode has no
 * AI path and only loads/stores the plan locally.
 */
import { invoke } from '@tauri-apps/api/core';
import { isTauri, localLoad, localRemove, localSave, tauriLoad, tauriSave } from '../../shared/platform.ts';
import { normalizeDietAiReply, type DietAiRequest } from './ai.ts';
import {
  normalizeDietData,
  normalizePlan,
  type ConsentChoice,
  type DietData,
  type DietPlan,
  type DietPreferences,
  type ThyroidFact,
} from './model.ts';

const STORAGE_KEY = 'diet-advisor-v1';
const MIGRATION_KEY = 'diet-advisor-migrated-v1';

function readLocal(facts: ThyroidFact[]): DietData | null {
  const raw = localLoad<unknown>(STORAGE_KEY);
  return raw ? normalizeDietData(raw, facts) : null;
}

function writeLocal(data: DietData): void {
  localSave(STORAGE_KEY, data);
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

/**
 * The single diet AI boundary. Only the Rust command reads the API key, and
 * only the whitelisted request built by `buildDietAiRequest` crosses invoke.
 */
export async function requestDietPlan(input: DietAiRequest): Promise<string> {
  if (!isTauri()) throw new Error('AI generation is available in the desktop app.');
  const raw = await invoke<string>('generate_diet_plan', { input: JSON.stringify(input) });
  return normalizeDietAiReply(raw, input);
}

export interface ShoppingUpdateResult {
  add: string[];
  remove: string[];
}

export interface UpdateShoppingPayload {
  changedMeal: NonNullable<DietAiRequest['changedMeal']>;
  pantry: string[];
  currentShoppingList: string[];
  factLibrary?: unknown[];
}

export interface UpdateShoppingResponse {
  neededIngredients: string[];
  notes: string[];
  foodAdvice?: Array<{ text: string; factIds: string[] }>;
}

/** Asks the desktop AI to update shopping list after a meal edit. */
export async function updateShopping(input: UpdateShoppingPayload): Promise<UpdateShoppingResponse> {
  if (!isTauri()) throw new Error('Shopping update is available in the desktop app.');
  return invoke<UpdateShoppingResponse>('update_shopping', { input });
}

/** editMeal responses contain only needed ingredients, never a new meal. */
export async function requestMealEditIngredients(input: DietAiRequest): Promise<ShoppingUpdateResult> {
  if (isTauri() && input.changedMeal) {
    try {
      const res = await updateShopping({
        changedMeal: input.changedMeal,
        pantry: input.pantry,
        currentShoppingList: input.currentShoppingList,
        factLibrary: input.factLibrary,
      });
      return { add: res.neededIngredients, remove: [] };
    } catch {
      // Fallback to requestDietPlan
    }
  }
  const raw = await requestDietPlan(input);
  const parsed = JSON.parse(raw) as { neededIngredients?: unknown; notes?: unknown };
  const clean = (value: unknown) => Array.isArray(value)
    ? value.map((item) => String(item ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean)
    : [];
  return { add: clean(parsed.neededIngredients).slice(0, 40), remove: [] };
}

