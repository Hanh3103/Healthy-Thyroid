/**
 * Cross-cutting platform helpers.
 *
 * Persistence boundaries in each feature's `api.ts` use these so that the same code
 * works in `npm run dev` (browser + localStorage) and in a packaged Tauri app
 * (Rust commands backed by files in the app-data directory).
 */
import { invoke } from '@tauri-apps/api/core';

/** True when running inside the Tauri webview rather than a plain browser. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Reads a JSON string produced by a Tauri `load_*` command and parses it. */
export async function tauriLoad<T>(command: string): Promise<T | null> {
  try {
    const raw = await invoke<string | null>(command);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.error(`Failed to load via ${command}:`, error);
    return null;
  }
}

/** Serialises a value and hands it to a Tauri `save_*` command. */
export async function tauriSave<T>(command: string, value: T): Promise<boolean> {
  try {
    await invoke(command, { json: JSON.stringify(value) });
    return true;
  } catch (error) {
    console.error(`Failed to save via ${command}:`, error);
    return false;
  }
}

/** Calls a Tauri command with named arguments and returns its typed result. */
export async function tauriInvoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

/** Browser fallback: read and parse JSON from localStorage. */
export function localLoad<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.error(`Failed to read ${key} from localStorage:`, error);
    return null;
  }
}

/** Browser fallback: write JSON to localStorage. */
export function localSave<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to write ${key} to localStorage:`, error);
  }
}

/** Removes a key from localStorage (used after a successful one-time migration). */
export function localRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures (e.g. disabled storage / private mode).
  }
}
