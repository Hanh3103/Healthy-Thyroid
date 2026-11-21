<script setup lang="ts">
const model = defineModel<boolean>({ default: false });
defineProps<{ title?: string; width?: string }>();
</script>

<template>
  <el-dialog v-model="model" :title="title" :width="width || '480px'" class="app-dialog" align-center>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </el-dialog>
</template>

<style scoped>
.app-dialog :deep(.el-dialog__header) {
  margin-right: 0;
}
</style>
