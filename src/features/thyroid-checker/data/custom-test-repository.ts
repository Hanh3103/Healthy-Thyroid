import type { CustomTestDefinition } from '../domain/types';
import { readJSON, writeJSON } from '../../../shared/storage/local-storage';

const STORAGE_KEY = 'thyroid-custom-tests-v1';

export function normalizeCustomTestDefinition(value: unknown): CustomTestDefinition | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== 'string' || !input.id.trim()) return null;
  if (typeof input.name !== 'string' || !input.name.trim()) return null;
  const refLow = typeof input.refLow === 'number' && Number.isFinite(input.refLow) ? input.refLow : null;
  const refHigh = typeof input.refHigh === 'number' && Number.isFinite(input.refHigh) ? input.refHigh : null;
  return {
    id: input.id,
    name: input.name.trim(),
    unit: typeof input.unit === 'string' ? input.unit.trim() : '',
    refLow,
    refHigh,
    archived: input.archived === true,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
  };
}

export class LocalCustomTestRepository {
  load(): CustomTestDefinition[] {
    const stored = readJSON<unknown>(STORAGE_KEY);
    if (!Array.isArray(stored)) return [];
    return stored
      .map(normalizeCustomTestDefinition)
      .filter((definition): definition is CustomTestDefinition => definition !== null);
  }

  save(definitions: CustomTestDefinition[]): void {
    writeJSON(STORAGE_KEY, definitions);
  }
}
