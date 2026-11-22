<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { usePlanner } from '../planner/usePlanner';
import { useDiet } from './useDiet';
import {
  EN_NAMES,
  buildEnergyCalendar,
  buildEnergyWeek,
  summarizeEnergyMonth,
  type CalendarMode,
  type EnergyCalendarDay,
  type EnergyLevel,
} from '../planner/model';
import { canAdvanceMonth, isDatePlannable, maxPlannableWeekOffset } from './model';
import { keyOf } from '../../shared/utils';

const props = defineProps<{ selectedDate: string }>();
const emit = defineEmits<{ select: [date: string] }>();

const planner = usePlanner();
const diet = useDiet();
const { calendarMode, setCalendarMode } = planner;

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const levels: EnergyLevel[] = [1, 2, 3];

const todayKey = ref(keyOf(new Date()));
const todayDate = computed(() => {
  const [year, month, day] = todayKey.value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
});
const calendarCursor = ref({ year: todayDate.value.getFullYear(), month: todayDate.value.getMonth() });
const weekOffset = ref(0);

const energyCalendar = computed(() => buildEnergyCalendar(
  calendarCursor.value.year,
  calendarCursor.value.month,
  planner.state.value.energyHistory,
  todayDate.value,
));
const energyWeek = computed(() => buildEnergyWeek(
  planner.state.value.energyHistory,
  todayDate.value,
  weekOffset.value,
));
const energySummary = computed(() => summarizeEnergyMonth(energyCalendar.value));
const canGoForwardWeek = computed(() => weekOffset.value < maxPlannableWeekOffset(todayDate.value));
const canGoForward = computed(() =>
  canAdvanceMonth(calendarCursor.value.year, calendarCursor.value.month, todayDate.value));

const weekLogged = computed(() => energyWeek.value.days.filter((day) => day.level !== null).length);
const weekPlanned = computed(() => energyWeek.value.days.filter((day) => diet.planForDate(day.key)).length);
const monthPlanned = computed(() => energyCalendar.value.weeks
  .flat()
  .filter((day) => day.inMonth && diet.planForDate(day.key))
  .length);
const isMonth = computed(() => calendarMode.value === 'month');
const plannedCount = computed(() => (isMonth.value ? monthPlanned.value : weekPlanned.value));
const loggedCount = computed(() => (isMonth.value ? energySummary.value.logged : weekLogged.value));

const panel = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const panelHeight = ref('auto');
let motionQuery: MediaQueryList | null = null;
let reduceMotion = false;
let frame = 0;
let animating = false;
let dayTimer = 0;

function onMotionChange(event: MediaQueryListEvent): void {
  reduceMotion = event.matches;
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduceMotion = motionQuery.matches;
  motionQuery.addEventListener('change', onMotionChange);
  dayTimer = window.setInterval(() => {
    const key = keyOf(new Date());
    if (key === todayKey.value) return;
    todayKey.value = key;
    planner.checkDay();
  }, 60_000);
});

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', onMotionChange);
  if (frame) cancelAnimationFrame(frame);
  if (dayTimer) window.clearInterval(dayTimer);
});

function goToCurrentEnergyMonth(): void {
  const today = todayDate.value;
  calendarCursor.value = { year: today.getFullYear(), month: today.getMonth() };
}

function goToCurrentEnergyWeek(): void {
  weekOffset.value = 0;
}

function shiftEnergyCalendar(delta: number): void {
  if (delta > 0 && !canGoForward.value) return;
  const date = new Date(calendarCursor.value.year, calendarCursor.value.month + delta, 1, 12);
  calendarCursor.value = { year: date.getFullYear(), month: date.getMonth() };
}

function shiftEnergyWeek(delta: number): void {
  if (delta > 0 && !canGoForwardWeek.value) return;
  weekOffset.value += delta;
}

async function toggleMode(): Promise<void> {
  const next: CalendarMode = isMonth.value ? 'week' : 'month';

  animating = false;
  setCalendarMode(next);
  if (next === 'week') {
    goToCurrentEnergyMonth();
    goToCurrentEnergyWeek();
  }
  if (reduceMotion || !content.value) {
    await nextTick();
    panelHeight.value = 'auto';
    return;
  }

  // Lock the current height, swap the view, then animate to the new content height.
  panelHeight.value = `${content.value.scrollHeight}px`;
  await nextTick();
  const target = content.value?.scrollHeight ?? 0;
  if (frame) cancelAnimationFrame(frame);
  animating = true;
  frame = requestAnimationFrame(() => {
    panelHeight.value = `${target}px`;
  });
}

function onTransitionEnd(event: TransitionEvent): void {
  if (animating && event.target === panel.value && event.propertyName === 'height') {
    panelHeight.value = 'auto';
    animating = false;
  }
}

