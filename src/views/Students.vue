<template>
  <div class="students fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">学生管理</h1>
        <p class="page-subtitle">管理所有学生信息和课时</p>
      </div>
      <div class="header-actions">
        <OfficeButton class="btn btn-secondary" @click="showBatchModal = true" :disabled="loading || loadError">
          批量添加
        </OfficeButton>
        <OfficeButton class="btn btn-primary" @click="openAddModal" :disabled="loading || loadError">
          <span>+</span> 添加学生
        </OfficeButton>
      </div>
    </div>

    <div v-if="loading" class="empty-state" role="status">正在加载学生资料…</div>
    <div v-else-if="loadError" class="empty-state" role="alert">
      <p>学生资料加载失败，请重试</p>
      <OfficeButton class="btn btn-secondary" @click="loadData">重试</OfficeButton>
    </div>

    <div class="search-bar" v-if="!loading && !loadError">
      <div class="scope-filter"><OfficeButton class="btn btn-text" :class="{ selected: scopeFilter === 'all' }" @click="scopeFilter = 'all'">全部学生</OfficeButton><OfficeButton class="btn btn-text" :class="{ selected: scopeFilter === 'mine' }" @click="scopeFilter = 'mine'">我录入的</OfficeButton><OfficeButton class="btn btn-text" :class="{ selected: showArchived }" @click="showArchived = !showArchived">{{ showArchived ? '隐藏归档' : '查看归档' }}</OfficeButton></div>
      <OfficeInput
        type="text"
        class="input"
        placeholder="搜索学生姓名或电话..."
        v-model="searchText"
      />
    </div>

    <div class="table-container desktop-only" v-if="!loading && !loadError">
      <OfficeTable class="table" v-if="filteredStudents.length > 0">
        <thead>
          <tr>
            <th>姓名</th>
            <th>年龄</th>
            <th>联系电话</th>
            <th>报名阶段</th><th>录入人</th>
            <th>总课时</th>
            <th>已用课时</th>
            <th class="sortable" @click="toggleSort">
              剩余课时
              <span class="sort-icon">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="student in filteredStudents" :key="student.id" :class="{ 'row-deleted': student.status === 'deleted' || student.status === 'quit' }">
            <td><OfficeButton class="btn btn-text" @click="detailStudent = student">{{ student.name }}</OfficeButton></td>
            <td>{{ student.age || '-' }}</td>
            <td>{{ student.phone || '-' }}</td>
            <td>{{ student.enrollmentStage === 'pending' ? '待报名' : '已报名' }}</td>
            <td>{{ creatorName(student) }}</td>
            <td>{{ student.totalHours }}</td>
            <td>{{ student.usedHours || 0 }}</td>
            <td>{{ (student.totalHours || 0) - (student.usedHours || 0) }}</td>
            <td>
              <div class="status-badges">
                <span class="badge" :class="getStudentStatusClass(student)" @click="student.status !== 'deleted' && canEdit(student) && openStatusMenu(student)">
                  {{ getStudentStatusText(student) }}
                </span>
                <span class="badge" :class="getHoursStatusClass(student)">
                  {{ getHoursStatusText(student) }}
                </span>
              </div>
            </td>
            <td>
              <div class="action-buttons" v-if="student.status !== 'deleted'">
                <OfficeButton v-if="canEdit(student)" class="btn btn-text" @click="openAddHoursModal(student)" title="加减课时">加减课</OfficeButton>
                <OfficeButton class="btn btn-text" @click="goToHistory(student.id)" title="课时历史">历史</OfficeButton>
                <OfficeButton v-if="canEdit(student)" class="btn btn-text" @click="editStudent(student)">编辑</OfficeButton>
                <OfficeButton v-if="canArchive(student)" class="btn btn-text" style="color: var(--color-danger)" @click="removeStudent(student)">归档</OfficeButton>
              </div>
              <div class="action-buttons" v-else>
                <OfficeButton class="btn btn-text" @click="goToHistory(student.id)" title="课时历史">历史</OfficeButton>
              </div>
            </td>
          </tr>
        </tbody>
      </OfficeTable>
      <div class="empty-state" v-else>
        <p>暂无学生数据</p>
        <div class="empty-actions">
          <OfficeButton class="btn btn-secondary" @click="showBatchModal = true">批量添加</OfficeButton>
          <OfficeButton class="btn btn-primary" @click="openAddModal">添加第一个学生</OfficeButton>
        </div>
      </div>
    </div>

    <!-- 移动端卡片列表 -->
    <div class="mobile-card-list mobile-only" v-if="!loading && !loadError && filteredStudents.length > 0">
      <div class="mobile-card" v-for="student in filteredStudents" :key="student.id" :class="{ 'card-deleted': student.status === 'deleted' || student.status === 'quit' }">
        <div class="mobile-card-sticky">
          <button class="mobile-name" type="button" @click="openMobileStudent(student, $event)">{{ student.name }}</button>
          <span class="mobile-creator">{{ student.enrollmentStage === 'pending' ? '待报名' : '已报名' }} · {{ creatorName(student) }}<template v-if="student.enrollmentStage !== 'pending' && getHoursStatusText(student) !== '正常'"> · {{ getHoursStatusText(student) }}</template></span>
          <div class="mobile-right-info">
            <span class="mobile-remaining" :class="getHoursStatusClass(student)">{{ (student.totalHours || 0) - (student.usedHours || 0) }} 课时</span>
            <span class="badge mobile-status-badge" :class="getStudentStatusClass(student)" @click="student.status !== 'deleted' && canEdit(student) && openStatusMenu(student)">
              {{ getStudentStatusText(student) }}
            </span>
          </div>
        </div>
        <div class="mobile-card-actions">
          <template v-if="student.status !== 'deleted'">
            <OfficeButton v-if="canEdit(student)" class="btn btn-text" @click="openAddHoursModal(student)">加减课</OfficeButton>
            <OfficeButton class="btn btn-text" @click="goToHistory(student.id)">历史</OfficeButton>
            <OfficeButton v-if="canEdit(student)" class="btn btn-text" @click="editStudent(student)">编辑</OfficeButton>
            <OfficeButton v-if="canArchive(student)" class="btn btn-text btn-danger-text" @click="removeStudent(student)">归档</OfficeButton>
          </template>
          <template v-else>
            <OfficeButton class="btn btn-text" @click="goToHistory(student.id)">历史</OfficeButton>
          </template>
        </div>
      </div>
    </div>
    <div class="empty-state mobile-only" v-if="!loading && !loadError && filteredStudents.length === 0">
      <p>暂无学生数据</p>
      <div class="empty-actions">
        <OfficeButton class="btn btn-secondary" @click="showBatchModal = true">批量添加</OfficeButton>
        <OfficeButton class="btn btn-primary" @click="openAddModal">添加第一个学生</OfficeButton>
      </div>
    </div>

    <OfficeModal v-model:show="showStudentDetail"><div class="modal"><h2 class="modal-title">学生详情</h2><template v-if="detailStudent"><p>{{ detailStudent.name }} · {{ detailStudent.age || '未填写年龄' }}</p><p>电话：{{ detailStudent.phone || '未填写' }}</p><p>录入人：{{ creatorName(detailStudent) }}</p><p>{{ getStudentStatusText(detailStudent) }} · {{ detailStudent.enrollmentStage === 'pending' ? '待报名' : '已报名' }}</p><p>备注：{{ detailStudent.remark || '无' }}</p><p>总课时 {{ detailStudent.totalHours }} · 已用 {{ detailStudent.usedHours }}</p><div class="modal-actions"><OfficeButton class="btn btn-secondary" @click="detailStudent = null">关闭</OfficeButton><OfficeButton class="btn btn-primary" @click="goToHistory(detailStudent.id)">课时历史</OfficeButton></div></template></div></OfficeModal>
    <!-- 添加/编辑弹窗 -->
    <OfficeModal v-model:show="showModal" @update:show="value => { if (!value) { closeModal() } }">
      <div class="modal">
        <h2 class="modal-title">{{ editingStudent ? '编辑学生' : '添加学生' }}</h2>
        <form @submit.prevent="saveStudent">
          <div class="form-group">
            <label>姓名 *</label>
            <OfficeInput type="text" class="input" v-model="form.name" required maxlength="100" placeholder="请输入学生姓名" />
          </div>
          <div class="form-group">
            <label>年龄</label>
            <OfficeInput type="number" class="input" v-model.number="form.age" min="1" max="100" placeholder="请输入学生年龄" />
          </div>
          <div class="form-group">
            <label>联系电话</label>
            <OfficeInput type="tel" class="input" v-model="form.phone" maxlength="20" placeholder="请输入家长联系电话" />
          </div>
          <div class="form-group">
            <label>{{ editingStudent ? '初始课时' : '初始课时 *' }}</label>
            <OfficeInput
              type="number"
              class="input"
              v-model.number="form.totalHours"
              :required="!editingStudent"
              min="0"
              step="0.5"
              placeholder="请输入购买课时数"
              :disabled="!!editingStudent"
            />
            <span class="form-hint" v-if="editingStudent">初始课时不可修改，可通过"加课"功能增加课时</span>
          </div>
          <div class="form-group">
            <label>备注</label>
            <OfficeInput type="textarea" class="input" v-model="form.remark" rows="2" placeholder="特殊情况说明"></OfficeInput>
          </div>
          <div class="form-group"><label>报名阶段</label><NSelect v-model:value="form.enrollmentStage" :options="enrollmentOptions" /></div>
          <div class="modal-actions">
            <OfficeButton type="button" class="btn btn-secondary" @click="closeModal">取消</OfficeButton>
            <OfficeButton type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</OfficeButton>
          </div>
        </form>
      </div>
    </OfficeModal>

    <!-- 批量添加弹窗 -->
    <OfficeModal v-model:show="showBatchModal" @update:show="value => { if (!value) { closeBatchModal() } }">
      <div class="modal modal-lg">
        <h2 class="modal-title">批量添加学生</h2>
        <div class="batch-form">
          <div class="batch-header">
            <span class="batch-col">姓名 *</span>
            <span class="batch-col">年龄</span>
            <span class="batch-col action-col">操作</span>
          </div>
          <div class="batch-rows">
            <div class="batch-row" v-for="(row, index) in batchRows" :key="index">
              <OfficeInput type="text" class="input batch-col" v-model="row.name" maxlength="100" placeholder="学生姓名" />
              <OfficeInput type="number" class="input batch-col" v-model.number="row.age" placeholder="年龄" min="1" max="100" />
              <OfficeButton type="button" class="btn btn-text batch-col action-col" @click="removeBatchRow(index)" :disabled="batchRows.length <= 1">删除</OfficeButton>
            </div>
          </div>
          <OfficeButton type="button" class="btn btn-secondary add-row-btn" @click="addBatchRow">+ 添加一行</OfficeButton>

          <div class="batch-options"><div class="form-group"><label>报名阶段</label><NSelect v-model:value="batchEnrollment" :options="enrollmentOptions" /></div>
            <div class="form-group">
              <label>默认课时</label>
              <OfficeInput type="number" class="input" v-model.number="batchDefaultHours" min="0" step="0.5" placeholder="默认0课时" />
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <OfficeButton type="button" class="btn btn-secondary" @click="closeBatchModal">取消</OfficeButton>
          <OfficeButton type="button" class="btn btn-primary" @click="saveBatchStudents" :disabled="!hasValidBatchData || submitting">{{ submitting ? '提交中...' : '确认添加' }}</OfficeButton>
        </div>
      </div>
    </OfficeModal>

    <!-- 批量添加结果弹窗 -->
    <OfficeModal v-model:show="showBatchResultModal" @update:show="value => { if (!value) { showBatchResultModal = false } }">
      <div class="modal modal-sm">
        <h2 class="modal-title">批量添加结果</h2>
        <p style="font-size: 14px; margin-bottom: 12px;">成功添加 <strong>{{ batchResult.added }}</strong> 名学生</p>
        <div v-if="batchResult.skipped.length > 0" class="confirm-warning" style="margin-bottom: 16px;">
          <p>以下姓名已存在，已自动跳过：</p>
          <p><strong>{{ batchResult.skipped.join('、') }}</strong></p>
        </div>
        <div class="modal-actions">
          <OfficeButton class="btn btn-primary" @click="showBatchResultModal = false">确定</OfficeButton>
        </div>
      </div>
    </OfficeModal>

    <!-- 加减课时弹窗 -->
    <OfficeModal v-model:show="showHoursModal" @update:show="value => { if (!value) { closeHoursModal() } }">
      <div class="modal">
        <h2 class="modal-title">加减课时</h2>
        <div class="hours-info">
          <div class="info-row">
            <span class="info-label">学生</span>
            <span class="info-value">{{ hoursStudent?.name }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">当前剩余</span>
            <span class="info-value">{{ hoursStudent ? (hoursStudent.totalHours || 0) - (hoursStudent.usedHours || 0) : 0 }} 课时</span>
          </div>
        </div>
        <form @submit.prevent="saveAddHours" @input.capture="captureHoursInput">
          <div class="form-group">
            <label>操作类型 *</label>
            <div class="hours-type-options">
              <button type="button" class="hours-type-btn" :class="{ active: addHoursForm.type === 'add', 'type-add': addHoursForm.type === 'add' }" @click="addHoursForm.type = 'add'">
                <span class="type-sign">+</span>
                <span class="type-label">加课时</span>
              </button>
              <button type="button" class="hours-type-btn" :class="{ active: addHoursForm.type === 'subtract', 'type-subtract': addHoursForm.type === 'subtract' }" @click="addHoursForm.type = 'subtract'">
                <span class="type-sign">−</span>
                <span class="type-label">减课时</span>
              </button>
            </div>
          </div>
          <div class="form-group">
            <label>{{ addHoursForm.type === 'add' ? '增加课时数' : '减少课时数' }} *</label>
            <OfficeInput type="number" class="input hours-amount" v-model.number="addHoursForm.hours" required min="0.5" max="10000" step="0.5" :placeholder="addHoursForm.type === 'add' ? '请输入要增加的课时数' : '请输入要减少的课时数'" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <OfficeInput type="text" class="input" v-model="addHoursForm.remark" :placeholder="addHoursForm.type === 'add' ? '如：续费20课时' : '如：输错修正'" />
          </div>
          <div class="modal-actions">
            <OfficeButton type="button" class="btn btn-secondary" @click="closeHoursModal">取消</OfficeButton>
            <OfficeButton type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '提交中...' : '确认' }}</OfficeButton>
          </div>
        </form>
      </div>
    </OfficeModal>

    <!-- 状态修改弹窗 -->
    <OfficeModal v-model:show="showStatusModal" @update:show="value => { if (!value) { closeStatusModal() } }">
      <div class="modal modal-sm">
        <h2 class="modal-title">修改学生状态</h2>
        <div class="status-options">
          <button class="status-option" :class="{ active: statusForm.status === 'active' }" @click="statusForm.status = 'active'">
            <span class="status-icon">✓</span>
            <span class="status-text">正常</span>
            <span class="status-desc">学生正常上课</span>
          </button>
          <button class="status-option" :class="{ active: statusForm.status === 'quit' }" @click="statusForm.status = 'quit'">
            <span class="status-icon">✕</span>
            <span class="status-text">退学</span>
            <span class="status-desc">学生已退学</span>
          </button>
        </div>
        <div class="modal-actions">
          <OfficeButton type="button" class="btn btn-secondary" @click="closeStatusModal">取消</OfficeButton>
          <OfficeButton type="button" class="btn btn-primary" @click="saveStatus" :disabled="submitting">{{ submitting ? '提交中...' : '确认修改' }}</OfficeButton>
        </div>
      </div>
    </OfficeModal>

    <!-- 确认弹窗 -->
    <OfficeModal v-model:show="showConfirmModal" @update:show="value => { if (!value) { showConfirmModal = false } }">
      <div class="modal modal-sm">
        <h2 class="modal-title">{{ confirmData.title }}</h2>
        <p class="confirm-message" v-if="confirmData.message">{{ confirmData.message }}</p>
        <div class="modal-actions">
          <OfficeButton class="btn btn-secondary" @click="showConfirmModal = false">取消</OfficeButton>
          <OfficeButton class="btn btn-primary" :style="confirmData.danger ? 'background: var(--color-danger)' : ''" @click="handleConfirm" :disabled="submitting">{{ submitting ? '处理中...' : '确认' }}</OfficeButton>
        </div>
      </div>
    </OfficeModal>

    <!-- 移动端姓名提示 -->
    <div class="name-tip" v-if="nameTipVisible" :style="nameTipStyle" @click="nameTipVisible = false">{{ nameTipText }}</div>
  </div>
