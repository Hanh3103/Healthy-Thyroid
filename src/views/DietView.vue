<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import DayMeals from '../features/diet/DayMeals.vue';
import DietCalendar from '../features/diet/DietCalendar.vue';
import PantryCard from '../features/diet/PantryCard.vue';
import ShoppingList from '../features/diet/ShoppingList.vue';
import { useDiet } from '../features/diet/useDiet';
import { keyOf } from '../shared/utils';
import AppButton from '../shared/ui/AppButton.vue';

const {
  init,
  clearMealsForDates,
  setShoppingFilter,
} = useDiet();

const isDev = import.meta.env.DEV;
const selectedDate = ref(keyOf(new Date()));
const calendar = ref<InstanceType<typeof DietCalendar> | null>(null);
const resetMessage = ref('');

function selectDay(date: string): void {
  selectedDate.value = date;
}

function showToday(): void {
  selectedDate.value = keyOf(new Date());
}

function returnToCalendar(): void {
  calendar.value?.focusDay(selectedDate.value);
}

function showShoppingForDate(date: string): void {
  setShoppingFilter({ date });
  void nextTick(() => {
    document.getElementById('shopping-list-card')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  });
}

function showPantry(): void {
  void nextTick(() => {
    document.getElementById('pantry-card')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  });
}

/** Dev-only: today plus the following seven dates. */
async function resetMealTestData(): Promise<void> {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const dates = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return keyOf(date);
  });
  const cleared = await clearMealsForDates(dates);
  resetMessage.value = `Cleared meal data for ${cleared.length} day${cleared.length === 1 ? '' : 's'}.`;
}

onMounted(() => { void init(); });
</script>

<template>
  <div class="diet-view app-view is-active">
    <DietCalendar
      ref="calendar"
      :selected-date="selectedDate"
      @select="selectDay"
    />
    <DayMeals
      :date="selectedDate"
      @today="showToday"
      @escape="returnToCalendar"
      @show-shopping="showShoppingForDate"
      @show-pantry="showPantry"
    />
    <div class="diet-list-cards">
      <PantryCard />
      <ShoppingList />
    </div>

    <div v-if="isDev" class="dev-reset">
      <AppButton size="sm" @click="resetMealTestData">Reset meal test data</AppButton>
      <span v-if="resetMessage" class="dev-reset-message" role="status">{{ resetMessage }}</span>
    </div>
  </div>
</template>

<style scoped>
.diet-list-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--spacing-20);
}

@media (max-width: 900px) {
  .diet-list-cards {
    grid-template-columns: minmax(0, 1fr);
  }
}

.dev-reset {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 0;
}

.dev-reset-message {
  color: var(--ink-2);
  font-size: 11px;
}
</style>
