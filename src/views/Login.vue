<template>
  <div class="login-page">
    <LibraryScene />
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

const router = useRouter()
const authStore = useAuthStore()

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

.login-card {
  position: relative;
  z-index: 1;
  background: linear-gradient(135deg, #18374a, #102333);
  border: 1px solid #c29a4a;
  border-radius: 3px;
  box-shadow: 0 0 0 2px #352c1d, 0 0 0 3px #8e6b32, 3px 4px #100e13,
    inset 1px 1px #63818a, inset -1px -1px #081b29;
  padding: 18px 19px 20px;
  width: 100%;
  max-width: 276px;
}

.login-card::before,
.login-card::after {
  content: '';
  position: absolute;
  width: 9px;
  height: 9px;
  border: 1px solid #e6c57b;
  background: #bb8d35;
  box-shadow: inset 2px 2px #eccd87, inset -2px -2px #735021;
  pointer-events: none;
}
.login-card::before { top: -3px; left: -3px; }
.login-card::after { right: -3px; bottom: -3px; }

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
  border-radius: 2px;
  background: #0b202f;
  box-shadow: inset 1px 1px #04111c;
  transition: var(--transition);
  outline: none;
  font-family: inherit;
  color: #dbe5e3;
}

.form-input :deep(.n-input__input-el) { color: #dbe5e3; caret-color: #f0d68e; }
.form-input :deep(.n-input__border) { border-color: #506b7b; }
.form-input :deep(.n-input__placeholder) { color: #bdccd2; }

.form-input:hover {
  background: #10283a;
}

.form-input:hover :deep(.n-input__state-border) {
  border-color: #95a9b0;
}

.form-input:focus-within {
  background: #10283a;
  box-shadow: 0 0 0 2px #d8b36d55;
}

.form-input:focus-within :deep(.n-input__state-border) {
  border-color: #ddbc73;
}

.form-input :deep(input::placeholder) {
  color: #bdccd2;
  opacity: 1;
}

.form-input :deep(input::selection) {
  background: #547789;
  color: #fff3cf;
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-error {
  font-size: 13px;
  color: #ffc1a6;
  margin: 0;
  text-align: center;
}

.login-btn {
  width: 100%;
  min-height: 38px;
  margin-top: 3px;
  position: relative;
  border-radius: 2px;
  background: repeating-linear-gradient(0deg, #24446a 0 2px, #25476e 2px 3px);
  color: #f1d992;
  font-weight: 700;
  letter-spacing: 3px;
  text-shadow: 1px 1px #142435;
  box-shadow: inset 1px 1px #5482a7, inset -1px -1px #11263e, 0 1px #6e5023;
  transition: background-color .2s ease, color .2s ease;
}

.login-btn:hover {
  background: #305580;
  color: #ffe8ab;
}

.login-btn:active {
  background: #1b3554;
  color: #ffe8ab;
}

.login-btn:focus-visible {
  outline: 2px solid #f2ca7b;
  outline-offset: 2px;
}

.login-btn :deep(.n-base-wave) {
  --n-ripple-color: #dfba6b66;
}

.login-btn :deep(.n-button__border),
.login-btn :deep(.n-button__state-border) {
  border-color: #dfba6b;
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
  border: 2px solid #f1d99255;
  border-top-color: #f1d992;
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
