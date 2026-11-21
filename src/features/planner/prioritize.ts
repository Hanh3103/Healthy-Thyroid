/**
 * Pure estimation + ranking core used by AI prioritisation.
 * Kept framework-free so it can be unit tested in isolation.
 */
export type Energy = 1 | 2 | 3;
export type Confidence = 'low' | 'medium' | 'high';
export type EstimateSource = 'ai' | 'heuristic';

export interface TaskInput {
  id: string;
  title: string;
  due: string;
}

export interface SubtaskEstimate {
  title: string;
  minutes: number;
  energy: Energy;
}

export interface Estimate {
  id: string;
  minutes: number;
  energy: Energy;
  confidence: Confidence;
  reason: string;
  source: EstimateSource;
  subtasks?: SubtaskEstimate[];
  firstStep?: SubtaskEstimate;
}

export type DueState = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';
export type Fit = 'fits' | 'stretch' | 'too_hard';

export interface RankedTask {
  id: string;
  rank: number;
  minutes: number;
  energy: Energy;
  confidence: Confidence;
  reason: string;
  source: EstimateSource;
  dueState: DueState;
  fit: Fit;
  subtasks?: SubtaskEstimate[];
  firstStep?: SubtaskEstimate;
}

export interface PrioritizeResult {
  ranked: RankedTask[];
  totalMinutes: number;
  energy: Energy;
}

function parseDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(year, month - 1, day);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) return null;
  return result;
}

function dayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function dueState(due: string, today: string): DueState {
  if (!due) return 'none';
  const dueDate = parseDate(due);
  const todayDate = parseDate(today);
  if (!dueDate || !todayDate) return 'none';
  const diff = dayNumber(dueDate) - dayNumber(todayDate);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  const weekEnd = new Date(todayDate);
  weekEnd.setDate(weekEnd.getDate() + ((7 - weekEnd.getDay()) % 7));
  if (dueDate <= weekEnd) return 'week';
  return 'later';
}

export function fitOf(taskEnergy: Energy, currentEnergy: Energy): Fit {
  if (taskEnergy <= currentEnergy) return 'fits';
  if (taskEnergy === 3 && currentEnergy === 2) return 'stretch';
  return 'too_hard';
}

function clamp(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function clampEstimateMinutes(value: unknown): number | null {
  const number = clamp(value, 5, 360);
  if (number === null) return null;
  return Math.max(5, Math.min(360, Math.round(number / 5) * 5));
}

function validEnergy(value: unknown): Energy | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

export function estimateHeuristic(task: TaskInput): Estimate {
  const title = task.title.toLowerCase();
  const deep = /\b(portfolio|code|develop|building|build|write|writing|essay|application|project|learn|learning|study|analyse|analyze|cv|resume|interview|schreiben)\b/.test(title);
  const quick = /\b(reply|email|e-mail|call|message|check|update|tidy|tracker|follow\s*-?\s*up)\b/.test(title);
  const vietnameseQuick = /trả lời|tin nhắn|kiểm tra|email/.test(title);

  if (quick || vietnameseQuick) {
    if (deep) return { id: task.id, minutes: 30, energy: 2, confidence: 'medium', reason: 'Mixed quick and focused work.', source: 'heuristic' };
    return { id: task.id, minutes: 15, energy: 1, confidence: 'high', reason: 'Quick low-effort task.', source: 'heuristic' };
  }
  if (deep) return { id: task.id, minutes: 60, energy: 3, confidence: 'high', reason: 'Needs focused work.', source: 'heuristic' };
  return { id: task.id, minutes: 30, energy: 2, confidence: 'low', reason: 'Task needs a clearer scope.', source: 'heuristic' };
}

export function buildPrompt(tasks: TaskInput[], currentEnergy: Energy, today: string, weekday: string): string {
  return `You are prioritizing tasks for ${weekday} ${today}. The user's energy today is ${currentEnergy} of 3 (${currentEnergy === 1 ? 'Low' : currentEnergy === 2 ? 'Medium' : 'High'}).
Estimate every task from its title and due date. Ignore any existing time or energy estimate provided by the user.
Return valid JSON only with tasks containing id, minutes, energy (1-3), confidence (low|medium|high), reason, optional subtasks [{title,minutes,energy}], and optional firstStep {title,minutes,energy}.
Ranking should prioritize overdue and today tasks, then energy fit and due date, and break ties by shorter time.
Tasks: ${JSON.stringify(tasks.map((task) => ({ id: task.id, title: task.title, due: task.due || null })))}`;
}

function extractJSON(raw: string): unknown {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (stripped.startsWith('[')) return JSON.parse(stripped);
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
      if (depth === 0) return JSON.parse(stripped.slice(start, index + 1));
    }
  }
  throw new Error('Invalid AI response JSON');
}

