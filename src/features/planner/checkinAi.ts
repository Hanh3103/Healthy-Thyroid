/**
 * AI-backed daily check-in suggestion shared by the planner and the diet day panel.
 *
 * Keeps transport setup out of components while leaving prompts and parsing in
 * the framework-free `checkin.ts` core.
 */
import { createAITextProvider } from '../../shared/ai/client';
import { useAiStore } from '../../stores/ai';
import { EN_NAMES } from './model';
import {
  buildCheckInPrompt,
  heuristicEnergySuggestion,
  parseEnergySuggestion,
  type EnergySuggestion,
} from './checkin';

export interface CheckInSuggestionResult {
  suggestion: EnergySuggestion;
  status: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The AI took too long. Try again.')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Asks AI for a level, falling back to the local heuristic with a clear status. */
export async function requestCheckInSuggestion(symptoms: string): Promise<CheckInSuggestionResult> {
  const store = useAiStore();
  await store.load();
  const config = store.config;
  const configured = !!config.endpoint && !!config.model
    && (config.provider === 'ollama' || !!config.apiKey);

  if (!configured) {
    const fallback = heuristicEnergySuggestion(symptoms);
    return {
      suggestion: fallback,
      status: `${EN_NAMES[fallback.level]} suggestion (${fallback.reason}) — AI is not configured, so this is a local estimate.`,
    };
  }

  try {
    const raw = await withTimeout(
      createAITextProvider(config).complete(buildCheckInPrompt(symptoms)),
      90_000,
    );
    const suggestion = parseEnergySuggestion(raw);
    if (!suggestion) throw new Error('AI did not return a valid energy level.');
    return {
      suggestion,
      status: suggestion.reason
        ? `AI suggests ${EN_NAMES[suggestion.level]}: ${suggestion.reason}`
        : `AI suggests ${EN_NAMES[suggestion.level]}.`,
    };
  } catch (error) {
    const fallback = heuristicEnergySuggestion(symptoms);
    const detail = error instanceof Error ? error.message : String(error);
    return {
      suggestion: fallback,
      status: `${EN_NAMES[fallback.level]} suggestion (${fallback.reason}) — fallback: ${detail}`,
    };
  }
}
