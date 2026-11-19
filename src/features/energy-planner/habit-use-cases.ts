import type { AppState, Habit } from '../../shared/domain-types';
import { keyOf } from '../../shared/utils';

export function toggleDailyHabit(state: AppState, habit: Habit): void {
  const key = keyOf(new Date());
  state.log[key] = state.log[key] || {};
  state.log[key][habit.id] = !state.log[key][habit.id];
}
