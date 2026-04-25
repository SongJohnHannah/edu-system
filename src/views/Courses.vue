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
      <div class="search-row">
        <SearchSelect
          v-model="searchType"
          :options="searchTypeOptions"
          :searchable="false"
        />
        <input type="text" class="input" v-model="courseSearchText" :placeholder="'搜索' + searchTypeOptions.find(o => o.value === searchType)?.label + '...'" />
      </div>
    </div>

    <div class="courses-list" v-if="filteredCourses.length > 0">
      <div class="course-card" v-for="course in filteredCourses" :key="course.id">
        <div class="course-header">
          <h3 class="course-name">{{ course.name }}</h3>
          <span class="course-time">{{ getWeekdayText(course.weekday) }} {{ course.startTime }}-{{ course.endTime }}</span>
        </div>
        <div class="course-details">
          <div class="detail-row">
            <div class="detail-item">
              <span class="detail-label">授课教师</span>
              <span class="detail-value">{{ getTeacherName(course.teacherId) }}</span>
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
          <div class="detail-item detail-students">
            <span class="detail-label">上课学生</span>
            <span class="detail-value students-value">{{ getStudentNames(course.studentIds) }}</span>
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
            <SearchSelect
              v-model="form.teacherId"
              :options="teachers.map(t => ({ value: t.id, label: t.name }))"
              placeholder="搜索或选择教师"
            />
          </div>
          <div class="form-group">
            <label>上课日期 *</label>
            <SearchSelect
              v-model="form.weekday"
              :options="weekdayOptions"
              placeholder="选择星期"
              :searchable="false"
            />
          </div>
          <div class="time-row">
            <div class="form-group">
              <label>开始时间 *</label>
              <SearchSelect
                v-model="form.startTime"
                :options="timeOptions"
                placeholder="选择开始时间"
                :searchable="false"
              />
            </div>
            <div class="form-group">
              <label>结束时间 *</label>
              <SearchSelect
                v-model="form.endTime"
                :options="timeOptions"
                placeholder="选择结束时间"
                :searchable="false"
              />
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
            <button type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 确认弹窗 -->
    <div class="modal-overlay" v-if="showConfirmModal" @click.self="showConfirmModal = false">
      <div class="modal modal-sm">
        <h2 class="modal-title">删除课程</h2>
        <p class="confirm-message">确定要删除课程"{{ deleteTargetName }}"吗？</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showConfirmModal = false">取消</button>
          <button class="btn btn-primary" style="background: var(--color-danger)" @click="confirmDeleteCourse" :disabled="submitting">{{ submitting ? '删除中...' : '确认删除' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getCourses, addCourse, updateCourse, deleteCourse, getTeachers, getStudents } from '../utils/storage'
import { useToast } from '../composables/useToast'
import SearchSelect from '../components/SearchSelect.vue'

const toast = useToast()
const courses = ref([])
const teachers = ref([])
const students = ref([])
const showModal = ref(false)
const editingCourse = ref(null)
const studentSearchText = ref('')
const courseSearchText = ref('')
const searchType = ref('course')
const searchTypeOptions = [
  { value: 'course', label: '课程名称' },
  { value: 'teacher', label: '教师名称' },
  { value: 'student', label: '学生名称' }
]
const showConfirmModal = ref(false)
const deleteTargetId = ref('')
const deleteTargetName = ref('')

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

async function loadData() {
  const [c, t, s] = await Promise.all([
    getCourses(), getTeachers(), getStudents()
  ])
  courses.value = c || []
  teachers.value = t || []
  students.value = s || []
}

onMounted(async () => {
  await loadData()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    loadData()
  }
}

// 过滤学生列表
const filteredStudents = computed(() => {
  if (!studentSearchText.value) return students.value.filter(s => s.status === 'active')
  const search = studentSearchText.value.toLowerCase()
  return students.value.filter(s =>
    s.name.toLowerCase().includes(search) && s.status === 'active'
  )
})

const filteredCourses = computed(() => {
  if (!courseSearchText.value) return courses.value
  const search = courseSearchText.value.toLowerCase()
  return courses.value.filter(c => {
    if (searchType.value === 'course') return c.name.toLowerCase().includes(search)
    if (searchType.value === 'teacher') return getTeacherName(c.teacherId).toLowerCase().includes(search)
    if (searchType.value === 'student') return getStudentNames(c.studentIds).toLowerCase().includes(search)
    return false
  })
})

const weekdayMap = { 1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四', 5: '星期五', 6: '星期六', 7: '星期日' }
const weekdayOptions = Object.entries(weekdayMap).map(([v, l]) => ({ value: Number(v), label: l }))

const timeOptions = []
for (let h = 6; h <= 22; h++) {
  for (let m = 0; m < 60; m += 30) {
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    timeOptions.push({ value: time, label: time })
  }
}

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

const submitting = ref(false)

async function saveCourse() {
  if (submitting.value) return

  if (form.value.startTime && form.value.endTime && form.value.startTime >= form.value.endTime) {
    toast.error('结束时间必须晚于开始时间')
    return
  }
  const hpc = Number(form.value.hoursPerClass)
  if (!hpc || hpc <= 0) {
    form.value.hoursPerClass = 1
  }

  submitting.value = true
  try {
    if (editingCourse.value) {
      // 编辑前刷新确认课程仍可操作（防止移交后编辑）
      const freshCourses = await getCourses()
      const stillExists = (freshCourses || []).find(c => c.id === editingCourse.value.id)
      if (!stillExists) {
        toast.error('该课程已移交，无法编辑')
        courses.value = freshCourses || []
        closeModal()
        return
      }
      courses.value = await updateCourse(editingCourse.value.id, form.value)
    } else {
      courses.value = await addCourse(form.value)
    }
    closeModal()
  } catch (err) {
    toast.error(err.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

function removeCourse(id) {
  const course = courses.value.find(c => c.id === id)
  if (!course) return
  deleteTargetId.value = id
  deleteTargetName.value = course.name
  showConfirmModal.value = true
}

async function confirmDeleteCourse() {
  if (submitting.value) return
  submitting.value = true
  try {
    courses.value = await deleteCourse(deleteTargetId.value)
    showConfirmModal.value = false
  } catch (err) {
    toast.error(err.message || '删除失败')
  } finally {
    submitting.value = false
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

.search-row {
  display: flex;
  gap: 10px;
  max-width: 400px;
}

.search-row .search-select {
  width: 140px;
  flex-shrink: 0;
}

.search-row .input {
  flex: 1;
}

.courses-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.course-card {
  background: white;
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}

.course-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.course-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.course-time {
  font-size: 13px;
  color: var(--color-primary);
  font-weight: 500;
  white-space: nowrap;
}

.course-details {
  padding: 12px 0;
  border-top: 1px solid var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-bg-secondary);
}

.detail-row {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.detail-value {
  font-size: 13px;
  color: var(--color-text);
  font-weight: 500;
  white-space: nowrap;
}

.students-value {
  white-space: normal;
  word-break: break-all;
  line-height: 1.5;
}

.course-actions {
  margin-top: 12px;
  display: flex;
  gap: 4px;
  justify-content: flex-end;
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
  padding: 24px 16px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.modal {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 560px;
  margin: auto 0;
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
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.time-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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

.modal-sm {
  max-width: 400px;
}

.confirm-message {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.6;
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .course-header {
    flex-direction: column;
    gap: 4px;
  }
  .courses-list {
    grid-template-columns: 1fr;
  }
  .detail-row {
    gap: 12px;
  }
  .search-row {
    max-width: none;
  }
  .search-row .search-select {
    width: 120px;
    min-width: 0;
  }
  .form-row {
    grid-template-columns: 1fr 1fr;
  }
  .time-row {
    grid-template-columns: 1fr 1fr;
  }
  .student-select {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .student-btn {
    padding: 6px 12px;
    font-size: 13px;
  }
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }
  .modal {
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px 16px;
  }
  .modal-actions {
    flex-direction: column;
  }
  .modal-actions .btn {
    width: 100%;
  }
}
</style>