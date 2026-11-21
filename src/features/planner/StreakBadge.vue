<script setup lang="ts">
import type { HabitDayView } from './model';

const props = defineProps<{ streak: number; history: HabitDayView[] }>();
</script>

<template>
  <span
    class="streak-line"
    :class="{ 'is-hot': props.streak >= 3 }"
  >
    <span class="streak-copy">
      <strong class="streak-value">{{ props.streak }}</strong>
      <span class="streak-label">day streak</span>
    </span>
    <span class="streak-dots" role="group" aria-label="Last 7 days">
      <i
        v-for="day in props.history"
        :key="day.index"
        class="streak-dot"
        :class="day.className"
        role="img"
        :aria-label="day.title"
        :title="day.title"
      ></i>
    </span>
  </span>
</template>

<style scoped>
.streak-line {
  --streak-amber: #b45309;
  --streak-orange: #9a4707;
  --streak-deep: #b45309;
  --streak-muted: #d8a06d;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  height: 40px;
}

@media (prefers-color-scheme: dark) {
  .streak-line {
    --streak-amber: #e0a36a;
    --streak-orange: #c98750;
    --streak-deep: #e0a36a;
    --streak-muted: #f2c79a;
  }
}

:root[data-theme="dark"] .streak-line {
  --streak-amber: #e0a36a;
  --streak-orange: #c98750;
  --streak-deep: #e0a36a;
  --streak-muted: #f2c79a;
}

.streak-copy {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  white-space: nowrap;
}

.streak-value {
  color: var(--streak-orange);
  background: linear-gradient(135deg, var(--streak-amber) 0%, var(--streak-orange) 100%);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .streak-value {
    color: transparent;
    -webkit-text-fill-color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
  }
}

.is-hot .streak-value {
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--streak-orange) 45%, transparent));
}

.streak-label {
  color: var(--ink-2);
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.streak-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.streak-dot {
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border: 1.5px solid color-mix(in srgb, var(--streak-deep) 35%, var(--line));
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--streak-amber) 10%, transparent);
  transition: background 160ms ease, border-color 160ms ease, opacity 160ms ease;
}

.streak-dot.done {
  border-color: var(--streak-orange);
  background: linear-gradient(135deg, var(--streak-amber) 0%, var(--streak-orange) 100%);
  box-shadow: 0 1px 5px color-mix(in srgb, var(--streak-orange) 32%, transparent);
}

.streak-dot.missed {
  border-style: dashed;
  border-color: var(--streak-muted);
  background: transparent;
}

.streak-dot.future {
  opacity: 0.28;
  background: transparent;
}

.streak-dot.off {
  opacity: 0.18;
  border-style: dotted;
  background: transparent;
}

.streak-dot.today {
  box-shadow:
    0 0 0 2px var(--surface),
    0 0 0 3.5px var(--streak-orange);
}

@media (prefers-reduced-motion: reduce) {
  .streak-dot {
    transition: none;
  }
}
</style>
