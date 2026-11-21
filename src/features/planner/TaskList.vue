<script setup lang="ts">
import TaskItem from './TaskItem.vue';
import type { DumpFilter, Task } from './model';

defineProps<{
  tasks: Task[];
  titleId: string;
  title: string;
  emptyText?: string;
  showMoveToToday?: boolean;
  filter?: DumpFilter;
  meta?: string;
}>();

const emit = defineEmits<{
  action: [task: Task, action: 'done' | 'imp' | 'details' | 'today' | 'del'];
  'set-filter': [filter: DumpFilter];
}>();

const filters: Array<{ value: DumpFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' },
  { value: 'later', label: 'Later' },
];
</script>

<template>
  <section class="panel" :aria-labelledby="titleId">
    <div class="sec-head">
      <div class="sec-title-wrap">
        <h2 :id="titleId">{{ title }}</h2>
        <span v-if="meta" class="muted">{{ meta }}</span>
      </div>
      <slot name="actions" />
    </div>
    <slot name="before" />
    <nav v-if="filter" class="task-filters" aria-label="Filter dumped tasks">
      <button
        v-for="item in filters"
        :key="item.value"
        type="button"
        class="pill imp"
        :class="{ active: filter === item.value }"
        @click="emit('set-filter', item.value)"
      >{{ item.label }}</button>
    </nav>
    <ol>
      <li v-if="!tasks.length" class="empty">{{ emptyText || 'No tasks waiting.' }}</li>
      <TaskItem
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :show-move-to-today="showMoveToToday"
        @action="(t, a) => emit('action', t, a)"
      />
    </ol>
  </section>
</template>
