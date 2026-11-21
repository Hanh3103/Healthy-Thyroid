<script setup lang="ts">
import AppDialog from '../../shared/ui/AppDialog.vue';
import AppButton from '../../shared/ui/AppButton.vue';
import { usePlanner } from './usePlanner';

const { taskDialogOpen, taskForm, taskDueStatus, closeTaskDetails, applyDuePreset, saveTaskDetails } = usePlanner();
</script>

<template>
  <AppDialog v-model="taskDialogOpen" title="Edit task details" width="480px">
    <form @submit.prevent="saveTaskDetails">
      <label for="task-name-input">Task name
        <el-input id="task-name-input" v-model="taskForm.title" type="text" maxlength="140" required />
      </label>
      <label for="task-due-input">Due date
        <el-input id="task-due-input" v-model="taskForm.due" type="date" />
      </label>
      <p class="task-detail-status" id="task-due-status">{{ taskDueStatus }}</p>
      <div class="due-presets" aria-label="Due date presets">
        <button type="button" class="pill imp" @click="applyDuePreset('today')">Today</button>
        <button type="button" class="pill imp" @click="applyDuePreset('tomorrow')">Tomorrow</button>
        <button type="button" class="pill imp" @click="applyDuePreset('week')">This week</button>
        <button type="button" class="pill imp" @click="applyDuePreset('none')">No due date</button>
      </div>
      <label for="task-minutes-input">Estimated time
        <el-input-number id="task-minutes-input" v-model="taskForm.minutes" :min="5" :max="360" :step="5" :controls="false" placeholder="Not estimated yet" />
      </label>
      <div class="actions" style="margin-top: 18px; justify-content: flex-end;">
        <AppButton variant="ghost" type="button" @click="closeTaskDetails">Cancel</AppButton>
        <AppButton variant="primary" type="submit">Save</AppButton>
      </div>
    </form>
  </AppDialog>
</template>