</template>

<script setup>
const detailStudent = ref(null)
const showStudentDetail = computed({ get: () => !!detailStudent.value, set: value => { if (!value) detailStudent.value = null } })

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getStudents, getTeachers, addStudent, updateStudent, deleteStudent, updateStudentStatus, addStudentsBatch, addHours, subtractHours, checkStudentNameExists } from '../utils/storage'
import { useToast } from '../composables/useToast'
import { useAuthStore } from '../stores/auth.js'
import { NSelect } from 'naive-ui'

const router = useRouter()
const toast = useToast()
const auth = useAuthStore()
const isAdmin = computed(() => auth.isAdmin)
const scopeFilter = ref('all')
const showArchived = ref(false)
const teachers = ref([])
const enrollmentOptions = [{ label: '待报名（可预约试听）', value: 'pending' }, { label: '已报名', value: 'enrolled' }]
function canEdit(student) { return isAdmin.value || auth.isTeacher && (student.createdBy === 'admin' || !!auth.teacherId && student.creatorId === auth.teacherId) }
function canArchive(student) { return isAdmin.value || !!auth.teacherId && student.creatorId === auth.teacherId }
function creatorName(student) { return student.createdBy === 'admin' ? '管理员' : (teachers.value.find(t => t.id === student.creatorId)?.name || '原录入教师') }
const students = ref([])
const loading = ref(true)
const loadError = ref(false)
const searchText = ref('')
const showModal = ref(false)
const showBatchModal = ref(false)
const showBatchResultModal = ref(false)
const batchResult = ref({ added: 0, skipped: [] })
const showHoursModal = ref(false)
const showStatusModal = ref(false)
const editingStudent = ref(null)
const hoursStudent = ref(null)
const statusStudent = ref(null)
const sortOrder = ref('asc')

