<script setup lang="ts">
const model = defineModel<string>({ default: '' });

withDefaults(defineProps<{
  id?: string;
  label?: string;
  placeholder?: string;
  type?: string;
  maxlength?: number;
  required?: boolean;
  autocomplete?: string;
  inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
  pattern?: string;
}>(), {
  type: 'text',
  required: false,
});
</script>

<template>
  <label v-if="label" class="app-field" :for="id">
    <span class="app-field-label">{{ label }}</span>
    <el-input
      :id="id"
      v-model="model"
      class="app-control"
      :type="type"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :required="required"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :pattern="pattern"
    />
  </label>
  <el-input
    v-else
    :id="id"
    v-model="model"
    class="app-control"
    :type="type"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :required="required"
    :autocomplete="autocomplete"
    :inputmode="inputmode"
    :pattern="pattern"
  />
</template>

<style scoped>
.app-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.app-field-label {
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-charcoal);
  font-weight: var(--font-weight-medium);
}

.app-control {
  width: 100%;
}

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
</style>
