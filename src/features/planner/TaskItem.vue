<script setup lang="ts">
import { IM_NAMES } from './model';
import { dueLabel } from '../../shared/utils';
import type { Task } from './model';

const props = defineProps<{
  task: Task;
  showMoveToToday?: boolean;
}>();

const emit = defineEmits<{
  action: [task: Task, action: 'done' | 'imp' | 'details' | 'today' | 'del'];
}>();

function on(action: 'done' | 'imp' | 'details' | 'today' | 'del'): void {
  emit('action', props.task, action);
}
</script>

<template>
  <li class="task" :class="{ done: task.done, guess: !task.est }" :data-id="task.id">
    <button type="button" class="chk" :aria-label="task.done ? 'Mark as not done' : 'Mark as done'" @click="on('done')"></button>
    <div>
      <button type="button" class="ttitle task-editable" title="Edit task name and details" @click="on('details')">
        {{ task.title }}
      </button>
      <p v-if="task.reason" class="reason">{{ task.reason }}</p>
      <span v-if="task.movedFromToday" class="chip todo" title="Moved out of Today because it needs more energy at today's level. Use Move to Today to bring it back.">Moved from Today — needs more energy</span>
      <span v-if="task.estimateSource === 'heuristic'" class="chip todo" title="This estimate was calculated from the task name, not by AI">Heuristic estimate</span>
      <div class="meta">
        <button type="button" class="pill imp" :class="'imp' + task.imp" title="Click to cycle urgency" @click="on('imp')">{{ IM_NAMES[task.imp] }}</button>
        <button v-if="task.min" type="button" class="chip task-editable" title="Change estimated time" @click="on('details')">{{ task.min }} min</button>
        <button v-if="!task.est" type="button" class="chip todo task-editable" title="Estimate due date and time" @click="on('details')">Not estimated yet</button>
        <template v-if="dueLabel(task.due)">
          <button type="button" class="chip task-editable" :class="{ late: dueLabel(task.due)?.late }" title="Change due date" @click="on('details')">{{ dueLabel(task.due)?.t }}</button>
        </template>
        <button v-else type="button" class="chip todo task-editable" title="Set a due date" @click="on('details')">No due date</button>
        <span v-if="task.ex" class="chip ex">Example</span>
        <button v-if="showMoveToToday" type="button" class="chip todo task-editable" title="Move this task to Do now" @click="on('today')">Move to Today</button>
      </div>
    </div>
    <button type="button" class="del" aria-label="Delete task" @click="on('del')">×</button>
  </li>
</template>
