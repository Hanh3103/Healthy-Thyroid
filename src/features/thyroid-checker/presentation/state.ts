import type {
  CustomTestDefinition,
  RangeMap,
  ThyroidAppointment,
  ThyroidBloodRecord,
  ThyroidBloodValues,
  UnitMap,
} from '../domain/types';
import { createEmptyValues } from '../domain/field-definitions';

export interface CustomDraftEntry {
  name: string;
  value: number | null;
  unit: string;
  range?: { low: number | null; high: number | null };
}

export interface Draft {
  values: ThyroidBloodValues;
  units: UnitMap;
  ranges: RangeMap;
  custom: Record<string, CustomDraftEntry>;
}

export function createDraft(): Draft {
  return {
    values: createEmptyValues(),
    units: {},
    ranges: {},
    custom: {},
  };
}

export const state = {
  records: [] as ThyroidBloodRecord[],
  customTests: [] as CustomTestDefinition[],
  appointments: [] as ThyroidAppointment[],
  appointmentFrequency: null as number | null,
  editingId: null as string | null,
  draft: createDraft(),
};
export type AppState = typeof state;
