<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import AppInput from '../../shared/ui/AppInput.vue';
import AppNumberInput from '../../shared/ui/AppNumberInput.vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import { usePlanner } from './usePlanner';

const { habitAddOpen, addHabit } = usePlanner();

const form = ref({ name: '', minutes: 15 as number | undefined, desc: '' });

function reset(): void {
  form.value = { name: '', minutes: 15, desc: '' };
}

function cancel(): void {
  reset();
  habitAddOpen.value = false;
}

watch(habitAddOpen, async (open) => {
  if (!open) return;
  await nextTick();
  document.getElementById('h-name-vue')?.focus();
});

function onSubmit(): void {
  const name = form.value.name.trim();
  if (!name) return;
  addHabit(name, Number(form.value.minutes || 15), form.value.desc);
  cancel();
}
</script>

<template>
  <form v-show="habitAddOpen" class="habit-form" autocomplete="off" @submit.prevent="onSubmit">
    <AppInput id="h-name-vue" v-model="form.name" label="Habit name" placeholder="e.g. Take L-Thyroxin or Morning walk" :maxlength="60" required />
    <AppNumberInput id="h-min-vue" v-model="form.minutes" label="Minutes per day" :min="1" :max="360" placeholder="15" />
    <AppInput id="h-desc-vue" v-model="form.desc" label="Details / Notes (optional)" placeholder="e.g. 30 min before breakfast with water" :maxlength="140" />
    <AppFormActions class="habit-form-actions">
      <AppButton variant="ghost" size="sm" type="button" @click="cancel">Cancel</AppButton>
      <AppButton variant="primary" size="sm" type="submit">Save Habit</AppButton>
    </AppFormActions>
  </form>
</template>

<style scoped>
.habit-form { display: flex; flex-direction: column; gap: var(--spacing-16); background: linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 92%, var(--bg)) 0%, var(--surface-2) 100%); border: 1px solid color-mix(in srgb, var(--line) 90%, transparent); border-radius: var(--radius-cards); padding: var(--spacing-12); margin-bottom: var(--spacing-12); box-shadow: inset 0 1px 2px color-mix(in srgb, black 8%, transparent), 0 1px 0 color-mix(in srgb, white 25%, transparent); }
.habit-form-actions { justify-content: flex-end; }
</style>
