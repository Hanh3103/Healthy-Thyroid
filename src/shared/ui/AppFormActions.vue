<script setup lang="ts">
withDefaults(defineProps<{ align?: 'start' | 'end' }>(), { align: 'end' });
</script>

<template>
  <div class="actions app-form-actions" :class="`app-form-actions--${align}`">
    <slot />
  </div>
</template>

<style scoped>
.app-form-actions {
  display: flex;
  gap: var(--spacing-8);
  flex-wrap: wrap;
  margin-top: var(--spacing-12);
}

.app-form-actions--end {
  justify-content: flex-end;
}

.app-form-actions--start {
  justify-content: flex-start;
}
</style>
