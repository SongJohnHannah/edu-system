<template>
  <div class="courses fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">排课管理</h1>
        <p class="page-subtitle">创建和管理课程安排</p>
      </div>
      <button class="btn btn-primary" @click="showModal = true" :disabled="teachers.length === 0 || students.length === 0">
        <span>+</span> 创建课程
      </button>
    </div>

    <div class="tip" v-if="teachers.length === 0 || students.length === 0">
      <p>请先添加{{ teachers.length === 0 ? '教师' : '' }}{{ teachers.length === 0 && students.length === 0 ? '和' : '' }}{{ students.length === 0 ? '学生' : '' }}后再创建课程</p>
    </div>

    <div class="search-bar" v-if="courses.length > 0">
      <input type="text" class="input" v-model="courseSearchText" placeholder="搜索课程名称..." />
    </div>

    <div class="courses-list" v-if="filteredCourses.length > 0">
      <div class="course-card" v-for="course in filteredCourses" :key="course.id">
        <div class="course-header">
          <h3 class="course-name">{{ course.name }}</h3>
          <span class="course-time">{{ getWeekdayText(course.weekday) }} {{ course.startTime }}-{{ course.endTime }}</span>
        </div>
        <div class="course-details">
          <div class="detail-item">
            <span class="detail-label">授课教师</span>
            <span class="detail-value">{{ getTeacherName(course.teacherId) }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">上课学生</span>
            <span class="detail-value">{{ getStudentNames(course.studentIds) }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">每次课时</span>
            <span class="detail-value">{{ course.hoursPerClass || 1 }} 课时</span>
          </div>
          <div class="detail-item" v-if="course.classroom">
            <span class="detail-label">教室</span>
            <span class="detail-value">{{ course.classroom }}</span>
          </div>
        </div>
        <div class="course-actions">
          <button class="btn btn-text" @click="editCourse(course)">编辑</button>
          <button class="btn btn-text" style="color: var(--color-danger)" @click="removeCourse(course.id)">删除</button>
        </div>
      </div>
    </div>
    <div class="empty-state" v-else>
      <p>暂无课程安排</p>
      <button class="btn btn-primary" @click="showModal = true" :disabled="teachers.length === 0 || students.length === 0">创建第一门课程</button>
    </div>

    <!-- 添加/编辑弹窗 -->
    <div class="modal-overlay" v-if="showModal" @click.self="closeModal">
      <div class="modal">
        <h2 class="modal-title">{{ editingCourse ? '编辑课程' : '创建课程' }}</h2>
        <form @submit.prevent="saveCourse">
          <div class="form-group">
            <label>课程名称 *</label>
            <input type="text" class="input" v-model="form.name" required placeholder="如：三年级数学提高班" />
          </div>
          <div class="form-group">
            <label>授课教师 *</label>
            <select class="input" v-model="form.teacherId" required>
              <option value="">请选择教师</option>
              <option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>上课日期 *</label>
              <select class="input" v-model="form.weekday" required>
                <option :value="1">星期一</option>
                <option :value="2">星期二</option>
                <option :value="3">星期三</option>
                <option :value="4">星期四</option>
                <option :value="5">星期五</option>
                <option :value="6">星期六</option>
                <option :value="7">星期日</option>
              </select>
            </div>
            <div class="form-group">
              <label>开始时间 *</label>
              <input type="time" class="input" v-model="form.startTime" required />
            </div>
            <div class="form-group">
              <label>结束时间 *</label>
              <input type="time" class="input" v-model="form.endTime" required />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>每次课时</label>
              <input type="number" class="input" v-model.number="form.hoursPerClass" min="1" />
            </div>
            <div class="form-group">
              <label>教室</label>
              <input type="text" class="input" v-model="form.classroom" placeholder="如：A101" />
            </div>
          </div>
          <div class="form-group">
            <label>上课学生 *</label>
            <input type="text" class="input student-search" v-model="studentSearchText" placeholder="搜索学生姓名..." />
            <div class="student-select">
              <button type="button" class="student-btn" v-for="s in filteredStudents" :key="s.id"
                :class="{ selected: form.studentIds.includes(s.id) }"
                @click="toggleStudent(s.id)">
                {{ s.name }}
              </button>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">取消</button>
            <button type="submit" class="btn btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getCourses, addCourse, updateCourse, deleteCourse, getTeachers, getStudents } from '../utils/storage'

const courses = ref([])
const teachers = ref([])
const students = ref([])
const showModal = ref(false)
const editingCourse = ref(null)
const studentSearchText = ref('')
const courseSearchText = ref('')

const form = ref({
  name: '',
  teacherId: '',
  weekday: 1,
  startTime: '09:00',
  endTime: '11:00',
  hoursPerClass: 1,
  classroom: '',
  studentIds: []
})

onMounted(() => {
  courses.value = getCourses()
  teachers.value = getTeachers()
  students.value = getStudents()
})

// 过滤学生列表
const filteredStudents = computed(() => {
  if (!studentSearchText.value) return students.value.filter(s => s.status !== 'deleted')
  const search = studentSearchText.value.toLowerCase()
  return students.value.filter(s =>
    s.name.toLowerCase().includes(search) && s.status !== 'deleted'
  )
})

// 过滤课程列表
const filteredCourses = computed(() => {
  if (!courseSearchText.value) return courses.value
  const search = courseSearchText.value.toLowerCase()
  return courses.value.filter(c =>
    c.name.toLowerCase().includes(search)
  )
})

const weekdayMap = { 1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四', 5: '星期五', 6: '星期六', 7: '星期日' }

function getWeekdayText(weekday) {
  return weekdayMap[weekday] || ''
}

function getTeacherName(teacherId) {
  const teacher = teachers.value.find(t => t.id === teacherId)
  return teacher ? teacher.name : '未知'
}

function getStudentNames(studentIds) {
  return studentIds.map(id => {
    const student = students.value.find(s => s.id === id)
    return student ? student.name : ''
  }).filter(Boolean).join('、') || '无'
}

function toggleStudent(id) {
  const index = form.value.studentIds.indexOf(id)
  if (index === -1) {
    form.value.studentIds.push(id)
  } else {
    form.value.studentIds.splice(index, 1)
  }
}

function editCourse(course) {
  editingCourse.value = course
  form.value = { ...course, studentIds: [...course.studentIds] }
  showModal.value = true
}

function saveCourse() {
  if (editingCourse.value) {
    courses.value = updateCourse(editingCourse.value.id, form.value)
  } else {
    courses.value = addCourse(form.value)
  }
  closeModal()
}

function removeCourse(id) {
  if (confirm('确定要删除这个课程吗？')) {
    courses.value = deleteCourse(id)
  }
}

function closeModal() {
  showModal.value = false
  editingCourse.value = null
  studentSearchText.value = ''
  form.value = {
    name: '',
    teacherId: '',
    weekday: 1,
    startTime: '09:00',
    endTime: '11:00',
    hoursPerClass: 1,
    classroom: '',
    studentIds: []
  }
}
</script>

<style scoped>
.courses {
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

.tip {
  background: rgba(255, 149, 0, 0.1);
  color: var(--color-warning);
  padding: 16px 24px;
  border-radius: var(--radius-md);
  margin-bottom: 24px;
}

.search-bar {
  margin-bottom: 24px;
}

.search-bar .input {
  width: 100%;
  max-width: 300px;
}

.courses-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.course-card {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.course-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.course-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.course-time {
  font-size: 14px;
  color: var(--color-primary);
  font-weight: 500;
}

.course-details {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-bg-secondary);
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.detail-value {
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
}

.course-actions {
  margin-top: 16px;
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
  max-width: 560px;
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

.form-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.form-row:last-of-type {
  grid-template-columns: 1fr 1fr;
}

.student-select {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.student-btn {
  padding: 8px 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: white;
  font-size: 14px;
  color: var(--color-text);
  cursor: pointer;
  transition: var(--transition);
}

.student-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.student-btn.selected {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>