import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

export type TabId = 'planner' | 'thyroid' | 'diet' | 'profile';

export interface TabConfig {
  id: TabId;
  label: string;
  path: string;
  title: string;
}

/** Single source of truth for navigation, used by AppTabs and App.vue. */
export const TABS: readonly TabConfig[] = [
  { id: 'planner', label: 'Energy Planner', path: '/planner', title: 'Energy Planner' },
  { id: 'thyroid', label: 'Thyroid Checker', path: '/thyroid', title: 'Thyroid Checker' },
  { id: 'diet', label: 'Diet Advisor', path: '/diet', title: 'Diet Advisor' },
  { id: 'profile', label: 'Profile', path: '/profile', title: 'Profile' },
];

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
  { path: '/:pathMatch(.*)*', redirect: '/planner' },
];

export const router = createRouter({
  // Hash history avoids file:// route failures in packaged Tauri builds.
  history: createWebHashHistory(),
  routes,
});

router.afterEach((to) => {
  const title = to.meta.title;
  if (typeof title === 'string') document.title = title;
});
