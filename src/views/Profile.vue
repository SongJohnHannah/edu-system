<template>
  <div class="profile fade-in">
    <div class="page-header">
      <h1 class="page-title">个人账户</h1>
      <p class="page-subtitle">管理您的账户信息</p>
    </div>

    <div class="profile-section" v-if="loadingProfile">正在加载账户资料…</div>
    <div class="profile-section" v-else-if="profileError">
      <p>账户资料加载失败，请重试</p>
      <OfficeButton class="btn btn-secondary" @click="loadProfile">重试</OfficeButton>
    </div>
    <template v-else>
    <div class="profile-card">
      <div class="profile-avatar">{{ (profile.displayName || '?').charAt(0) }}</div>
      <div class="profile-basic">
        <h2>{{ profile.displayName }}</h2>
        <span class="profile-role" :class="profile.role">{{ profile.role === 'admin' ? '管理员' : '教师' }}</span>
      </div>
    </div>

    <div class="profile-section">
      <h3 class="section-title">账户信息</h3>
      <div class="info-grid">
        <div class="info-item">
          <label>用户名</label>
          <span>{{ profile.username }}</span>
        </div>
        <div class="info-item" v-if="profile.teacher && profile.teacher.phone">
          <label>联系电话</label>
          <span>{{ profile.teacher.phone }}</span>
        </div>
        <div class="info-item" v-if="profile.teacher && profile.teacher.subject">
          <label>教授科目</label>
          <span>{{ profile.teacher.subject }}</span>
        </div>
      </div>
    </div>

    <!-- 教师可修改姓名 -->
    <div class="profile-section" v-if="profile.role === 'teacher'">
      <h3 class="section-title">修改姓名</h3>
      <form @submit.prevent="handleUpdateName" class="profile-form">
        <div class="form-group">
          <label class="form-label">姓名</label>
          <OfficeInput type="text" class="input" v-model="nameForm.displayName" required maxlength="100" />
        </div>
        <OfficeButton type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</OfficeButton>
      </form>
    </div>

    <!-- 修改密码 -->
    <div class="profile-section">
      <h3 class="section-title">修改密码</h3>
      <form @submit.prevent="handleChangePassword" class="profile-form">
        <div class="form-group">
          <label class="form-label">旧密码</label>
          <OfficeInput type="password" class="input" v-model="passwordForm.oldPassword" required autocomplete="current-password" />
        </div>
        <div class="form-group">
          <label class="form-label">新密码</label>
          <OfficeInput type="password" class="input" v-model="passwordForm.newPassword" required minlength="6" autocomplete="new-password" />
        </div>
        <div class="form-group">
          <label class="form-label">确认新密码</label>
          <OfficeInput type="password" class="input" v-model="passwordForm.confirmPassword" required minlength="6" autocomplete="new-password" />
        </div>
        <p class="form-error" v-if="passwordError">{{ passwordError }}</p>
        <OfficeButton type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? '保存中...' : '修改密码' }}</OfficeButton>
      </form>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../utils/api.js'
import { useAuthStore } from '../stores/auth.js'
import { useToast } from '../composables/useToast'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const profile = ref({})
const loadingProfile = ref(true)
const profileError = ref(false)
const saving = ref(false)
const passwordError = ref('')

const nameForm = ref({ displayName: '' })
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })

let loadRequest = 0
let loadErrorToast = null
onMounted(loadProfile)
onUnmounted(() => { loadRequest++ })

async function loadProfile() {
  const request = ++loadRequest
  loadingProfile.value = true
  profileError.value = false
  try {
    const loaded = await api.get('/auth/profile')
    if (request !== loadRequest) return
    profile.value = loaded
    nameForm.value.displayName = profile.value.displayName || ''
    toast.clearError(loadErrorToast)
    loadErrorToast = null
  } catch (error) {
    if (request !== loadRequest) return
    if (error.status === 401) { authStore.logout(); router.push('/login') }
    else { profileError.value = true; loadErrorToast = toast.error(error.message || '账户资料加载失败') }
  } finally { if (request === loadRequest) loadingProfile.value = false }
}

async function handleUpdateName() {
  if (saving.value) return
  const displayName = String(nameForm.value.displayName ?? '').trim()
  if (!displayName) return toast.error('姓名不能为空')
  nameForm.value.displayName = displayName
  saving.value = true
  try {
    const updated = await api.put('/auth/profile', { displayName: nameForm.value.displayName })
    profile.value = updated
    toast.success('个人资料已保存')
    if (authStore.user) {
      authStore.user.displayName = updated.displayName
      localStorage.setItem('user', JSON.stringify(authStore.user))
    }
  } catch (err) {
    toast.error(err.message || '修改失败')
  } finally {
    saving.value = false
  }
}

async function handleChangePassword() {
  if (saving.value) return
  passwordError.value = ''
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  if (passwordForm.value.newPassword.length < 6) {
    passwordError.value = '新密码至少6位'
    return
  }

  saving.value = true
  try {
    await api.put('/auth/password', {
      oldPassword: passwordForm.value.oldPassword,
      newPassword: passwordForm.value.newPassword
    })
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    toast.success('密码已修改，请重新登录')
    authStore.logout()
    router.push('/login')
  } catch (err) {
    passwordError.value = err.message || '修改失败'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.profile {
  max-width: 600px;
  margin: 0 auto;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 20px;
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 24px;
}

.profile-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  flex-shrink: 0;
}

.profile-basic h2 {
  margin: 0;
  font-size: 20px;
  color: var(--color-text);
}

.profile-role {
  display: inline-block;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 12px;
  margin-top: 4px;
  font-weight: 500;
}

.profile-role.admin {
  background: #eaf5f0;
  color: var(--color-success);
}

.profile-role.teacher {
  background: #eaf3fc;
  color: var(--color-primary);
}

.profile-section {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 16px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.info-item label {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.info-item span {
  font-size: 15px;
  color: var(--color-text);
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.form-error {
  font-size: 13px;
  color: var(--color-danger);
  margin: 0;
}
</style>
