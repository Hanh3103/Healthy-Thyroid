<script setup lang="ts">
import type { HabitItemView } from './model';
import StreakBadge from './StreakBadge.vue';

defineProps<{ item: HabitItemView }>();
const emit = defineEmits<{ 'toggle-slot': [id: string]; remove: [id: string] }>();
</script>

<template>
  <div class="habit">
    <div class="habit-head">
      <h3>{{ item.name }}</h3>
      <div class="habit-head-actions">
        <span class="muted">{{ item.weekendMail ? 'Weekend' : `${item.doneCount} of ${item.slots.length} done` }}</span>
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
    <StreakBadge :streak="item.streak" :history="item.days" />
  </div>
</template>
