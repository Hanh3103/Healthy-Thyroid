<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { SETTINGS_SECTIONS, TABS, settingsBackPath } from '../router';

const route = useRoute();

const backLabel = computed(() =>
  TABS.find((tab) => tab.path === settingsBackPath.value)?.label ?? 'Energy Planner');
const activeSection = computed(() =>
  SETTINGS_SECTIONS.find((section) => route.path === section.path)?.label ?? 'Settings');
</script>

<template>
  <div class="settings-view app-view is-active">
    <RouterLink class="settings-back" :to="settingsBackPath">
      <span aria-hidden="true">←</span> Back to {{ backLabel }}
    </RouterLink>

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="Settings sections">
        <RouterLink
          v-for="section in SETTINGS_SECTIONS"
          :key="section.id"
          class="settings-nav-item"
          :class="{ 'is-active': route.path === section.path }"
          :to="section.path"
          :aria-current="route.path === section.path ? 'page' : undefined"
        >{{ section.label }}</RouterLink>
      </nav>

      <section class="panel settings-card" :aria-label="activeSection">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </section>
    </div>
  </div>
</template>
