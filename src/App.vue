<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AiStatusButton from './shared/layout/AiStatusButton.vue';
import AppConfirmDialog from './shared/ui/AppConfirmDialog.vue';
import AppTabs from './shared/layout/AppTabs.vue';
import appLogo from './assets/logo.svg';
import { formatDate, formatTime } from './features/settings/model';
import { preferences } from './features/settings/preferences';
import { TABS } from './router';

const route = useRoute();
const router = useRouter();

const activeTitle = computed(() => {
  const match = TABS.find((tab) => tab.path === route.path);
  if (match) return match.title;
  return typeof route.meta.title === 'string' ? route.meta.title : 'Energy Planner';
});

const isSettings = computed(() => route.path.startsWith('/settings'));
const settingsLabel = computed(() =>
  isSettings.value ? 'Settings, open — go to Settings' : 'Open settings');

const date = computed(() => {
  const now = new Date();
  const weekday = now.toLocaleDateString(preferences.value.language, { weekday: 'long' });
  return `${weekday}, ${formatDate(now, preferences.value)} · ${formatTime(now, preferences.value)}`;
});

const plannerPath = TABS.find((tab) => tab.id === 'planner')?.path ?? '/planner';

function openSettings(): void {
  void router.push('/settings');
}
</script>

<template>
  <main>
    <header class="top">
      <RouterLink class="app-brand" :to="plannerPath" aria-label="Healthy Thyroid home">
        <img class="brand-logo" :src="appLogo" alt="" />
        <span>Happy Thyroid</span>
      </RouterLink>

      <AppTabs />

      <div class="app-actions">
        <AiStatusButton />
        <button type="button" class="icon-btn header-icon-btn settings-btn"
          :class="{ 'is-pressed': isSettings }" :aria-label="settingsLabel" :title="settingsLabel"
          :aria-pressed="isSettings" @click="openSettings">
          <svg class="header-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.06a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.06A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 0 1 4 0v.06a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.06a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 0 1 0 4h-.06A1.7 1.7 0 0 0 19.4 15z" />
          </svg>
        </button>
      </div>
    </header>

    <section class="page-heading">
      <h1 id="app-title">{{ activeTitle }}</h1>
      <p class="date" id="date">{{ date }}</p>
    </section>

    <RouterView />
    <AppConfirmDialog />
  </main>
</template>
