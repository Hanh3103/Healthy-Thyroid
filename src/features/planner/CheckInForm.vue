<script setup lang="ts">
import { computed } from 'vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import { EN_NAMES, type EnergyLevel } from './model';
import EnergyPicker from './EnergyPicker.vue';

const props = withDefaults(defineProps<{
  symptoms: string;
  level: EnergyLevel;
  suggestion: EnergyLevel | null;
  status: string;
  loading: boolean;
  idPrefix: string;
  label?: string;
  saveLabel?: string;
  showCancel?: boolean;
  showSuggest?: boolean;
}>(), {
  label: 'How do you feel today?',
  saveLabel: 'Save',
  showCancel: true,
  showSuggest: true,
});

const emit = defineEmits<{
  'update:symptoms': [value: string];
  'update:level': [value: EnergyLevel];
  suggest: [];
  accept: [];
  save: [];
  cancel: [];
}>();

const suggestionLabel = computed(() => (
  props.suggestion === null ? '' : EN_NAMES[props.suggestion]
));
</script>

<template>
  <form class="checkin-form" @submit.prevent="emit('save')">
    <label class="checkin-label" :for="`${idPrefix}-symptoms`">{{ label }}</label>
    <textarea
      :id="`${idPrefix}-symptoms`"
      :value="symptoms"
      class="checkin-input"
      rows="3"
      maxlength="1000"
      placeholder="Sleep, pain, focus, stress, anything relevant…"
      :disabled="loading"
      @input="emit('update:symptoms', ($event.target as HTMLTextAreaElement).value)"
    ></textarea>

    <div v-if="showSuggest" class="checkin-actions">
      <AppButton
        variant="ghost"
        size="sm"
        type="button"
        :loading="loading"
        :disabled="!symptoms.trim() || loading"
        @click="emit('suggest')"
      >Suggest energy</AppButton>
    </div>

    <div v-if="suggestion !== null" class="checkin-suggestion" role="status">
      <span>AI suggests <strong>{{ suggestionLabel }}</strong></span>
      <button type="button" class="accept-suggestion" @click="emit('accept')">
        Accept
      </button>
    </div>

    <fieldset class="checkin-energy">
      <legend :id="`${idPrefix}-energy-label`">My energy level</legend>
      <EnergyPicker
        :model-value="level"
        :aria-labelledby="`${idPrefix}-energy-label`"
        @update:model-value="emit('update:level', $event)"
      />
    </fieldset>

    <p class="muted checkin-status" role="status">{{ status }}</p>

    <slot name="before-actions" />

    <AppFormActions class="checkin-form-actions">
      <AppButton
        v-if="showCancel"
        variant="ghost"
        size="sm"
        type="button"
        :equal="true"
        @click="emit('cancel')"
      >Cancel</AppButton>
      <AppButton variant="primary" size="sm" type="submit" :equal="true" :disabled="loading">
        {{ saveLabel }}
      </AppButton>
    </AppFormActions>
  </form>
</template>

<style scoped>
.checkin-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-10, 10px);
}

.checkin-label,
.checkin-energy legend {
  color: var(--ink-2);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
}

.checkin-energy {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.checkin-energy legend {
  margin-bottom: 6px;
  padding: 0;
}

.checkin-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--line) 90%, var(--ink-2));
  border-radius: var(--radius-buttons);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--text-caption);
  line-height: 1.4;
  resize: vertical;
}

.checkin-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.checkin-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkin-form-actions {
  justify-content: flex-end;
}

.checkin-suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
  border-radius: var(--radius-buttons);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  color: var(--ink-2);
  font-size: var(--text-caption);
}

.checkin-suggestion strong {
  color: var(--ink);
}

.accept-suggestion {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  text-decoration: underline;
  cursor: pointer;
}

.checkin-status {
  min-height: 1em;
}
</style>
