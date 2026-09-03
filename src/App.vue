<template>
  <div class="app">
    <div class="global-progress" :class="{ active: apiLoading, done: apiLoadingDone }">
      <div class="global-progress-bar"></div>
    </div>
    <!-- 桌面端顶部导航 -->
    <header v-if="!isLoginPage" class="header desktop-nav" :class="{ 'header-electron': isElectronEnv }">
      <div class="header-content">
        <div class="logo">
          <svg width="32" height="32" viewBox="0 0 100 100">
            <rect width="100" height="100" rx="20" fill="#1d1d1f"/>
            <text x="50" y="65" font-size="50" text-anchor="middle" fill="white" font-family="Inter, sans-serif" font-weight="600">教</text>
          </svg>
          <span class="logo-text">嘉言思听教务系统 <span class="version">v{{ appVersion }}</span></span>
        </div>
        <nav class="nav" ref="navRef">
          <router-link to="/" class="nav-item" exact-active-class="active">首页</router-link>
          <router-link to="/students" class="nav-item" active-class="active">学生</router-link>
          <router-link to="/courses" class="nav-item" active-class="active">课程安排</router-link>
          <router-link to="/weekly-schedule" class="nav-item" active-class="active">周排课</router-link>
          <router-link to="/attendance" class="nav-item" active-class="active">点名</router-link>
          <router-link to="/calendar" class="nav-item" active-class="active">日历</router-link>
          <div class="nav-more">
            <button class="nav-item nav-more-btn" :class="{ active: showNavMore }" @click.stop="showNavMore = !showNavMore">
              更多
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="nav-more-dropdown" v-if="showNavMore" @click.stop>
              <router-link to="/teachers" class="nav-more-item" @click="showNavMore = false" v-if="isAdmin">教师管理</router-link>
              <router-link to="/teacher-stats" class="nav-more-item" @click="showNavMore = false">教师统计</router-link>
              <router-link to="/handovers" class="nav-more-item" @click="showNavMore = false" v-if="isAdmin">交接记录</router-link>
            </div>
          </div>
        </nav>
        <div class="header-actions">
          <router-link to="/profile" class="user-info" v-if="useApi && authUser">
            {{ authUser.displayName }}
            <span class="user-role" :class="authUser.role">{{ roleLabel }}</span>
          </router-link>
          <button class="btn btn-secondary btn-sm" @click="showBackupModal = true" v-if="isAdmin">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>数据备份</span>
          </button>
          <button class="btn btn-secondary btn-sm" @click="handleLogout" v-if="useApi && authUser">
            退出登录
          </button>
        </div>
      </div>
    </header>

    <!-- 移动端顶部栏 -->
    <header v-if="!isLoginPage" class="mobile-header">
      <div class="mobile-header-content">
        <div class="mobile-logo">
          <svg width="28" height="28" viewBox="0 0 100 100">
            <rect width="100" height="100" rx="20" fill="#1d1d1f"/>
            <text x="50" y="65" font-size="50" text-anchor="middle" fill="white" font-family="Inter, sans-serif" font-weight="600">教</text>
          </svg>
          <span class="mobile-title">{{ currentPageTitle }}</span>
        </div>
        <div class="mobile-actions">
          <button class="mobile-icon-btn" @click="showBackupModal = true" v-if="isAdmin" title="数据备份">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <router-link to="/profile" class="mobile-icon-btn" v-if="useApi && authUser" title="个人资料">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </router-link>
          <button class="mobile-icon-btn" @click="handleLogout" v-if="useApi && authUser" title="退出">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
    <main class="main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 移动端底部 Tab 栏 -->
    <nav v-if="!isLoginPage" class="mobile-tab-bar">
      <router-link to="/" class="tab-item" exact-active-class="tab-active">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>首页</span>
      </router-link>
      <router-link to="/students" class="tab-item" active-class="tab-active">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span>学生</span>
      </router-link>
      <router-link to="/courses" class="tab-item" active-class="tab-active">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <span>课程安排</span>
      </router-link>
      <router-link to="/weekly-schedule" class="tab-item" active-class="tab-active">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
        </svg>
        <span>周排课</span>
      </router-link>
      <router-link to="/attendance" class="tab-item" active-class="tab-active">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <span>点名</span>
      </router-link>
      <a class="tab-item" :class="{ 'tab-active': showMoreMenu }" @click.prevent="showMoreMenu = !showMoreMenu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
        </svg>
        <span>更多</span>
      </a>
    </nav>

    <!-- 移动端更多菜单 -->
    <div class="mobile-more-overlay" v-if="showMoreMenu" @click="showMoreMenu = false">
      <div class="mobile-more-menu" @click.stop>
        <router-link to="/teachers" class="more-item" @click="showMoreMenu = false" v-if="isAdmin">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>教师管理</span>
        </router-link>
        <router-link to="/teacher-stats" class="more-item" @click="showMoreMenu = false">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <span>教师统计</span>
        </router-link>
        <router-link to="/calendar" class="more-item" @click="showMoreMenu = false">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>日历</span>
        </router-link>
        <router-link to="/handovers" class="more-item" @click="showMoreMenu = false" v-if="isAdmin">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="8.5" cy="7" r="4"/>
            <line x1="20" y1="8" x2="20" y2="14"/>
            <line x1="23" y1="11" x2="17" y2="11"/>
          </svg>
          <span>交接记录</span>
        </router-link>
        <router-link to="/profile" class="more-item" @click="showMoreMenu = false" v-if="useApi && authUser">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>个人资料</span>
        </router-link>
      </div>
    </div>

    <Toast />
    <!-- 数据备份弹窗 -->
    <div class="modal-overlay" v-if="showBackupModal" @click.self="showBackupModal = false">
      <div class="modal">
        <h2 class="modal-title">数据备份与恢复</h2>

        <div class="store-info" v-if="isElectronEnv">
          <div class="store-label">数据存储位置</div>
          <div class="store-path">{{ storePath }}</div>
        </div>

        <div class="backup-section">
          <h3>备份数据</h3>
          <p class="backup-desc">将当前所有数据导出为 SQL 文件，保存到本地</p>
          <button class="btn btn-primary" @click="handleBackup">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            导出备份
          </button>
        </div>
        <div class="backup-divider"></div>
        <div class="backup-section">
          <h3>恢复数据</h3>
          <p class="backup-desc">从 SQL 或 JSON 备份文件恢复数据，将覆盖当前所有数据</p>
          <div class="import-area">
            <input type="file" ref="fileInput" accept=".sql,.json" @change="handleImport" style="display: none" />
            <button class="btn btn-secondary" @click="$refs.fileInput.click()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              选择备份文件
            </button>
          </div>
          <p class="import-warning" v-if="importResult">
            <span :class="importResult.success ? 'success' : 'error'">{{ importResult.message }}</span>
          </p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showBackupModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Toast from './components/Toast.vue'
