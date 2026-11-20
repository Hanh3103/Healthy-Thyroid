import { setupEvents } from '../features/energy-planner/presentation/events';
import { render } from '../features/energy-planner/presentation/render';
import { appStateRepository } from '../features/energy-planner/data/app-state';
import { setupViewSwitcher } from './view-switcher';
import { setupProfileView } from './profile';

export function commit(): void {
  appStateRepository.save();
  render();
}

window.addEventListener('DOMContentLoaded', () => {
  setupViewSwitcher();
  setupProfileView();

  // Loaded separately so an error in the thyroid feature cannot stop the rest of the app.
  void import('../features/thyroid-checker/presentation/thyroid-checker')
    .then(({ setupThyroidChecker }) => setupThyroidChecker())
    .catch((error: unknown) => {
      console.error('Thyroid Checker failed to initialise:', error);
      const status = document.getElementById('thyroid-init-status');
      if (status) {
        status.textContent = 'Thyroid Checker could not load. Reload the window, or restart the dev server.';
        status.hidden = false;
      }
    });

  setupEvents(commit);
  render();
});