function canOpenDay(day: EnergyCalendarDay): boolean {
  return isDatePlannable(day.key, todayDate.value);
}

/** Check wins over dot: a logged meal is the stronger signal on a busy calendar. */
function mealMark(date: string): 'check' | 'dot' | '' {
  if (diet.logForDate(date).length) return 'check';
  if (diet.planForDate(date)) return 'dot';
  return '';
}

function shoppingCount(date: string): number {
  return diet.shoppingCountForDate(date);
}

function openDay(key: string): void {
  if (!isDatePlannable(key, todayDate.value)) return;
  emit('select', key);
}

/** Lets the meals card send focus back to the calendar cell on Escape. */
function focusDay(key: string): void {
  panel.value?.querySelector<HTMLElement>(`[data-day-key="${key}"]`)?.focus();
}

defineExpose({ focusDay });

function dayLabel(day: EnergyCalendarDay): string {
  const date = new Date(`${day.key}T12:00:00`);
  const label = date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const parts: string[] = [];
  if (day.level !== null) parts.push(`${EN_NAMES[day.level]} energy`);
  else if (day.isFuture) parts.push('not yet');
  else parts.push('no energy recorded');
  if (!canOpenDay(day)) parts.push('outside meal-planning window');
  else if (mealMark(day.key) === 'check') parts.push('meals logged');
  else if (mealMark(day.key) === 'dot') parts.push('meal plan saved');
  const sc = shoppingCount(day.key);
  if (sc) parts.push(`${sc} shopping item${sc === 1 ? '' : 's'}`);
  return `${label}: ${parts.join(', ')}`;
}
</script>

