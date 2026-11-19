import { setupEvents } from '../features/energy-planner/presentation/events';
import { render } from '../features/energy-planner/presentation/render';
import { appStateRepository } from '../features/energy-planner/data/app-state';

export function commit(): void {
  appStateRepository.save();
  render();
}

window.addEventListener('DOMContentLoaded', () => {
  setupEvents(commit);
  render();
});
