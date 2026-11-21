<script setup lang="ts">
const model = defineModel<boolean>({ default: false });
defineProps<{ label?: string; disabled?: boolean }>();
</script>

<template>
  <el-checkbox v-model="model" :disabled="disabled" class="app-checkbox">
    <slot>{{ label }}</slot>
  </el-checkbox>
</template>

<style scoped>
.app-checkbox :deep(.el-checkbox__inner) {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
}
</style>