// 确认弹窗
const showConfirmModal = ref(false)
const confirmData = ref({ title: '', message: '', onConfirm: () => {}, danger: false })

const form = ref({
  name: '',
  phone: '',
  age: null,
  totalHours: 0,
  remark: ''
  ,enrollmentStage: 'enrolled'
})

const batchRows = ref([{ name: '', age: null }])
const batchEnrollment = ref('enrolled')
const batchDefaultHours = ref(0)

const addHoursForm = ref({
  type: 'add',
  hours: 1,
  remark: ''
})
const hoursRawInput = ref(null)

const statusForm = ref({
  status: 'active'
})

let loadRequest = 0
let loadErrorToast = null
async function loadData() {
  const request = ++loadRequest
  loading.value = true
  loadError.value = false
  try {
    const [nextStudents, nextTeachers] = await Promise.all([getStudents(), getTeachers()])
    if (request !== loadRequest) return
    students.value = nextStudents
    teachers.value = nextTeachers
    toast.clearError(loadErrorToast)
    loadErrorToast = null
  } catch (error) {
    if (request !== loadRequest) return
    loadError.value = true
    loadErrorToast = toast.error(error.message || '学生资料加载失败')
  } finally {
    if (request === loadRequest) loading.value = false
  }
}

onMounted(loadData)

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') loadData()
}
onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange))
onUnmounted(() => { loadRequest++; document.removeEventListener('visibilitychange', handleVisibilityChange) })

