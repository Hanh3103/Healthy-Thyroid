/**
 * Local check-in energy suggestion.
 *
 * The Diet Advisor's Tauri command is the only AI caller in this app. This
 * helper deliberately uses the local heuristic so symptom notes stay on the
 * device and no API key is needed in the webview.
 */
import { EN_NAMES } from './model';
import {
  heuristicEnergySuggestion,
  type EnergySuggestion,
} from './checkin';

export interface CheckInSuggestionResult {
  suggestion: EnergySuggestion;
  status: string;
}

/** Returns a conservative local estimate; never sends the symptom note. */
export async function requestCheckInSuggestion(symptoms: string): Promise<CheckInSuggestionResult> {
  const suggestion = heuristicEnergySuggestion(symptoms);
  return {
    suggestion,
    status: `${EN_NAMES[suggestion.level]} suggestion (${suggestion.reason}) — local estimate.`,
  };
}
