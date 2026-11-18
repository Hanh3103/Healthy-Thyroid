import type { AIPrioritizationResult, EnergyLevel } from './types';
import { EN_NAMES } from './constants';
import { state } from './state';
import { getAIConfig, requestAIText } from './ai-client';

function applyMediumFallback(commit: () => void): void {
  state.tasks
    .filter((task) => !task.done && !task.locked)
    .forEach((task) => {
      task.energy = 2;
      task.imp = 2;
      task.min = task.min || 30;
      task.reason = task.reason || 'Estimated as medium effort.';
      task.est = true;
    });
  commit();
}

export async function estimateTask(
  taskId: string,
  onStatus: (message: string) => void,
  commit: () => void
): Promise<void> {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.locked) return;

  const config = getAIConfig();
  if (!config.apiKey || !config.endpoint || !config.model) {
    task.energy = 2;
    task.imp = 2;
    task.min = 30;                   
    task.reason = 'Estimated as medium effort.';
    task.est = true;
    commit();
    onStatus('AI is not configured — task added with Medium defaults.');
    return;
  }

  const prompt = `Estimate this task's required effort. Return only valid JSON:
{"energy":1|2|3,"minutes":5-360,"reason":"one short sentence"}

Task: ${task.title}${task.due ? `; due: ${task.due}` : ''}`;

  try {
    const raw = await requestAIText(config, prompt);
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const result = JSON.parse(json) as { energy?: number; minutes?: number; reason?: string };

    const energy = Number(result.energy);
    task.energy = [1, 2, 3].includes(energy) ? energy as EnergyLevel : 2;
    task.min = Math.max(5, Math.min(360, Math.round((Number(result.minutes) || 30) / 5) * 5));
    task.reason = typeof result.reason === 'string' ? result.reason.slice(0, 120) : 'Estimated as medium effort.';
    task.est = true;
    commit();
    onStatus(`Task estimated as ${EN_NAMES[task.energy].toLowerCase()} energy.`);
  } catch (error) {
    console.error('Task estimation error:', error);
    task.energy = 2;
    task.imp = 2;
    task.min = task.min || 30;
    task.reason = 'Estimated as medium effort.';
    task.est = true;
    commit();
    onStatus('AI estimation failed — task was estimated as medium.');
  }
}

export async function prioritizeTasks(onStatus: (message: string) => void, commit: () => void): Promise<void> {
  const config = getAIConfig();
  if (!config.apiKey || !config.endpoint || !config.model) {
    applyMediumFallback(commit);
    onStatus('AI is not configured — enter it in Settings.');
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
  onStatus('Asking AI…');

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
    const raw = await requestAIText(config, prompt);
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const result = JSON.parse(json) as AIPrioritizationResult;
    if (!Array.isArray(result.tasks)) throw new Error('Invalid AI response shape');

    const byId = new Map(undone.map((task) => [task.id, task]));
    result.tasks.forEach((item) => {
      const task = byId.get(item.id);
      if (!task) return;
      if (!task.locked) {
        const energy = Number(item.energy);
        const urgency = Number(item.urgency);
        task.energy = [1, 2, 3].includes(energy)
          ? energy as EnergyLevel
          : 2;
        task.imp = [1, 2, 3].includes(urgency)
          ? urgency as 1 | 2 | 3
          : 2;
      }
      task.min = Math.max(5, Math.min(360, Math.round((Number(item.minutes) || 30) / 5) * 5));
      task.reason = typeof item.reason === 'string' ? item.reason.slice(0, 120) : '';
      task.est = true;
    });
    undone
      .filter((task) => !task.locked && !task.est)
      .forEach((task) => {
        task.energy = 2;
        task.imp = 2;
        task.min = task.min || 30;
        task.reason = task.reason || 'Estimated as medium effort.';
        task.est = true;
      });

    const validOrder = Array.isArray(result.order)
      ? result.order.filter((id) => byId.has(id) && !byId.get(id)!.done)
      : [];
    state.plan = { energy: state.energy, order: validOrder, at: Date.now() };
    commit();
    onStatus(`Done — tasks prioritized for ${EN_NAMES[state.energy].toLowerCase()} energy.`);
  } catch (error) {
    console.error('AI prioritization error:', error);
    applyMediumFallback(commit);
    onStatus(`AI error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (aiButton) aiButton.disabled = false;
  }
}

function $dialog(id: string): HTMLDialogElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLDialogElement)) throw new Error(`Dialog #${id} not found`);
  return element;
}
