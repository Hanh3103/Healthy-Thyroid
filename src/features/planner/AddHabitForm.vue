<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import AppInput from '../../shared/ui/AppInput.vue';
import AppNumberInput from '../../shared/ui/AppNumberInput.vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import { usePlanner } from './usePlanner';
import { EN_NAMES, type EnergyLevel } from './model';

const { habitAddOpen, addHabit } = usePlanner();

const levels: EnergyLevel[] = [1, 2, 3];
const defaultMinutes: Record<EnergyLevel, number> = { 1: 10, 2: 15, 3: 25 };
const placeholders: Record<EnergyLevel, string> = {
  1: 'e.g. 5 min tidy – a small, low-effort version',
  2: 'e.g. 15 min steady, comfortable session',
  3: 'e.g. 30 min deep, focused work',
};

type DetailDraft = { minutes: number | undefined; desc: string };

function emptyDetails(): Record<EnergyLevel, DetailDraft> {
  return {
    1: { minutes: defaultMinutes[1], desc: '' },
    2: { minutes: defaultMinutes[2], desc: '' },
    3: { minutes: defaultMinutes[3], desc: '' },
  };
}

const form = ref({ name: '', by: emptyDetails() });

function reset(): void {
  form.value = { name: '', by: emptyDetails() };
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
  const by = {} as Record<EnergyLevel, { min: number; txt: string }>;
  for (const level of levels) {
    by[level] = {
      min: Number(form.value.by[level].minutes || defaultMinutes[level]),
      txt: form.value.by[level].desc.trim(),
    };
  }
  addHabit(name, by);
  cancel();
}
</script>

<template>
  <form v-show="habitAddOpen" class="habit-form" autocomplete="off" @submit.prevent="onSubmit">
    <AppInput id="h-name-vue" v-model="form.name" label="Habit name" placeholder="e.g. Take L-Thyroxin or Morning walk" :maxlength="60" required />

    <fieldset class="energy-details">
      <legend>Detail by energy level</legend>
      <div v-for="level in levels" :key="level" class="energy-detail-row">
        <div class="energy-detail-label" :data-tone="level === 1 ? 'low' : level === 2 ? 'mid' : 'high'">
          <span>{{ EN_NAMES[level] }} energy</span>
        </div>
        <AppNumberInput
          :id="`h-min-${level}-vue`"
          v-model="form.by[level].minutes"
          :label="`Minutes`"
          :min="1"
          :max="360"
          :placeholder="String(defaultMinutes[level])"
        />
        <AppInput
          :id="`h-desc-${level}-vue`"
          v-model="form.by[level].desc"
          label="Details / notes (optional)"
          :placeholder="placeholders[level]"
          :maxlength="140"
        />
      </div>
    </fieldset>

    <AppFormActions class="habit-form-actions">
      <AppButton variant="ghost" size="sm" type="button" :equal="true" @click="cancel">Cancel</AppButton>
      <AppButton variant="primary" size="sm" type="submit" :equal="true">Save</AppButton>
    </AppFormActions>
  </form>
</template>

<style scoped>
.habit-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 92%, var(--bg)) 0%, var(--surface-2) 100%);
  border: 1px solid color-mix(in srgb, var(--line) 90%, transparent);
  border-radius: var(--radius-cards);
  padding: var(--spacing-12);
  margin-bottom: var(--spacing-12);
  box-shadow: inset 0 1px 2px color-mix(in srgb, black 8%, transparent), 0 1px 0 color-mix(in srgb, white 25%, transparent);
}

.energy-details {
  display: grid;
  gap: var(--spacing-12);
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.energy-details legend {
  padding: 0;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-4);
}

.energy-detail-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: var(--spacing-8);
  align-items: end;
}

.energy-detail-label {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.energy-detail-label[data-tone="low"] { --energy-tone: var(--energy-low); color: var(--energy-tone); }
.energy-detail-label[data-tone="mid"] { --energy-tone: var(--energy-medium); color: var(--energy-tone); }
.energy-detail-label[data-tone="high"] { --energy-tone: var(--energy-high); color: var(--energy-tone); }

.habit-form-actions { justify-content: flex-end; }

@media (max-width: 560px) {
  .energy-detail-row { grid-template-columns: 1fr 1fr; }
  .energy-detail-label { grid-column: 1 / -1; }
}
</style>
