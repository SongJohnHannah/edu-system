<template>
  <NConfigProvider :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
  <div class="app">
    <div class="global-progress" :class="{ active: apiLoading, done: apiLoadingDone }">
      <div class="global-progress-bar"></div>
    </div>
    <!-- 桌面端顶部导航 -->
    <header v-if="!isLoginPage" class="header desktop-nav">
      <div class="header-content">
        <div class="logo">
          <BrandLogo />
          <span class="logo-text">教务系统</span>
        </div>
        <button class="tablet-menu-btn" type="button" :aria-expanded="showTabletNav" @click="showTabletNav = !showTabletNav">{{ showTabletNav ? '收起导航' : '打开导航' }}</button>
        <nav class="nav" :class="{ 'tablet-open': showTabletNav }">
          <AppNavLink v-for="item in primaryNavItems" :key="item.to" :item="item" link-class="nav-item" active-class="active" />
          <div class="nav-more">
            <button class="nav-item nav-more-btn" :class="{ active: showNavMore || moreNavActive }" :aria-expanded="showNavMore" @click.stop="showNavMore = !showNavMore; showAccountMenu = false">
              更多
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="nav-more-dropdown" v-if="showNavMore" @click.stop>
              <AppNavLink v-for="item in moreNavItems" :key="item.to" :item="item" link-class="nav-more-item" @select="showNavMore = false" />
            </div>
          </div>
        </nav>
        <div class="header-actions" v-if="authUser">
          <div class="account-menu">
            <button type="button" class="account-trigger" :aria-expanded="showAccountMenu" aria-controls="account-actions" @click.stop="showAccountMenu = !showAccountMenu; showNavMore = false">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>
              <span>账户</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div v-if="showAccountMenu" id="account-actions" class="account-dropdown" @click.stop>
              <div class="account-summary"><strong :title="authUser.displayName">{{ authUser.displayName }}</strong><span v-if="showRoleLabel">{{ roleLabel }}</span></div>
              <AppNavLink :item="accountNavItem" link-class="account-action" @select="showAccountMenu = false" />
              <button v-if="isAdmin" type="button" class="account-action" @click="showAccountMenu = false; showBackupModal = true">数据备份与恢复</button>
              <button type="button" class="account-action account-logout" @click="showAccountMenu = false; handleLogout()">退出登录</button>
              <div class="account-version">v{{ appVersion }}</div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="main" :class="{ 'main-login': isLoginPage }">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </main>

    <!-- 移动端底部 Tab 栏 -->
    <nav v-if="!isLoginPage" class="mobile-tab-bar">
      <AppNavLink v-for="item in primaryNavItems" :key="item.to" :item="item" link-class="tab-item" active-class="tab-active" show-icon :icon-size="22" />
      <button type="button" class="tab-item" :class="{ 'tab-active': showMoreMenu || moreMobileActive }" :aria-expanded="showMoreMenu" aria-controls="mobile-more-actions" @click="showMoreMenu = !showMoreMenu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
        </svg>
        <span>更多</span>
      </button>
    </nav>

    <!-- 移动端更多菜单 -->
    <div class="mobile-more-overlay" v-if="showMoreMenu" @click="showMoreMenu = false">
      <div id="mobile-more-actions" class="mobile-more-menu" @click.stop>
        <AppNavLink v-for="item in moreNavItems" :key="item.to" :item="item" link-class="more-item" show-icon @select="showMoreMenu = false" />
        <AppNavLink v-if="authUser" :item="accountNavItem" link-class="more-item" show-icon @select="showMoreMenu = false" />
        <button v-if="isAdmin" type="button" class="more-item" @click="showMoreMenu = false; showBackupModal = true"><NavIcon name="backup" :size="18" /><span>数据备份与恢复</span></button>
        <button v-if="authUser" type="button" class="more-item more-logout" @click="showMoreMenu = false; handleLogout()"><NavIcon name="logout" :size="18" /><span>退出登录</span></button>
      </div>
    </div>

    <Toast />
    <OfficeModal :show="!!pendingImport" @update:show="value => { if (!value && !importing) pendingImport = null }"><div class="modal"><h2 class="modal-title">确认恢复备份</h2><p>{{ pendingImport?.name }}</p><p>恢复将覆盖当前业务数据和备份中包含的账号。请确认已保存当前备份。</p><div class="modal-actions"><OfficeButton :disabled="importing" @click="pendingImport = null">取消</OfficeButton><OfficeButton class="btn btn-primary" :disabled="importing" @click="confirmImport">{{ importing ? '正在恢复…' : '确认恢复' }}</OfficeButton></div></div></OfficeModal>
    <!-- 数据备份弹窗 -->
    <OfficeModal v-model:show="showBackupModal" @update:show="value => { if (!value) { showBackupModal = false } }">
      <div class="modal">
        <h2 class="modal-title">数据备份与恢复</h2>

        <div class="backup-section">
          <h3>备份数据</h3>
          <p class="backup-desc">将当前所有数据导出为 SQL 文件，保存到本地</p>
          <OfficeButton class="btn btn-primary" @click="handleBackup">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            导出备份
          </OfficeButton>
        </div>
        <div class="backup-divider"></div>
        <div class="backup-section">
          <h3>恢复数据</h3>
          <p class="backup-desc">从 SQL 或 JSON 备份文件恢复数据，将覆盖当前所有数据</p>
          <div class="import-area">
            <input type="file" ref="fileInput" accept=".sql,.json" @change="handleImport" style="display: none" />
            <OfficeButton class="btn btn-secondary" @click="$refs.fileInput.click()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              选择备份文件
            </OfficeButton>
          </div>
          <p class="import-warning" v-if="importResult">
            <span :class="importResult.success ? 'success' : 'error'">{{ importResult.message }}</span>
          </p>
        </div>
        <div class="modal-actions">
          <OfficeButton class="btn btn-secondary" @click="showBackupModal = false">关闭</OfficeButton>
        </div>
      </div>
    </OfficeModal>
  </div>
  </NConfigProvider>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Toast from './components/Toast.vue'
