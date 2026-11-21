<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { usePlanner } from '../features/planner/usePlanner';
import EnergyPicker from '../features/planner/EnergyPicker.vue';
import TaskList from '../features/planner/TaskList.vue';
import TaskItem from '../features/planner/TaskItem.vue';
import AddTaskForm from '../features/planner/AddTaskForm.vue';
import HabitCard from '../features/planner/HabitCard.vue';
import EmailRoutine from '../features/planner/EmailRoutine.vue';
import AddHabitForm from '../features/planner/AddHabitForm.vue';
import TaskDetailsDialog from '../features/planner/TaskDetailsDialog.vue';
import BackupPanel from '../features/planner/BackupPanel.vue';
import AppButton from '../shared/ui/AppButton.vue';
import type { EnergyLevel, Task } from '../features/planner/model';

const planner = usePlanner();
const {
  energy,
  habitItems,
  habitDoneHabits,
  habitExpectedHabits,
  nowTasks,
  filteredDumps,
  doneTasks,
  hasExamples,
  dumpFilter,
  aiStatus,
  planNote,
  energyHint,
  nowMeta,
} = planner;

function setEnergy(level: EnergyLevel): void {
  planner.setEnergy(level);
}

function onTaskAction(task: Task, action: 'done' | 'imp' | 'details' | 'today' | 'del'): void {
  planner.taskAction(task.id, action);
}

function onVisibilityOrFocus(): void {
  if (!document.hidden) planner.checkDay();
}

let dayInterval: number | undefined;

onMounted(async () => {
  await planner.init();
  document.addEventListener('visibilitychange', onVisibilityOrFocus);
  window.addEventListener('focus', onVisibilityOrFocus);
  dayInterval = window.setInterval(() => planner.checkDay(), 60_000);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityOrFocus);
  window.removeEventListener('focus', onVisibilityOrFocus);
  if (dayInterval) window.clearInterval(dayInterval);
});
</script>

<template>
  <div class="app-view is-active" id="energy-view">
    <div class="grid">
      <aside class="rail">
        <section class="panel" aria-labelledby="h-energy">
          <h2 id="h-energy">Your energy right now</h2>
          <EnergyPicker :model-value="energy" aria-labelledby="h-energy" @update:model-value="setEnergy" />
          <p class="muted energy-hint" id="energy-hint">{{ energyHint }}</p>
        </section>

        <section class="panel" aria-labelledby="h-habits">
          <div class="sec-head">
            <h2 id="h-habits">Every day <small id="habit-count">{{ habitDoneHabits }} of {{ habitExpectedHabits }} done</small></h2>
            <AppButton variant="ghost" size="sm" @click="planner.taskAddOpen.value = false; planner.habitAddOpen.value = !planner.habitAddOpen.value">
              {{ planner.habitAddOpen.value ? 'Close' : 'Add habit' }}
            </AppButton>
          </div>
          <AddHabitForm />
          <div id="habits">
            <template v-for="item in habitItems" :key="item.id">
              <EmailRoutine v-if="item.isMail" :item="item" @toggle-slot="planner.toggleSlot" />
              <HabitCard v-else :item="item" @toggle="planner.toggleHabit" />
            </template>
          </div>
        </section>
      </aside>

      <div class="main-col">
        <div v-show="hasExamples" class="banner" id="ex-banner">
          <span>The tasks marked "Example" show how it looks. Replace them with your own.</span>
          <button class="ghost" type="button" @click="planner.clearExamples">Remove examples</button>
        </div>

        <TaskList title-id="h-now" title="Do now" :tasks="nowTasks" :meta="nowMeta" @action="onTaskAction">
          <template #actions>
            <button class="ghost btn-sm" id="ai-btn" type="button" @click="planner.prioritize">AI Prioritize</button>
          </template>
          <template #before>
            <p class="status ai-status-line" id="ai-status" role="status">{{ aiStatus }}</p>
            <p class="muted" id="plan-note">{{ planNote }}</p>
          </template>
        </TaskList>

        <section class="panel" aria-labelledby="h-dumps">
          <div class="sec-head">
            <h2 id="h-dumps">Dumps</h2>
            <div class="sec-head-actions">
              <span class="muted" id="dumps-meta">{{ filteredDumps.length ? filteredDumps.length + ' shown' : '' }}</span>
              <AppButton variant="ghost" size="sm" @click="planner.taskAddOpen.value = !planner.taskAddOpen.value">
                {{ planner.taskAddOpen.value ? 'Close' : 'Add task' }}
              </AppButton>
            </div>
          </div>
          <AddTaskForm />
          <p class="muted">Stored tasks that are not scheduled for today.</p>
          <nav class="task-filters" aria-label="Filter dumped tasks">
            <button
              v-for="option in (['all', 'tomorrow', 'week', 'later'] as const)"
              :key="option"
              type="button"
              class="pill imp"
              :class="{ active: dumpFilter === option }"
              @click="planner.setDumpFilter(option)"
            >{{ option === 'all' ? 'All' : option === 'tomorrow' ? 'Tomorrow' : option === 'week' ? 'This week' : 'Later' }}</button>
          </nav>
          <ol id="list-dumps">
            <li v-if="!filteredDumps.length" class="empty">No tasks in Dumps.</li>
            <TaskItem v-for="task in filteredDumps" :key="task.id" :task="task" :show-move-to-today="true" @action="onTaskAction" />
          </ol>
        </section>

        <section v-show="doneTasks.length" class="panel" aria-labelledby="h-done" id="done-panel">
          <div class="sec-head">
            <h2 id="h-done">Done</h2>
            <button class="ghost" type="button" @click="planner.clearDone">Clear done</button>
          </div>
          <ol id="list-done">
            <TaskItem v-for="task in doneTasks" :key="task.id" :task="task" @action="onTaskAction" />
          </ol>
        </section>

        <BackupPanel />
      </div>
    </div>

    <TaskDetailsDialog />
  </div>
</template>
