<script setup lang="ts">
import type { HabitItemView } from './model';

defineProps<{ item: HabitItemView }>();
const emit = defineEmits<{ toggle: [id: string] }>();
</script>

<template>
  <div class="habit" :class="{ done: item.done }">
    <div class="habit-head">
      <div class="habit-check">
        <button
          type="button"
          class="chk"
          :aria-pressed="item.done ? 'true' : 'false'"
          :aria-label="`${item.done ? 'Mark not done' : 'Mark done'}: ${item.name}`"
          @click="emit('toggle', item.id)"
        ></button>
        <h3>{{ item.name }}</h3>
      </div>
    </div>
    <p class="how">
      <span class="chip habit-energy-chip">{{ item.detail.min }} min · {{ item.energyName }} energy</span>
      {{ item.detail.txt }}
    </p>
    <div class="hfoot">
      <div class="dots" aria-label="Last 7 days">
        <i v-for="day in item.days" :key="day.index" :class="day.className" :title="day.title">{{ day.letter }}</i>
      </div>
      <span class="muted">{{ item.streak > 0 ? item.streak + '-day streak' : 'No streak yet' }}</span>
    </div>
  </div>
</template>
