export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch (error) {
    console.error(`Failed to read ${key} from localStorage:`, error);
    return null;
  }
}

export function writeJSON<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Failed to write ${key} to localStorage:`, error);
    return false;
  }
}
