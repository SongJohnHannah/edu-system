<template>
  <div class="teachers fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">教师管理</h1>
        <p class="page-subtitle">管理所有教师信息</p>
      </div>
      <button class="btn btn-primary" @click="showModal = true">
        <span>+</span> 添加教师
      </button>
    </div>

    <div class="search-bar">
      <input
        type="text"
        class="input"
        placeholder="搜索教师姓名..."
        v-model="searchText"
      />
    </div>

    <div class="teachers-grid" v-if="filteredTeachers.length > 0">
      <div class="teacher-card" v-for="teacher in filteredTeachers" :key="teacher.id">
        <div class="teacher-avatar">{{ teacher.name.charAt(0) }}</div>
        <div class="teacher-info">
          <h3 class="teacher-name">{{ teacher.name }}</h3>
          <p class="teacher-subject" v-if="teacher.subject">{{ teacher.subject }}</p>
          <p class="teacher-phone" v-if="teacher.phone">{{ teacher.phone }}</p>
        </div>
        <div class="teacher-meta">
          <span class="course-count">{{ getCourseCount(teacher.id) }} 门课程</span>
        </div>
        <div class="teacher-actions">
          <button class="btn btn-text" @click="editTeacher(teacher)">编辑</button>
          <button class="btn btn-text" v-if="isAdmin && teacher.userId" @click="openAccountModal(teacher)">账户</button>
          <button class="btn btn-text" style="color: var(--color-danger)" @click="removeTeacher(teacher.id)">删除</button>
        </div>
      </div>
    </div>
    <div class="empty-state" v-else>
      <p>暂无教师数据</p>
      <button class="btn btn-primary" @click="showModal = true">添加第一位教师</button>
    </div>

    <!-- 添加/编辑弹窗 -->
    <div class="modal-overlay" v-if="showModal" @click.self="closeModal">
      <div class="modal">
        <h2 class="modal-title">{{ editingTeacher ? '编辑教师' : '添加教师' }}</h2>
        <form @submit.prevent="saveTeacher">
          <div class="form-group">
            <label>姓名 *</label>
            <input type="text" class="input" v-model="form.name" required placeholder="请输入教师姓名" />
          </div>
          <div class="form-group">
            <label>联系电话</label>
            <input type="tel" class="input" v-model="form.phone" placeholder="请输入联系电话" />
          </div>
          <div class="form-group">
            <label>教授科目</label>
            <input type="text" class="input" v-model="form.subject" placeholder="如：数学、英语" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <textarea class="input" v-model="form.remark" rows="3" placeholder="其他说明"></textarea>
          </div>
          <div class="form-hint" v-if="!editingTeacher">
            添加教师后将自动创建登录账号，默认密码：<strong>123456</strong>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 确认弹窗 -->
    <div class="modal-overlay" v-if="showConfirmModal" @click.self="showConfirmModal = false">
      <div class="modal modal-sm">
        <h2 class="modal-title">删除教师</h2>
        <p class="confirm-message">确定要删除教师"{{ deleteTargetName }}"吗？</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showConfirmModal = false">取消</button>
          <button class="btn btn-primary" style="background: var(--color-danger)" @click="confirmDeleteTeacher" :disabled="submitting">{{ submitting ? '删除中...' : '确认删除' }}</button>
        </div>
      </div>
    </div>

    <!-- 账户管理弹窗 -->
    <div class="modal-overlay" v-if="showAccountModal" @click.self="showAccountModal = false">
      <div class="modal">
        <h2 class="modal-title">教师账户管理</h2>
        <form @submit.prevent="saveAccount">
          <div class="form-group">
            <label>姓名</label>
            <input type="text" class="input" v-model="accountForm.displayName" required />
          </div>
          <div class="form-group">
            <label>手机号</label>
            <input type="tel" class="input" v-model="accountForm.phone" />
          </div>
          <div class="form-group">
            <label>重置密码（留空则不修改）</label>
            <input type="password" class="input" v-model="accountForm.newPassword" placeholder="输入新密码（至少6位）" minlength="6" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showAccountModal = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 创建成功提示弹窗 -->
    <div class="modal-overlay" v-if="showSuccessModal">
      <div class="modal modal-sm">
        <h2 class="modal-title">教师创建成功</h2>
        <div class="success-info">
          <p>已为该教师创建登录账号：</p>
          <div class="success-detail">
            <div class="success-row"><span class="success-label">登录账号</span><span class="success-value">{{ successInfo.username }}</span></div>
            <div class="success-row"><span class="success-label">默认密码</span><span class="success-value success-password">{{ successInfo.password }}</span></div>
          </div>
          <p class="success-hint">请告知教师及时修改密码</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="showSuccessModal = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getTeachers, addTeacher, updateTeacher, deleteTeacher } from '../utils/storage'