import BrandLogo from './components/BrandLogo.vue'
import AppNavLink from './components/AppNavLink.vue'
import NavIcon from './components/NavIcon.vue'
import { NConfigProvider, zhCN, dateZhCN } from 'naive-ui'
import { navigationItems } from './navigation.js'
import { downloadBackup, importData } from './utils/storage'
import { useToast } from './composables/useToast'

const themeOverrides = {
  common: {
    primaryColor: '#4178B9', primaryColorHover: '#31689F', primaryColorPressed: '#285A8C',
    primaryColorSuppl: '#4178B9', textColorBase: '#26384D', textColor2: '#63758A',
    borderColor: '#DBE5EF', bodyColor: '#F8FAFD', cardColor: '#FFFFFF',
    borderRadius: '10px', fontFamily: "Inter, 'Microsoft YaHei', 'PingFang SC', sans-serif"
  }
}
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

const showBackupModal = ref(false)
const showMoreMenu = ref(false)
const showNavMore = ref(false)
const showAccountMenu = ref(false)
const showTabletNav = ref(false)
const importResult = ref(null)
const pendingImport = ref(null)
const importing = ref(false)

watch(() => router.currentRoute.value.path, () => {
  showMoreMenu.value = false
  showNavMore.value = false
  showAccountMenu.value = false
  showTabletNav.value = false
})
const appVersion = __APP_VERSION__

const authUser = ref(null)

const isLoginPage = computed(() => router.currentRoute.value.path === '/login')
const isAdmin = computed(() => authUser.value?.role === 'admin')
const visibleNavItems = computed(() => navigationItems.filter(item => !item.adminOnly || isAdmin.value))
const primaryNavItems = computed(() => visibleNavItems.value.filter(item => item.section === 'primary'))
const moreNavItems = computed(() => visibleNavItems.value.filter(item => item.section === 'more'))
const accountNavItem = navigationItems.find(item => item.section === 'account')
const moreNavActive = computed(() => moreNavItems.value.some(item => item.to === router.currentRoute.value.path))
const moreMobileActive = computed(() => moreNavActive.value || [accountNavItem.to, '/hours-history'].includes(router.currentRoute.value.path))

onMounted(async () => {
  const { useAuthStore } = await import('./stores/auth.js')
  const authStore = useAuthStore()
  authUser.value = authStore.user
  authStore.$subscribe(() => {
    authUser.value = authStore.user
  })
})

function closeDropdowns(e) {
  if (!e.target.closest('.nav-more')) showNavMore.value = false
  if (!e.target.closest('.account-menu')) showAccountMenu.value = false
}
function closeMenusOnEscape(e) {
  if (e.key !== 'Escape') return
  showNavMore.value = false
  showAccountMenu.value = false
  showMoreMenu.value = false
  showTabletNav.value = false
}
onMounted(() => document.addEventListener('click', closeDropdowns))
onUnmounted(() => document.removeEventListener('click', closeDropdowns))
onMounted(() => document.addEventListener('keydown', closeMenusOnEscape))
onUnmounted(() => document.removeEventListener('keydown', closeMenusOnEscape))

const roleLabel = computed(() => {
  if (!authUser.value) return ''
  return authUser.value.role === 'admin' ? '管理员' : '教师'
})
const showRoleLabel = computed(() => !authUser.value?.displayName?.includes(roleLabel.value))