<template>
  <div class="diet-calendar-wrap">
    <section class="panel energy-history" aria-labelledby="diet-calendar-title">
    <div class="sec-head">
      <h2 id="diet-calendar-title">
        Meal calendar
        <small v-if="!isMonth">{{ energyWeek.label }}</small>
      </h2>
      <div class="calendar-head-actions">
        <span class="muted">{{ plannedCount }} planned, {{ loggedCount }} logged</span>
        <button
          type="button"
          class="calendar-toggle"
          :aria-expanded="isMonth"
          aria-controls="diet-calendar-panel"
          @click="toggleMode"
        >
          <span>{{ isMonth ? 'Show week' : 'Show month' }}</span>
          <svg
            class="calendar-chevron"
            :class="{ 'is-up': isMonth }"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path d="M3.5 6 8 10.5 12.5 6" />
          </svg>
        </button>
      </div>
    </div>

    <div
      id="diet-calendar-panel"
      ref="panel"
      class="calendar-panel"
      :style="{ height: panelHeight }"
      @transitionend="onTransitionEnd"
    >
      <div ref="content" class="calendar-panel-inner">
        <div v-if="!isMonth" class="week-view">
          <div class="week-strip" :aria-label="`Meal plans and energy for ${energyWeek.label}`">
            <button
              v-for="(day, index) in energyWeek.days"
              :key="day.key"
              type="button"
              class="week-day level-cell"
              :class="{
                'is-today': day.isToday,
                'is-locked': !canOpenDay(day),
                'is-selected': selectedDate === day.key,
              }"
              :data-level="day.level ?? undefined"
              :data-day-key="day.key"
              :title="dayLabel(day)"
              :aria-label="dayLabel(day)"
              :disabled="!canOpenDay(day)"
              :aria-expanded="selectedDate === day.key"
              :aria-pressed="selectedDate === day.key"
              aria-controls="day-meals-card"
              @click="openDay(day.key)"
            >
              <span class="week-letter">{{ day.isToday ? 'TODAY' : weekLetters[index] }}</span>
              <span class="week-day-center">
                <span class="week-date">{{ day.day }}</span>
                <span v-if="day.level !== null" class="week-level">{{ EN_NAMES[day.level] }}</span>
              </span>
              <span class="week-status" aria-hidden="true">
                <span v-if="mealMark(day.key) === 'check'" class="meal-check">✓</span>
                <span v-else-if="mealMark(day.key) === 'dot'" class="meal-dot"></span>
                <span v-if="shoppingCount(day.key)" class="shopping-dot"></span>
              </span>
              <svg v-if="!canOpenDay(day)" class="cell-lock" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" />
                <rect x="3" y="7" width="10" height="7" rx="1.5" />
              </svg>
            </button>
          </div>

          <div class="week-nav" aria-label="Week navigation">
            <button type="button" class="week-nav-btn" @click="shiftEnergyWeek(-1)">
              <svg class="week-chevron is-left" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M10 3.5 5.5 8 10 12.5" />
              </svg>
              <span>Last week</span>
            </button>
            <button
              type="button"
              class="week-nav-btn"
              :disabled="!canGoForwardWeek"
              :title="canGoForwardWeek ? undefined : 'You can plan up to 2 weeks ahead'"
              @click="shiftEnergyWeek(1)"
            >
              <span>Next week</span>
              <svg class="week-chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3.5 10.5 8 6 12.5" />
              </svg>
            </button>
            <a href="#" class="week-today" @click.prevent="goToCurrentEnergyWeek">This week</a>
          </div>
        </div>

        <div v-else class="month-view">
          <div class="calendar-nav">
            <button type="button" class="calendar-arrow" aria-label="Previous month" @click="shiftEnergyCalendar(-1)">‹</button>
            <h3>{{ energyCalendar.label }}</h3>
            <button
              type="button"
              class="calendar-arrow"
              aria-label="Next month"
              :disabled="!canGoForward"
              :title="canGoForward ? undefined : 'You can plan up to 2 weeks ahead'"
              @click="shiftEnergyCalendar(1)"
            >›</button>
            <button type="button" class="calendar-today" @click="goToCurrentEnergyMonth">Today</button>
          </div>

          <table class="calendar-grid">
            <thead>
              <tr>
                <th v-for="weekday in weekdays" :key="weekday" scope="col">{{ weekday }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(week, weekIndex) in energyCalendar.weeks" :key="weekIndex">
                <td v-for="day in week" :key="day.key" class="calendar-cell">
                  <button
                    type="button"
                    class="calendar-day level-cell"
                    :class="{
                      'is-outside': !day.inMonth,
                      'is-today': day.isToday,
                      'is-locked': !canOpenDay(day),
                      'is-selected': selectedDate === day.key,
                    }"
                    :data-level="day.level ?? undefined"
                    :data-day-key="day.key"
                    :title="dayLabel(day)"
                    :aria-label="dayLabel(day)"
                    :disabled="!canOpenDay(day)"
                    :aria-expanded="selectedDate === day.key"
                    :aria-pressed="selectedDate === day.key"
                    aria-controls="day-meals-card"
                    @click="openDay(day.key)"
                  >
                    <span class="week-letter month-day-label">{{ day.isToday ? 'TODAY' : '' }}</span>
                    <span class="week-day-center">
                      <span class="day-number">{{ day.day }}</span>
                      <span v-if="day.level !== null" class="week-level month-level">{{ EN_NAMES[day.level] }}</span>
                    </span>
                    <span class="week-status" aria-hidden="true">
                      <span v-if="mealMark(day.key) === 'check'" class="meal-check">✓</span>
                      <span v-else-if="mealMark(day.key) === 'dot'" class="meal-dot"></span>
                      <span v-if="shoppingCount(day.key)" class="shopping-dot"></span>
                    </span>
                    <svg v-if="!canOpenDay(day)" class="cell-lock" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" />
                      <rect x="3" y="7" width="10" height="7" rx="1.5" />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="month-summary" aria-label="Month summary">
            <div class="summary-item">
              <span>Days logged</span>
              <strong>{{ energySummary.logged }}</strong>
            </div>
            <div class="summary-item">
              <span>Average level</span>
              <strong>{{ energySummary.average === null ? '—' : `${energySummary.average} / 3` }}</strong>
            </div>
            <div class="summary-item">
              <span>Most common</span>
              <strong>{{ energySummary.mostCommon === null ? '—' : EN_NAMES[energySummary.mostCommon] }}</strong>
            </div>
          </div>

          <div class="calendar-legend" aria-label="Energy level legend">
            <span v-for="level in levels" :key="level" class="legend-item" :data-level="level">
              <i aria-hidden="true"></i>{{ EN_NAMES[level] }} <strong>{{ energyCalendar.counts[level] }}</strong>
            </span>
          </div>
        </div>
        </div>
      </div>
    </section>

  </div>
</template>

<style scoped>
.diet-calendar-wrap {
  width: 100%;
  min-width: 0;
}

.energy-history {
  width: 100%;
  margin: 0 0 var(--spacing-12);
  padding: 12px;
  min-width: 0;
}

.energy-history .sec-head {
  height: 24px;
  margin-bottom: 8px;
  flex-wrap: nowrap;
}

.calendar-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.energy-history h2 small {
  display: inline;
  margin-left: 6px;
  color: var(--ink-2);
  font-family: var(--font-geist-sans);
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.02em;
  text-transform: none;
}

.calendar-panel {
  overflow: hidden;
  transition: height 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.calendar-panel-inner {
  min-width: 0;
}

/* Current week (collapsed) */
.week-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.week-day,
.calendar-day {
  position: relative;
  display: grid;
  grid-template-rows: 16px minmax(0, 1fr) 16px;
  align-items: stretch;
  justify-items: center;
  width: 100%;
  min-width: 0;
  padding: 4px 2px;
  box-sizing: border-box;
  font: inherit;
  text-align: center;
  cursor: pointer;
}

.week-day { height: 72px; }
.calendar-day { height: 64px; }

.week-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 16px;
  color: var(--ink-2);
  font-size: 9px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.week-day.is-today .week-letter,
.calendar-day.is-today .week-letter { color: var(--accent); }

.week-day-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  width: 100%;
}

