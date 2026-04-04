<template>
  <div class="attendance fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">点名扣课时</h1>
        <p class="page-subtitle">记录学生出勤并扣除课时</p>
      </div>
    </div>

    <div class="tip" v-if="courses.length === 0">
      <p>请先创建课程后再进行点名</p>
      <router-link to="/courses" class="btn btn-primary" style="margin-top: 12px">去创建课程</router-link>
    </div>

    <template v-else>
      <div class="select-course">
        <label>选择课程</label>
        <select class="input" v-model="selectedCourseId" @change="loadCourseStudents">
          <option value="">请选择课程</option>
          <option v-for="course in courses" :key="course.id" :value="course.id">
            {{ course.name }} - {{ getTeacherName(course.teacherId) }} ({{ getWeekdayText(course.weekday) }})
          </option>
        </select>
      </div>

      <div class="attendance-form" v-if="selectedCourse">
        <div class="form-header">
          <h2>{{ selectedCourse.name }}</h2>
          <span class="date">{{ today }}</span>
        </div>

        <div class="student-list">
          <div class="list-header">
            <span>学生名单</span>
            <div class="quick-actions">
              <button type="button" class="btn btn-text" @click="selectAll">全选</button>
              <button type="button" class="btn btn-text" @click="deselectAll">取消全选</button>
            </div>
          </div>
          <div class="students">
            <label class="student-item" v-for="student in courseStudents" :key="student.id">
              <input type="checkbox" :value="student.id" v-model="checkedStudents" />
              <div class="student-info">
                <span class="student-name">{{ student.name }}</span>
                <span class="student-hours">剩余 {{ student.totalHours - (student.usedHours || 0) }} 课时</span>
              </div>
              <span class="check-mark" v-if="checkedStudents.includes(student.id)">✓</span>
            </label>
          </div>
        </div>

        <div class="deduct-info">
          <span>将扣除 <strong>{{ selectedCourse.hoursPerClass || 1 }}</strong> 课时/人</span>
          <span>共 <strong>{{ checkedStudents.length * (selectedCourse.hoursPerClass || 1) }}</strong> 课时</span>
        </div>

        <button class="btn btn-primary btn-lg" @click="handleConfirmClick" :disabled="checkedStudents.length === 0">
          确认点名 ({{ checkedStudents.length }} 人)
        </button>
      </div>

      <!-- 点名确认弹框 -->
      <div class="modal-overlay" v-if="showConfirmModal" @click.self="showConfirmModal = false">
        <div class="modal modal-sm">
          <h2 class="modal-title">确认点名</h2>
          <div class="confirm-warning" v-if="isDuplicateAttendance">
            <p>⚠️ 该课程今天已经点过名了，是否继续点名？</p>
          </div>
          <div class="confirm-info">
            <p>课程：<strong>{{ selectedCourse?.name }}</strong></p>
            <p>出勤学生：<strong>{{ checkedStudents.length }}</strong> 人</p>
            <p>扣除课时：<strong>{{ selectedCourse?.hoursPerClass || 1 }}</strong> 课时/人</p>
            <p>共计：<strong>{{ checkedStudents.length * (selectedCourse?.hoursPerClass || 1) }}</strong> 课时</p>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showConfirmModal = false">取消</button>
            <button class="btn btn-primary" @click="submitAttendance">确认点名</button>
          </div>
        </div>
      </div>

      <!-- 选择性删除弹窗 -->
      <div class="modal-overlay" v-if="showDeleteModal" @click.self="showDeleteModal = false">
        <div class="modal modal-sm">
          <h2 class="modal-title">删除点名记录</h2>
          <p class="delete-desc">选择要删除的学生，删除后将还原对应课时：</p>
          <div class="delete-student-list">
            <label class="delete-student-item" v-for="student in deleteTargetStudents" :key="student.id">
              <input type="checkbox" :value="student.id" v-model="deleteCheckedStudents" />
              <span class="delete-student-name">{{ student.name }}</span>
            </label>
          </div>
          <div class="delete-select-actions">
            <button type="button" class="btn btn-text" @click="deleteCheckedStudents = deleteTargetStudents.map(s => s.id)">全选</button>
            <button type="button" class="btn btn-text" @click="deleteCheckedStudents = []">取消全选</button>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showDeleteModal = false">取消</button>
            <button class="btn btn-primary" style="background: var(--color-danger);" @click="confirmDeleteStudents" :disabled="deleteCheckedStudents.length === 0">
              确认删除 ({{ deleteCheckedStudents.length }} 人)
            </button>
          </div>
        </div>
      </div>

      <!-- 点名历史 -->
      <div class="history">
        <div class="history-header">
          <h3 class="history-title">点名记录</h3>
          <div class="filter-group">
            <select class="input filter-select" v-model="filterCourseId">
              <option value="">全部课程</option>
              <option v-for="course in courses" :key="course.id" :value="course.id">
                {{ course.name }}
              </option>
            </select>
            <input type="month" class="input filter-select" v-model="filterMonth" />
          </div>
        </div>
        <div class="history-list" v-if="filteredRecords.length > 0">
          <div class="history-item" v-for="record in filteredRecords" :key="record.id">
            <div class="history-main">
              <div class="history-row">
                <span class="history-date">{{ record.date }}</span>
                <span class="history-course">{{ getCourseName(record.courseId) }}</span>
                <span class="history-teacher">{{ getTeacherNameByCourse(record.courseId) }}</span>
              </div>
              <div class="history-row">
                <span class="history-students">出勤: {{ getStudentNames(record.studentIds) }}</span>
                <span class="history-hours">扣除 {{ record.hoursDeducted }} 课时/人</span>
              </div>
            </div>
            <button class="btn btn-text delete-btn" @click="openDeleteModal(record)">删除</button>
          </div>
        </div>
        <div class="empty-history" v-else>
          <p>暂无点名记录</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getCourses, getStudents, getTeachers, getAttendance, addAttendance, deductHours, removeStudentsFromRecord } from '../utils/storage'
