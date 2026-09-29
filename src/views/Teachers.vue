<template>
  <div class="teachers fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ isAdmin ? '教师管理' : '教师信息' }}</h1>
        <p class="page-subtitle">查看教师与课程安排</p>
      </div>
      <OfficeButton v-if="isAdmin" class="btn btn-primary" @click="showModal = true" :disabled="loading || loadError">
        <span>+</span> 添加教师
      </OfficeButton>
    </div>

    <div v-if="loading" class="empty-state" role="status">正在加载教师资料…</div>
    <div v-else-if="loadError" class="empty-state" role="alert">
      <p>教师资料加载失败，请重试</p>
      <OfficeButton class="btn btn-secondary" @click="loadData">重试</OfficeButton>
    </div>
    <div class="search-bar" v-if="!loading && !loadError">
      <OfficeInput
        type="text"
        class="input"
        placeholder="搜索教师姓名..."
        v-model="searchText"
      />
    </div>
    <div v-if="!loading && !loadError && auth.teacherId" class="scope-filter" role="group" aria-label="教师信息范围">
      <OfficeButton type="button" class="btn btn-text" :class="{ selected: scopeFilter === 'all' }" @click="scopeFilter = 'all'">全部教师</OfficeButton>
      <OfficeButton type="button" class="btn btn-text" :class="{ selected: scopeFilter === 'mine' }" @click="scopeFilter = 'mine'">我的信息</OfficeButton>
    </div>

    <div class="teachers-grid" v-if="!loading && !loadError && filteredTeachers.length > 0">
      <div class="teacher-card" :class="{ 'card-deleted': teacher.status === 'deleted' }" v-for="teacher in filteredTeachers" :key="teacher.id">
        <div class="teacher-avatar">{{ (teacher.name || '?').charAt(0) }}</div>
        <div class="teacher-info">
          <h3 class="teacher-name">
            {{ teacher.name }}
            <span class="badge badge-danger" v-if="teacher.status === 'deleted'">已停用</span>
          </h3>
          <p class="teacher-subject" v-if="teacher.subject">{{ teacher.subject }}</p>
          <p class="teacher-phone" v-if="teacher.phone">{{ teacher.phone }}</p>
        </div>
        <div class="teacher-meta">
          <span class="course-count">{{ getCourseCount(teacher.id) }} 门课程</span>
        </div>
        <div class="teacher-actions" v-if="teacher.status !== 'deleted' && isAdmin">
          <OfficeButton class="btn btn-text" @click="editTeacher(teacher)">编辑</OfficeButton>
          <OfficeButton class="btn btn-text" v-if="isAdmin" @click="openHandoverModal(teacher)">交接课程</OfficeButton>
          <OfficeButton class="btn btn-text" v-if="isAdmin && teacher.userId" @click="openAccountModal(teacher)">账户</OfficeButton>
          <OfficeButton class="btn btn-text" style="color: var(--color-danger)" @click="removeTeacher(teacher.id)">停用</OfficeButton>
        </div>
        <div class="teacher-actions" v-else>
          <OfficeButton class="btn btn-text" style="color: var(--color-success)" @click="restoreTeacher(teacher.id)" v-if="isAdmin">恢复</OfficeButton>
        </div>
      </div>
    </div>
    <div class="empty-state" v-else-if="!loading && !loadError">
      <p>{{ teachers.length ? '没有符合条件的教师' : '暂无教师数据' }}</p>
      <OfficeButton v-if="isAdmin && !teachers.length" class="btn btn-primary" @click="showModal = true">添加第一位教师</OfficeButton>
    </div>

    <!-- 添加/编辑弹窗 -->
    <OfficeModal v-model:show="showModal" @update:show="value => { if (!value) { closeModal() } }">
      <div class="modal">
        <h2 class="modal-title">{{ editingTeacher ? '编辑教师' : '添加教师' }}</h2>
        <form @submit.prevent="saveTeacher">
          <div class="form-group">
            <label>姓名 *</label>
            <OfficeInput type="text" class="input" v-model="form.name" required maxlength="100" placeholder="请输入教师姓名" />
          </div>
          <div class="form-group">
            <label>联系电话</label>
            <OfficeInput type="tel" class="input" v-model="form.phone" maxlength="20" placeholder="请输入联系电话" />
          </div>
          <div class="form-group">
            <label>教授科目</label>
            <OfficeInput type="text" class="input" v-model="form.subject" maxlength="100" placeholder="如：数学、英语" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <OfficeInput type="textarea" class="input" v-model="form.remark" rows="3" placeholder="其他说明"></OfficeInput>
          </div>
          <div class="form-hint" v-if="!editingTeacher">
            添加教师后将自动生成一次性初始密码，请在创建成功后及时保存。
          </div>
          <div class="modal-actions">
            <OfficeButton type="button" class="btn btn-secondary" @click="closeModal">取消</OfficeButton>
            <OfficeButton type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</OfficeButton>
          </div>
        </form>
      </div>
    </OfficeModal>

    <!-- 确认弹窗 -->
    <OfficeModal v-model:show="showConfirmModal" @update:show="value => { if (!value) { showConfirmModal = false } }">
      <div class="modal modal-sm">
        <h2 class="modal-title">停用教师</h2>
        <p class="confirm-message">确定要停用教师“{{ deleteTargetName }}”的登录账号吗？</p>
        <div class="modal-actions">
          <OfficeButton class="btn btn-secondary" @click="showConfirmModal = false">取消</OfficeButton>
          <OfficeButton class="btn btn-primary" style="background: var(--color-danger)" @click="confirmDeleteTeacher" :disabled="submitting">{{ submitting ? '停用中...' : '确认停用' }}</OfficeButton>
        </div>
      </div>
    </OfficeModal>

    <!-- 账户管理弹窗 -->
    <OfficeModal v-model:show="showAccountModal" @update:show="value => { if (!value) { showAccountModal = false } }">
      <div class="modal">
        <h2 class="modal-title">教师账户管理</h2>
        <form @submit.prevent="saveAccount">
          <div class="form-group">
            <label>姓名</label>
            <OfficeInput type="text" class="input" v-model="accountForm.displayName" required maxlength="100" />
          </div>
          <div class="form-group">
            <label>手机号</label>
            <OfficeInput type="tel" class="input" v-model="accountForm.phone" maxlength="20" />
          </div>
          <div class="form-group">
            <label>重置密码（留空则不修改）</label>
            <OfficeInput type="password" class="input" v-model="accountForm.newPassword" placeholder="输入新密码（至少6位）" minlength="6" />
          </div>
          <div class="modal-actions">
            <OfficeButton type="button" class="btn btn-secondary" @click="showAccountModal = false">取消</OfficeButton>
            <OfficeButton type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</OfficeButton>
          </div>
        </form>
      </div>
    </OfficeModal>

    <!-- 创建成功提示弹窗 -->
    <OfficeModal v-model:show="showSuccessModal" @update:show="value => { if (!value) { showSuccessModal = false } }">
      <div class="modal modal-sm">
        <h2 class="modal-title">教师创建成功</h2>
        <div class="success-info">
          <p>已为该教师创建登录账号：</p>
          <div class="success-detail">
            <div class="success-row"><span class="success-label">登录账号</span><span class="success-value">{{ successInfo.username }}</span></div>
            <div class="success-row"><span class="success-label">初始密码</span><span class="success-value success-password">{{ successInfo.password }}</span></div>
          </div>
          <p class="success-hint">请告知教师及时修改密码</p>
        </div>
        <div class="modal-actions">
          <OfficeButton class="btn btn-primary" @click="showSuccessModal = false">知道了</OfficeButton>
        </div>
      </div>
    </OfficeModal>

    <!-- 课程交接弹窗 -->
    <OfficeModal v-model:show="showHandoverModal" @update:show="value => { if (!value) { showHandoverModal = false } }">
      <div class="modal">
        <h2 class="modal-title">课程交接</h2>
        <div class="handover-info">
          <div class="handover-row">
            <span class="handover-label">原教师：</span>
            <span class="handover-value">{{ handoverTeacher?.name }}</span>
          </div>
        </div>
        <div class="form-group" v-if="handoverCourses.length > 0">
          <label>选择要交接的课程</label>
          <div class="handover-course-list">
            <label class="handover-course-item" v-for="course in handoverCourses" :key="course.id">
              <input type="checkbox" :value="course.id" v-model="handoverSelectedCourses" />
              <span>{{ course.name }}（{{ {1:'一',2:'二',3:'三',4:'四',5:'五',6:'六',7:'日'}[course.weekday] || '日' }} {{ course.startTime }}-{{ course.endTime }}）</span>
            </label>
          </div>
        </div>
        <div class="empty-state" v-else style="padding: 16px; color: var(--color-text-secondary);">
          该教师暂无课程可交接
        </div>
        <div class="form-group">
          <label>交接给</label>
          <SearchSelect
            v-model="handoverTargetTeacherId"
            :options="teachers.filter(t => t.id !== handoverTeacher?.id && t.status === 'active').map(t => ({ value: t.id, label: t.name }))"
            placeholder="请选择教师"
          />
        </div>
        <div class="form-group">
          <label>交接原因（选填）</label>
          <OfficeInput type="textarea" class="input" v-model="handoverReason" rows="2" placeholder="如：教师离职、课程调整等"></OfficeInput>
        </div>
        <div class="modal-actions">
          <OfficeButton class="btn btn-secondary" @click="showHandoverModal = false">取消</OfficeButton>
          <OfficeButton class="btn btn-primary" @click="confirmHandover" :disabled="!handoverTargetTeacherId || handoverSelectedCourses.length === 0 || handoverSubmitting">
            {{ handoverSubmitting ? '交接中...' : '确认交接' }}
          </OfficeButton>
        </div>
      </div>
    </OfficeModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getTeachers, addTeacher, updateTeacher, deleteTeacher, updateTeacherStatus } from '../utils/storage'
