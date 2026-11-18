/**
 * Type definitions for Energy Planner.
 */

/** Energy level: 1 = Low, 2 = Medium, 3 = High. */
export type EnergyLevel = 1 | 2 | 3;

/** Urgency level: 1 = Later, 2 = This week, 3 = Today. */
export type UrgencyLevel = 1 | 2 | 3;

/** Represents a user task with prioritization metadata. */
export interface Task {
  id: string;
  title: string;
  energy: EnergyLevel;
  imp: UrgencyLevel;
  min: number;
  due: string;
  done: boolean;
  ex: boolean;
  est: boolean;
  locked: boolean;
  reason: string;
}

/** Specific target duration and instructions for a habit at a given energy level. */
export interface HabitByEnergy {
  min: number;
  txt: string;
}

/** Represents a recurring daily habit. */
export interface Habit {
  id: string;
  name: string;
  slots?: boolean;
  by: Record<EnergyLevel, HabitByEnergy>;
}

/** Stores an AI-generated or optimized task ordering plan. */
export interface Plan {
  energy: number;
  order: string[];
  at: number;
}

/** Root application state persisted to local storage. */
export interface AppState {
  energy: EnergyLevel;
  energyDay?: string;
  log: Record<string, Record<string, boolean>>;
  plan: Plan | null;
  tasks: Task[];
  habits: Habit[];
}

/** Scheduled checklist slot inside a multi-slot habit (e.g. Email check). */
export interface MailSlot {
  id: string;
  time: string;
  label: string;
  fri?: boolean;
}

/** Result shape returned by the Gemini Prioritization API. */
export interface GeminiTaskResult {
  id: string;
  energy: number;
  minutes: number;
  urgency: number;
  reason: string;
}

export interface GeminiPrioritizationResult {
  tasks: GeminiTaskResult[];
  order: string[];
}
