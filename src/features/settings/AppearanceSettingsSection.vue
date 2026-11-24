<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import { preferences, savePreferences } from './preferences';
import { THEME_OPTIONS, type ThemeMode } from './model';
import { registerSettingsDraft } from './unsaved';

const theme = ref<ThemeMode>(preferences.value.theme);
const status = ref('');
const dirty = computed(() => theme.value !== preferences.value.theme);

function cancel(): void {
  theme.value = preferences.value.theme;
  status.value = '';
}

function save(): void {
  savePreferences({ ...preferences.value, theme: theme.value });
  status.value = 'Appearance saved.';
}

const unregister = registerSettingsDraft('appearance', {
  isDirty: () => dirty.value,
  discard: cancel,
});

onUnmounted(unregister);
</script>

<template>
  <div class="settings-section">
    <div class="sec-head"><h2>Appearance</h2></div>
    <p class="muted">Choose how Healthy Thyroid looks on this device. System follows your operating system.</p>

    <form class="settings-form" @submit.prevent="save">
      <div class="settings-grid">
        <label class="budget-field" for="appearance-theme">
          <span>Theme</span>
          <select id="appearance-theme" v-model="theme" class="budget-select">
            <option v-for="option in THEME_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
      <p class="muted">Current choice: {{ THEME_OPTIONS.find((option) => option.value === theme)?.label }}</p>
      <p v-if="status" class="status" role="status">{{ status }}</p>

      <AppFormActions>
        <AppButton variant="ghost" :disabled="!dirty" @click="cancel">Cancel</AppButton>
        <AppButton variant="primary" type="submit" :disabled="!dirty">Save appearance</AppButton>
      </AppFormActions>
    </form>
  </div>
</template>
