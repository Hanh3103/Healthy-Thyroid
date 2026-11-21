<script setup lang="ts">
import type { HabitItemView } from './model';

defineProps<{ item: HabitItemView }>();
const emit = defineEmits<{ 'toggle-slot': [id: string] }>();
</script>

<template>
  <div class="habit">
    <div class="habit-head">
      <h3>{{ item.name }}</h3>
      <span class="muted">{{ item.weekendMail ? 'Weekend' : `${item.doneCount} of ${item.slots.length} done` }}</span>
    </div>
    <ul v-if="item.slots.length" class="slots">
      <li v-for="slot in item.slots" :key="slot.id" class="slot" :class="{ done: slot.done, next: slot.next }">
        <button
          type="button"
          class="chk"
          :aria-pressed="slot.done ? 'true' : 'false'"
          :aria-label="`${slot.done ? 'Mark not done' : 'Mark done'}: ${slot.label}`"
          @click="emit('toggle-slot', slot.id)"
        ></button>
        <span class="stime">{{ slot.time }}</span>
        <span class="slabel">{{ slot.label }} <span v-if="slot.next" class="chip">Next</span></span>
      </li>
    </ul>
    <p v-else class="how">No email routine on weekends. It starts again on Monday.</p>
    <div class="hfoot">
      <div class="dots" aria-label="Last 7 days">
        <i v-for="day in item.days" :key="day.index" :class="day.className" :title="day.title">{{ day.letter }}</i>
      </div>
      <span class="muted">{{ item.streak > 0 ? item.streak + '-day streak' : 'No streak yet' }}</span>
    </div>
  </div>
</template>
