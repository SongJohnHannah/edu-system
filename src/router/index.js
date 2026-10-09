import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue')
  },
  {
    path: '/students',
    name: 'Students',
    component: () => import('../views/Students.vue')
  },
  {
    path: '/hours-history',
    name: 'HoursHistory',
    component: () => import('../views/HoursHistory.vue')
  },
  {
    path: '/teachers',
    name: 'Teachers',
    component: () => import('../views/Teachers.vue')
  },
  {
    path: '/courses',
    name: 'Courses',
    component: () => import('../views/Courses.vue')
  },
  {
    path: '/attendance',
    name: 'Attendance',
    component: () => import('../views/Attendance.vue')
  },
  {
    path: '/calendar',
    name: 'Calendar',
    component: () => import('../views/Calendar.vue')
  },
  {
    path: '/weekly-schedule',
    name: 'WeeklySchedule',
    component: () => import('../views/WeeklySchedule.vue')
  },
  {
    path: '/trial-bookings',
    name: 'TrialBookings',
    component: () => import('../views/TrialBookings.vue')
  },
  {
    path: '/teacher-stats',
    name: 'TeacherStats',
    component: () => import('../views/TeacherStats.vue')
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('../views/Profile.vue')
  },
  {
    path: '/handovers',
    name: 'HandoverHistory',
    component: () => import('../views/HandoverHistory.vue'),
    meta: { adminOnly: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const userStr = localStorage.getItem('user')
  let user = null
  try { user = JSON.parse(userStr || 'null') } catch { /* Invalid cached login. */ }
  const isAuthenticated = (user?.role === 'admin' || (user?.role === 'teacher' && !!user.teacherId)) &&
    !!(localStorage.getItem('access_token') || localStorage.getItem('refresh_token'))

  if (to.path === '/login') {
    if (isAuthenticated) return next('/')
    return next()
  }

  if (!isAuthenticated) {
    return next('/login')
  }

  if (to.meta.adminOnly) {
    if (user.role !== 'admin') return next('/')
  }

  next()
})

export default router
