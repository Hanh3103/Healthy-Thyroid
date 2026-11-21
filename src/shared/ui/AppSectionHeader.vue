<script setup lang="ts">
defineProps<{ title?: string; titleId?: string }>();
</script>

<template>
  <div class="sec-head app-sec-head">
    <div class="app-sec-head-main">
      <h2 v-if="title || $slots.title" :id="titleId">
        <slot name="title">{{ title }}</slot>
      </h2>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="sec-head-actions">
      <slot name="actions" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.app-sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
  margin-bottom: var(--spacing-12);
  min-height: 32px;
}

.app-sec-head-main {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-8);
  flex-wrap: wrap;
}
</style>