import { downloadBackup, importData, getStorePath, checkIsElectron } from './utils/storage'
import { useToast } from './composables/useToast'

const useApi = import.meta.env.VITE_USE_API === 'true'
const router = useRouter()
const toast = useToast()

// 全局 API 加载进度条
const apiLoading = ref(false)
const apiLoadingDone = ref(false)
let activeRequests = 0
let doneTimer = null

function onApiStart() {
  activeRequests++
  apiLoading.value = true
  apiLoadingDone.value = false
  clearTimeout(doneTimer)
}

function onApiEnd() {
  activeRequests = Math.max(0, activeRequests - 1)
  if (activeRequests === 0) {
    apiLoadingDone.value = true
    doneTimer = setTimeout(() => {
      apiLoading.value = false
      apiLoadingDone.value = false
    }, 300)
  }
}

onMounted(() => {
  window.addEventListener('api-loading-start', onApiStart)
  window.addEventListener('api-loading-end', onApiEnd)
})

onUnmounted(() => {
  window.removeEventListener('api-loading-start', onApiStart)
  window.removeEventListener('api-loading-end', onApiEnd)
  clearTimeout(doneTimer)
})

const vClickOutside = {
  mounted(el, binding) {
    el._handler = (e) => {
      if (!el.contains(e.target)) binding.value()
    }
    document.addEventListener('click', el._handler, true)
  },
  unmounted(el) {
    document.removeEventListener('click', el._handler, true)
  }
}

