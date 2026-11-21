<script setup lang="ts">
import type { EnergyLevel } from './model';

withDefaults(defineProps<{
  modelValue?: EnergyLevel;
  ariaLabelledby?: string;
}>(), { modelValue: 2 });

const emit = defineEmits<{ 'update:modelValue': [value: EnergyLevel] }>();

const options: Array<{ level: EnergyLevel; label: string; tone: string }> = [
  { level: 1, label: 'Low', tone: 'low' },
  { level: 2, label: 'Medium', tone: 'mid' },
  { level: 3, label: 'High', tone: 'high' },
];

function select(level: EnergyLevel): void {
  emit('update:modelValue', level);
}
</script>

<template>
  <div class="seg energy-seg" role="radiogroup" :aria-labelledby="ariaLabelledby">
    <button
      v-for="opt in options"
      :key="opt.level"
      type="button"
      class="energy-segment"
      role="radio"
      :data-level="opt.level"
      :data-tone="opt.tone"
      :aria-checked="modelValue === opt.level ? 'true' : 'false'"
      @click="select(opt.level)"
    >
      <span class="energy-battery" :data-level="opt.level" aria-hidden="true">
        <i v-for="i in 3" :key="i" :class="{ filled: i <= opt.level }"></i>
      </span>
      <span class="energy-segment-label">{{ opt.label }}</span>
    </button>
  </div>
</template>
