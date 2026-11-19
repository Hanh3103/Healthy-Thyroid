export interface TestRange {
  low: number | null;
  high: number | null;
}

export interface ThyroidBloodValues {
  tsh: number | null;
  freeT4: number | null;
  totalT4: number | null;
  freeT3: number | null;
  totalT3: number | null;
  tpoAb: number | null;
  tgAb: number | null;
  trab: number | null;
  got: number | null;
  ggt: number | null;
  cholesterol: number | null;
  triglycerides: number | null;
  calcium: number | null;
  glucose: number | null;
  urea: number | null;
  creatinine: number | null;
  gpt: number | null;
  uricAcid: number | null;
}

export type ThyroidFieldKey = keyof ThyroidBloodValues;

/** Units selected for a record, keyed by built-in test. */
export type UnitMap = Partial<Record<ThyroidFieldKey, string>>;

/** User-edited expected ranges for a record, in that record's unit. */
export type RangeMap = Partial<Record<ThyroidFieldKey, TestRange>>;

/** A user-defined test such as Vitamin D. */
export interface CustomTestDefinition {
  id: string;
  name: string;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  archived: boolean;
  createdAt: number;
}

/** A custom test value for one record. */
export interface CustomMeasurement {
  name: string;
  value: number | null;
  unit: string;
  range?: TestRange;
}

export type CustomMeasurementMap = Record<string, CustomMeasurement>;

export interface ThyroidAppointment {
  id: string;
  date: string;
  time?: string;
  note?: string;
  createdAt: number;
  completed?: boolean;
}
export interface ThyroidBloodRecord extends ThyroidBloodValues {
  id: string;
  date: string;
  sourceFileName?: string;
  units?: UnitMap;
  ranges?: RangeMap;
  custom?: CustomMeasurementMap;
  createdAt: number;
  updatedAt: number;
}
