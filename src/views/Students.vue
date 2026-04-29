<template>
  <div class="students fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">学生管理</h1>
        <p class="page-subtitle">管理所有学生信息和课时</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="showBatchModal = true">
          批量添加
        </button>
        <button class="btn btn-primary" @click="openAddModal">
          <span>+</span> 添加学生
        </button>
      </div>
    </div>

    <div class="search-bar">
      <input
        type="text"
        class="input"
        placeholder="搜索学生姓名或电话..."
        v-model="searchText"
      />
    </div>

    <div class="table-container desktop-only">
      <table class="table" v-if="filteredStudents.length > 0">
        <thead>
          <tr>
            <th>姓名</th>
            <th>年龄</th>
            <th>联系电话</th>
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
            <td><strong>{{ student.name }}</strong></td>
            <td>{{ student.age || '-' }}</td>
            <td>{{ student.phone || '-' }}</td>
            <td>{{ student.totalHours }}</td>
            <td>{{ student.usedHours || 0 }}</td>
            <td>{{ (student.totalHours || 0) - (student.usedHours || 0) }}</td>
            <td>
              <div class="status-badges">
                <span class="badge" :class="getStudentStatusClass(student)" @click="openStatusMenu(student)">
                  {{ getStudentStatusText(student) }}
                </span>
                <span class="badge" :class="getHoursStatusClass(student)">
                  {{ getHoursStatusText(student) }}
                </span>
              </div>
            </td>
            <td>
              <div class="action-buttons" v-if="student.status === 'active'">
                <button class="btn btn-text" @click="openAddHoursModal(student)" title="加减课时">加减课</button>
                <button class="btn btn-text" @click="goToHistory(student.id)" title="课时历史">历史</button>
                <button class="btn btn-text" @click="editStudent(student)">编辑</button>
                <button class="btn btn-text" style="color: var(--color-danger)" @click="removeStudent(student)">删除</button>
              </div>
              <div class="action-buttons" v-else>
                <button class="btn btn-text" @click="goToHistory(student.id)" title="课时历史">历史</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="empty-state" v-else>
        <p>暂无学生数据</p>
        <div class="empty-actions">
          <button class="btn btn-secondary" @click="showBatchModal = true">批量添加</button>
          <button class="btn btn-primary" @click="openAddModal">添加第一个学生</button>
        </div>
      </div>
    </div>

    <!-- 移动端卡片列表 -->
    <div class="mobile-card-list mobile-only" v-if="filteredStudents.length > 0">
      <div class="mobile-card" v-for="student in filteredStudents" :key="student.id" :class="{ 'card-deleted': student.status === 'deleted' || student.status === 'quit' }">
        <div class="mobile-card-sticky">
          <strong class="mobile-name" @click="showNameTip(student, $event)">{{ student.name }}</strong>
          <div class="mobile-right-info">
            <span class="mobile-remaining" :class="getHoursStatusClass(student)">{{ (student.totalHours || 0) - (student.usedHours || 0) }} 课时</span>
            <span class="badge mobile-status-badge" :class="getStudentStatusClass(student)" @click="openStatusMenu(student)">
              {{ getStudentStatusText(student) }}
            </span>
          </div>
        </div>
        <div class="mobile-card-actions">
          <template v-if="student.status === 'active'">
            <button class="btn btn-text" @click="openAddHoursModal(student)">加减课</button>
            <button class="btn btn-text" @click="goToHistory(student.id)">历史</button>
            <button class="btn btn-text" @click="editStudent(student)">编辑</button>
            <button class="btn btn-text btn-danger-text" @click="removeStudent(student)">删除</button>
          </template>
          <template v-else>
            <button class="btn btn-text" @click="goToHistory(student.id)">历史</button>
          </template>
        </div>
      </div>
    </div>
    <div class="empty-state mobile-only" v-if="filteredStudents.length === 0">
      <p>暂无学生数据</p>
      <div class="empty-actions">
        <button class="btn btn-secondary" @click="showBatchModal = true">批量添加</button>
        <button class="btn btn-primary" @click="openAddModal">添加第一个学生</button>
      </div>
    </div>

    <!-- 添加/编辑弹窗 -->
    <div class="modal-overlay" v-if="showModal" @click.self="closeModal">
      <div class="modal">
        <h2 class="modal-title">{{ editingStudent ? '编辑学生' : '添加学生' }}</h2>
        <form @submit.prevent="saveStudent">
          <div class="form-group">
            <label>姓名 *</label>
            <input type="text" class="input" v-model="form.name" required placeholder="请输入学生姓名" />
          </div>
          <div class="form-group">
            <label>年龄</label>
            <input type="number" class="input" v-model.number="form.age" min="1" max="100" placeholder="请输入学生年龄" />
          </div>
          <div class="form-group">
            <label>联系电话</label>
            <input type="tel" class="input" v-model="form.phone" placeholder="请输入家长联系电话" />
          </div>
          <div class="form-group">
            <label>{{ editingStudent ? '初始课时' : '初始课时 *' }}</label>
            <input
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
            <textarea class="input" v-model="form.remark" rows="2" placeholder="特殊情况说明"></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 批量添加弹窗 -->
    <div class="modal-overlay" v-if="showBatchModal" @click.self="closeBatchModal">
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
              <input type="text" class="input batch-col" v-model="row.name" placeholder="学生姓名" />
              <input type="number" class="input batch-col" v-model.number="row.age" placeholder="年龄" min="1" max="100" />
              <button type="button" class="btn btn-text batch-col action-col" @click="removeBatchRow(index)" :disabled="batchRows.length <= 1">删除</button>
            </div>
          </div>
          <button type="button" class="btn btn-secondary add-row-btn" @click="addBatchRow">+ 添加一行</button>

          <div class="batch-options">
            <div class="form-group">
              <label>默认课时</label>
              <input type="number" class="input" v-model.number="batchDefaultHours" min="0" step="0.5" placeholder="默认0课时" />
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeBatchModal">取消</button>
          <button type="button" class="btn btn-primary" @click="saveBatchStudents" :disabled="!hasValidBatchData || submitting">{{ submitting ? '提交中...' : '确认添加' }}</button>
        </div>
      </div>
    </div>

    <!-- 批量添加结果弹窗 -->
    <div class="modal-overlay" v-if="showBatchResultModal">
      <div class="modal modal-sm">
        <h2 class="modal-title">批量添加结果</h2>
        <p style="font-size: 14px; margin-bottom: 12px;">成功添加 <strong>{{ batchResult.added }}</strong> 名学生</p>
        <div v-if="batchResult.skipped.length > 0" class="confirm-warning" style="margin-bottom: 16px;">
          <p>以下姓名已存在，已自动跳过：</p>
          <p><strong>{{ batchResult.skipped.join('、') }}</strong></p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="showBatchResultModal = false">确定</button>
        </div>
      </div>
    </div>

    <!-- 加减课时弹窗 -->
    <div class="modal-overlay" v-if="showHoursModal" @click.self="closeHoursModal">
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
        <form @submit.prevent="saveAddHours">
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
            <input type="number" class="input" v-model.number="addHoursForm.hours" required min="0.5" step="0.5" :max="addHoursForm.type === 'subtract' ? (hoursStudent ? (hoursStudent.totalHours || 0) - (hoursStudent.usedHours || 0) : 0.5) : undefined" :placeholder="addHoursForm.type === 'add' ? '请输入要增加的课时数' : '请输入要减少的课时数'" />
            <span class="form-hint" v-if="addHoursForm.type === 'subtract' && hoursStudent">最多可减少 {{ (hoursStudent.totalHours || 0) - (hoursStudent.usedHours || 0) }} 课时</span>
          </div>
          <div class="form-group">
            <label>备注</label>
            <input type="text" class="input" v-model="addHoursForm.remark" :placeholder="addHoursForm.type === 'add' ? '如：续费20课时' : '如：输错修正'" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeHoursModal">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '提交中...' : '确认' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 状态修改弹窗 -->
    <div class="modal-overlay" v-if="showStatusModal" @click.self="closeStatusModal">
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
          <button type="button" class="btn btn-secondary" @click="closeStatusModal">取消</button>
          <button type="button" class="btn btn-primary" @click="saveStatus" :disabled="submitting">{{ submitting ? '提交中...' : '确认修改' }}</button>
        </div>
      </div>
    </div>

    <!-- 确认弹窗 -->
    <div class="modal-overlay" v-if="showConfirmModal" @click.self="showConfirmModal = false">
      <div class="modal modal-sm">
        <h2 class="modal-title">{{ confirmData.title }}</h2>
        <p class="confirm-message" v-if="confirmData.message">{{ confirmData.message }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showConfirmModal = false">取消</button>
          <button class="btn btn-primary" :style="confirmData.danger ? 'background: var(--color-danger)' : ''" @click="handleConfirm">确认</button>
        </div>
      </div>
    </div>

    <!-- 移动端姓名提示 -->
    <div class="name-tip" v-if="nameTipVisible" :style="nameTipStyle" @click="nameTipVisible = false">{{ nameTipText }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getStudents, addStudent, updateStudent, deleteStudent, updateStudentStatus, addStudentsBatch, addHours, subtractHours, checkStudentNameExists } from '../utils/storage'
import { useToast } from '../composables/useToast'

const router = useRouter()
const toast = useToast()
const students = ref([])
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
})