const filteredStudents = computed(() => {
  let result = students.value.filter(s => (showArchived.value ? s.status === 'deleted' : s.status !== 'deleted') &&
    (scopeFilter.value !== 'mine' || !!auth.teacherId && s.creatorId === auth.teacherId || isAdmin.value && s.createdBy === 'admin'))

  // 按姓名/电话搜索
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    result = result.filter(s =>
      s.name.toLowerCase().includes(search) ||
      (s.phone || '').includes(search)
    )
  }

  // 按剩余课时排序
  const sorted = result.slice().sort((a, b) => {
    const remainingA = (a.totalHours || 0) - (a.usedHours || 0)
    const remainingB = (b.totalHours || 0) - (b.usedHours || 0)
    return sortOrder.value === 'asc' ? remainingA - remainingB : remainingB - remainingA
  })
  return sorted
})

const hasValidBatchData = computed(() => {
  return batchRows.value.some(row => row.name && row.name.trim())
})

function toggleSort() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
}

// 学生状态（手动设置）
function getStudentStatusClass(student) {
  if (student.status === 'deleted') return 'badge-danger'
  return student.status === 'quit' ? 'badge-secondary' : 'badge-info'
}

function getStudentStatusText(student) {
  if (student.status === 'deleted') return '已归档'
  return student.status === 'quit' ? '退学' : '正常'
}

