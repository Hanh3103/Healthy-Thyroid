<script setup lang="ts">
import { useDiet } from '../features/diet/useDiet';

const { title, description, comingSoon } = useDiet();
</script>

<template>
  <div class="diet-view app-view is-active">
    <section class="panel">
      <div class="sec-head">
        <h2 id="diet-heading">{{ title }}</h2>
        <span v-if="comingSoon" class="chip">Coming soon</span>
      </div>
      <p class="muted">{{ description }}</p>
    </section>
  </div>
</template>
