import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setTokens, clearTokens } from '../utils/api.js'

export const useAuthStore = defineStore('auth', () => {
  let savedUser = null
  try { savedUser = JSON.parse(localStorage.getItem('user') || 'null') } catch { clearTokens() }
  const user = ref(savedUser)
  const isAuthenticated = computed(() =>
    (user.value?.role === 'admin' || (user.value?.role === 'teacher' && !!user.value.teacherId)) &&
    !!(localStorage.getItem('access_token') || localStorage.getItem('refresh_token')))

  const isAdmin = computed(() => user.value?.role === 'admin')
  const isTeacher = computed(() => user.value?.role === 'teacher')
  const displayName = computed(() => user.value?.displayName || '')
  const role = computed(() => user.value?.role || '')
  const teacherId = computed(() => user.value?.teacherId || null)

  function setLocalUser(u) {
    user.value = u
    localStorage.setItem('user', JSON.stringify(u))
  }

  async function login(username, password) {
    const result = await api.post('/auth/login', { username, password })
    setTokens(result.accessToken, result.refreshToken)
    setLocalUser(result.user)
    return result.user
  }

  function logout() {
    clearTokens()
    localStorage.removeItem('user')
    user.value = null
  }

  function loadFromStorage() {
    const saved = localStorage.getItem('user')
    if (saved) {
      try { user.value = JSON.parse(saved) } catch { logout() }
    }
  }

  return {
    user,
    isAuthenticated,
    isAdmin,
    isTeacher,
    displayName,
    role,
    teacherId,
    login,
    logout,
    loadFromStorage
  }
})