const showBackupModal = ref(false)
const showMoreMenu = ref(false)
const showNavMore = ref(false)
const importResult = ref(null)

watch(() => router.currentRoute.value.path, () => {
  showMoreMenu.value = false
  showNavMore.value = false
})
const isElectronEnv = ref(false)
const storePath = ref('')
const appVersion = __APP_VERSION__

const authUser = ref(null)

const currentPageTitle = computed(() => {
  const route = router.currentRoute.value
  const titles = {
    '/': '首页',
    '/students': '学生管理',
    '/teachers': '教师管理',
    '/courses': '课程安排',
    '/attendance': '点名',
    '/calendar': '日历',
    '/weekly-schedule': '周排课',
    '/teacher-stats': '教师统计',
    '/profile': '个人资料',
    '/handovers': '交接记录',
    '/login': '登录'
  }
  return titles[route.path] || '教务系统'
})

const isLoginPage = computed(() => router.currentRoute.value.path === '/login')

onMounted(async () => {
  isElectronEnv.value = checkIsElectron()
  if (isElectronEnv.value) {
    storePath.value = await getStorePath() || ''
  }
  if (useApi) {
    const { useAuthStore } = await import('./stores/auth.js')
    const authStore = useAuthStore()
    authUser.value = authStore.user
    authStore.$subscribe(() => {
      authUser.value = authStore.user
    })
  }
})

function closeDropdowns(e) {
  if (!e.target.closest('.nav-more')) showNavMore.value = false
}
document.addEventListener('click', closeDropdowns)

const isAdmin = computed(() => {
  if (!useApi) return true
  return authUser.value?.role === 'admin'
})

const roleLabel = computed(() => {
  if (!authUser.value) return ''
  return authUser.value.role === 'admin' ? '管理员' : '教师'
})

function handleLogout() {
  if (useApi) {
    import('./stores/auth.js').then(({ useAuthStore }) => {
      const authStore = useAuthStore()
      authStore.logout()
      router.push('/login')
    })
  }
}

async function handleBackup() {
  try {
    await downloadBackup()
    toast.success('备份导出成功')
  } catch (err) {
    toast.error('导出失败: ' + err.message)
  }
}

