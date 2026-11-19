import type { Habit, Task } from '../../../shared/domain-types';
import { EN_NAMES, HINTS, IM_NAMES } from '../../../shared/constants';
import { state } from '../data/app-state';
import { $, esc, keyOf, dueLabel, getPast7Days } from '../../../shared/utils';
import { orderNow, streak, todaySlots } from '../domain/scoring';
import {
  isTodayTask,
  matchesDumpFilter as matchesTaskDumpFilter,
  type DumpFilter as TaskDumpFilter
} from '../task-view-model';

export type DumpFilter = TaskDumpFilter;
export let dumpFilter: DumpFilter = 'all';

export function setDumpFilter(filter: DumpFilter): void {
  dumpFilter = filter;
}

function matchesDumpFilter(task: Task): boolean {
  return matchesTaskDumpFilter(task, dumpFilter);
}

function taskHTML(task: Task, _first: boolean, dump = false): string {
  const due = dueLabel(task.due);
  let html = `<li class="task${task.done ? ' done' : ''}${task.est ? '' : ' guess'}" data-id="${task.id}">`;
  html += `<button type="button" class="chk" data-act="done" aria-label="${task.done ? 'Mark as not done' : 'Mark as done'}"></button>`;
  html += '<div>';
  html += `<button type="button" class="ttitle task-editable" data-act="details" title="Edit task name and details">${esc(task.title)}</button>`;
  if (task.reason) html += `<p class="reason">${esc(task.reason)}</p>`;
  if (task.estimateSource === 'heuristic') {
    html += '<span class="chip todo" title="This estimate was calculated from the task name, not by AI">Heuristic estimate</span>';
  }
  html += '<div class="meta">';
  html += `<button type="button" class="pill imp imp${task.imp}" data-act="imp" title="Click to cycle urgency">${IM_NAMES[task.imp]}</button>`;
  if (task.min) html += `<button type="button" class="chip task-editable" data-act="details" title="Change estimated time">${task.min} min</button>`;
  if (!task.est) html += '<button type="button" class="chip todo task-editable" data-act="details" title="Estimate due date and time">Not estimated yet</button>';
  if (due) {
    html += `<button type="button" class="chip task-editable${due.late ? ' late' : ''}" data-act="details" title="Change due date">${due.t}</button>`;
  } else {
    html += '<button type="button" class="chip todo task-editable" data-act="details" title="Set a due date">No due date</button>';
  }
  if (task.ex) html += '<span class="chip ex">Example</span>';
  if (dump) html += '<button type="button" class="chip todo task-editable" data-act="today" title="Move this task to Do now">Move to Today</button>';
  html += '</div></div>';
  html += '<button type="button" class="del" data-act="del" aria-label="Delete task">×</button></li>';
  return html;
}

function mailHTML(habit: Habit): string {
  const today = new Date();
  const key = keyOf(today);
  const slots = todaySlots(today);
  const log = state.log[key] || {};
  let dots = '';

  getPast7Days().forEach((day, index) => {
    const dayKey = keyOf(day);
    const done = !!(state.log[dayKey] && state.log[dayKey][habit.id]);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const isToday = index === 6;
    dots += `<i class="${done ? 'on' : ''}${isToday ? ' today' : ''}${weekend ? ' off' : ''}" title="${day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${weekend ? ': weekend' : done ? ': done' : ': not done'}"></i>`;
  });

  let nextId: string | null = null;
  for (const slot of slots) {
    if (!log['mail_' + slot.id]) {
      nextId = slot.id;
      break;
    }
  }
  const doneCount = slots.filter((slot) => log['mail_' + slot.id]).length;

  const body = slots.length
    ? '<ul class="slots">' + slots.map((slot) => {
        const done = !!log['mail_' + slot.id];
        return `<li class="slot${done ? ' done' : ''}${slot.id === nextId ? ' next' : ''}"><button type="button" class="chk" data-slot="${slot.id}" aria-pressed="${done}" aria-label="${done ? 'Mark not done: ' : 'Mark done: '}${esc(slot.label)}"></button><span class="stime">${slot.time}</span><span class="slabel">${esc(slot.label)}${slot.id === nextId ? ' <span class="chip">Next</span>' : ''}</span></li>`;
      }).join('') + '</ul>'
    : '<p class="how">No email routine on weekends. It starts again on Monday.</p>';
  const streakCount = streak(habit.id);

  return `<div class="habit"><div class="habit-head"><h3>${habit.name}</h3><span class="muted">${slots.length ? doneCount + ' of ' + slots.length + ' done' : 'Weekend'}</span></div>${body}
    <div class="hfoot"><div class="dots" aria-label="Last 7 days">${dots}</div><span class="muted">${streakCount > 0 ? streakCount + '-day streak' : 'No streak yet'}</span></div></div>`;
}

