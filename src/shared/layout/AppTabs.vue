<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { TABS } from '../../router';

const route = useRoute();
const nav = ref<HTMLElement | null>(null);
const indicatorStyle = ref({ width: '0px', transform: 'translateX(0px)' });

function updateIndicator(): void {
  if (!nav.value) return;
  const active = nav.value.querySelector<HTMLElement>('[aria-current="page"]');
  if (!active) return;
  indicatorStyle.value = {
    width: `${active.offsetWidth}px`,
    transform: `translateX(${active.offsetLeft}px)`,
  };
}

watch(() => route.fullPath, async () => {
  await nextTick();
  updateIndicator();
});

onMounted(() => {
  void nextTick(updateIndicator);
  window.addEventListener('resize', updateIndicator);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateIndicator);
});
</script>

<template>
  <nav ref="nav" class="app-nav" aria-label="App views">
    <span class="app-nav-indicator" aria-hidden="true" :style="indicatorStyle"></span>
    <RouterLink
      v-for="tab in TABS"
      :key="tab.id"
      :to="tab.path"
      :data-app-view="tab.id"
      :title="tab.label"
      :aria-label="tab.label"
      :aria-current="route.path === tab.path ? 'page' : undefined"
      class="ghost btn-sm"
      active-class="active"
      exact-active-class="active"
    >
      <svg
        class="app-tab-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path v-for="(path, index) in tab.icon" :key="index" :d="path" />
      </svg>
      <span class="app-tab-label">{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>
