<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { usePlanner } from './usePlanner';
import { EN_NAMES, type EnergyCalendarDay, type EnergyLevel } from './model';

const {
  energyCalendar,
  energyWeek,
  energySummary,
  calendarMode,
  canGoForward,
  canGoForwardWeek,
  setCalendarMode,
  shiftEnergyCalendar,
  goToCurrentEnergyMonth,
  shiftEnergyWeek,
  goToCurrentEnergyWeek,
} = usePlanner();

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const levels: EnergyLevel[] = [1, 2, 3];

const weekLogged = computed(() => energyWeek.value.days.filter((day) => day.level !== null).length);
const isMonth = computed(() => calendarMode.value === 'month');

const panel = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const panelHeight = ref('auto');
let motionQuery: MediaQueryList | null = null;
let reduceMotion = false;
let frame = 0;
let animating = false;

function onMotionChange(event: MediaQueryListEvent): void {
  reduceMotion = event.matches;
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduceMotion = motionQuery.matches;
  motionQuery.addEventListener('change', onMotionChange);
});

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', onMotionChange);
  if (frame) cancelAnimationFrame(frame);
});

async function toggleMode(): Promise<void> {
  const next = isMonth.value ? 'week' : 'month';

  animating = false;
  if (reduceMotion || !content.value) {
    setCalendarMode(next);
    await nextTick();
    panelHeight.value = 'auto';
    return;
  }

  // Lock the current height, swap the view, then animate to the new content height.
  panelHeight.value = `${content.value.scrollHeight}px`;
  setCalendarMode(next);
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

function dayLabel(day: EnergyCalendarDay): string {
  const date = new Date(`${day.key}T12:00:00`);
  const label = date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  if (day.level !== null) return `${label}: ${EN_NAMES[day.level]} energy`;
  if (day.isFuture) return `${label}: not yet`;
  return `${label}: no energy recorded`;
}

function levelText(day: EnergyCalendarDay): string {
  return day.level !== null ? EN_NAMES[day.level] : 'Not set';
}
</script>

<template>
  <section class="panel energy-history" aria-labelledby="energy-calendar-title">
    <div class="sec-head">
      <h2 id="energy-calendar-title">
        Energy pattern
        <small v-if="!isMonth">{{ energyWeek.label }}</small>
      </h2>
      <div class="calendar-head-actions">
        <span class="muted">{{ isMonth ? energySummary.logged : weekLogged }} logged</span>
        <button
          type="button"
          class="calendar-toggle"
          :aria-expanded="isMonth"
          aria-controls="energy-calendar-panel"
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
      id="energy-calendar-panel"
      ref="panel"
      class="calendar-panel"
      :style="{ height: panelHeight }"
      @transitionend="onTransitionEnd"
    >
      <div ref="content" class="calendar-panel-inner">
        <div v-if="!isMonth" class="week-view">
          <div class="week-strip" :aria-label="`Energy levels for ${energyWeek.label}`">
            <div
              v-for="(day, index) in energyWeek.days"
              :key="day.key"
              class="week-day level-cell"
              :class="{
                'is-today': day.isToday,
                'is-future': day.isFuture,
                'is-missing': day.isPast && day.level === null,
              }"
              :data-level="day.level ?? undefined"
              :title="dayLabel(day)"
              :aria-label="dayLabel(day)"
            >
              <span class="week-letter">{{ weekLetters[index] }}</span>
              <span class="week-date">{{ day.day }}</span>
              <span class="week-level">{{ levelText(day) }}</span>
            </div>
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
                <td
                  v-for="day in week"
                  :key="day.key"
                  class="calendar-day level-cell"
                  :class="{
                    'is-outside': !day.inMonth,
                    'is-today': day.isToday,
                    'is-future': day.isFuture,
                    'is-missing': day.isPast && day.level === null,
                  }"
                  :data-level="day.level ?? undefined"
                  :title="dayLabel(day)"
                  :aria-label="dayLabel(day)"
                >
                  <span class="day-number">{{ day.day }}</span>
                  <span v-if="day.level !== null" class="day-mark" aria-hidden="true"></span>
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
</template>

<style scoped>
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

.week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  height: 56px;
  padding: 4px 2px;
  box-sizing: border-box;
}

.week-letter {
  color: var(--ink-2);
  font-size: 9px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.week-date {
  color: var(--ink);
  font-size: 15px;
  font-weight: var(--font-weight-semibold);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.week-level {
  max-width: 100%;
  overflow: hidden;
  color: var(--ink-2);
  font-size: 9px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.level-cell[data-level] .week-level {
  color: color-mix(in srgb, var(--day-color) 70%, var(--ink));
  font-weight: var(--font-weight-semibold);
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

.calendar-day {
  position: relative;
  height: 34px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
  background: color-mix(in srgb, var(--surface-2) 45%, var(--surface));
  color: var(--ink);
  font-size: 12px;
  text-align: center;
  vertical-align: middle;
  font-variant-numeric: tabular-nums;
}

.day-number {
  position: relative;
  z-index: 1;
}

.day-mark {
  position: absolute;
  left: 50%;
  bottom: 4px;
  width: 5px;
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--day-color);
  transform: translateX(-50%);
}

/* Shared day colours */
.level-cell[data-level="1"] {
  --day-color: #d97706;
  background: color-mix(in srgb, var(--day-color) 18%, var(--surface));
  border-color: color-mix(in srgb, var(--day-color) 42%, var(--line));
}

.level-cell[data-level="2"] {
  --day-color: #65a30d;
  background: color-mix(in srgb, var(--day-color) 18%, var(--surface));
  border-color: color-mix(in srgb, var(--day-color) 42%, var(--line));
}

.level-cell[data-level="3"] {
  --day-color: #16a34a;
  background: color-mix(in srgb, var(--day-color) 18%, var(--surface));
  border-color: color-mix(in srgb, var(--day-color) 42%, var(--line));
}

.level-cell {
  border: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
  border-radius: var(--radius-buttons);
  color: var(--ink);
}

.week-day.is-today,
.calendar-day.is-today {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
}

.week-day.is-future {
  background: transparent;
  opacity: 0.5;
}

.week-day.is-missing,
.calendar-day.is-missing {
  color: var(--ink-2);
}

.calendar-day.is-outside {
  opacity: 0.35;
}

.calendar-day.is-future {
  background: transparent;
  color: var(--ink-2);
  opacity: 0.45;
}

.calendar-day.is-missing {
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

.legend-item[data-level="1"] { --legend-color: #d97706; }
.legend-item[data-level="2"] { --legend-color: #65a30d; }
.legend-item[data-level="3"] { --legend-color: #16a34a; }

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
