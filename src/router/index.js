import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'

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
    component: () => import('../views/Teachers.vue'),
    meta: { adminOnly: true }
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

const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:'

const router = createRouter({
  history: isElectron ? createWebHashHistory() : createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const useApi = import.meta.env.VITE_USE_API === 'true'
  if (!useApi) {
    return next()
  }

  const userStr = localStorage.getItem('user')
  const isAuthenticated = !!userStr

  if (to.path === '/login') {
    if (isAuthenticated) return next('/')
    return next()
  }

  if (!isAuthenticated) {
    return next('/login')
  }

  if (to.meta.adminOnly) {
    try {
      const user = JSON.parse(userStr)
      if (user.role !== 'admin') {
        return next('/')
      }
    } catch {
      return next('/login')
    }
  }

  next()
})

export default router
