export type AppViewId = 'energy' | 'thyroid' | 'diet' | 'profile';

interface ViewConfig {
  id: AppViewId;
  containerId: string;
  title: string;
  showSummary: boolean;
}

const VIEWS: readonly ViewConfig[] = [
  { id: 'energy', containerId: 'energy-view', title: 'Energy Planner', showSummary: true },
  { id: 'thyroid', containerId: 'thyroid-view', title: 'Thyroid Checker', showSummary: false },
  { id: 'diet', containerId: 'diet-view', title: 'Diet Advisor', showSummary: false },
  { id: 'profile', containerId: 'profile-view', title: 'Profile', showSummary: false },
];

const VIEW_BY_ID = new Map(VIEWS.map((view) => [view.id, view]));

function isAppViewId(value: string | null | undefined): value is AppViewId {
  return value != null && VIEW_BY_ID.has(value as AppViewId);
}

export function activateView(viewId: AppViewId): void {
  const activeView = VIEW_BY_ID.get(viewId);
  if (!activeView) return;

  document.querySelectorAll<HTMLElement>('[data-app-view]').forEach((item) => {
    const itemViewId = item.getAttribute('data-app-view');
    const isActive = itemViewId === viewId;
    item.classList.toggle('active', isActive);
    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  VIEWS.forEach((view) => {
    const container = document.getElementById(view.containerId);
    if (container) container.hidden = view.id !== viewId;
  });

  document.title = activeView.title;

  const appTitle = document.getElementById('app-title');
  if (appTitle) appTitle.textContent = activeView.title;

  const summary = document.getElementById('summary');
  if (summary) summary.hidden = !activeView.showSummary;
}

export function setupViewSwitcher(): void {
  const buttons = document.querySelectorAll<HTMLElement>('[data-app-view]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const viewId = button.getAttribute('data-app-view');
      if (isAppViewId(viewId)) activateView(viewId);
    });
  });

  const initial = document.querySelector<HTMLElement>('[data-app-view].active')?.getAttribute('data-app-view');
  activateView(isAppViewId(initial) ? initial : 'energy');
}
