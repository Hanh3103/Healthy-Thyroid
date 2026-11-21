/**
 * Diet feature model.
 * The Diet Advisor is a placeholder for a future module; this holds the small
 * amount of pure data the view needs so the UI stays declarative.
 */

export interface DietStatus {
  title: string;
  state: 'coming-soon';
  description: string;
}

export function initialDietStatus(): DietStatus {
  return {
    title: 'Diet Advisor',
    state: 'coming-soon',
    description: 'Personalized meal and nutrition guidance will live here. This area is ready for a future Diet Advisor module, kept independent from Energy Planner and Thyroid Checker.',
  };
}