async function handleImport(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    const result = await importData(e.target.result)
    importResult.value = result

    if (result.success) {
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}
</script>

<style scoped>
.global-progress {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  z-index: 9999;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}

.global-progress.active {
  opacity: 1;
}

.global-progress.done {
  opacity: 1;
}

.global-progress-bar {
  height: 100%;
  width: 0;
  background: var(--color-primary);
  border-radius: 0 2px 2px 0;
  transition: none;
}

.global-progress.active .global-progress-bar {
  animation: progress-advance 8s ease-out forwards;
}

.global-progress.done .global-progress-bar {
  animation: progress-complete 0.3s ease-out forwards;
}

@keyframes progress-advance {
  0% { width: 0; }
  20% { width: 30%; }
  50% { width: 55%; }
  80% { width: 75%; }
  100% { width: 90%; }
}

@keyframes progress-complete {
  from { width: 90%; }
  to { width: 100%; }
}

.app {
  min-height: 100vh;
  background: var(--color-bg-secondary);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

/* ===== 桌面端顶部导航 ===== */
.desktop-nav {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
  overflow: visible;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  overflow: visible;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.version {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-left: 4px;
  vertical-align: middle;
}

.nav {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  overflow: visible;
}

.nav-item {
  padding: 8px 16px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  transition: var(--transition);
  white-space: nowrap;
  flex-shrink: 0;
}

.nav-item:hover {
  color: var(--color-text);
  background: var(--color-bg-secondary);
}

.nav-item.active {
  color: var(--color-primary);
  background: rgba(0, 113, 227, 0.1);
}

.nav-more {
  position: relative;
}

.nav-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  border: none;
  background: none;
  font-family: inherit;
}

.nav-more-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: white;
  border-radius: var(--radius-md);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  min-width: 140px;
  z-index: 200;
  overflow: hidden;
}

.nav-more-item {
  display: block;
  padding: 10px 16px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.15s;
}

.nav-more-item:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-info {
  font-size: 13px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: var(--transition);
}

.user-info:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.user-role {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.user-role.admin {
  background: rgba(0, 113, 227, 0.1);
  color: var(--color-primary);
}

.user-role.teacher {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ===== 移动端顶部栏（默认隐藏）===== */
.mobile-header {
  display: none;
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--color-border);
}

.mobile-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 48px;
}

.mobile-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mobile-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.mobile-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mobile-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-decoration: none;
  transition: var(--transition);
  -webkit-tap-highlight-color: transparent;
}

.mobile-icon-btn:active {
  background: var(--color-bg-secondary);
}

/* ===== 移动端底部 Tab 栏（默认隐藏）===== */
.mobile-tab-bar {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 200;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: saturate(180%) blur(20px);
  border-top: 1px solid var(--color-border);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 0 8px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 10px;
  font-weight: 500;
  transition: color 0.2s;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
}

.tab-item:active {
  color: var(--color-primary);
}

.tab-active {
  color: var(--color-primary) !important;
}

/* ===== 移动端更多菜单 ===== */
.mobile-more-overlay {
  display: none;
}

.more-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  color: var(--color-text);
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.more-item:active {
  background: var(--color-bg-secondary);
}

/* ===== 主内容区 ===== */
.main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ===== 弹窗 ===== */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 20px;
}

.store-info {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
}

.store-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.store-path {
  font-size: 13px;
  color: var(--color-text);
  font-family: monospace;
  word-break: break-all;
}

.backup-section {
  margin-bottom: 20px;
}

.backup-section h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 8px;
}

.backup-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 16px;
}

.backup-divider {
  height: 1px;
  background: var(--color-border);
  margin: 20px 0;
}

.import-area {
  margin-bottom: 12px;
}

.import-warning {
  font-size: 13px;
  margin-top: 12px;
}

.import-warning .success {
  color: var(--color-success);
}

.import-warning .error {
  color: var(--color-danger);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}

/* Electron 环境：为红绿灯按钮留出空间 */
.header-electron .header-content {
  padding-left: 78px;
}

/* ===== 平板/移动端适配 ===== */
@media (max-width: 1100px) {
  .nav-item {
    padding: 6px 10px;
    font-size: 13px;
  }
  .logo-text {
    font-size: 15px;
  }
  .header-actions .btn-sm span {
    display: none;
  }
  .header-actions .btn-sm {
    padding: 8px;
  }
}

@media (max-width: 1024px) {
  .header-content {
    padding: 0 16px;
  }
}

/* ===== 移动端/平板：切换为底部 Tab 导航 ===== */
@media (max-width: 1024px) {
  .desktop-nav {
    display: none;
  }

  .mobile-header {
    display: block;
  }

  .mobile-tab-bar {
    display: flex;
  }

  .mobile-more-overlay {
    display: block;
    position: fixed;
    bottom: 56px;
    left: 8px;
    right: 8px;
    z-index: 250;
  }

  .mobile-more-menu {
    background: white;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .main {
    padding: 16px 12px;
    padding-bottom: calc(70px + env(safe-area-inset-bottom, 0px));
  }

  .modal {
    padding: 20px 16px;
    border-radius: var(--radius-md);
  }
}
</style>
