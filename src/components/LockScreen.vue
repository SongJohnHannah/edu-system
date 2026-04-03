<template>
  <Teleport to="body">
    <Transition name="lock-fade">
      <div v-if="isLocked" class="lock-screen" @click="unlock">
        <div class="lock-content">
          <div class="lock-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 class="lock-title">教务管理系统</h2>
          <p class="lock-hint" v-if="!isUnlocking">点击任意位置解锁</p>
          <p class="lock-hint" v-else>解锁中... {{ countdown }}秒</p>
          <div class="lock-progress" v-if="isUnlocking">
            <div class="lock-progress-bar" :style="{ width: progress + '%' }"></div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const isLocked = ref(true)
const isUnlocking = ref(false)
const countdown = ref(3)
const progress = ref(0)

// 自动锁屏时间：5分钟（单位：毫秒）
const AUTO_LOCK_TIME = 5 * 60 * 1000

let timer = null
let autoLockTimer = null

function unlock() {
  if (isUnlocking.value) return

  isUnlocking.value = true
  countdown.value = 3
  progress.value = 0

  const startTime = Date.now()
  const duration = 3000

  timer = setInterval(() => {
    const elapsed = Date.now() - startTime
    progress.value = Math.min(100, (elapsed / duration) * 100)
    countdown.value = Math.ceil((duration - elapsed) / 1000)

    if (elapsed >= duration) {
      clearInterval(timer)
      isLocked.value = false
      isUnlocking.value = false
      // 保存解锁状态到 localStorage
      localStorage.setItem('edu-system-unlocked', 'true')
      // 启动自动锁屏计时器
      resetAutoLockTimer()
    }
  }, 50)
}

// 重置自动锁屏计时器
function resetAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
  }

  if (!isLocked.value) {
    autoLockTimer = setTimeout(() => {
      isLocked.value = true
      localStorage.removeItem('edu-system-unlocked')
    }, AUTO_LOCK_TIME)
  }
}

// 用户活动处理
function handleUserActivity() {
  if (!isLocked.value) {
    resetAutoLockTimer()
  }
}

onMounted(() => {
  // 检查是否已经解锁过
  const unlocked = localStorage.getItem('edu-system-unlocked')
  if (unlocked === 'true') {
    isLocked.value = false
    // 启动自动锁屏计时器
    resetAutoLockTimer()
  }

  // 监听用户活动
  window.addEventListener('mousemove', handleUserActivity)
  window.addEventListener('mousedown', handleUserActivity)
  window.addEventListener('keydown', handleUserActivity)
  window.addEventListener('touchstart', handleUserActivity)
  window.addEventListener('scroll', handleUserActivity)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
  }

  // 移除事件监听
  window.removeEventListener('mousemove', handleUserActivity)
  window.removeEventListener('mousedown', handleUserActivity)
  window.removeEventListener('keydown', handleUserActivity)
  window.removeEventListener('touchstart', handleUserActivity)
  window.removeEventListener('scroll', handleUserActivity)
})
</script>

<style scoped>
.lock-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  /* 毛玻璃效果 */
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.lock-content {
  text-align: center;
  padding: 48px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.lock-icon {
  margin-bottom: 24px;
  color: var(--color-primary, #0071e7);
}

.lock-title {
  font-size: 28px;
  font-weight: 600;
  color: #1d1d1f;
  margin-bottom: 16px;
}

.lock-hint {
  font-size: 16px;
  color: #86868b;
  margin-bottom: 16px;
}

.lock-progress {
  width: 200px;
  height: 4px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin: 0 auto;
}

.lock-progress-bar {
  height: 100%;
  background: var(--color-primary, #0071e7);
  border-radius: 2px;
  transition: width 0.05s linear;
}

/* 过渡动画 */
.lock-fade-enter-active,
.lock-fade-leave-active {
  transition: opacity 0.3s ease;
}

.lock-fade-enter-from,
.lock-fade-leave-to {
  opacity: 0;
}

/* 深色模式支持 */
@media (prefers-color-scheme: dark) {
  .lock-screen {
    background: rgba(29, 29, 31, 0.7);
  }

  .lock-content {
    background: rgba(29, 29, 31, 0.5);
  }

  .lock-title {
    color: #f5f5f7;
  }

  .lock-hint {
    color: #a1a1a6;
  }

  .lock-progress {
    background: rgba(255, 255, 255, 0.1);
  }
}
</style>