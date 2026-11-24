import { ref } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { confirmLeaveSettings, discardSettingsDrafts } from '../features/settings/unsaved.ts';

export type TabId = 'planner' | 'thyroid' | 'diet' | 'profile';

export interface TabConfig {
  id: TabId;
  label: string;
  path: string;
  title: string;
  /** 24x24 stroke paths used when the header collapses to icon-only tabs. */
  icon: readonly string[];
}

/** Single source of truth for navigation, used by AppTabs and App.vue. */
export const TABS: readonly TabConfig[] = [
  {
    id: 'planner',
    label: 'Energy Planner',
    path: '/planner',
    title: 'Energy Planner',
    icon: [
      'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
      'M8 3v4M16 3v4M3 10h18',
      'M8 14h2M14 14h2M8 17h2M14 17h2',
    ],
  },
  {
    id: 'thyroid',
    label: 'Thyroid Checker',
    path: '/thyroid',
    title: 'Thyroid Checker',
    icon: ['M3 12h4l2.5-6 4 12 2.5-6h5'],
  },
  {
    id: 'diet',
    label: 'Diet Advisor',
    path: '/diet',
    title: 'Diet Advisor',
    icon: [
      'M20 4c-8.5 0-14 3.5-14 10a6 6 0 0 0 6 6c6.5 0 10-5.5 8-16z',
      'M4 20c2-4 5-7 10-9',
    ],
  },
  {
    id: 'profile',
    label: 'Profile',
    path: '/profile',
    title: 'Profile',
    icon: [
      'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      'M4 21a8 8 0 0 1 16 0',
    ],
  },
];

/** Left-hand section list and child route definitions for Settings. */
export const SETTINGS_SECTIONS: readonly { id: string; label: string; path: string; title: string }[] = [
  { id: 'ai', label: 'AI', path: '/settings/ai', title: 'AI settings' },
  { id: 'appearance', label: 'Appearance', path: '/settings/appearance', title: 'Appearance' },
  { id: 'language', label: 'Language and formats', path: '/settings/language', title: 'Language and formats' },
  { id: 'privacy', label: 'Data and privacy', path: '/settings/privacy', title: 'Data and privacy' },
  { id: 'about', label: 'About', path: '/settings/about', title: 'About' },
];

const TAB_PATHS = new Set(TABS.map((tab) => tab.path));

function initialBackPath(): string {
  try {
    const saved = sessionStorage.getItem('settings-back-path');
    if (saved && TAB_PATHS.has(saved)) return saved;
  } catch {
    // Storage may be unavailable in private mode; the planner is a safe default.
  }
  return TAB_PATHS.has('/planner') ? '/planner' : [...TAB_PATHS][0];
}

/** The last tab visited before Settings, used by the Settings Back link. */
export const settingsBackPath = ref(initialBackPath());

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/planner' },
  {
    path: '/planner',
    name: 'planner',
    component: () => import('../views/PlannerView.vue'),
    meta: { title: 'Energy Planner' },
  },
  {
    path: '/thyroid',
    name: 'thyroid',
    component: () => import('../views/ThyroidView.vue'),
    meta: { title: 'Thyroid Checker' },
  },
  {
    path: '/diet',
    name: 'diet',
    component: () => import('../views/DietView.vue'),
    meta: { title: 'Diet Advisor' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
    meta: { title: 'Profile' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { title: 'Settings' },
    children: [
      { path: '', redirect: { name: 'ai-settings' } },
      {
        path: 'ai',
        name: 'ai-settings',
        component: () => import('../features/settings/AiSettingsSection.vue'),
        meta: { title: 'AI settings' },
      },
      {
        path: 'appearance',
        name: 'appearance-settings',
        component: () => import('../features/settings/AppearanceSettingsSection.vue'),
        meta: { title: 'Appearance' },
      },
      {
        path: 'language',
        name: 'language-settings',
        component: () => import('../features/settings/LanguageSettingsSection.vue'),
        meta: { title: 'Language and formats' },
      },
      {
        path: 'privacy',
        name: 'privacy-settings',
        component: () => import('../features/settings/PrivacySettingsSection.vue'),
        meta: { title: 'Data and privacy' },
      },
      {
        path: 'about',
        name: 'about-settings',
        component: () => import('../features/settings/AboutSettingsSection.vue'),
        meta: { title: 'About' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/planner' },
];

export const router = createRouter({
  // Hash history avoids file:// route failures in packaged Tauri builds.
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to, from) => {
  if (from.path.startsWith('/settings') && to.path !== from.path) {
    const allowed = await confirmLeaveSettings();
    if (!allowed) return false;
    discardSettingsDrafts();
  }
  if (TAB_PATHS.has(to.path)) {
    settingsBackPath.value = to.path;
    try {
      sessionStorage.setItem('settings-back-path', to.path);
    } catch {
      // Ignore private-mode storage failures.
    }
  }
  return true;
});

router.afterEach((to) => {
  const title = to.meta.title;
  if (typeof title === 'string') document.title = title;
});
