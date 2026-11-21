<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppConfirmDialog from './shared/ui/AppConfirmDialog.vue';
import AppTabs from './shared/layout/AppTabs.vue';
import { TABS } from './router';

const route = useRoute();

const activeTitle = computed(() => {
  const match = TABS.find((tab) => tab.path === route.path);
  return match?.title ?? 'Energy Planner';
});

const date = ref(new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}));
</script>

<template>
  <main>
    <header class="top">
      <AppTabs />
      <div class="top-heading">
        <h1 id="app-title">{{ activeTitle }}</h1>
        <p class="date" id="date">{{ date }}</p>
      </div>
    </header>

    <RouterView />
    <AppConfirmDialog />
  </main>
</template>
