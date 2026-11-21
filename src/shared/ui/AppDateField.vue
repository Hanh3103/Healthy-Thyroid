<script setup lang="ts">
import { ref, watch } from 'vue';
import { parseDueInput } from '../utils';

const model = defineModel<string>({ default: '' });

withDefaults(defineProps<{
  id?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}>(), {
  placeholder: 'DD/MM/YYYY',
  required: false,
});

type PickerHandle = { handleOpen: () => void };
const picker = ref<PickerHandle | null>(null);

function format(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

const text = ref(format(model.value));

watch(model, (iso) => {
  text.value = format(iso);
});

function onTextChange() {
  const value = text.value.trim();
  if (!value) {
    model.value = '';
    return;
  }
  const iso = parseDueInput(value);
  if (iso) {
    model.value = iso;
    text.value = format(iso);
  } else {
    text.value = format(model.value);
  }
}

function onPickerChange(value: string | null) {
  model.value = value ?? '';
  text.value = format(model.value);
}

function openPicker() {
  picker.value?.handleOpen();
}

function clear() {
  model.value = '';
  text.value = '';
}
</script>

<template>
  <label class="app-field" :class="{ 'app-field--bare': !label }" :for="id">
    <span v-if="label" class="app-field-label">{{ label }}</span>
    <span class="date-anchor">
      <el-input
        :id="id"
        v-model="text"
        class="app-control"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :placeholder="placeholder"
        :required="required"
        @change="onTextChange"
        @blur="onTextChange"
        @click="openPicker"
      >
        <template #prefix>
          <span class="date-icon" title="Choose a date" @click.stop="openPicker">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 2v2m10-2v2M3.5 8.5h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z" />
            </svg>
          </span>
        </template>
        <template #suffix>
          <!-- Always rendered so the field width never changes when a date is set;
               only its visibility toggles. -->
          <button
            type="button"
            class="date-clear"
            :class="{ 'is-hidden': !model }"
            :aria-hidden="!model"
            :tabindex="model ? 0 : -1"
            title="Clear date"
            @click.stop="clear"
          >&times;</button>
        </template>
      </el-input>

      <!-- Invisible bridge: uses Element Plus's compact date panel, opened over our single-box field.
           Wrapped in a real element because el-date-picker renders a fragment (input + teleported popper),
           so it cannot be hidden directly with a scoped class. -->
      <span class="date-bridge" aria-hidden="true">
        <el-date-picker
          ref="picker"
          :model-value="model"
          type="date"
          format="DD/MM/YYYY"
          value-format="YYYY-MM-DD"
          :editable="false"
          :clearable="false"
          :teleported="true"
          popper-class="date-field-popover"
          @update:model-value="onPickerChange"
        />
      </span>
    </span>
  </label>
</template>

<style scoped>
.app-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.app-field--bare {
  display: contents;
}

.app-field-label {
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-charcoal);
  font-weight: var(--font-weight-medium);
}

.date-anchor {
  position: relative;
  display: block;
  width: 100%;
}

.app-control {
  width: 100%;
}

/* Exactly the same single-box styling used by AppInput (Habit name). */
.app-control :deep(.el-input__wrapper) {
  width: 100%;
  height: 32px;
  border-radius: var(--radius-buttons);
  padding: 0 10px;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--surface-2) 55%, var(--bg)) 0%,
    var(--surface) 100%);
  border: 1px solid color-mix(in srgb, var(--line) 95%, var(--color-ash));
  box-shadow: inset 0 1px 2px color-mix(in srgb, black 8%, transparent);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.app-control :deep(.el-input__wrapper:hover) {
  border-color: color-mix(in srgb, var(--ink-2) 35%, var(--line));
}

.app-control :deep(.el-input__wrapper.is-focus) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  box-shadow:
    inset 0 1px 2px color-mix(in srgb, black 6%, transparent),
    0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}

.app-control :deep(.el-input__inner) {
  height: 30px;
  line-height: 30px;
  font-size: 14px;
  color: var(--ink);
  background: transparent;
  border: none;
  box-shadow: none;
  outline: none;
}

.app-control :deep(.el-input__inner::placeholder) {
  color: var(--color-stone);
  opacity: 1;
}

.app-control :deep(.el-input__inner:focus) {
  outline: none;
  box-shadow: none;
  border: none;
}

/* Calendar icon / clear button live inside the same single field box. */
.date-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  color: var(--ink-2);
  cursor: pointer;
}

.date-icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.date-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 2px;
  padding: 0;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--ink-2);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.date-clear:hover {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.date-clear.is-hidden {
  visibility: hidden;
  pointer-events: none;
}

/* The hidden picker is only a positioning anchor for Element Plus's compact calendar panel.
   The popper is teleported to <body>, so hiding this wrapper does not hide the calendar. */
.date-bridge {
  position: absolute;
  inset: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
</style>
