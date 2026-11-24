/** The exact disclosure shown before the first AI call and in Settings > Data & privacy. */
export const AI_CONSENT_ITEMS: readonly string[] = [
  'Daily Check-in energy level for selected day(s), symptoms as name + severity only (never the free note), and busyness computed from task/habit counts and minutes.',
  'Profile: medication time, meal times, diet preferences, allergies, avoided foods, cooking minutes, equipment, servings/leftovers, cuisine preference, shopping place and budget.',
  'Diet: wanted foods and appetite for the day, pantry, recent meals from the last 3–5 days, kept meals, the changed meal when editing, shopping-item names only, and the curated fact library.',
  'Computed by the app: days/weekdays, remaining meals for today, and the timing clock times.',
  'No names, free notes, task/habit names, or medical records. API key stays in the OS keychain.',
];

export const AI_STORAGE_ITEMS: readonly string[] = [
  'Energy Planner tasks, habits, daily check-ins and saved backups stay on this device.',
  'Thyroid Checker results and imported files stay on this device.',
  'Diet Advisor plans, pantry, shopping list and food log stay on this device.',
  'Appearance, language, date/time format and week-start preferences stay on this device.',
  'The AI API key is stored only in the operating system keychain, never in browser storage. A daily call counter is kept in app data.',
];
