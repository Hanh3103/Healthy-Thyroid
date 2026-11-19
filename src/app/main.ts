import { setupEvents } from '../features/energy-planner/presentation/events';
import { render } from '../features/energy-planner/presentation/render';
import { appStateRepository } from '../features/energy-planner/data/app-state';

export function commit(): void {
  appStateRepository.save();
  render();
}

function setupViewSwitcher(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-app-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.appView;
      document.querySelectorAll<HTMLButtonElement>('[data-app-view]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      const energyView = document.getElementById('energy-view');
      const thyroidView = document.getElementById('thyroid-view');
      if (energyView) energyView.hidden = view !== 'energy';
      if (thyroidView) thyroidView.hidden = view !== 'thyroid';
      document.title = view === 'thyroid' ? 'Thyroid Checker' : 'Energy Planner';
      const appTitle = document.getElementById('app-title');
      if (appTitle) appTitle.textContent = view === 'thyroid' ? 'Thyroid Checker' : 'Energy Planner';
      const summary = document.getElementById('summary');
      if (summary) summary.hidden = view === 'thyroid';
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setupViewSwitcher();

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
