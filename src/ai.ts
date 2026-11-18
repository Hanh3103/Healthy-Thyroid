import type { EnergyLevel, GeminiPrioritizationResult } from './types';
import { EN_NAMES } from './constants';
import { state } from './state';

const GEMINI_MODEL = 'gemini-3.5-flash-lite';

export function getGeminiApiKey(): string {
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY;
  if (envKey?.trim()) return envKey.trim();
  return localStorage.getItem('gemini_api_key')?.trim() || '';
}

export async function prioritizeWithGemini(onStatus: (message: string) => void, commit: () => void): Promise<void> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    onStatus('No API key set — enter it in Settings.');
    ($dialog('settings-dialog')).showModal();
    return;
  }

  const undone = state.tasks.filter((task) => !task.done);
  if (!undone.length) {
    onStatus('No active tasks to prioritize.');
    return;
  }

  const aiButton = document.getElementById('ai-btn') as HTMLButtonElement | null;
  if (aiButton) aiButton.disabled = true;
  onStatus('Asking Gemini…');

  const payload = undone.map((task) => ({
    id: task.id,
    title: task.title,
    locked: task.locked,
    lockedEnergy: task.locked ? task.energy : undefined,
    lockedUrgency: task.locked ? task.imp : undefined,
    due: task.due || undefined
  }));
  const prompt = `You are an energy-aware productivity assistant.

Current energy: ${EN_NAMES[state.energy]} (${state.energy}/3).
For each task, return valid JSON with id, energy (1|2|3), minutes (5-360), urgency (1|2|3), and reason (max 120 chars).
Locked tasks keep lockedEnergy and lockedUrgency exactly.
Return: {"tasks":[{"id":"...","energy":1,"minutes":30,"urgency":2,"reason":"..."}],"order":["id"]}.

Tasks: ${JSON.stringify(payload)}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json' }
      })
    });
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const raw = Array.isArray(parts)
      ? parts.filter((part) => !part?.thought).map((part) => part?.text ?? '').join('')
      : '';
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const result = JSON.parse(json) as GeminiPrioritizationResult;
    if (!Array.isArray(result.tasks)) throw new Error('Invalid Gemini response shape');

    const byId = new Map(undone.map((task) => [task.id, task]));
    result.tasks.forEach((item) => {
      const task = byId.get(item.id);
      if (!task) return;
      if (!task.locked) {
        task.energy = Math.max(1, Math.min(3, Math.round(item.energy))) as EnergyLevel;
        task.imp = Math.max(1, Math.min(3, Math.round(item.urgency))) as 1 | 2 | 3;
      }
      task.min = Math.max(5, Math.min(360, Math.round((Number(item.minutes) || 30) / 5) * 5));
      task.reason = typeof item.reason === 'string' ? item.reason.slice(0, 120) : '';
      task.est = true;
    });

    const validOrder = Array.isArray(result.order)
      ? result.order.filter((id) => byId.has(id) && !byId.get(id)!.done)
      : [];
    state.plan = { energy: state.energy, order: validOrder, at: Date.now() };
    commit();
    onStatus(`Done — tasks prioritized for ${EN_NAMES[state.energy].toLowerCase()} energy.`);
  } catch (error) {
    console.error('Gemini prioritization error:', error);
    onStatus(`Gemini error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (aiButton) aiButton.disabled = false;
  }
}

function $dialog(id: string): HTMLDialogElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLDialogElement)) throw new Error(`Dialog #${id} not found`);
  return element;
}
