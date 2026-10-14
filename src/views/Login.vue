<template>
  <div class="login-page" :class="{ 'is-day': sceneTheme === 'day' }">
    <LibraryScene v-model:theme="sceneTheme" />
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

        <p class="login-error" role="alert" v-if="errorMsg">{{ errorMsg }}</p>

        <OfficeButton type="submit" class="btn login-btn" :disabled="loading">
          <span v-if="loading" class="login-spinner"></span>
          <span>{{ loading ? '登录中...' : '登录' }}</span>
        </OfficeButton>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import LibraryScene from '../components/login/LibraryScene.vue'
import { readSceneTheme } from '../components/login/libraryPreferences.js'

const router = useRouter()
const authStore = useAuthStore()
const sceneTheme = ref(readSceneTheme())

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
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
  --login-panel-start: #183747;
  --login-panel-end: #102734;
  --login-border: #c4a064;
  --login-outline: #243948;
  --login-rim: #806842;
  --login-shadow: #090f1666;
  --login-highlight: #688591;
  --login-inset: #071c29;
  --login-control: #0b2433;
  --login-control-hover: #102f43;
  --login-control-border: #68838f;
  --login-control-border-hover: #96adb6;
  --login-text: #e1e9e6;
  --login-placeholder: #bdccd2;
  --login-focus: #ddbc73;
  --login-ring: #d8b36d55;
  --login-selection: #547789;
  --login-selection-text: #fff3cf;
  --login-button: #285579;
  --login-button-stripe: #2a587c;
  --login-button-hover: #32668c;
  --login-button-active: #214967;
  --login-button-text: #f1deb2;
  --login-error: #ffc1a6;
  --login-spinner-muted: #f1deb255;
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #171c23;
  padding: 32px clamp(32px, 5.5vw, 96px);
}

.login-page.is-day {
  --login-panel-start: #f5fbff;
  --login-panel-end: #dceeff;
  --login-border: #ffffff;
  --login-outline: #cae7fc;
  --login-rim: #75afd7;
  --login-shadow: #2c6c9533;
  --login-highlight: #ffffff;
  --login-inset: #a9cee8;
  --login-control: #f9fcff;
  --login-control-hover: #eef7ff;
  --login-control-border: #8db4d2;
  --login-control-border-hover: #5e96bf;
  --login-text: #244f71;
  --login-placeholder: #52718a;
  --login-focus: #337db5;
  --login-ring: #4096cc33;
  --login-selection: #bedef5;
  --login-selection-text: #244f71;
  --login-button: #3377ab;
  --login-button-stripe: #357aad;
  --login-button-hover: #2d6b99;
  --login-button-active: #2b6390;
  --login-button-text: #ffffff;
  --login-error: #995449;
  --login-spinner-muted: #ffffff66;
}

.login-card {
  position: relative;
  z-index: 1;
  background: linear-gradient(135deg, var(--login-panel-start), var(--login-panel-end));
  border: 1px solid var(--login-border);
  border-radius: 10px;
  box-shadow: 0 0 0 2px var(--login-outline), 0 0 0 3px var(--login-rim), 3px 4px var(--login-shadow),
    inset 1px 1px var(--login-highlight), inset -1px -1px var(--login-inset);
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
  border-radius: 6px;
  background: var(--login-control);
  box-shadow: inset 1px 1px var(--login-inset);
  transition: var(--transition);
  outline: none;
  font-family: inherit;
  color: var(--login-text);
}

.form-input :deep(.n-input__input-el) { color: var(--login-text); caret-color: var(--login-focus); }
.form-input :deep(.n-input__border) { border-color: var(--login-control-border); }
.form-input :deep(.n-input__border),
.form-input :deep(.n-input__state-border) { border-radius: 6px; }
.form-input :deep(.n-input__placeholder) { color: var(--login-placeholder); }

.form-input:hover {
  background: var(--login-control-hover);
}

.form-input:hover :deep(.n-input__state-border) {
  border-color: var(--login-control-border-hover);
}

.form-input:focus-within {
  background: var(--login-control-hover);
  box-shadow: 0 0 0 2px var(--login-ring);
}

.form-input:focus-within :deep(.n-input__state-border) {
  border-color: var(--login-focus);
}

.form-input :deep(input::placeholder) {
  color: var(--login-placeholder);
  opacity: 1;
}

.form-input :deep(input::selection) {
  background: var(--login-selection);
  color: var(--login-selection-text);
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-error {
  font-size: 13px;
  color: var(--login-error);
  margin: 0;
  text-align: center;
}

.login-btn {
  width: 100%;
  min-height: 38px;
  margin-top: 3px;
  position: relative;
  border-radius: 6px;
  background: repeating-linear-gradient(0deg, var(--login-button) 0 2px, var(--login-button-stripe) 2px 3px);
  color: var(--login-button-text);
  font-weight: 700;
  letter-spacing: 3px;
  text-shadow: 0 1px var(--login-shadow);
  box-shadow: inset 1px 1px var(--login-highlight), inset -1px -1px var(--login-inset), 0 1px var(--login-rim);
  transition: background-color .2s ease, color .2s ease;
}

.login-btn:hover {
  background: var(--login-button-hover);
  color: var(--login-button-text);
}

.login-btn:active {
  background: var(--login-button-active);
  color: var(--login-button-text);
}

.login-btn:focus-visible {
  outline: 2px solid var(--login-focus);
  outline-offset: 2px;
}

.login-btn :deep(.n-base-wave) {
  --n-ripple-color: var(--login-ring);
}

.login-btn :deep(.n-button__border),
.login-btn :deep(.n-button__state-border) {
  border-color: var(--login-control-border);
  border-radius: 6px;
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.login-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  border: 2px solid var(--login-spinner-muted);
  border-top-color: var(--login-button-text);
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
}

@media (max-width: 599px) {
  .login-page { padding: 24px 20px max(30px, env(safe-area-inset-bottom)); }
  .login-card { max-width: 276px; }
}

@media (max-height: 250px) {
  .login-page { align-items: flex-start; overflow-y: auto; }
}

</style>
