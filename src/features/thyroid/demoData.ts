/**
 * Deterministic sample records for exercising the dashboard during development.
 * Dates are generated relative to the current month so the All / 1 year /
 * 6 months filters always have enough points to display.
 */
import { createEmptyValues, STANDARD_RANGES, type ThyroidBloodRecord } from './model';

export const DEMO_ID_PREFIX = 'demo-result-';

// TSH (mIU/L): starts above the reference range, then settles into it.
const TSH = [
  6.82, 6.14, 5.73, 5.21, 4.86, 4.35, 3.91, 3.54, 3.28, 2.96,
  2.71, 2.44, 2.18, 2.05, 1.88, 1.72, 1.61, 1.95, 2.12, 2.36,
];

// Free T4 (ng/dL) and Free T3 (pg/mL), aligned with the TSH readings.
const FREE_T4 = [
  0.78, 0.82, 0.86, 0.91, 0.95, 1.02, 1.06, 1.12, 1.15, 1.21,
  1.24, 1.30, 1.33, 1.38, 1.41, 1.46, 1.49, 1.44, 1.40, 1.37,
];

const FREE_T3 = [
  2.12, 2.21, 2.28, 2.36, 2.44, 2.55, 2.63, 2.72, 2.80, 2.89,
  2.97, 3.08, 3.16, 3.24, 3.33, 3.41, 3.48, 3.42, 3.36, 3.29,
];

export function buildDemoRecords(now = new Date()): ThyroidBloodRecord[] {
  return TSH.map((tsh, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (TSH.length - 1 - index), 15);
    const date = [
      month.getFullYear(),
      String(month.getMonth() + 1).padStart(2, '0'),
      '15',
    ].join('-');
    const createdAt = month.getTime();

    return {
      ...createEmptyValues(),
      id: `${DEMO_ID_PREFIX}${String(index + 1).padStart(2, '0')}`,
      date,
      tsh,
      freeT4: FREE_T4[index],
      freeT3: FREE_T3[index],
      units: { tsh: 'mIU/L', freeT4: 'ng/dL', freeT3: 'pg/mL' },
      ranges: {
        tsh: STANDARD_RANGES.tsh,
        freeT4: STANDARD_RANGES.freeT4,
        freeT3: STANDARD_RANGES.freeT3,
      },
      sourceFileName: 'demo-blood-results.pdf',
      createdAt,
      updatedAt: createdAt,
    };
  });
}
