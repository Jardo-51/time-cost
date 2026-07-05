import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/pages/HomePage.vue'),
    },
    {
      path: '/stats',
      component: () => import('@/pages/StatsPage.vue'),
    },
    {
      path: '/settings',
      component: () => import('@/pages/SettingsPage.vue'),
    },
    {
      path: '/settings/categories',
      component: () => import('@/pages/CategoriesPage.vue'),
    },
    {
      path: '/settings/templates',
      component: () => import('@/pages/TemplatesPage.vue'),
    },
  ],
})

export default router
