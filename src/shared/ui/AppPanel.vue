<script setup lang="ts">
defineProps<{ ariaLabelledby?: string }>();
</script>

<template>
  <section class="panel app-panel" :aria-labelledby="ariaLabelledby">
    <slot />
  </section>
</template>

<style scoped>
.app-panel {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--surface) 98%, white) 0%,
    color-mix(in srgb, var(--surface) 96%, var(--surface-2)) 100%);
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  border-radius: var(--radius-cards);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 45%, transparent),
    0 1px 2px color-mix(in srgb, black 8%, transparent),
    0 10px 24px color-mix(in srgb, black 6%, transparent);
  padding: var(--card-padding);
  min-width: 0;
}
</style>
