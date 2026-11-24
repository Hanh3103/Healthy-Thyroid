<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'Set up AI' });
</script>

<template>
  <RouterLink class="setup-ai-link" to="/settings/ai">{{ label }}</RouterLink>
</template>

<style scoped>
.setup-ai-link {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 var(--spacing-12);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line));
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  color: var(--accent);
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  text-decoration: none;
}

.setup-ai-link:hover {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}

.setup-ai-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
