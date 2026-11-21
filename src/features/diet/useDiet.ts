/** Diet ViewModel. */
import { computed, ref } from 'vue';
import { initialDietStatus, type DietStatus } from './model';

const status = ref<DietStatus>(initialDietStatus());

export function useDiet() {
  return {
    status,
    title: computed(() => status.value.title),
    description: computed(() => status.value.description),
    comingSoon: computed(() => status.value.state === 'coming-soon'),
  };
}
