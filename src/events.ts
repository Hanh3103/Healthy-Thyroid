import type { AppState, EnergyLevel, Habit } from './types';
import { DEFAULT_HABITS } from './constants';
import { state, newTask } from './state';
import { $, keyOf } from './utils';
import { toggleSlot } from './scoring';
import { getGeminiApiKey, prioritizeWithGemini } from './ai';

export function setupEvents(commit: () => void): void {
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
    const key = keyOf(new Date());
    state.log[key] = state.log[key] || {};
    state.log[key][habitId] = !state.log[key][habitId];
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
    if (action === 'done') task.done = !task.done;
    if (action === 'energy') {
      task.energy = ((task.energy % 3) + 1) as EnergyLevel;
      task.locked = true;
    }
    if (action === 'imp') {
      task.imp = ((task.imp % 3) + 1) as 1 | 2 | 3;
      task.locked = true;
    }
    if (action === 'del') state.tasks.splice(index, 1);
    commit();
  }

  ['list-now', 'list-later', 'list-done'].forEach((id) => {
    $(id).addEventListener('click', onTaskList);
  });

  $('add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const titleInput = $<HTMLInputElement>('t-title');
    const dueInput = $<HTMLInputElement>('t-due');
    const energyInput = $<HTMLSelectElement>('t-energy');
    const title = titleInput.value.trim();
    if (!title) return;
    const rawEnergy = Number(energyInput.value);
    const energy = rawEnergy === 1 || rawEnergy === 2 || rawEnergy === 3
      ? rawEnergy as EnergyLevel
      : undefined;
    state.tasks.push(newTask(title, dueInput.value, energy));
    titleInput.value = '';
    dueInput.value = '';
    energyInput.value = 'auto';
    commit();
    titleInput.focus();
  });

  $('bulk-add').addEventListener('click', () => {
    const bulk = $<HTMLTextAreaElement>('bulk');
    bulk.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => state.tasks.push(newTask(line.slice(0, 140))));
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
  const keyInput = $<HTMLInputElement>('gemini-key-input');
  $('settings-btn').addEventListener('click', () => {
    keyInput.value = getGeminiApiKey();
    settingsDialog.showModal();
  });
  $('settings-close').addEventListener('click', () => settingsDialog.close());
  $('settings-cancel').addEventListener('click', () => settingsDialog.close());
  $<HTMLFormElement>('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const key = keyInput.value.trim();
    if (key) localStorage.setItem('gemini_api_key', key);
    else localStorage.removeItem('gemini_api_key');
    $('ai-status').textContent = key ? 'Gemini API key saved.' : 'Gemini API key cleared.';
    settingsDialog.close();
  });

  $('ai-btn').addEventListener('click', () => {
    void prioritizeWithGemini(
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