import { getCourses } from '../utils/storage'
import { performHandover } from '../utils/storage'
import { api } from '../utils/api.js'
import { useToast } from '../composables/useToast'
import { useAuthStore } from '../stores/auth.js'
import SearchSelect from '../components/SearchSelect.vue'

const auth = useAuthStore()
const isAdmin = computed(() => auth.isAdmin)
const toast = useToast()

const teachers = ref([])
const courses = ref([])
const loading = ref(true)
const loadError = ref(false)
const searchText = ref('')
const scopeFilter = ref('all')
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

let loadRequest = 0
let loadErrorToast = null
async function loadData() {
  const request = ++loadRequest
  loading.value = true
  loadError.value = false
  try {
    const [t, c] = await Promise.all([getTeachers(), getCourses()])
    if (request !== loadRequest) return
    teachers.value = t || []
    courses.value = c || []
    toast.clearError(loadErrorToast)
    loadErrorToast = null
  } catch (error) {
    if (request !== loadRequest) return
    loadError.value = true
    loadErrorToast = toast.error(error.message || '教师资料加载失败')
  } finally {
    if (request === loadRequest) loading.value = false
  }
}
onMounted(loadData)
onUnmounted(() => { loadRequest++ })

const filteredTeachers = computed(() => {
  const search = searchText.value.trim().toLowerCase()
  return teachers.value.filter(t => (scopeFilter.value !== 'mine' || t.id === auth.teacherId) &&
    (!search || t.name.toLowerCase().includes(search)))
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

function upsertTeacher(teacher) {
  if (!teacher?.id) return
  const previous = teachers.value.find(item => item.id === teacher.id)
  teachers.value = previous
    ? teachers.value.map(item => item.id === teacher.id ? { ...item, ...teacher } : item)
    : [teacher, ...teachers.value]
}

async function saveTeacher() {
  if (submitting.value) return
  const name = String(form.value.name ?? '').trim()
  if (!name) return toast.error('请输入教师姓名')
  form.value.name = name
  submitting.value = true
  try {
    if (editingTeacher.value) {
      upsertTeacher(await updateTeacher(editingTeacher.value.id, form.value))
    } else {
      const result = await addTeacher(form.value)
      if (Array.isArray(result.teachers)) teachers.value = result.teachers
      else if (result.createdTeacher) teachers.value = [...teachers.value, result.createdTeacher]
      if (result.defaultPassword) {
        successInfo.value = { username: result.username, password: result.defaultPassword }
        showSuccessModal.value = true
      }
      if (result.refreshFailed) toast.warning('教师已创建，列表刷新失败，请稍后重试')
    }
    closeModal()
  } catch (err) {
    toast.error(err.message || '保存失败')
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
    upsertTeacher(await updateTeacherStatus(deleteTargetId.value, 'deleted'))
    showConfirmModal.value = false
  } catch (err) {
    toast.error(err.message || '停用失败')
  } finally {
    submitting.value = false
  }
}

async function restoreTeacher(id) {
  try {
    upsertTeacher(await updateTeacherStatus(id, 'active'))
    toast.success('教师已恢复')
  } catch (err) {
    toast.error(err.message || '恢复失败')
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
    const profile = await api.put(`/auth/users/${userId}`, { displayName, phone })
    teachers.value = teachers.value.map(teacher => teacher.userId === userId
      ? { ...teacher, name: profile.teacher?.name ?? profile.displayName, phone: profile.teacher?.phone ?? phone.trim() }
      : teacher)
    if (newPassword && newPassword.length >= 6) {
      try { await api.put(`/auth/users/${userId}/password`, { newPassword }) }
      catch (error) { toast.warning(`教师资料已保存，但密码重置失败：${error.message || '请重试'}`); return }
    }
    showAccountModal.value = false
    try { teachers.value = await getTeachers() || [] }
    catch { toast.warning('教师账户已保存，列表刷新失败，请稍后重试') }
  } catch (err) {
    toast.error(err.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

// 课程交接
const showHandoverModal = ref(false)
const handoverTeacher = ref(null)
const handoverCourses = ref([])
const handoverSelectedCourses = ref([])
const handoverTargetTeacherId = ref('')
const handoverReason = ref('')
const handoverSubmitting = ref(false)

function openHandoverModal(teacher) {
  handoverTeacher.value = teacher
  handoverCourses.value = courses.value.filter(c => c.teacherId === teacher.id)
  handoverSelectedCourses.value = handoverCourses.value.map(c => c.id)
  handoverTargetTeacherId.value = ''
  handoverReason.value = ''
  showHandoverModal.value = true
}

async function confirmHandover() {
  if (handoverSubmitting.value) return
  handoverSubmitting.value = true
  try {
    const completed = []
    for (const courseId of [...handoverSelectedCourses.value]) {
      await performHandover(courseId, handoverTargetTeacherId.value, handoverReason.value)
      completed.push(courseId)
      handoverSelectedCourses.value = handoverSelectedCourses.value.filter(id => id !== courseId)
      courses.value = courses.value.map(course => course.id === courseId ? { ...course, teacherId: handoverTargetTeacherId.value } : course)
    }
    toast.success(`已成功交接 ${completed.length} 门课程`)
    showHandoverModal.value = false
    try {
      teachers.value = await getTeachers() || []
      courses.value = await getCourses() || []
    } catch { toast.warning('课程已交接，列表刷新失败，请稍后重试') }
  } catch (err) {
    toast.error((err.message || '交接失败') + '；已完成的课程已从待交接列表移除，其余课程未改变')
  } finally {
    handoverSubmitting.value = false
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
  margin-bottom: 12px;
}

.scope-filter { display: flex; gap: 6px; margin-bottom: 20px; }
.scope-filter .selected { background: var(--color-selected); font-weight: 650; }

.teachers-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

@media (max-width: 1100px) {
  .teachers-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
  background: var(--color-selected);
  color: var(--color-primary);
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
  flex-wrap: wrap;
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
  align-items: flex-start;
  justify-content: center;
  z-index: 1000;
  overflow-y: auto;
  padding: 24px 16px;
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
  .modal {
    margin: 16px;
    padding: 24px;
  }
  .modal-actions {
    flex-direction: column;
  }
  .modal-actions .btn {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .teachers-grid { grid-template-columns: 1fr; }
}

@media (max-width: 359px) {
  .teacher-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .teacher-actions .n-button { width: 100%; }
}

.handover-info {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  margin-bottom: 16px;
}

.handover-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.handover-label {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.handover-value {
  font-weight: 600;
}

.handover-course-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.handover-course-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
}

.handover-course-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.card-deleted {
  opacity: 0.5;
}

.card-deleted .teacher-name {
  text-decoration: line-through;
  color: var(--color-text-secondary);
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  vertical-align: middle;
  margin-left: 6px;
}

.badge-danger {
  background: #fceeee;
  color: var(--color-danger);
}
</style>
