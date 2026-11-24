<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import {
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  TIME_FORMAT_OPTIONS,
  formatDate,
  formatTime,
  type DateFormat,
  type LanguageCode,
  type TimeFormat,
} from './model';
import { preferences, savePreferences } from './preferences';
import { registerSettingsDraft } from './unsaved';

const language = ref<LanguageCode>(preferences.value.language);
const dateFormat = ref<DateFormat>(preferences.value.dateFormat);
const timeFormat = ref<TimeFormat>(preferences.value.timeFormat);
const mondayStart = ref(preferences.value.weekStartsOn === 1);
const status = ref('');

const draftPreferences = computed(() => ({
  ...preferences.value,
  language: language.value,
  dateFormat: dateFormat.value,
  timeFormat: timeFormat.value,
  weekStartsOn: (mondayStart.value ? 1 : 0) as 0 | 1,
}));
const dirty = computed(() =>
  JSON.stringify(draftPreferences.value) !== JSON.stringify(preferences.value));
const preview = computed(() => {
  const sample = new Date(2026, 10, 24, 18, 30);
  return `${formatDate(sample, draftPreferences.value)} · ${formatTime(sample, draftPreferences.value)}`;
});

function cancel(): void {
  language.value = preferences.value.language;
  dateFormat.value = preferences.value.dateFormat;
  timeFormat.value = preferences.value.timeFormat;
  mondayStart.value = preferences.value.weekStartsOn === 1;
  status.value = '';
}

function save(): void {
  savePreferences(draftPreferences.value);
  status.value = 'Language and formats saved for the whole app.';
}

const unregister = registerSettingsDraft('language', {
  isDirty: () => dirty.value,
  discard: cancel,
});

onUnmounted(unregister);
</script>

<template>
  <div class="settings-section">
    <div class="sec-head"><h2>Language and formats</h2></div>
    <p class="muted">One language and one set of formats are used across the whole screen.</p>

    <form class="settings-form" @submit.prevent="save">
      <div class="settings-grid">
        <label class="budget-field" for="pref-language">
          <span>Language</span>
          <select id="pref-language" v-model="language" class="budget-select">
            <option v-for="option in LANGUAGE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="budget-field" for="pref-date">
          <span>Date format</span>
          <select id="pref-date" v-model="dateFormat" class="budget-select">
            <option v-for="option in DATE_FORMAT_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="budget-field" for="pref-time">
          <span>Time format</span>
          <select id="pref-time" v-model="timeFormat" class="budget-select">
            <option v-for="option in TIME_FORMAT_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="profile-checkbox" for="pref-week-start">
          <input id="pref-week-start" v-model="mondayStart" type="checkbox" />
          <span>Week starts on Monday</span>
        </label>
      </div>
      <p class="muted">Preview: {{ preview }}</p>
      <p v-if="status" class="status" role="status">{{ status }}</p>

      <AppFormActions>
        <AppButton variant="ghost" :disabled="!dirty" @click="cancel">Cancel</AppButton>
        <AppButton variant="primary" type="submit" :disabled="!dirty">Save formats</AppButton>
      </AppFormActions>
    </form>
  </div>
</template>
