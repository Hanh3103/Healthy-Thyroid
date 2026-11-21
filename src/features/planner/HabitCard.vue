<script setup lang="ts">
import type { HabitItemView } from './model';
import StreakBadge from './StreakBadge.vue';

defineProps<{ item: HabitItemView }>();
const emit = defineEmits<{ toggle: [id: string]; remove: [id: string] }>();
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
      <button
        type="button"
        class="habit-remove"
        :aria-label="`Remove habit: ${item.name}`"
        title="Remove habit"
        @click="emit('remove', item.id)"
      >
        ×
      </button>
    </div>
    <p class="how">
      <span class="chip habit-energy-chip">{{ item.detail.min }} min · {{ item.energyName }} energy</span>
      {{ item.detail.txt }}
    </p>
    <StreakBadge :streak="item.streak" :history="item.days" />
  </div>
</template>
