<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'ghost' | 'text' | 'danger';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  equal?: boolean;
}>(), {
  variant: 'ghost',
  size: 'sm',
  type: 'button',
  disabled: false,
  loading: false,
  equal: false,
});
</script>

<template>
  <el-button
    :type="variant === 'primary' || variant === 'danger' ? variant : 'default'"
    :native-type="type"
    :disabled="disabled"
    :loading="loading"
    class="app-btn"
    :class="[
      `app-btn--${variant}`,
      `app-btn--${size}`,
      { 'app-btn--equal': equal }
    ]"
  >
    <slot />
  </el-button>
</template>

<style scoped>
.app-btn {
  border-radius: var(--radius-full);
  font-family: var(--font-geist-sans);
  font-weight: var(--font-weight-medium);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, color 0.15s ease, background 0.15s ease, filter 0.15s ease;
}

.app-btn--sm {
  height: 32px;
  padding: 0 var(--spacing-12);
  font-size: 13px;
}

.app-btn--md {
  height: 42px;
  padding: 0 var(--spacing-16);
  font-size: 14px;
}

.app-btn--primary {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--surface-inverted-surface) 90%, white) 0%,
    var(--surface-inverted-surface) 100%);
  color: var(--accent-ink);
  border: 1px solid color-mix(in srgb, var(--surface-inverted-surface) 82%, black);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 18%, transparent),
    0 1px 2px color-mix(in srgb, black 20%, transparent),
    0 6px 14px color-mix(in srgb, black 14%, transparent);
}

.app-btn--primary:hover {
  filter: brightness(1.04);
}

.app-btn--ghost {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--surface) 98%, white) 0%,
    color-mix(in srgb, var(--surface) 92%, var(--surface-2)) 100%);
  border: 1px solid color-mix(in srgb, var(--line) 90%, transparent);
  color: var(--ink-2);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 45%, transparent),
    0 1px 2px color-mix(in srgb, black 8%, transparent);
}

.app-btn--ghost:hover {
  color: var(--ink);
  border-color: color-mix(in srgb, var(--ink-2) 30%, var(--line));
}

.app-btn--danger {
  background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
  color: #ffffff;
  border: 1px solid #b91c1c;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 22%, transparent),
    0 1px 2px color-mix(in srgb, black 20%, transparent),
    0 6px 14px color-mix(in srgb, #dc2626 24%, transparent);
}

.app-btn--danger:hover {
  filter: brightness(1.05);
}

.app-btn:active {
  transform: translateY(1px);
}

.app-btn--equal {
  width: 88px;
  padding: 0;
}
</style>
