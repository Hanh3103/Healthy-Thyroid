import type { ThyroidBloodValues, ThyroidFieldKey } from './types';

export interface FieldDefinition {
  key: ThyroidFieldKey;
  label: string;
  fullName: string;
  description: string;
  step?: string;
}

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: 'tsh', label: 'TSH', fullName: 'Thyroid-Stimulating Hormone', description: 'Signals the thyroid gland to produce and release thyroid hormones.', step: '0.001' },
  { key: 'freeT4', label: 'Free T4', fullName: 'Free Thyroxine', description: 'The unbound thyroxine available to tissues; the usual T4 test when only “T4” is not specified.', step: '0.01' },
  { key: 'totalT4', label: 'Total T4', fullName: 'Total Thyroxine', description: 'Protein-bound plus free thyroxine; reported by some labs instead of free T4.', step: '0.01' },
  { key: 'freeT3', label: 'Free T3', fullName: 'Free Triiodothyronine', description: 'The unbound, active thyroid hormone that influences metabolism and organ function.', step: '0.01' },
  { key: 'totalT3', label: 'Total T3', fullName: 'Total Triiodothyronine', description: 'Protein-bound plus free triiodothyronine; reported by some labs instead of free T3.', step: '0.1' },
  { key: 'tpoAb', label: 'TPO Ab', fullName: 'Thyroid Peroxidase Antibody', description: 'Antibody marker commonly associated with autoimmune thyroid inflammation.', step: '0.01' },
  { key: 'tgAb', label: 'Tg Ab', fullName: 'Thyroglobulin Antibody', description: 'Antibody that may indicate autoimmune thyroid disease or interfere with thyroglobulin testing.', step: '0.01' },
  { key: 'trab', label: 'TRAb', fullName: 'TSH Receptor Antibody', description: 'Antibody that may stimulate or block the TSH receptor in thyroid autoimmune disease.', step: '0.01' },
  { key: 'got', label: 'GOT / AST', fullName: 'Aspartate Aminotransferase', description: 'Measures liver and muscle cell enzymes that can rise with tissue injury.', step: '0.1' },
  { key: 'ggt', label: 'GGT', fullName: 'Gamma-Glutamyl Transferase', description: 'Measures a liver enzyme and helps assess liver or bile-duct conditions.', step: '0.1' },
  { key: 'cholesterol', label: 'CHO', fullName: 'Total Cholesterol', description: 'Measures blood cholesterol used to assess cardiovascular risk.', step: '0.1' },
  { key: 'triglycerides', label: 'TRIG', fullName: 'Triglycerides', description: 'Measures blood fat used for energy and related to metabolic and cardiovascular risk.', step: '0.1' },
  { key: 'calcium', label: 'Calcium', fullName: 'Blood Calcium', description: 'Supports bone, muscle, nerve, and blood-clotting functions.', step: '0.01' },
  { key: 'glucose', label: 'GLU', fullName: 'Blood Glucose', description: 'Measures circulating sugar used as the body’s main energy source.', step: '0.1' },
  { key: 'urea', label: 'URE', fullName: 'Urea', description: 'Reflects protein metabolism and kidney or hydration status.', step: '0.1' },
  { key: 'creatinine', label: 'CRE', fullName: 'Creatinine', description: 'Waste product used to estimate kidney function.', step: '0.01' },
  { key: 'gpt', label: 'GPT / ALT', fullName: 'Alanine Aminotransferase', description: 'Measures a liver enzyme that rises when liver cells are injured.', step: '0.1' },
  { key: 'uricAcid', label: 'UA', fullName: 'Uric Acid', description: 'Measures a waste product associated with gout and kidney or metabolic conditions.', step: '0.1' },
];

export const FIELD_KEYS: ThyroidFieldKey[] = FIELD_DEFINITIONS.map((field) => field.key);

export const FIELD_BY_KEY: Record<ThyroidFieldKey, FieldDefinition> = FIELD_DEFINITIONS.reduce(
  (map, field) => {
    map[field.key] = field;
    return map;
  },
  {} as Record<ThyroidFieldKey, FieldDefinition>,
);

export function createEmptyValues(): ThyroidBloodValues {
  return {
    tsh: null,
    freeT4: null,
    totalT4: null,
    freeT3: null,
    totalT3: null,
    tpoAb: null,
    tgAb: null,
    trab: null,
    got: null,
    ggt: null,
    cholesterol: null,
    triglycerides: null,
    calcium: null,
    glucose: null,
    urea: null,
    creatinine: null,
    gpt: null,
    uricAcid: null,
  };
}
