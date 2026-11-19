import type { AppState, EnergyLevel, Habit } from '../../../shared/domain-types';
import { DEFAULT_HABITS } from '../../../shared/constants';
import { state } from '../data/app-state';
import { $, keyOf } from '../../../shared/utils';
import { toggleSlot } from '../domain/scoring';
import { prioritizeTasks } from '../application/prioritize';
import { AI_ENDPOINTS, getAIConfig } from '../../../shared/ai/ai-client';
import { setDumpFilter } from './render';
import {
  createTask,
  editTask,
  toggleTaskDone,
  cycleTaskUrgency,
  moveTaskToToday,
  removeTask
} from '../task-use-cases';
import { toggleDailyHabit } from '../habit-use-cases';

export function setupEvents(commit: () => void): void {
  document.querySelectorAll<HTMLButtonElement>('[data-dump-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('[data-dump-filter]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      setDumpFilter(button.getAttribute('data-dump-filter') as 'all' | 'tomorrow' | 'week' | 'later');
      commit();
    });
  });
  const taskDetailsDialog = $<HTMLDialogElement>('task-details-dialog');
  const taskNameInput = $<HTMLInputElement>('task-name-input');
  const taskDueInput = $<HTMLInputElement>('task-due-input');
  const taskMinutesInput = $<HTMLInputElement>('task-minutes-input');
  const taskDueStatus = $('task-due-status');
  let editingTaskId: string | null = null;

  function openTaskDetails(task: { id: string; title: string; due: string; min: number; est: boolean }): void {
    editingTaskId = task.id;
    taskNameInput.value = task.title;
    taskDueInput.value = task.due || '';
    taskDueStatus.textContent = task.due ? 'Due date set' : 'No due date';
    taskMinutesInput.value = task.est && task.min ? String(task.min) : '';
    taskDetailsDialog.showModal();
  }

  taskDueInput.addEventListener('change', () => {
    taskDueStatus.textContent = taskDueInput.value ? 'Due date set' : 'No due date';
  });

  taskMinutesInput.addEventListener('input', () => {
    if (!taskMinutesInput.value) {
      taskMinutesInput.setAttribute('placeholder', 'Not estimated yet');
    }
  });

  taskDetailsDialog.addEventListener('close', () => {
    editingTaskId = null;
  });

  $('task-details-close').addEventListener('click', () => taskDetailsDialog.close());
  $('task-details-cancel').addEventListener('click', () => taskDetailsDialog.close());
  $<HTMLFormElement>('task-details-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!editingTaskId) return;
    const task = state.tasks.find((item) => item.id === editingTaskId);
    if (!task) return;
    const title = taskNameInput.value.trim();
    if (!title) {
      taskNameInput.focus();
      return;
    }
    editTask(task, title, taskDueInput.value, taskMinutesInput.value.trim()
      ? Number(taskMinutesInput.value)
      : 0);
    taskDetailsDialog.close();
    commit();
  });

  taskDetailsDialog.querySelectorAll<HTMLButtonElement>('[data-due-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = button.getAttribute('data-due-preset');
      const date = new Date();
      if (preset === 'none') {
        taskDueInput.value = '';
        taskDueStatus.textContent = 'No due date';
        return;
      }
      if (preset === 'tomorrow') date.setDate(date.getDate() + 1);
      if (preset === 'week') {
        const daysUntilSunday = (7 - date.getDay()) % 7;
        date.setDate(date.getDate() + (daysUntilSunday || 7));
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      taskDueInput.value = `${year}-${month}-${day}`;
      taskDueStatus.textContent = 'Due date set';
    });
  });

  $('energy').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-level]');
    if (!button) return;
    const level = Number(button.getAttribute('data-level')) as EnergyLevel;
    if (level !== 1 && level !== 2 && level !== 3) return;
    state.energy = level;
    state.energyDay = keyOf(new Date());
    commit();
  });

  $('habits').addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const slotButton = target.closest<HTMLElement>('[data-slot]');
    if (slotButton) {
      const slotId = slotButton.getAttribute('data-slot');
      if (slotId) toggleSlot(slotId, commit);
      return;
    }

    const habitButton = target.closest<HTMLElement>('[data-habit]');
    if (!habitButton) return;
    const habitId = habitButton.getAttribute('data-habit');
    if (!habitId) return;
    const habit = state.habits.find((item) => item.id === habitId);
    if (habit) toggleDailyHabit(state, habit);
    commit();
  });

  function onTaskList(event: MouseEvent): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!button) return;
    const item = button.closest<HTMLLIElement>('.task');
    if (!item) return;
    const id = item.getAttribute('data-id');
    const index = state.tasks.findIndex((task) => task.id === id);
    if (index < 0) return;

    const task = state.tasks[index];
    const action = button.getAttribute('data-act');
    if (action === 'done') toggleTaskDone(task);
    if (action === 'imp') {
      cycleTaskUrgency(task);
    }
    if (action === 'today') {
      moveTaskToToday(task);
    }
    if (action === 'details') openTaskDetails(task);
    if (action === 'del' && id) removeTask(state.tasks, id);
    if (action !== 'details') commit();
  }

  ['list-now', 'list-dumps', 'list-done'].forEach((id) => {
    $(id).addEventListener('click', onTaskList);
  });

  $('add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const titleInput = $<HTMLInputElement>('t-title');
    const dueInput = $<HTMLInputElement>('t-due');
    const minutesInput = $<HTMLInputElement>('t-minutes');
    const title = titleInput.value.trim();
    if (!title) return;
    const task = createTask(title, dueInput.value, Number(minutesInput.value));
    state.tasks.push(task);
    titleInput.value = '';
    dueInput.value = '';
    minutesInput.value = '';
    titleInput.focus();
    commit();
  });

  $('bulk-add').addEventListener('click', () => {
    const bulk = $<HTMLTextAreaElement>('bulk');
    bulk.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => state.tasks.push(createTask(line.slice(0, 140))));
    bulk.value = '';
    commit();
  });

  $('habit-add-btn').addEventListener('click', () => {
    $('habit-form').hidden = false;
    $<HTMLInputElement>('h-name').focus();
  });
  $('habit-cancel-btn').addEventListener('click', () => {
    $('habit-form').hidden = true;
  });
  $('habit-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $<HTMLInputElement>('h-name').value.trim();
    if (!name) return;
    const minutes = Math.max(1, Math.min(360, Number($<HTMLInputElement>('h-min').value) || 15));
    const description = $<HTMLInputElement>('h-desc').value.trim();
    const habit: Habit = {
      id: 'h' + Date.now().toString(36),
      name,
      by: {
        1: { min: minutes, txt: description || 'Light version — keep it short and low-effort.' },
        2: { min: minutes, txt: description || 'Standard version — steady, comfortable effort.' },
        3: { min: minutes, txt: description || 'Deep version — give this your full focus.' }
      }
    };
    state.habits.push(habit);
    $<HTMLInputElement>('h-name').value = '';
    $<HTMLInputElement>('h-min').value = '15';
    $<HTMLInputElement>('h-desc').value = '';
    $('habit-form').hidden = true;
    commit();
  });

  $('clear-ex').addEventListener('click', () => {
    state.tasks = state.tasks.filter((task) => !task.ex);
    commit();
  });
  $('clear-done').addEventListener('click', () => {
    state.tasks = state.tasks.filter((task) => !task.done);
    commit();
  });

  $('b-copy').addEventListener('click', () => {
    const backup = $<HTMLTextAreaElement>('backup');
    backup.value = JSON.stringify(state, null, 2);
    const fallback = () => {
      backup.focus();
      backup.select();
      $('b-status').textContent = 'Select and copy the text above.';
    };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(backup.value).then(
          () => { $('b-status').textContent = 'Backup copied to clipboard.'; },
          fallback
        );
      } else fallback();
    } catch {
      fallback();
    }
  });

  $('b-restore').addEventListener('click', () => {
    try {
      const restored = JSON.parse($<HTMLTextAreaElement>('backup').value) as Partial<AppState>;
      if (!restored || !Array.isArray(restored.tasks)) throw new Error('Invalid backup format');
      restored.log = restored.log || {};
      restored.energy = restored.energy || 2;
      restored.plan = restored.plan || null;
      if (!Array.isArray(restored.habits) || !restored.habits.length) restored.habits = [...DEFAULT_HABITS];
      restored.tasks.forEach((task) => {
        if (task.est === undefined) task.est = true;
        if (task.locked === undefined) task.locked = false;
        if (task.reason === undefined) task.reason = '';
      });
      Object.assign(state, restored);
      commit();
      $('b-status').textContent = 'Backup restored successfully.';
    } catch {
      $('b-status').textContent = 'The entered text is not a valid backup JSON.';
    }
  });

  const settingsDialog = $<HTMLDialogElement>('settings-dialog');
  const providerInput = $<HTMLSelectElement>('ai-provider-input');
  const keyInput = $<HTMLInputElement>('ai-api-key-input');
  const endpointInput = $<HTMLInputElement>('ai-endpoint-input');
  const modelInput = $<HTMLInputElement>('ai-model-input');
  $('settings-btn').addEventListener('click', () => {
    const config = getAIConfig();
    providerInput.value = config.provider;
    keyInput.value = config.apiKey;
    endpointInput.value = config.endpoint;
    modelInput.value = config.model;
    settingsDialog.showModal();
  });
  $('settings-close').addEventListener('click', () => settingsDialog.close());
  $('settings-cancel').addEventListener('click', () => settingsDialog.close());
  providerInput.addEventListener('change', () => {
    const provider = providerInput.value as keyof typeof AI_ENDPOINTS;
    const preset = AI_ENDPOINTS[provider];
    if (preset) {
      endpointInput.value = preset.endpoint;
      modelInput.value = preset.model;
    }
  });
  $<HTMLFormElement>('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const provider = providerInput.value as 'custom' | 'openai' | 'gemini' | 'claude' | 'mistral' | 'ollama';
    const key = keyInput.value.trim();
    const endpoint = endpointInput.value.trim();
    const model = modelInput.value.trim();
    localStorage.setItem('ai_provider', provider);
    if (key) localStorage.setItem('ai_api_key', key);
    else localStorage.removeItem('ai_api_key');
    if (endpoint) localStorage.setItem('ai_endpoint', endpoint);
    else localStorage.removeItem('ai_endpoint');
    if (model) localStorage.setItem('ai_model', model);
    else localStorage.removeItem('ai_model');
    $('ai-status').textContent = endpoint && model && (provider === 'ollama' || !!key)
      ? 'AI configuration saved.'
      : 'AI configuration cleared or incomplete.';
    settingsDialog.close();
  });

  $('ai-btn').addEventListener('click', () => {
    void prioritizeTasks(
      (message) => { $('ai-status').textContent = message; },
      commit
    );
  });

  let shownDay = keyOf(new Date());
  function dayCheck(): void {
    const key = keyOf(new Date());
    if (key !== shownDay) {
      shownDay = key;
      state.energy = 2;
      state.energyDay = key;
      commit();
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) dayCheck();
  });
  window.addEventListener('focus', dayCheck);
  window.setInterval(dayCheck, 60_000);
}
