<script setup lang="ts">
import { computed } from 'vue';
import type { ThyroidFact, TimingNote } from './model';

const props = defineProps<{
  notes: TimingNote[];
  facts: ThyroidFact[];
}>();
const emit = defineEmits<{ 'select-fact': [id: string] }>();

const factById = computed(() => new Map(props.facts.map((fact) => [fact.id, fact] as const)));
</script>

<template>
  <ul v-if="notes.length" class="timing-list" aria-label="Meal timing notes">
    <li v-for="(note, index) in notes" :key="index" class="timing-item">
      <span class="timing-text">{{ note.text }}</span>
      <div v-for="id in note.factIds" :key="id" class="timing-fact">
        <button type="button" class="science-tag" @click="emit('select-fact', id)">
          Science note · {{ id }}
        </button>
        <a
          v-if="factById.get(id)"
          :href="factById.get(id)?.source.url"
          target="_blank"
          rel="noreferrer"
        >Source: {{ factById.get(id)?.source.title }}</a>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.timing-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.timing-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  line-height: 1.5;
}

.timing-fact {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 10px;
}

.timing-fact a {
  color: var(--accent);
  overflow-wrap: anywhere;
}

.science-tag {
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--line));
  border-radius: var(--radius-full);
  background: var(--surface-2);
  color: var(--ink-2);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}
</style>
