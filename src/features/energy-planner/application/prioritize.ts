import { state } from '../data/app-state';
import { createAITextProvider, getAIConfig } from '../../../shared/ai/ai-client';
import { keyOf } from '../../../shared/utils';
import {
  buildPrompt,
  estimateHeuristic,
  parseEstimates,
  rankTasks,
  type Energy,
  type PrioritizeResult,
  type TaskInput,
} from '../domain/prioritize-core';

const TIMEOUT_MS = 90_000;

function isTodayTask(task: { imp: number; due: string }, today: string): boolean {
  return task.imp === 4 || (!!task.due && task.due <= today);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The AI took too long. Try again.')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function applyResult(result: PrioritizeResult, commit: () => void): void {
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  result.ranked.forEach((ranked) => {
    const task = byId.get(ranked.id);
    if (!task) return;
    task.min = ranked.minutes;
    task.est = true;
    task.reason = ranked.reason;
    task.estimateSource = ranked.source;
    task.fit = ranked.fit;
    task.confidence = ranked.confidence;
    task.firstStep = ranked.firstStep ? {
      title: ranked.firstStep.title,
      minutes: ranked.firstStep.minutes
    } : undefined;
    task.subtasks = ranked.subtasks?.map((subtask) => ({
      title: subtask.title,
      minutes: subtask.minutes,
      energy: subtask.energy
    }));
  });
  state.plan = {
    energy: result.energy,
    order: result.ranked.map((ranked) => ranked.id),
    at: Date.now()
  };
  commit();
}

export async function prioritizeTasks(
  onStatus: (message: string) => void,
  commit: () => void,
): Promise<PrioritizeResult | null> {
  const energy = state.energy as Energy;
  const today = keyOf(new Date());
  const todayTasks = state.tasks.filter((task) => !task.done && isTodayTask(task, today));
  if (!todayTasks.length) {
    onStatus('No tasks marked for today.');
    return null;
  }

  const inputs: TaskInput[] = todayTasks.map((task) => ({
    id: task.id,
    title: task.title,
    due: task.due || ''
  }));
  const config = getAIConfig();
  const configured = !!config.endpoint && !!config.model
    && (config.provider === 'ollama' || !!config.apiKey);
  if (!configured) {
    const result = rankTasks(inputs, new Map(), energy, today);
    applyResult(result, commit);
    onStatus('Heuristic estimates used: AI is not configured. Add your key in Settings.');
    $dialog('settings-dialog').showModal();
    return result;
  }

  const aiButton = document.getElementById('ai-btn') as HTMLButtonElement | null;
  if (aiButton) aiButton.disabled = true;
  onStatus('Asking AI...');

  try {
    const weekday = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
    const aiProvider = createAITextProvider();
    const raw = await withTimeout(
      aiProvider.complete(buildPrompt(inputs, energy, today, weekday)),
      TIMEOUT_MS,
    );
    const { estimates, missing } = parseEstimates(raw, inputs.map((input) => input.id));
    missing.forEach((id) => {
      const task = inputs.find((input) => input.id === id);
      if (task) estimates.set(id, estimateHeuristic(task));
    });
    const result = rankTasks(inputs, estimates, energy, today);
    applyResult(result, commit);
    onStatus(missing.length
      ? `Heuristic estimates used for ${missing.length} task(s): the AI skipped them. Remaining tasks use AI estimates.`
      : 'AI estimates used. Today tasks prioritized.');
    return result;
  } catch (error) {
    console.error('AI prioritization error:', error);
    const result = rankTasks(inputs, new Map(), energy, today);
    applyResult(result, commit);
    onStatus(`Heuristic estimates used: ${error instanceof Error ? error.message : String(error)}.`);
    return result;
  } finally {
    if (aiButton) aiButton.disabled = false;
  }
}

function $dialog(id: string): HTMLDialogElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLDialogElement)) throw new Error(`Dialog #${id} not found`);
  return element;
}