.week-date,
.day-number {
  color: var(--ink);
  font-size: 15px;
  font-weight: var(--font-weight-semibold);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.day-number { font-size: 14px; }

.week-level {
  max-width: 100%;
  overflow: hidden;
  color: var(--ink-2);
  font-size: 9px;
  line-height: 1.1;
  font-weight: var(--font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.month-level { font-size: 8px; }
.level-cell[data-level] .week-level { color: var(--day-color); }

.week-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 16px;
}

.meal-check {
  color: var(--ok);
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  line-height: 1;
}

.meal-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--accent);
}

.shopping-dot {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: var(--ink-2);
}

.week-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: nowrap;
  gap: 4px 10px;
  margin-top: 8px;
  white-space: nowrap;
}

.week-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 24px;
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, var(--line) 90%, var(--ink-2));
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--ink);
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.week-nav-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.week-nav-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.week-chevron {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.week-today {
  padding: 2px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  text-decoration: underline;
  cursor: pointer;
}

/* Shared day colours */
.level-cell[data-level="1"] {
  --day-color: var(--energy-low);
  background: color-mix(in srgb, var(--day-color) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--day-color) 35%, var(--line));
}

.level-cell[data-level="2"] {
  --day-color: var(--energy-medium);
  background: color-mix(in srgb, var(--day-color) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--day-color) 35%, var(--line));
}

.level-cell[data-level="3"] {
  --day-color: var(--energy-high);
  background: color-mix(in srgb, var(--day-color) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--day-color) 35%, var(--line));
}

.level-cell {
  border: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
  border-radius: var(--radius-buttons);
  background: var(--surface);
  color: var(--ink);
}

/* Full month (expanded) */
.calendar-nav {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 28px auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.calendar-nav h3 {
  margin: 0;
  font-size: 15px;
  font-weight: var(--font-weight-semibold);
  color: var(--ink);
  text-align: center;
  text-transform: capitalize;
}

.calendar-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--line) 90%, var(--ink-2));
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--ink);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.calendar-arrow:hover:not(:disabled) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.calendar-arrow:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.calendar-today {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  text-decoration: underline;
  cursor: pointer;
}

.calendar-grid {
  width: 100%;
  border-collapse: separate;
  border-spacing: 3px;
  table-layout: fixed;
}

.calendar-grid th {
  padding: 0 0 3px;
  color: var(--ink-2);
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
}

.calendar-cell {
  padding: 0;
}

.week-day:hover:not(:disabled),
.calendar-day:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
}

.week-day:hover:not(:disabled):not([data-level]),
.calendar-day:hover:not(:disabled):not([data-level]) {
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.week-day.is-selected,
.calendar-day.is-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
  outline: none;
}

.week-day.is-selected:not([data-level]),
.calendar-day.is-selected:not([data-level]) {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.week-day.is-selected[data-level],
.calendar-day.is-selected[data-level] {
  background: color-mix(in srgb, var(--day-color) 14%, var(--surface));
}

.week-day:focus-visible,
.calendar-day:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.week-day:disabled,
.calendar-day:disabled {
  cursor: not-allowed;
  opacity: 0.38;
  background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
}

.week-day:disabled[data-level],
.calendar-day:disabled[data-level] {
  background: color-mix(in srgb, var(--day-color) 8%, var(--surface));
}

.cell-lock {
  position: absolute;
  left: 3px;
  bottom: 2px;
  width: 10px;
  height: 10px;
  fill: none;
  stroke: var(--ink-2);
  stroke-width: 1.5;
}

.week-day.is-today,
.calendar-day.is-today {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
}

.week-day.is-today .week-letter,
.calendar-day.is-today .week-letter,
.calendar-day.is-today .day-number {
  color: var(--accent);
}

.calendar-day.is-outside {
  color: var(--ink-2);
}


.month-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.summary-item span {
  color: var(--ink-2);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.summary-item strong {
  color: var(--ink);
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 10px;
  color: var(--ink-2);
  font-size: 11px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-item i {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--legend-color);
}

.legend-item[data-level="1"] { --legend-color: var(--energy-low); }
.legend-item[data-level="2"] { --legend-color: var(--energy-medium); }
.legend-item[data-level="3"] { --legend-color: var(--energy-high); }

.legend-item strong {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

/* Mode switch */
.calendar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 24px;
  margin: 0;
  padding: 2px 8px;
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.calendar-toggle:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.calendar-chevron {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 200ms ease;
}

.calendar-chevron.is-up {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .calendar-panel,
  .calendar-chevron,
  .week-nav-btn {
    transition: none;
  }
}
</style>
