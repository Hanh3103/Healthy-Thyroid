export type AppViewId = 'energy' | 'thyroid' | 'diet' | 'profile';

interface ViewConfig {
  id: AppViewId;
  containerId: string;
  title: string;
}

const VIEWS: readonly ViewConfig[] = [
  { id: 'energy', containerId: 'energy-view', title: 'Energy Planner' },
  { id: 'thyroid', containerId: 'thyroid-view', title: 'Thyroid Checker' },
  { id: 'diet', containerId: 'diet-view', title: 'Diet Advisor' },
  { id: 'profile', containerId: 'profile-view', title: 'Profile' },
];

const VIEW_BY_ID = new Map(VIEWS.map((view) => [view.id, view]));

let currentViewId: AppViewId | null = null;

function isAppViewId(value: string | null | undefined): value is AppViewId {
  return value != null && VIEW_BY_ID.has(value as AppViewId);
}

function updateNavIndicator(): void {
  const nav = document.querySelector<HTMLElement>('.app-nav');
  const indicator = nav?.querySelector<HTMLElement>('.app-nav-indicator');
  const active = nav?.querySelector<HTMLElement>('[data-app-view].active, [data-app-view][aria-current="page"]');
  if (!nav || !indicator || !active) return;

  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.transform = `translateX(${active.offsetLeft}px)`;
}

export function activateView(viewId: AppViewId): void {
  const activeView = VIEW_BY_ID.get(viewId);
  if (!activeView) return;

  const currentIndex = currentViewId ? VIEWS.findIndex((view) => view.id === currentViewId) : -1;
  const nextIndex = VIEWS.findIndex((view) => view.id === viewId);
  const direction = currentIndex === -1 || nextIndex === currentIndex
    ? null
    : nextIndex > currentIndex
      ? 'forward'
      : 'backward';

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
    if (!container) return;

    const isActive = view.id === viewId;
    container.classList.toggle('is-active', isActive);
    container.classList.remove('enter-forward', 'enter-backward');

    if (isActive) {
      container.hidden = false;
      if (direction) {
        // Restart animation when switching rapidly between tabs.
        void container.offsetWidth;
        container.classList.add(direction === 'forward' ? 'enter-forward' : 'enter-backward');
      }
    } else {
      container.hidden = true;
    }
  });

  document.title = activeView.title;

  const appTitle = document.getElementById('app-title');
  if (appTitle) appTitle.textContent = activeView.title;

  currentViewId = viewId;
  updateNavIndicator();
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

  window.addEventListener('resize', () => {
    updateNavIndicator();
  });
}