const batchRows = ref([{ name: '', age: null }])
const batchDefaultHours = ref(0)

const addHoursForm = ref({
  type: 'add',
  hours: 1,
  remark: ''
})

const statusForm = ref({
  status: 'active'
})

async function loadData() {
  students.value = await getStudents() || []
}

onMounted(loadData)

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') loadData()
}
onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange))
onUnmounted(() => document.removeEventListener('visibilitychange', handleVisibilityChange))

const filteredStudents = computed(() => {
  let result = students.value

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
  if (student.status === 'deleted') return '已删除'
  return student.status === 'quit' ? '退学' : '正常'
}

// 课时状态（自动计算）
function getHoursStatusClass(student) {
  const remaining = (student.totalHours || 0) - (student.usedHours || 0)
  if (remaining <= 0) return 'badge-danger'
  if (remaining < 3) return 'badge-warning'
  return 'badge-success'
}

function getHoursStatusText(student) {
  const remaining = (student.totalHours || 0) - (student.usedHours || 0)
  if (remaining <= 0) return '已耗尽'
  if (remaining < 3) return '不足'
  return '正常'
}

function openAddModal() {
  editingStudent.value = null
  form.value = { name: '', phone: '', age: null, totalHours: 0, remark: '' }
  showModal.value = true
}

function editStudent(student) {
  editingStudent.value = student
  form.value = { ...student }
  showModal.value = true
}

const submitting = ref(false)

async function saveStudent() {
  if (submitting.value) return
  submitting.value = true
  try {
    // 检查重名
    const exists = await checkStudentNameExists(form.value.name, editingStudent.value?.id)
    if (exists) {
      toast.warning(`学生"${form.value.name}"已存在，请使用其他姓名`)
      return
    }

    if (editingStudent.value) {
      students.value = await updateStudent(editingStudent.value.id, form.value)
    } else {
      students.value = await addStudent(form.value)
    }
    closeModal()
  } catch (err) {
    toast.error(err.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

function removeStudent(student) {
  if (student.status === 'deleted') return

  const remaining = (student.totalHours || 0) - (student.usedHours || 0)
  const warning = remaining > 0
    ? `该学生还有 ${remaining} 节剩余课时！\n`
    : ''

  confirmData.value = {
    title: '删除学生',
    message: `确定要删除学生"${student.name}"吗？\n${warning}删除后该学生的历史数据将保留，但无法进行任何操作。`,
    onConfirm: async () => { students.value = await updateStudentStatus(student.id, 'deleted') },
    danger: true
  }
  showConfirmModal.value = true
}

function closeModal() {
  showModal.value = false
  editingStudent.value = null
  form.value = { name: '', phone: '', age: null, totalHours: 0, remark: '' }
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
    // 检查重名
    const existingNames = []
    for (const row of validRows) {
      const exists = await checkStudentNameExists(row.name.trim())
      if (exists) existingNames.push(row.name.trim())
    }

    // 检查批量输入内部是否有重复
    const duplicateInBatch = []
    const nameSet = new Set()
    validRows.forEach(row => {
      const name = row.name.trim()
      if (nameSet.has(name)) duplicateInBatch.push(name)
      nameSet.add(name)
    })

    if (existingNames.length > 0) {
      toast.warning(`以下学生姓名已存在：${existingNames.join('、')}`)
      return
    }
    if (duplicateInBatch.length > 0) {
      toast.warning(`批量输入中存在重复姓名：${duplicateInBatch.join('、')}`)
      return
    }

    const result = await addStudentsBatch(validRows, batchDefaultHours.value)
    students.value = result.students
    closeBatchModal()
    if (result.skipped && result.skipped.length > 0) {
      batchResult.value = { added: result.addedCount, skipped: result.skipped }
      showBatchResultModal.value = true
    } else {
      toast.success(`成功添加 ${result.addedCount} 名学生`)
    }
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
  showHoursModal.value = true
}

function closeHoursModal() {
  showHoursModal.value = false
  hoursStudent.value = null
}

async function saveAddHours() {
  if (!hoursStudent.value || addHoursForm.value.hours <= 0 || submitting.value) return
  const h = Number(addHoursForm.value.hours)
  addHoursForm.value.hours = h % 0.5 !== 0 ? Math.round(h * 2) / 2 : h

  submitting.value = true
  try {
    if (addHoursForm.value.type === 'add') {
      students.value = await addHours(hoursStudent.value.id, addHoursForm.value.hours, addHoursForm.value.remark)
      toast.success(`已为 ${hoursStudent.value.name} 增加 ${addHoursForm.value.hours} 课时`)
    } else {
      students.value = await subtractHours(hoursStudent.value.id, addHoursForm.value.hours, addHoursForm.value.remark)
      toast.success(`已为 ${hoursStudent.value.name} 减少 ${addHoursForm.value.hours} 课时`)
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
    students.value = await updateStudentStatus(statusStudent.value.id, statusForm.value.status)
    closeStatusModal()
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

function showNameTip(student, event) {
  const el = event.target
  if (el.scrollWidth <= el.clientWidth) return
  nameTipText.value = student.name
  const rect = el.getBoundingClientRect()
  nameTipStyle.value = {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top - 8}px`,
    transform: 'translateY(-100%)'
  }
  nameTipVisible.value = true
  setTimeout(() => { nameTipVisible.value = false }, 3000)
}

async function handleConfirm() {
  try {
    await confirmData.value.onConfirm()
    showConfirmModal.value = false
  } catch {}
}

// 跳转到课时历史
function goToHistory(studentId) {
  const route = router.resolve({ path: '/hours-history', query: { studentId } })
  window.open(route.href, '_blank')
}
</script>

<style scoped>
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

.badge-info { background: rgba(0, 113, 227, 0.1); color: var(--color-primary); }
.badge-secondary { background: rgba(142, 142, 147, 0.1); color: #8e8e93; }
.badge-success { background: rgba(52, 199, 89, 0.1); color: var(--color-success); }
.badge-warning { background: rgba(255, 149, 0, 0.1); color: var(--color-warning); }
.badge-danger { background: rgba(255, 59, 48, 0.1); color: var(--color-danger); }

.action-buttons {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.action-buttons .btn {
  padding: 4px 8px;
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
  background: rgba(52, 199, 89, 0.05);
}

.hours-type-btn.active.type-subtract {
  border-color: var(--color-danger);
  background: rgba(255, 59, 48, 0.05);
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
  background: rgba(0, 113, 227, 0.05);
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
  color: #8e8e93;
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
  display: flex;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  border-bottom: 1px solid var(--color-border);
}
.mobile-card:last-child { border-bottom: none; }
.mobile-card::-webkit-scrollbar { display: none; }

.mobile-card-sticky {
  position: sticky;
  left: 0;
  z-index: 1;
  background: white;
  padding: 12px 16px;
  flex-shrink: 0;
  min-width: 55%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mobile-name {
  font-size: 15px;
  max-width: 5em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.mobile-right-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 12px;
  flex-shrink: 0;
}

.card-deleted .mobile-name {
  text-decoration: line-through;
  color: #8e8e93;
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