// 课时状态（自动计算）
function getHoursStatusClass(student) {
  if (student.enrollmentStage === 'pending') return 'badge-secondary'
  const remaining = (student.totalHours || 0) - (student.usedHours || 0)
  if (remaining < 0) return 'badge-danger'
  if (remaining === 0) return 'badge-danger'
  if (remaining < 3) return 'badge-warning'
  return 'badge-success'
}

function getHoursStatusText(student) {
  if (student.enrollmentStage === 'pending') return '试听阶段'
  const remaining = (student.totalHours || 0) - (student.usedHours || 0)
  if (remaining < 0) return `欠${Math.abs(remaining)}课时`
  if (remaining === 0) return '已耗尽'
  if (remaining < 3) return '不足'
  return '正常'
}

function openAddModal() {
  editingStudent.value = null
  form.value = { name: '', phone: '', age: null, totalHours: 0, remark: '', enrollmentStage: 'enrolled' }
  showModal.value = true
}

function editStudent(student) {
  if (!canEdit(student)) return
  editingStudent.value = student
  form.value = { ...student }
  showModal.value = true
}

function upsertStudent(student) {
  if (!student?.id) return
  students.value = students.value.some(item => item.id === student.id)
    ? students.value.map(item => item.id === student.id ? student : item)
    : [student, ...students.value]
}