function handleLogout() {
  import('./stores/auth.js').then(({ useAuthStore }) => {
    const authStore = useAuthStore()
    authStore.logout()
    router.push('/login')
  })
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
  importResult.value = null
  pendingImport.value = null
  try {
    pendingImport.value = { name: file.name, content: await file.text() }
  } catch {
    importResult.value = { success: false, message: '备份文件读取失败，请重新选择' }
  } finally {
    event.target.value = ''
  }
}
async function confirmImport() {
  if (importing.value || !pendingImport.value) return
  importing.value = true
  try {
    const result = await importData(pendingImport.value.content)
    importResult.value = result
    if (result.success) { pendingImport.value = null; setTimeout(() => window.location.reload(), 1500) }
    else toast.error(result.message)
  } finally { importing.value = false }
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
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
  overflow: visible;
}

.header-content {
  max-width: 1320px;
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
  flex: none;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
}

.nav {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  overflow: visible;
}
.tablet-menu-btn { display: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: white; color: var(--color-text); padding: 8px 12px; font: inherit; cursor: pointer; }

.nav-item {
  padding: 8px 12px;
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
  color: var(--color-primary-text);
  background: var(--color-selected);
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
  flex: none;
}

.account-menu { position: relative; }
.account-trigger { display: inline-flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: white; color: var(--color-text-secondary); font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
.account-trigger:hover, .account-trigger[aria-expanded="true"] { background: var(--color-bg-secondary); color: var(--color-text); }
.account-trigger:focus-visible, .nav-more-btn:focus-visible, .tablet-menu-btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.account-dropdown { position: absolute; top: calc(100% + 7px); right: 0; z-index: 200; min-width: 188px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: white; box-shadow: var(--shadow-lg); }
.account-summary { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 13px 15px; border-bottom: 1px solid var(--color-border); color: var(--color-text); font-size: 13px; }
.account-summary strong { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-summary span { flex: none; color: var(--color-text-secondary); font-size: 11px; }
.account-action { display: block; width: 100%; padding: 10px 15px; border: 0; background: white; color: var(--color-text); text-align: left; text-decoration: none; font: inherit; font-size: 13px; cursor: pointer; }
.account-action:hover, .account-action:focus-visible { background: var(--color-bg-secondary); }
.account-logout { border-top: 1px solid var(--color-border); }
.account-version { padding: 4px 15px 10px; color: var(--color-text-secondary); font-size: 11px; }

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
  border: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
}

.tab-item:active {
  color: var(--color-primary-text);
}

.tab-active {
  color: var(--color-primary-text) !important;
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

button.more-item { width: 100%; border: 0; background: white; text-align: left; font-family: inherit; cursor: pointer; }
.more-logout { border-top: 1px solid var(--color-border) !important; }

.more-item:active {
  background: var(--color-bg-secondary);
}

/* ===== 主内容区 ===== */
.main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
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

/* ===== 平板/移动端适配 ===== */
@media (max-width: 1100px) {
  .nav-item {
    padding: 6px 10px;
    font-size: 13px;
  }
  .logo-text {
    font-size: 15px;
  }
}

@media (max-width: 1240px) {
  .header-content {
    padding: 0 16px;
  }
}

@media (min-width: 600px) and (max-width: 1240px) {
  .header-content { min-height: 56px; height: auto; flex-wrap: wrap; }
  .tablet-menu-btn { display: inline-flex; margin-left: auto; margin-right: 12px; }
  .nav { display: none; order: 3; width: 100%; flex-wrap: wrap; padding: 0 0 12px; }
  .nav.tablet-open { display: flex; }
  .logo, .header-actions { min-height: 56px; }
  .main { padding: 24px 20px; }
}

/* ===== 手机底部导航 ===== */
@media (max-width: 599px) {
  .desktop-nav {
    display: none;
  }

  .mobile-tab-bar {
    display: flex;
  }

  .mobile-more-overlay {
    display: flex;
    position: fixed;
    inset: 0;
    align-items: flex-end;
    z-index: 190;
    padding: 0 8px calc(60px + env(safe-area-inset-bottom, 0px));
    background: rgba(38, 56, 77, .22);
  }

  .mobile-more-menu {
    width: 100%;
    max-height: calc(100dvh - 120px);
    overflow-y: auto;
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
    padding-top: calc(16px + env(safe-area-inset-top, 0px));
    padding-bottom: calc(70px + env(safe-area-inset-bottom, 0px));
  }

  .modal {
    padding: 20px 16px;
    border-radius: var(--radius-md);
  }
}
.main.main-login { max-width: none; width: 100%; padding: 0; margin: 0; }
</style>
