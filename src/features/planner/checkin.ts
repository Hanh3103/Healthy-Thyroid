/**
 * Daily check-in suggestion core.
 *
 * Framework-free so prompts and parsing can be unit tested. Live AI calls are
 * made only by the Rust Diet generator; this module is local heuristics.
 */
import type { EnergyLevel } from './model';

export interface EnergySuggestion {
  level: EnergyLevel;
  reason: string;
  source: 'ai' | 'heuristic';
}

function validLevel(value: unknown): EnergyLevel | null {
  if (value === 1 || value === 2 || value === 3) return value;
  if (typeof value !== 'string') return null;
  const label = value.trim().toLowerCase();
  if (label === 'low' || label === '1') return 1;
  if (label === 'medium' || label === 'mid' || label === '2') return 2;
  if (label === 'high' || label === '3') return 3;
  return null;
}

function extractObject(raw: string): Record<string, unknown> {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = stripped.indexOf('{');
  if (start < 0) throw new Error('Invalid AI response: no JSON object');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < stripped.length; index++) {
    const char = stripped[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return JSON.parse(stripped.slice(start, index + 1)) as Record<string, unknown>;
    }
  }
  throw new Error('Invalid AI response JSON');
}

export function buildCheckInPrompt(symptoms: string): string {
  return `You are helping a user choose a realistic energy level for today's plan.
Their symptoms, sleep and general state are: ${symptoms}

Return valid JSON only with this shape:
{"level": 1|2|3, "reason": "one short sentence"}

Level guide: 1 = Low (rest, pain, poor sleep, low capacity), 2 = Medium (steady, ordinary day), 3 = High (rested, focused, good capacity).
Do not give medical advice. Make a conservative recommendation.`;
}

/** Parses an AI energy suggestion, accepting common key and value variants. */
export function parseEnergySuggestion(raw: string): EnergySuggestion | null {
  let object: Record<string, unknown>;
  try {
    object = extractObject(raw);
  } catch {
    return null;
  }
  const level = validLevel(object.level ?? object.energy ?? object.suggested);
  if (level === null) return null;

  return {
    level,
    reason: typeof object.reason === 'string' ? object.reason.trim().slice(0, 200) : '',
    source: 'ai',
  };
}

/** Splits a free-text symptom note into display chips. */
export function parseSymptomChips(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim().replace(/\s+[-–]\s+/, ' - '))
    .filter(Boolean)
    .slice(0, 8);
}

const SHAREABLE_SYMPTOMS: { name: string; pattern: RegExp; severe?: boolean }[] = [
  { name: 'chest pain', pattern: /chest pain/i, severe: true },
  { name: 'shortness of breath', pattern: /short(?:ness of)? breath|difficulty breathing|trouble breathing/i, severe: true },
  { name: 'fainting', pattern: /faint(?:ed|ing)?|passed out/i, severe: true },
  { name: 'palpitations', pattern: /palpitations|racing heart|very fast heartbeat/i, severe: true },
  { name: 'fatigue', pattern: /fatigue|tired|exhaust/i },
  { name: 'poor sleep', pattern: /poor sleep|no sleep|insomnia/i },
  { name: 'headache', pattern: /headache/i },
  { name: 'pain', pattern: /pain|ache/i },
  { name: 'fever', pattern: /fever/i },
  { name: 'nausea', pattern: /nausea/i },
  { name: 'dizziness', pattern: /dizzy|dizziness/i },
  { name: 'cramps', pattern: /cramp/i },
  { name: 'bloating', pattern: /bloated|bloating/i },
  { name: 'weakness', pattern: /weak/i },
  { name: 'low mood', pattern: /low mood/i },
  { name: 'anxiety', pattern: /anxious|anxiety/i },
  { name: 'stress', pattern: /stress/i },
];

/**
 * Derives only controlled symptom names and a coarse severity from a saved
 * check-in note. The original wording is never included in the result.
 */
export function symptomsFromNote(raw: string): { name: string; severity: 'mild' | 'moderate' | 'severe' }[] {
  const text = raw.toLowerCase();
  const cleared = text.replace(/no pain|pain[- ]free/g, ' ');
  const severe = /\b(severe|extreme|very bad|worst|emergency|can't breathe|cannot breathe)\b/i.test(cleared);
  const moderate = /\b(moderate|bad|significant|quite|strong)\b/i.test(cleared);
  return SHAREABLE_SYMPTOMS
    .filter((symptom) => symptom.pattern.test(cleared))
    .slice(0, 8)
    .map((symptom) => ({
      name: symptom.name,
      severity: symptom.severe || severe ? 'severe' : moderate ? 'moderate' : 'mild',
    }));
}

/** Short rationale used when an AI suggestion omitted its reason. */
export function recommendedAiReason(level: EnergyLevel): string {
  if (level === 1) return 'your symptoms point to a lighter day.';
  if (level === 3) return 'good sleep and no symptoms point to a strong day.';
  return 'a steady day looks right for your symptoms.';
}

/** Offline fallback used when AI config is missing or the request fails. */
export function heuristicEnergySuggestion(symptoms: string): EnergySuggestion {
  const text = symptoms.toLowerCase();
  // "no pain" is a positive signal, so remove it before scanning for complaints.
  const complaints = text.replace(/no pain|pain[- ]free/g, ' ');
  const low = /tired|fatigue|exhaust|poor sleep|no sleep|insomnia|headache|pain|fever|sick|ill|nausea|dizzy|cramp|bleed|flare|stressed|anxious|anxiety|low mood|bloated|weak|cold/i.test(complaints);
  const high = /energetic|rested|good sleep|well rested|focused|great|excellent|no pain|fine|strong|clear headed/i.test(text);

  let score = 0;
  if (low) score -= 2;
  if (high) score += 2;

  if (score <= -2) {
    return { level: 1, reason: 'Your symptoms point to a lighter day.', source: 'heuristic' };
  }
  if (score >= 2) {
    return { level: 3, reason: 'You sound rested and ready for focused work.', source: 'heuristic' };
  }
  return { level: 2, reason: 'A steady, medium-energy day is the safest default.', source: 'heuristic' };
}
