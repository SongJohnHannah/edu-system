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

    <div class="table-container">
      <table class="table" v-if="filteredStudents.length > 0">
        <thead>
          <tr>
            <th>姓名</th>
            <th>年龄</th>
            <th>联系电话</th>
            <th>总课时</th>
            <th>已用课时</th>
            <th>剩余课时</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="student in filteredStudents" :key="student.id">
            <td><strong>{{ student.name }}</strong></td>
            <td>{{ student.age || '-' }}</td>
            <td>{{ student.phone || '-' }}</td>
            <td>{{ student.totalHours }}</td>
            <td>{{ student.usedHours || 0 }}</td>
            <td>{{ student.totalHours - (student.usedHours || 0) }}</td>
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
              <div class="action-buttons">
                <button class="btn btn-text" @click="openAddHoursModal(student)" title="添加课时">加课</button>
                <button class="btn btn-text" @click="goToHistory(student.id)" title="课时历史">历史</button>
                <button class="btn btn-text" @click="editStudent(student)">编辑</button>
                <button class="btn btn-text" style="color: var(--color-danger)" @click="removeStudent(student.id)">删除</button>
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
            <button type="submit" class="btn btn-primary">保存</button>
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
              <input type="number" class="input" v-model.number="batchDefaultHours" min="0" placeholder="默认0课时" />
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeBatchModal">取消</button>
          <button type="button" class="btn btn-primary" @click="saveBatchStudents" :disabled="!hasValidBatchData">确认添加</button>
        </div>
      </div>
    </div>

    <!-- 添加课时弹窗 -->
    <div class="modal-overlay" v-if="showHoursModal" @click.self="closeHoursModal">
      <div class="modal">
        <h2 class="modal-title">添加课时</h2>
        <div class="hours-info">
          <div class="info-row">
            <span class="info-label">学生</span>
            <span class="info-value">{{ hoursStudent?.name }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">当前剩余</span>
            <span class="info-value">{{ hoursStudent ? hoursStudent.totalHours - (hoursStudent.usedHours || 0) : 0 }} 课时</span>
          </div>
        </div>
        <form @submit.prevent="saveAddHours">
          <div class="form-group">
            <label>添加课时数 *</label>
            <input type="number" class="input" v-model.number="addHoursForm.hours" required min="1" placeholder="请输入要添加的课时数" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <input type="text" class="input" v-model="addHoursForm.remark" placeholder="如：续费20课时" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeHoursModal">取消</button>
            <button type="submit" class="btn btn-primary">确认添加</button>
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
          <button type="button" class="btn btn-primary" @click="saveStatus">确认修改</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getStudents, addStudent, updateStudent, deleteStudent, updateStudentStatus, addStudentsBatch, addHours, checkStudentNameExists } from '../utils/storage'

const router = useRouter()
const students = ref([])
const searchText = ref('')
const showModal = ref(false)
const showBatchModal = ref(false)
const showHoursModal = ref(false)
const showStatusModal = ref(false)
const editingStudent = ref(null)
const hoursStudent = ref(null)
const statusStudent = ref(null)

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
  hours: 1,
  remark: ''
})

const statusForm = ref({
  status: 'active'
})

onMounted(() => {
  students.value = getStudents()
})

const filteredStudents = computed(() => {
  let result = students.value

  // 按姓名/电话搜索
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    result = result.filter(s =>
      s.name.toLowerCase().includes(search) ||
      s.phone.includes(search)
    )
  }

  // 按剩余课时排序（从小到大）
  return result.slice().sort((a, b) => {
    const remainingA = a.totalHours - (a.usedHours || 0)
    const remainingB = b.totalHours - (b.usedHours || 0)
    return remainingA - remainingB
  })
})

const hasValidBatchData = computed(() => {
  return batchRows.value.some(row => row.name && row.name.trim())
})

// 学生状态（手动设置）
function getStudentStatusClass(student) {
  return student.status === 'quit' ? 'badge-secondary' : 'badge-info'
}

function getStudentStatusText(student) {
  return student.status === 'quit' ? '退学' : '正常'
}

// 课时状态（自动计算）
function getHoursStatusClass(student) {
  const remaining = student.totalHours - (student.usedHours || 0)
  if (remaining <= 0) return 'badge-danger'
  if (remaining < 3) return 'badge-warning'
  return 'badge-success'
}

function getHoursStatusText(student) {
  const remaining = student.totalHours - (student.usedHours || 0)
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

function saveStudent() {
  // 检查重名
  if (checkStudentNameExists(form.value.name, editingStudent.value?.id)) {
    alert(`学生"${form.value.name}"已存在，请使用其他姓名`)
    return
  }

  if (editingStudent.value) {
    students.value = updateStudent(editingStudent.value.id, form.value)
  } else {
    students.value = addStudent(form.value)
  }
  closeModal()
}

function removeStudent(id) {
  if (confirm('确定要删除这个学生吗？')) {
    students.value = deleteStudent(id)
  }
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

function saveBatchStudents() {
  const validRows = batchRows.value.filter(row => row.name && row.name.trim())
  if (validRows.length === 0) {
    alert('请至少填写一个学生姓名')
    return
  }

  // 检查重名
  const existingNames = []
  const duplicateInBatch = []

  validRows.forEach(row => {
    if (checkStudentNameExists(row.name.trim())) {
      existingNames.push(row.name.trim())
    }
  })

  // 检查批量输入内部是否有重复
  const nameSet = new Set()
  validRows.forEach(row => {
    const name = row.name.trim()
    if (nameSet.has(name)) {
      duplicateInBatch.push(name)
    }
    nameSet.add(name)
  })

  if (existingNames.length > 0) {
    alert(`以下学生姓名已存在：${existingNames.join('、')}\n请修改后重试`)
    return
  }

  if (duplicateInBatch.length > 0) {
    alert(`批量输入中存在重复姓名：${duplicateInBatch.join('、')}\n请修改后重试`)
    return
  }

  const result = addStudentsBatch(validRows, batchDefaultHours.value)
  students.value = result.students

  alert(`成功添加 ${result.addedCount} 名学生`)
  closeBatchModal()
}

// 添加课时
function openAddHoursModal(student) {
  hoursStudent.value = student
  addHoursForm.value = { hours: 1, remark: '' }
  showHoursModal.value = true
}

function closeHoursModal() {
  showHoursModal.value = false
  hoursStudent.value = null
}

function saveAddHours() {
  if (!hoursStudent.value || addHoursForm.value.hours <= 0) return

  students.value = addHours(hoursStudent.value.id, addHoursForm.value.hours, addHoursForm.value.remark)
  alert(`已为 ${hoursStudent.value.name} 添加 ${addHoursForm.value.hours} 课时`)
  closeHoursModal()
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

function saveStatus() {
  if (!statusStudent.value) return

  students.value = updateStudentStatus(statusStudent.value.id, statusForm.value.status)
  closeStatusModal()
}

// 跳转到课时历史
function goToHistory(studentId) {
  router.push({ path: '/hours-history', query: { studentId } })
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

.status-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
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
  flex-wrap: wrap;
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
}
</style>