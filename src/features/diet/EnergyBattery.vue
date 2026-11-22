<script setup lang="ts">
import { EN_NAMES, type EnergyLevel } from '../planner/model';

withDefaults(defineProps<{
  level: EnergyLevel | null;
  /** `sm` is the calendar-cell size, `md` the day-panel size. */
  size?: 'sm' | 'md';
  label?: boolean;
}>(), {
  size: 'md',
  label: false,
});
</script>

<template>
  <span
    class="energy-battery"
    :class="`is-${size}`"
    :data-level="level ?? undefined"
    :title="level !== null ? `${EN_NAMES[level]} energy` : 'No energy saved'"
  >
    <i v-for="cell in 3" :key="cell" :class="{ 'is-filled': level !== null && cell <= level }"></i>
    <span v-if="label" class="battery-text">{{ level !== null ? EN_NAMES[level] : 'Not checked in' }}</span>
  </span>
</template>

<style scoped>
.energy-battery {
  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  gap: 2px;
  box-sizing: border-box;
  border: 1.5px solid var(--battery-color, var(--ink-2));
  border-radius: 4px;
  flex: 0 0 auto;
}

.energy-battery::after {
  content: "";
  position: absolute;
  right: -4px;
  top: 50%;
  width: 2px;
  height: 6px;
  border-radius: 0 1px 1px 0;
  background: var(--battery-color, var(--ink-2));
  transform: translateY(-50%);
}

.energy-battery.is-md {
  width: 38px;
  height: 20px;
  padding: 2px;
}

.energy-battery.is-sm {
  width: 18px;
  height: 10px;
  padding: 1px;
  gap: 1px;
  border-width: 1px;
  border-radius: 2px;
}

.energy-battery.is-sm::after {
  right: -3px;
  width: 1.5px;
  height: 4px;
}

.energy-battery i {
  display: block;
  border-radius: 1px;
  background: color-mix(in srgb, var(--battery-color, var(--ink-2)) 12%, transparent);
}

.energy-battery i.is-filled {
  background: var(--battery-color, var(--ink-2));
}

.energy-battery[data-level="1"] { --battery-color: var(--energy-low); }
.energy-battery[data-level="2"] { --battery-color: var(--energy-medium); }
.energy-battery[data-level="3"] { --battery-color: var(--energy-high); }

.battery-text {
  position: absolute;
  left: calc(100% + 6px);
  top: 50%;
  color: var(--ink-2);
  font-size: 10px;
  white-space: nowrap;
  transform: translateY(-50%);
}
</style>
