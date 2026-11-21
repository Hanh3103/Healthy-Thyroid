<script setup lang="ts">
import { computed } from 'vue';
import AppButton from './AppButton.vue';
import { getConfirmState, settleConfirm } from './useConfirm';

const state = getConfirmState();

const isPrimary = computed(() => state.request?.tone === 'primary');
const cancelLabel = computed(() => state.request?.cancelLabel || 'Cancel');

/** Escape closes the dialog with v-model, so resolve the pending promise here. */
function onClosed(): void {
  settleConfirm(false);
}
</script>

<template>
  <el-dialog
    v-model="state.open"
    class="confirm-dialog"
    modal-class="confirm-modal"
    width="420px"
    align-center
    :show-header="false"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    :aria-label="state.request?.title || 'Confirm action'"
    @closed="onClosed"
  >
    <div
      v-if="state.request"
      class="confirm-content"
      :data-tone="isPrimary ? 'primary' : 'danger'"
    >
      <div class="confirm-icon" aria-hidden="true">
        <svg v-if="isPrimary" viewBox="0 0 24 24">
          <path d="M3 6.5h18v3H3zM5 9.5v10h14v-10M9 14h6" />
        </svg>
        <svg v-else viewBox="0 0 24 24">
          <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
        </svg>
      </div>

      <h2 class="confirm-title">{{ state.request.title }}</h2>
      <p class="confirm-description">{{ state.request.description }}</p>
      <p v-if="state.request.subject" class="confirm-subject">“{{ state.request.subject }}”</p>

      <p v-if="state.request.warning" class="confirm-warning">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.8 15 14H1L8 1.8Z" />
          <path d="M8 6v4" />
          <circle cx="8" cy="12" r="0.6" fill="currentColor" stroke="none" />
        </svg>
        <span>{{ state.request.warning }}</span>
      </p>

      <div class="confirm-actions">
        <AppButton variant="ghost" size="md" @click="settleConfirm(false)">
          {{ cancelLabel }}
        </AppButton>
        <AppButton
          :variant="isPrimary ? 'primary' : 'danger'"
          size="md"
          @click="settleConfirm(true)"
        >
          {{ state.request.confirmLabel }}
        </AppButton>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.confirm-dialog.el-dialog {
  max-width: calc(100vw - 32px);
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 55%, transparent),
    0 24px 70px color-mix(in srgb, black 28%, transparent);
}

.confirm-dialog :deep(.el-dialog__header),
.confirm-dialog :deep(.el-dialog__headerbtn) {
  display: none;
}

.confirm-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.confirm-content {
  --confirm-color: #dc2626;
  --confirm-soft: #fff1f2;
  padding: 24px;
  font-family: Inter, var(--font-geist-sans), system-ui, sans-serif;
}

.confirm-content[data-tone="primary"] {
  --confirm-color: var(--accent);
  --confirm-soft: var(--surface-2);
}

@media (prefers-color-scheme: dark) {
  .confirm-content[data-tone="danger"] {
    --confirm-color: #f87171;
    --confirm-soft: #3f1212;
  }

  .confirm-content[data-tone="primary"] {
    --confirm-soft: #232323;
  }
}

:root[data-theme="dark"] .confirm-content[data-tone="danger"] {
  --confirm-color: #f87171;
  --confirm-soft: #3f1212;
}

:root[data-theme="dark"] .confirm-content[data-tone="primary"] {
  --confirm-soft: #232323;
}

.confirm-icon {
  display: grid;
  width: 44px;
  height: 44px;
  margin-bottom: 16px;
  place-items: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--confirm-color) 14%, var(--confirm-soft));
  color: var(--confirm-color);
}

.confirm-icon svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.confirm-title {
  margin: 0;
  color: var(--ink);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.confirm-description {
  margin: 10px 0 0;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.5;
}

.confirm-subject {
  margin: 10px 0 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.confirm-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--confirm-color) 9%, var(--confirm-soft));
  color: var(--confirm-color);
  font-size: 13px;
  line-height: 1.4;
}

.confirm-warning svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  margin-top: 1px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}
</style>