import { getCourses } from '../utils/storage'
import { api } from '../utils/api.js'
import { useToast } from '../composables/useToast'

const useApi = import.meta.env.VITE_USE_API === 'true'
const isAdmin = ref(false)
const toast = useToast()

const teachers = ref([])
const courses = ref([])
const searchText = ref('')
const showModal = ref(false)
const editingTeacher = ref(null)
const showConfirmModal = ref(false)
const showAccountModal = ref(false)
const showSuccessModal = ref(false)
const successInfo = ref({ username: '', password: '' })
const deleteTargetId = ref('')
const deleteTargetName = ref('')
const form = ref({
  name: '',
  phone: '',
  subject: '',
  remark: ''
})
const accountForm = ref({
  userId: '',
  displayName: '',
  phone: '',
  newPassword: ''
})

onMounted(async () => {
  const [t, c] = await Promise.all([getTeachers(), getCourses()])
  teachers.value = t || []
  courses.value = c || []
  if (useApi) {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        isAdmin.value = user.role === 'admin'
      } catch {}
    }
  }
})

const filteredTeachers = computed(() => {
  if (!searchText.value) return teachers.value
  const search = searchText.value.toLowerCase()
  return teachers.value.filter(t => t.name.toLowerCase().includes(search))
})

function getCourseCount(teacherId) {
  return courses.value.filter(c => c.teacherId === teacherId).length
}

function editTeacher(teacher) {
  editingTeacher.value = teacher
  form.value = { ...teacher }
  showModal.value = true
}

const submitting = ref(false)

async function saveTeacher() {
  if (submitting.value) return
  submitting.value = true
  try {
    if (editingTeacher.value) {
      teachers.value = await updateTeacher(editingTeacher.value.id, form.value)
    } else {
      const result = await addTeacher(form.value)
      teachers.value = result.students || result
      // API 模式下显示默认密码
      if (useApi && result.defaultPassword) {
        successInfo.value = { username: result.username, password: result.defaultPassword }
        showSuccessModal.value = true
      }
    }
    closeModal()
  } finally {
    submitting.value = false
  }
}

function removeTeacher(id) {
  const teacher = teachers.value.find(t => t.id === id)
  if (!teacher) return
  deleteTargetId.value = id
  deleteTargetName.value = teacher.name
  showConfirmModal.value = true
}

async function confirmDeleteTeacher() {
  if (submitting.value) return
  submitting.value = true
  try {
    teachers.value = await deleteTeacher(deleteTargetId.value)
    showConfirmModal.value = false
  } finally {
    submitting.value = false
  }
}

function openAccountModal(teacher) {
  accountForm.value = {
    userId: teacher.userId,
    displayName: teacher.name,
    phone: teacher.phone || '',
    newPassword: ''
  }
  showAccountModal.value = true
}

async function saveAccount() {
  if (submitting.value) return
  submitting.value = true
  try {
    const { userId, displayName, phone, newPassword } = accountForm.value
    await api.put(`/auth/users/${userId}`, { displayName, phone })
    if (newPassword && newPassword.length >= 6) {
      await api.put(`/auth/users/${userId}/password`, { newPassword })
    }
    showAccountModal.value = false
    teachers.value = await getTeachers() || []
  } catch (err) {
    toast.error(err.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

function closeModal() {
  showModal.value = false
  editingTeacher.value = null
  form.value = { name: '', phone: '', subject: '', remark: '' }
}
</script>

<style scoped>
.teachers {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 4px;
}

.page-subtitle {
  color: var(--color-text-secondary);
  font-size: 15px;
}

.search-bar {
  margin-bottom: 24px;
}

.teachers-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.teacher-card {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  transition: var(--transition);
}

.teacher-card:hover {
  box-shadow: var(--shadow-md);
}

.teacher-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 16px;
}

.teacher-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.teacher-subject {
  font-size: 14px;
  color: var(--color-primary);
  margin-bottom: 4px;
}

.teacher-phone {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.teacher-meta {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-bg-secondary);
}

.course-count {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.teacher-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 64px 24px;
  background: white;
  border-radius: var(--radius-lg);
  color: var(--color-text-secondary);
}

.empty-state p {
  margin-bottom: 16px;
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

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 8px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.modal-sm {
  max-width: 400px;
}

.confirm-message {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.form-hint {
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  line-height: 1.5;
}

.form-hint strong {
  color: var(--color-primary);
}

.success-info {
  margin-bottom: 8px;
}

.success-info p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 12px;
}

.success-detail {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  margin-bottom: 12px;
}

.success-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.success-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.success-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.success-password {
  color: var(--color-primary);
  font-family: monospace;
  letter-spacing: 1px;
}

.success-hint {
  font-size: 13px;
  color: var(--color-text-secondary);
  text-align: center;
  margin: 0;
}

@media (max-width: 768px) {
  .teachers-grid {
    grid-template-columns: 1fr;
  }
}
</style>