import { useToast } from '../composables/useToast'

const toast = useToast()
const courses = ref([])
const students = ref([])
const teachers = ref([])
const attendanceRecords = ref([])
const selectedCourseId = ref('')
const filterCourseId = ref('')
const filterMonth = ref(new Date().toISOString().slice(0, 7))
const checkedStudents = ref([])
const courseStudents = ref([])
const showConfirmModal = ref(false)
const isDuplicateAttendance = ref(false)

// 选择性删除相关
const showDeleteModal = ref(false)
const deleteTargetRecord = ref(null)
const deleteCheckedStudents = ref([])

// 检查今天是否已经点过名
function hasTodayAttendance() {
  if (!selectedCourse.value) return false
  const today = new Date().toISOString().split('T')[0]
  return attendanceRecords.value.some(r =>
    r.courseId === selectedCourse.value.id && r.date === today
  )
}

// 点击确认点名按钮
function handleConfirmClick() {
  isDuplicateAttendance.value = hasTodayAttendance()
  showConfirmModal.value = true
}

const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })

onMounted(() => {
  courses.value = getCourses()
  students.value = getStudents()
  teachers.value = getTeachers()
  attendanceRecords.value = getAttendance().slice(-20).reverse()
})

const selectedCourse = computed(() => {
  return courses.value.find(c => c.id === selectedCourseId.value)
})

const filteredRecords = computed(() => {
  let result = attendanceRecords.value
  if (filterCourseId.value) {
    result = result.filter(r => r.courseId === filterCourseId.value)
  }
  if (filterMonth.value) {
    result = result.filter(r => r.date && r.date.startsWith(filterMonth.value))
  }
  return result
})

