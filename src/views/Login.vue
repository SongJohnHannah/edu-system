<template>
  <div class="login-page">
    <div class="login-media" aria-hidden="true">
      <video ref="videoElement" class="login-video" autoplay muted loop playsinline preload="metadata" :poster="loginPoster">
        <source :src="loginVideo" type="video/mp4" />
      </video>
    </div>
    <div class="login-tint" aria-hidden="true"></div>
    <div class="login-card">
      <form class="login-form" aria-label="登录" @submit.prevent="handleLogin">
        <div class="form-group">
          <OfficeInput
            v-model="username"
            type="text"
            class="form-input"
            input-aria-label="用户名"
            placeholder="请输入用户名"
            autocomplete="username"
            required
            :disabled="loading"
          />
        </div>
        <div class="form-group">
          <OfficeInput
            v-model="password"
            type="password"
            class="form-input"
            input-aria-label="密码"
            placeholder="请输入密码"
            autocomplete="current-password"
            required
            :disabled="loading"
          />
        </div>

        <p class="login-error" v-if="errorMsg">{{ errorMsg }}</p>

        <OfficeButton type="submit" class="btn login-btn" :disabled="loading">
          <span v-if="loading" class="login-spinner"></span>
          <span>{{ loading ? '登录中...' : '登录' }}</span>
        </OfficeButton>
      </form>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import loginVideo from '../assets/login-scene.mp4'
import loginPoster from '../assets/login-scene-poster.webp'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const videoElement = ref(null)
let motionPreference

function syncMotionPreference() {
  if (motionPreference.matches) videoElement.value?.pause()
  else videoElement.value?.play().catch(() => {})
}

onMounted(() => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionPreference.addEventListener('change', syncMotionPreference)
  syncMotionPreference()
})

onBeforeUnmount(() => motionPreference?.removeEventListener('change', syncMotionPreference))

async function handleLogin() {
  if (loading.value) return
  errorMsg.value = ''
  loading.value = true

  try {
    await authStore.login(username.value, password.value)
    router.push('/')
  } catch (err) {
    errorMsg.value = err.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #dceaf4;
  padding: 32px clamp(32px, 5.5vw, 96px);
}

.login-media,
.login-tint {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.login-media {
  z-index: -2;
  background: #dceaf4 url('../assets/login-scene-poster.webp') center / cover no-repeat;
}

.login-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.login-tint {
  z-index: -1;
  background:
    linear-gradient(90deg, transparent 42%, rgba(241, 247, 251, .22) 66%, rgba(241, 247, 251, .62) 100%),
    linear-gradient(180deg, rgba(243, 248, 251, .04), rgba(236, 244, 249, .16));
}

.login-card {
  position: relative;
  background: rgba(255, 255, 255, .27);
  border: 1px solid rgba(255, 255, 255, .5);
  backdrop-filter: blur(8px) saturate(108%);
  -webkit-backdrop-filter: blur(8px) saturate(108%);
  border-radius: 16px;
  box-shadow: 0 16px 46px rgba(44, 75, 111, .14);
  padding: 18px 19px 20px;
  width: 100%;
  max-width: 276px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-input {
  width: 100%;
  min-height: 38px;
  padding: 0;
  font-size: 13px;
  border: none;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .48);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  transition: var(--transition);
  outline: none;
  font-family: inherit;
  color: var(--color-text);
}

.form-input:hover {
  background: rgba(255, 255, 255, .58);
}

.form-input:hover :deep(.n-input__state-border) {
  border-color: rgba(72, 100, 117, .38);
}

.form-input:focus-within {
  background: rgba(255, 255, 255, .64);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, .52), 0 0 0 4px rgba(72, 100, 117, .18);
}

.form-input:focus-within :deep(.n-input__state-border) {
  border-color: rgba(72, 100, 117, .7);
}

.form-input :deep(input::placeholder) {
  color: #394e61;
  opacity: 1;
}

.form-input :deep(input::selection) {
  background: rgba(117, 147, 159, .42);
  color: #203b55;
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-input::placeholder {
  color: var(--color-text-secondary);
}

.login-error {
  font-size: 13px;
  color: var(--color-danger);
  margin: 0;
  text-align: center;
}

.login-btn {
  width: 100%;
  min-height: 38px;
  margin-top: 3px;
  position: relative;
  background: rgba(255, 255, 255, .54);
  color: #2a4660;
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  transition: background-color .2s ease, color .2s ease;
}

.login-btn:hover {
  background: rgba(255, 255, 255, .72);
  color: #203b55;
}

.login-btn:active {
  background: rgba(255, 255, 255, .8);
  color: #203b55;
}

.login-btn:focus-visible {
  outline: 2px solid rgba(72, 100, 117, .7);
  outline-offset: 2px;
}

.login-btn :deep(.n-base-wave) {
  --n-ripple-color: rgba(72, 100, 117, .28);
}

.login-btn :deep(.n-button__border),
.login-btn :deep(.n-button__state-border) {
  border-color: rgba(255, 255, 255, .52);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.login-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1100px) {
  .login-page {
    align-items: center;
    justify-content: center;
    padding: 32px 24px max(32px, env(safe-area-inset-bottom));
  }
  .login-tint {
    background: linear-gradient(180deg, transparent 28%, rgba(241, 247, 251, .16) 50%, rgba(241, 247, 251, .76) 100%);
  }
}

@media (max-width: 599px) {
  .login-page { padding: 24px 20px max(30px, env(safe-area-inset-bottom)); }
  .login-card { max-width: 276px; }
}

@media (max-height: 250px) {
  .login-page { align-items: flex-start; overflow-y: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .login-video { display: none; }
}
</style>