const submitting = ref(false)

async function saveStudent() {
  if (submitting.value) return
  const name = String(form.value.name ?? '').trim()
  if (!name) return toast.error('请输入学生姓名')
  form.value.name = name
  submitting.value = true
  try {
    // 检查重名
    const exists = await checkStudentNameExists(form.value.name, editingStudent.value?.id)
    if (exists) {
      toast.warning(`学生"${form.value.name}"已存在，请使用其他姓名`)
      return
    }

    if (editingStudent.value) {
      const { name, phone, age, remark, status, enrollmentStage } = form.value
      upsertStudent(await updateStudent(editingStudent.value.id, { name, phone, age, remark, status, enrollmentStage }))
    } else {
      upsertStudent(await addStudent(form.value))
    }
    closeModal()
  } catch (err) {
    toast.error(err.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

function removeStudent(student) {
  if (!canArchive(student)) return
  if (student.status === 'deleted') return

  const remaining = (student.totalHours || 0) - (student.usedHours || 0)
  const warning = remaining > 0
    ? `该学生还有 ${remaining} 节剩余课时！\n`
    : ''

  confirmData.value = {
    title: '归档学生',
    message: `确定归档学生"${student.name}"吗？\n${warning}归档后历史记录仍保留。`,
    onConfirm: async () => {
      await deleteStudent(student.id)
      upsertStudent({ ...student, status: 'deleted' })
    },
    danger: true
  }
  showConfirmModal.value = true
}

function closeModal() {
  showModal.value = false
  editingStudent.value = null
  form.value = { name: '', phone: '', age: null, totalHours: 0, remark: '', enrollmentStage: 'enrolled' }
}

// 批量添加
function addBatchRow() {
  batchRows.value.push({ name: '', age: null })
}

function removeBatchRow(index) {
  if (batchRows.value.length > 1) {
    batchRows.value.splice(index, 1)
  }
}

function closeBatchModal() {
  showBatchModal.value = false
  batchRows.value = [{ name: '', age: null }]
  batchEnrollment.value = 'enrolled'
  batchDefaultHours.value = 0
}

async function saveBatchStudents() {
  if (submitting.value) return
  const validRows = batchRows.value.filter(row => row.name && row.name.trim())
  if (validRows.length === 0) {
    toast.warning('请至少填写一个学生姓名')
    return
  }

  submitting.value = true
  try {
    const result = await addStudentsBatch(validRows.map(row => ({ ...row, enrollmentStage: batchEnrollment.value })), batchDefaultHours.value)
    if (Array.isArray(result.students)) students.value = result.students
    closeBatchModal()
    if (result.skipped && result.skipped.length > 0) {
      batchResult.value = { added: result.addedCount, skipped: result.skipped }
      showBatchResultModal.value = true
    } else {
      toast.success(`成功添加 ${result.addedCount} 名学生`)
    }
    if (result.refreshFailed) toast.warning('学生已添加，列表刷新失败，请稍后重试')
  } catch (err) {
    toast.error(err.message || '批量添加失败')
  } finally {
    submitting.value = false
  }
}

// 添加课时
function openAddHoursModal(student) {
  hoursStudent.value = student
  addHoursForm.value = { type: 'add', hours: 1, remark: '' }
  hoursRawInput.value = null
  showHoursModal.value = true
}

function closeHoursModal() {
  showHoursModal.value = false
  hoursStudent.value = null
  hoursRawInput.value = null
}

function captureHoursInput(event) {
  if (event.target?.closest?.('.hours-amount')) hoursRawInput.value = event.target.value
}

async function saveAddHours() {
  if (!hoursStudent.value || submitting.value) return
  const h = Number(hoursRawInput.value ?? addHoursForm.value.hours)
  if (!Number.isFinite(h) || h < 0.5 || h > 10000 || !Number.isInteger(h * 2)) {
    toast.error('课时数须为 0.5 至 10000 之间的半课时倍数')
    return
  }

  submitting.value = true
  try {
    if (addHoursForm.value.type === 'add') {
      upsertStudent(await addHours(hoursStudent.value.id, h, addHoursForm.value.remark))
      toast.success(`已为 ${hoursStudent.value.name} 增加 ${h} 课时`)
    } else {
      upsertStudent(await subtractHours(hoursStudent.value.id, h, addHoursForm.value.remark))
      toast.success(`已为 ${hoursStudent.value.name} 减少 ${h} 课时`)
    }
    closeHoursModal()
  } catch (err) {
    toast.error(err.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// 状态修改
function openStatusMenu(student) {
  if (!canEdit(student)) return
  statusStudent.value = student
  statusForm.value = { status: student.status || 'active' }
  showStatusModal.value = true
}

function closeStatusModal() {
  showStatusModal.value = false
  statusStudent.value = null
}

async function saveStatus() {
  if (!statusStudent.value || submitting.value) return

  submitting.value = true
  try {
    upsertStudent(await updateStudentStatus(statusStudent.value.id, statusForm.value.status))
    closeStatusModal()
    toast.success('学生状态已更新')
  } catch (err) {
    toast.error(err.message || '状态更新失败')
  } finally {
    submitting.value = false
  }
}

// 移动端姓名提示
const nameTipVisible = ref(false)
const nameTipStyle = ref({})
const nameTipText = ref('')
const nameTipStudentId = ref(null)
let nameTipTimer

function openMobileStudent(student, event) {
  if (nameTipVisible.value && nameTipStudentId.value === student.id) {
    nameTipVisible.value = false
    detailStudent.value = student
    return
  }
  if (!showNameTip(student, event)) detailStudent.value = student
}

function showNameTip(student, event) {
  const el = event.target
  if (el.scrollWidth <= el.clientWidth) return false
  nameTipText.value = student.name
  nameTipStudentId.value = student.id
  const rect = el.getBoundingClientRect()
  nameTipStyle.value = {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top - 8}px`,
    transform: 'translateY(-100%)'
  }
  nameTipVisible.value = true
  clearTimeout(nameTipTimer)
  nameTipTimer = setTimeout(() => { nameTipVisible.value = false }, 3000)
  return true
}
onUnmounted(() => clearTimeout(nameTipTimer))

async function handleConfirm() {
  if (submitting.value) return
  submitting.value = true
  try {
    await confirmData.value.onConfirm()
    showConfirmModal.value = false
  } catch (error) { toast.error(error.message || '归档失败') }
  finally { submitting.value = false }
}

// 跳转到课时历史
function goToHistory(studentId) {
  const route = router.resolve({ path: '/hours-history', query: { studentId } })
  window.open(route.href, '_blank')
}
</script>

<style scoped>
.scope-filter { display: flex; gap: 6px; margin-bottom: 10px; }
.scope-filter .selected { background: var(--color-selected); font-weight: 650; }
.mobile-creator { display: block; color: var(--color-text-secondary); font-size: 11px; }
.students {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.header-actions {
  display: flex;
  gap: 12px;
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

.table-container {
  background: white;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.table th, .table td { padding-inline: 10px; }
.table th:nth-child(5), .table td:nth-child(5) { white-space: nowrap; }

.empty-state {
  text-align: center;
  padding: 64px 24px;
  color: var(--color-text-secondary);
}

.empty-state p {
  margin-bottom: 16px;
}

.empty-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.sortable {
  cursor: pointer;
  user-select: none;
}

.sortable:hover {
  color: var(--color-primary);
}

.sort-icon {
  font-size: 12px;
  margin-left: 4px;
}

.confirm-message {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.6;
  margin-bottom: 0;
  white-space: pre-line;
}

.status-badges {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  cursor: default;
}

.badge:first-child {
  cursor: pointer;
}

.badge:first-child:hover {
  opacity: 0.8;
}

.badge-info { background: rgba(65, 120, 185, 0.1); color: var(--color-primary); }
.badge-secondary { background: rgba(99, 117, 138, 0.1); color: var(--color-text-secondary); }
.badge-success { background: rgba(53, 124, 101, 0.1); color: var(--color-success); }
.badge-warning { background: rgba(173, 108, 29, 0.1); color: var(--color-warning); }
.badge-danger { background: rgba(179, 79, 80, 0.1); color: var(--color-danger); }

.action-buttons {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.action-buttons .btn {
  padding: 4px 6px;
  font-size: 13px;
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

.modal-lg {
  max-width: 600px;
}

.modal-sm {
  max-width: 400px;
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

.form-hint {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.form-group input:disabled {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

/* 批量添加样式 */
.batch-form {
  margin-bottom: 16px;
}

.batch-header {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.batch-col {
  flex: 1;
}

.action-col {
  flex: 0 0 60px;
  text-align: center;
}

.batch-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.batch-row {
  display: flex;
  gap: 12px;
}

.add-row-btn {
  margin-top: 12px;
}

.batch-options {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--color-bg-secondary);
}

/* 添加课时信息 */
.hours-info {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
}

/* 加减课时类型选择 */
.hours-type-options {
  display: flex;
  gap: 12px;
}

.hours-type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: white;
  cursor: pointer;
  transition: var(--transition);
  font-size: 14px;
}

.hours-type-btn:hover {
  border-color: var(--color-primary);
}

.hours-type-btn.active.type-add {
  border-color: var(--color-success);
  background: rgba(53, 124, 101, 0.05);
}

.hours-type-btn.active.type-subtract {
  border-color: var(--color-danger);
  background: rgba(179, 79, 80, 0.05);
}

.type-sign {
  font-size: 20px;
  font-weight: 700;
}

.type-add .type-sign { color: var(--color-success); }
.type-subtract .type-sign { color: var(--color-danger); }
.type-label { font-weight: 500; }

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.info-value {
  font-weight: 500;
  color: var(--color-text);
}

/* 状态选择 */
.status-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: white;
  cursor: pointer;
  transition: var(--transition);
}

.status-option:hover {
  border-color: var(--color-primary);
}

.status-option.active {
  border-color: var(--color-primary);
  background: rgba(65, 120, 185, 0.05);
}

.status-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: var(--color-bg-secondary);
}

.status-option.active .status-icon {
  background: var(--color-primary);
  color: white;
}

.status-text {
  font-weight: 600;
  color: var(--color-text);
}

.status-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-left: auto;
}

/* 已删除学生样式 */
.row-deleted {
  opacity: 0.5;
}

.row-deleted td {
  color: var(--color-text-secondary);
}

.row-deleted td strong {
  text-decoration: line-through;
  color: var(--color-text-secondary);
}

/* ===== 移动端卡片（默认隐藏）===== */
.mobile-only { display: none; }

.mobile-card-list {
  background: white;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.mobile-card {
  display: grid;
  min-width: 0;
  border-bottom: 1px solid var(--color-border);
}
.mobile-card:last-child { border-bottom: none; }

.mobile-card-sticky {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 8px;
  padding: 12px 14px 8px;
}

.mobile-name {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  max-width: min(5em, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.mobile-right-info {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: flex;
  align-items: center;
  gap: 6px;
}

.name-tip {
  position: fixed;
  background: rgba(29, 29, 31, 0.92);
  color: white;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
}

.mobile-remaining {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.mobile-status-badge {
  flex-shrink: 0;
}

.mobile-card-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px;
  padding: 3px 8px 5px;
  border-top: 1px solid var(--color-border);
}
.mobile-card-actions .btn { min-width: 0; width: 100%; padding: 6px 2px; }

.card-deleted .mobile-name {
  text-decoration: line-through;
  color: var(--color-text-secondary);
}

.btn-danger-text {
  color: var(--color-danger) !important;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .btn {
    flex: 1;
  }

  .desktop-only { display: none; }
  .mobile-only { display: block; }

  .action-buttons {
    flex-wrap: nowrap;
  }

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
</style>
