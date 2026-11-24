<script setup lang="ts">
/**
 * Header AI status button and its non-modal popover.
 *
 * All state comes from useAiStatus, which is shared with the AI callers, so the
 * dot, spinner, usage and failure line update live after every request.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { providerLabel } from '../../features/profile/aiStatus';
import { useAiStatus } from '../ai/useAiStatus';

const {
  status,
  busy,
  busyLabel,
  cancelRequested,
  failureReason,
  testResult,
  lastResult,
  dot,
  stateLabel,
  tooltip,
  refresh,
  setEnabled,
  cancel,
  testConnection,
} = useAiStatus();

const route = useRoute();
const router = useRouter();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const button = ref<HTMLButtonElement | null>(null);
const popover = ref<HTMLElement | null>(null);

const dotClass = computed(() => `ai-dot ai-dot--${dot.value}`);
const providerAndModel = computed(() =>
  `${providerLabel(status.value.provider)}, ${status.value.model}`);
const usagePercent = computed(() => {
  const limit = status.value.dailyLimit;
  return limit > 0 ? Math.min(100, Math.round((status.value.callCount / limit) * 100)) : 0;
});

async function show(): Promise<void> {
  open.value = true;
  await refresh();
  await nextTick();
  popover.value?.querySelector<HTMLElement>('input, button, a')?.focus();
}

function close(restoreFocus = true): void {
  if (!open.value) return;
  open.value = false;
  if (restoreFocus) void nextTick(() => button.value?.focus());
}

function toggle(): void {
  if (open.value) close();
  else void show();
}

function onPointerDown(event: PointerEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    close();
  }
}

async function onSwitch(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  await setEnabled(input.checked);
}

async function onTest(): Promise<void> {
  try {
    await testConnection();
  } catch {
    // The friendly failure reason and inline result are rendered below.
  }
}

function openAiSettings(): void {
  close(false);
  void router.push('/settings/ai');
}

watch(() => route.fullPath, () => close(false));

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeydown);
  void refresh();
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="root" class="ai-control">
    <button
      ref="button"
      type="button"
      class="icon-btn header-icon-btn ai-status-btn"
      :aria-label="tooltip"
      :title="tooltip"
      :aria-expanded="open"
      aria-controls="ai-status-popover"
      @click="toggle"
    >
      <svg class="header-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true" focusable="false">
        <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
        <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15z" />
      </svg>
      <span v-if="dot !== 'none'" :class="dotClass" aria-hidden="true"></span>
      <span v-if="busy" class="ai-spinner ai-btn-spinner" aria-hidden="true"></span>
    </button>

    <div v-if="open" id="ai-status-popover" ref="popover" class="ai-popover"
      role="region" aria-label="AI status">
      <p class="ai-popover-status">{{ providerAndModel }}</p>
      <p class="ai-state" :class="`is-${dot}`">{{ stateLabel }}</p>

      <label class="ai-switch-row">
        <span>AI suggestions</span>
        <input class="ai-switch" type="checkbox" :checked="status.enabled" :disabled="busy"
          aria-label="AI suggestions" @change="onSwitch" />
      </label>

      <div class="ai-usage">
        <div class="ai-usage-label">
          <span>Usage today</span>
          <span>{{ status.callCount }} of {{ status.dailyLimit }} calls</span>
        </div>
        <div class="ai-usage-bar" role="presentation">
          <span :style="{ width: `${usagePercent}%` }"></span>
        </div>
      </div>

      <div v-if="busy" class="ai-generating" role="status" aria-live="polite">
        <span class="ai-spinner" aria-hidden="true"></span>
        <span>{{ busyLabel || 'Generating your meal plan...' }}</span>
        <button type="button" class="app-btn ghost btn-sm" :disabled="cancelRequested" @click="cancel">
          {{ cancelRequested ? 'Cancelling...' : 'Cancel' }}
        </button>
      </div>

      <div v-if="failureReason && !busy" class="ai-failure" role="status" aria-live="polite">
        <p>{{ failureReason }}</p>
        <button type="button" class="app-btn ghost btn-sm" @click="onTest">Test connection</button>
        <p v-if="testResult" class="ai-test-result">{{ testResult }}</p>
      </div>

      <div v-if="!status.configured && !busy" class="ai-setup">
        <p>Set up AI to get suggestions</p>
        <button type="button" class="app-btn primary btn-sm" @click="openAiSettings">Set up AI</button>
      </div>

      <p v-if="lastResult && !busy && !failureReason" class="ai-last-result" role="status" aria-live="polite">
        {{ lastResult }}
      </p>

      <RouterLink class="ai-settings-link" to="/settings/ai" @click="close(false)">
        Open AI settings
      </RouterLink>
    </div>
  </div>
</template>
