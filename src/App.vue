<template>
  <div class="app">
    <!-- 锁屏 -->
    <LockScreen />

    <header class="header">
      <div class="header-content">
        <div class="logo">
          <svg width="32" height="32" viewBox="0 0 100 100">
            <rect width="100" height="100" rx="20" fill="#1d1d1f"/>
            <text x="50" y="65" font-size="50" text-anchor="middle" fill="white" font-family="Inter, sans-serif" font-weight="600">教</text>
          </svg>
          <span class="logo-text">教务管理系统</span>
        </div>
        <nav class="nav">
          <router-link to="/" class="nav-item" exact-active-class="active">首页</router-link>
          <router-link to="/students" class="nav-item" active-class="active">学生</router-link>
          <router-link to="/teachers" class="nav-item" active-class="active">教师</router-link>
          <router-link to="/courses" class="nav-item" active-class="active">课程安排</router-link>
          <router-link to="/attendance" class="nav-item" active-class="active">点名</router-link>
          <router-link to="/calendar" class="nav-item" active-class="active">日历</router-link>
          <router-link to="/teacher-stats" class="nav-item" active-class="active">教师统计</router-link>
        </nav>
        <div class="header-actions">
          <button class="btn btn-secondary btn-sm" @click="showBackupModal = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>数据备份</span>
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
          <p class="backup-desc">将当前所有数据导出为 JSON 文件，保存到本地</p>
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
          <p class="backup-desc">从备份文件恢复数据，将覆盖当前所有数据</p>
          <div class="import-area">
            <input type="file" ref="fileInput" accept=".json" @change="handleImport" style="display: none" />
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
import { ref, onMounted } from 'vue'
import LockScreen from './components/LockScreen.vue'
import { downloadBackup, importData, getStorePath, checkIsElectron } from './utils/storage'

const showBackupModal = ref(false)
const importResult = ref(null)
const isElectronEnv = ref(false)
const storePath = ref('')

onMounted(async () => {
  isElectronEnv.value = checkIsElectron()
  if (isElectronEnv.value) {
    storePath.value = await getStorePath() || ''
  }
})

function handleBackup() {
  downloadBackup()
}

function handleImport(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const result = importData(e.target.result)
    importResult.value = result

    if (result.success) {
      // 刷新页面以加载新数据
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    }
  }
  reader.readAsText(file)

  // 清空文件输入，允许重复选择同一文件
  event.target.value = ''
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  background: var(--color-bg-secondary);
}

.header {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
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

.nav {
  display: flex;
  gap: 8px;
}

.nav-item {
  padding: 8px 16px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  transition: var(--transition);
}

.nav-item:hover {
  color: var(--color-text);
  background: var(--color-bg-secondary);
}

.nav-item.active {
  color: var(--color-primary);
  background: rgba(0, 113, 227, 0.1);
}

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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

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
}

.modal {
  background: white;
  border-radius: var(--radius-lg);
  padding: 32px;
  width: 100%;
  max-width: 480px;
}

.modal-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
}

.store-info {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 24px;
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
  margin-bottom: 24px;
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
  margin: 24px 0;
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
  margin-top: 24px;
}

/* 响应式布局 */
@media (max-width: 900px) {
  .header-content {
    padding: 0 16px;
  }

  .nav-item {
    padding: 6px 12px;
    font-size: 13px;
  }

  .logo-text {
    font-size: 16px;
  }

  .header-actions .btn-sm span {
    display: none;
  }

  .header-actions .btn-sm {
    padding: 8px;
  }
}

@media (max-width: 768px) {
  .header-content {
    height: auto;
    flex-wrap: wrap;
    padding: 12px 16px;
  }

  .logo {
    flex-shrink: 0;
  }

  .nav {
    width: 100%;
    order: 3;
    margin-top: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .nav::-webkit-scrollbar {
    display: none;
  }

  .nav-item {
    padding: 6px 12px;
    font-size: 13px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .header-actions {
    margin-left: auto;
  }

  .btn-sm {
    padding: 6px 10px;
  }

  .btn-sm svg {
    width: 14px;
    height: 14px;
  }

  .main {
    padding: 24px 16px;
  }
}

@media (max-width: 480px) {
  .logo-text {
    font-size: 15px;
  }

  .logo svg {
    width: 28px;
    height: 28px;
  }
}
</style>