function habitHTML(habit: Habit): string {
  if (habit.slots) return mailHTML(habit);
  const energy = state.energy;
  const key = keyOf(new Date());
  const done = !!(state.log[key] && state.log[key][habit.id]);
  const detail = habit.by[energy] || habit.by[2] || { min: 15, txt: '' };
  let dots = '';

  getPast7Days().forEach((day, index) => {
    const dayDone = !!(state.log[keyOf(day)] && state.log[keyOf(day)][habit.id]);
    dots += `<i class="${dayDone ? 'on' : ''}${index === 6 ? ' today' : ''}" title="${day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${dayDone ? ': done' : ': not done'}"></i>`;
  });
  const streakCount = streak(habit.id);

  return `<div class="habit"><div class="habit-head"><h3>${habit.name}</h3>
    <button type="button" class="hbtn" data-habit="${habit.id}" aria-pressed="${done}">${done ? 'Done today' : 'Mark done'}</button></div>
    <p class="how"><b>${detail.min} min at ${EN_NAMES[energy].toLowerCase()} energy.</b> ${esc(detail.txt)}</p>
    <div class="hfoot"><div class="dots" aria-label="Last 7 days">${dots}</div>
    <span class="muted">${streakCount > 0 ? streakCount + '-day streak' : 'No streak yet'}</span></div></div>`;
}

export function render(): void {
  const energy = state.energy;
  $('date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  document.querySelectorAll<HTMLButtonElement>('#energy button').forEach((button) => {
    const level = Number(button.getAttribute('data-level'));
    button.setAttribute('aria-checked', level === energy ? 'true' : 'false');
    button.querySelectorAll('.bars i').forEach((bar, index) => {
      bar.className = index < level && level === energy ? 'on' : '';
    });
  });

  $('energy-hint').textContent = HINTS[energy];

  const todayKey = keyOf(new Date());
  let doneHabits = 0;
  let expectedHabits = 0;
  let habitsHTML = '';
  state.habits.forEach((habit) => {
    if (habit.slots && !todaySlots(new Date()).length) {
      habitsHTML += habitHTML(habit);
      return;
    }
    expectedHabits++;
    if (state.log[todayKey] && state.log[todayKey][habit.id]) doneHabits++;
    habitsHTML += habitHTML(habit);
  });
  $('habits').innerHTML = habitsHTML;
  $('habit-count').textContent = `${doneHabits} of ${expectedHabits} done`;

  const open = state.tasks.filter((task) => !task.done);
  const today = open.filter((task) => isTodayTask(task));
  const now = orderNow(today, energy);
  const todayIds = new Set(today.map((task) => task.id));
  const dumps = open.filter((task) => !todayIds.has(task.id));
  const filteredDumps = dumps.filter(matchesDumpFilter);
  const done = state.tasks.filter((task) => task.done);

  $('list-now').innerHTML = now.length
    ? now.map((task, index) => taskHTML(task, index === 0)).join('')
    : '<li class="empty">No tasks waiting.</li>';
  $('list-dumps').innerHTML = filteredDumps.length
    ? filteredDumps.map((task) => taskHTML(task, false, true)).join('')
    : '<li class="empty">No tasks in Dumps.</li>';
  $('list-done').innerHTML = done.map((task) => taskHTML(task, false)).join('');
  $('done-panel').hidden = !done.length;

  const minutes = now.reduce((total, task) => total + (task.min || 0), 0);
  $('now-meta').textContent = `${now.length} task${now.length === 1 ? '' : 's'}${minutes ? ' · about ' + minutes + ' min' : ''}`;
  $('dumps-meta').textContent = filteredDumps.length ? `${filteredDumps.length} shown` : '';
  $('summary').textContent = `${EN_NAMES[energy]} energy: ${now.length} task${now.length === 1 ? '' : 's'} waiting today. ${doneHabits} of ${expectedHabits} daily habits done.`;
  $('ex-banner').hidden = !state.tasks.some((task) => task.ex);

  let note = '';
  const pending = open.filter((task) => !task.est).length;
  if (state.plan && state.plan.energy === energy && state.plan.at && keyOf(new Date(state.plan.at)) === todayKey) {
    note = `Order optimized for ${EN_NAMES[energy].toLowerCase()} energy.`;
  }
  if (pending) note += `${note ? ' ' : ''}${pending} task${pending === 1 ? ' has' : 's have'} not been estimated yet.`;
  $('plan-note').textContent = note;
}
