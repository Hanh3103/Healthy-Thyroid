/**
 * Local check-in energy suggestion.
 *
 * The Diet Advisor's Tauri command is the only AI caller in this app. This
 * helper deliberately uses the local heuristic so symptom notes stay on the
 * device and no API key is needed in the webview.
 */
import { isTauri } from '../../shared/platform';
import { useAiStatus } from '../../shared/ai/useAiStatus';
import { EN_NAMES } from './model';
import {
  heuristicEnergySuggestion,
  type EnergySuggestion,
} from './checkin';
import { suggestEnergy } from './api';

export interface CheckInSuggestionResult {
  suggestion: EnergySuggestion;
  status: string;
}

/** Calls the desktop AI suggest_energy command, falling back to local heuristic if unavailable. */
export async function requestCheckInSuggestion(symptoms: string): Promise<CheckInSuggestionResult> {
  const ai = useAiStatus();
  if (isTauri()) {
    try {
      const result = await ai.runAi(
        'Generating an energy suggestion',
        () => suggestEnergy(symptoms),
      );
      return {
        suggestion: {
          level: result.level,
          reason: result.reason,
          source: 'ai',
        },
        status: `AI suggests ${EN_NAMES[result.level]} (${result.reason}).`,
      };
    } catch {
      // Fallback to heuristic
    }
  }
  const suggestion = heuristicEnergySuggestion(symptoms);
  return {
    suggestion,
    status: `${EN_NAMES[suggestion.level]} suggestion (${suggestion.reason}) — local estimate.`,
  };
}