const weekdayMap = { 1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四', 5: '星期五', 6: '星期六', 7: '星期日' }

function getWeekdayText(weekday) {
  return weekdayMap[weekday] || ''
}

function getTeacherName(teacherId) {
  const teacher = teachers.value.find(t => t.id === teacherId)
  return teacher ? teacher.name : ''
}

function getTeacherNameByCourse(courseId) {
  const course = courses.value.find(c => c.id === courseId)
  if (!course) return ''
  const teacher = teachers.value.find(t => t.id === course.teacherId)
  return teacher ? teacher.name : ''
}

function getCourseName(courseId) {
  const course = courses.value.find(c => c.id === courseId)
  return course ? course.name : ''
}

function getStudentNames(studentIds) {
  return studentIds.map(id => {
    const student = students.value.find(s => s.id === id)
    return student ? student.name : ''
  }).filter(Boolean).join('、')
}

function loadCourseStudents() {
  if (!selectedCourse.value) {
    courseStudents.value = []
    return
  }
  courseStudents.value = selectedCourse.value.studentIds
    .map(id => students.value.find(s => s.id === id))
    .filter(Boolean)
    .filter(s => s.status === 'active')
  checkedStudents.value = [...courseStudents.value.map(s => s.id)]
}

function selectAll() {
  checkedStudents.value = courseStudents.value.map(s => s.id)
}

function deselectAll() {
  checkedStudents.value = []
}

function submitAttendance() {
  if (!selectedCourse.value || checkedStudents.value.length === 0) return

  const hoursPerStudent = selectedCourse.value.hoursPerClass || 1

  // 扣除课时
  checkedStudents.value.forEach(studentId => {
    deductHours(studentId, hoursPerStudent)
  })

  // 记录点名
  addAttendance({
    courseId: selectedCourse.value.id,
    date: new Date().toISOString().split('T')[0],
    studentIds: [...checkedStudents.value],
    hoursDeducted: hoursPerStudent
  })

  // 更新本地数据
  students.value = getStudents()
  attendanceRecords.value = getAttendance().slice(-20).reverse()

  // 重置
  showConfirmModal.value = false
  checkedStudents.value = []
  toast.success('点名成功！已扣除对应课时。')
  loadCourseStudents()
}

// 选择性删除相关
const deleteTargetStudents = computed(() => {
  if (!deleteTargetRecord.value) return []
  return (deleteTargetRecord.value.studentIds || [])
    .map(id => students.value.find(s => s.id === id))
    .filter(Boolean)
})

function openDeleteModal(record) {
  deleteTargetRecord.value = record
  deleteCheckedStudents.value = []
  showDeleteModal.value = true
}

function confirmDeleteStudents() {
  if (!deleteTargetRecord.value || deleteCheckedStudents.value.length === 0) return

  const result = removeStudentsFromRecord(
    deleteTargetRecord.value.id,
    deleteCheckedStudents.value
  )
  attendanceRecords.value = result
  students.value = getStudents()
  showDeleteModal.value = false

  if (deleteCheckedStudents.value.length === (deleteTargetRecord.value.studentIds || []).length) {
    toast.success('已删除整条点名记录并还原所有学生课时。')
  } else {
    toast.success(`已删除 ${deleteCheckedStudents.value.length} 名学生并还原课时。`)
  }
}
</script>

<style scoped>
.attendance {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
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

.tip {
  text-align: center;
  padding: 64px 24px;
  background: white;
  border-radius: var(--radius-lg);
  color: var(--color-text-secondary);
}

.select-course {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
}

.select-course label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 8px;
}

.attendance-form {
  background: white;
  border-radius: var(--radius-lg);
  padding: 32px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 32px;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-bg-secondary);
}

.form-header h2 {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text);
}

.date {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.student-list {
  margin-bottom: 24px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.quick-actions {
  display: flex;
  gap: 8px;
}

.students {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.student-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition);
}

.student-item:has(input:checked) {
  background: rgba(0, 113, 227, 0.1);
}

.student-item input {
  width: 20px;
  height: 20px;
}

.student-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.student-name {
  font-weight: 500;
  color: var(--color-text);
}

.student-hours {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.check-mark {
  color: var(--color-primary);
  font-size: 18px;
  font-weight: 600;
}

.deduct-info {
  display: flex;
  justify-content: space-between;
  padding: 16px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 24px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.deduct-info strong {
  color: var(--color-primary);
}

.btn-lg {
  width: 100%;
  padding: 16px;
  font-size: 16px;
}

.history {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.history-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.filter-group {
  display: flex;
  gap: 12px;
}

.filter-select {
  width: auto;
  min-width: 160px;
  padding: 8px 12px;
  font-size: 13px;
}

.history-list {
  display: flex;
  flex-direction: column;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--color-bg-secondary);
}

.history-item:last-child {
  border-bottom: none;
}

.history-main {
  flex: 1;
}

.history-row {
  display: flex;
  gap: 16px;
  margin-bottom: 4px;
}

.history-row:last-child {
  margin-bottom: 0;
}

.history-date {
  color: var(--color-text-secondary);
  font-size: 13px;
  min-width: 100px;
}

.history-course {
  font-weight: 500;
  color: var(--color-text);
  font-size: 14px;
}

.history-students {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.history-hours {
  color: var(--color-primary);
  font-size: 13px;
}

.delete-btn {
  color: var(--color-danger);
  padding: 4px 8px;
}

.delete-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 16px;
}

.delete-student-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}

.delete-student-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.delete-student-item input {
  width: 18px;
  height: 18px;
}

.delete-student-name {
  font-size: 14px;
  color: var(--color-text);
}

.delete-select-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  margin-bottom: 16px;
}

.empty-history {
  text-align: center;
  padding: 32px;
  color: var(--color-text-secondary);
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

.modal-sm {
  max-width: 400px;
}

.modal-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
}

.confirm-info {
  margin-bottom: 24px;
}

.confirm-warning {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 16px;
}

.confirm-warning p {
  margin: 0;
  color: #856404;
  font-size: 14px;
  font-weight: 500;
}

.confirm-warning {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 16px;
  text-align: center;
}

.confirm-warning p {
  margin: 0;
  font-size: 14px;
  color: #856404;
}

.confirm-info p {
  margin-bottom: 12px;
  color: var(--color-text-secondary);
}

.confirm-info strong {
  color: var(--color-text);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.confirm-warning {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 16px;
  color: #856404;
}

.confirm-warning p {
  margin: 0;
  font-size: 14px;
}
</style>