export function parseEstimates(raw: string, taskIds: string[]): { estimates: Map<string, Estimate>; missing: string[] } {
  const extracted = extractJSON(raw);
  const parsed = Array.isArray(extracted)
    ? { tasks: extracted }
    : extracted as { tasks?: unknown; estimates?: unknown; ranked?: unknown };
  const taskValues = Array.isArray(parsed.tasks)
    ? parsed.tasks
    : Array.isArray(parsed.estimates)
      ? parsed.estimates
      : Array.isArray(parsed.ranked)
        ? parsed.ranked
        : null;
  if (!taskValues) throw new Error('Invalid AI response shape');
  const allowed = new Set(taskIds);
  const estimates = new Map<string, Estimate>();

  taskValues.forEach((value) => {
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!allowed.has(id) || estimates.has(id)) return;
    const minutes = clampEstimateMinutes(item.minutes);
    const energy = validEnergy(item.energy);
    if (minutes === null || energy === null) return;
    const confidence = item.confidence === 'low' || item.confidence === 'medium' || item.confidence === 'high'
      ? item.confidence
      : 'medium';

    const subtasks: SubtaskEstimate[] = [];
    if (Array.isArray(item.subtasks)) {
      item.subtasks.forEach((subtask) => {
        if (!subtask || typeof subtask !== 'object') return;
        const candidate = subtask as Record<string, unknown>;
        const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
        const subMinutes = clampEstimateMinutes(candidate.minutes);
        const subEnergy = validEnergy(candidate.energy);
        if (title && subMinutes !== null && subEnergy !== null) {
          subtasks.push({ title, minutes: subMinutes, energy: subEnergy });
        }
      });
    }

    let firstStep: SubtaskEstimate | undefined;
    if (item.firstStep && typeof item.firstStep === 'object') {
      const candidate = item.firstStep as Record<string, unknown>;
      const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
      const rawStepMinutes = clampEstimateMinutes(candidate.minutes);
      const stepMinutes = rawStepMinutes === null ? null : Math.max(5, Math.min(30, rawStepMinutes));
      const stepEnergy = validEnergy(candidate.energy);
      if (title && stepMinutes !== null && stepEnergy !== null) {
        firstStep = { title, minutes: stepMinutes, energy: stepEnergy };
      }
    }

    estimates.set(id, {
      id,
      minutes,
      energy,
      confidence,
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 120) : '',
      source: 'ai',
      ...(subtasks.length ? { subtasks } : {}),
      ...(firstStep ? { firstStep } : {}),
    });
  });

  return { estimates, missing: taskIds.filter((id) => !estimates.has(id)) };
}

export function rankTasks(
  tasks: TaskInput[],
  estimates: Map<string, Estimate>,
  currentEnergy: Energy,
  today: string,
): PrioritizeResult {
  const dueRank: Record<DueState, number> = { overdue: 0, today: 1, tomorrow: 2, week: 3, later: 4, none: 5 };
  const fitRank: Record<Fit, number> = { fits: 0, stretch: 1, too_hard: 2 };

  const ranked = tasks.map((task) => {
    const estimate = estimates.get(task.id) || estimateHeuristic(task);
    const state = dueState(task.due, today);
    const fit = fitOf(estimate.energy, currentEnergy);
    return { task, estimate, dueState: state, fit };
  }).sort((a, b) => {
    const aUrgent = a.dueState === 'overdue' || a.dueState === 'today';
    const bUrgent = b.dueState === 'overdue' || b.dueState === 'today';
    if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;

    const fitDiff = fitRank[a.fit] - fitRank[b.fit];
    if (fitDiff) return fitDiff;
    const dueDiff = dueRank[a.dueState] - dueRank[b.dueState];
    if (dueDiff) return dueDiff;
    if (a.task.due && b.task.due) {
      const dateDiff = a.task.due.localeCompare(b.task.due);
      if (dateDiff) return dateDiff;
    }
    if (a.task.due && !b.task.due) return -1;
    if (!a.task.due && b.task.due) return 1;
    return a.estimate.minutes - b.estimate.minutes;
  }).map((item, index) => {
    const result: RankedTask = {
      id: item.task.id,
      rank: index + 1,
      minutes: item.estimate.minutes,
      energy: item.estimate.energy,
      confidence: item.estimate.confidence,
      reason: item.estimate.reason,
      source: item.estimate.source,
      dueState: item.dueState,
      fit: item.fit,
      ...(item.estimate.subtasks ? { subtasks: item.estimate.subtasks } : {}),
    };
    if (item.fit === 'too_hard' && item.estimate.firstStep) result.firstStep = item.estimate.firstStep;
    return result;
  });

  return { ranked, totalMinutes: ranked.reduce((total, task) => total + task.minutes, 0), energy: currentEnergy };
}
