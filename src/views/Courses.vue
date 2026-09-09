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
        <input type="text" class="input" v-model="courseSearchText" :placeholder="'搜索' + (searchTypeOptions.find(o => o.value === searchType)?.label || '') + '...'" />
      </div>
    </div>

    <div class="courses-list" v-if="filteredCourses.length > 0">
      <div class="course-card" v-for="course in filteredCourses" :key="course.id">
        <div class="course-header">
          <h3 class="course-name">{{ course.name }}</h3>
          <span class="course-time">{{ getWeekdayText(course.weekday) }} {{ course.startTime || '' }}-{{ course.endTime || '' }}</span>
        </div>
        <div class="course-details">
          <div class="detail-row">
            <div class="detail-item">
              <span class="detail-label">授课教师</span>
              <span class="detail-value">{{ getTeacherName(course.teacherId) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">每次课时</span>
              <span class="detail-value">{{ course.hoursPerClass ?? 1 }} 课时</span>
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
          <button class="btn btn-text" @click="openHistoryDrawer(course)" title="查看历史时间线">📜 历史</button>
          <button class="btn btn-text" @click="editCourse(course)">编辑</button>
          <button class="btn btn-text" style="color: var(--color-danger)" @click="removeCourse(course.id)">删除</button>
        </div>
      </div>
    </div>
    <div class="empty-state" v-else>
      <p>暂无课程安排</p>
      <button class="btn btn-primary" @click="showModal = true" :disabled="teachers.length === 0 || students.length === 0">创建第一门课程</button>
    </div>

    <!-- 添加/编辑弹窗（共用 CourseEditModal） -->
    <CourseEditModal
      :open="showModal"
      :mode="editingCourse ? 'edit' : 'create'"
      :course="editingCourse"
      :effective-date="editEffectiveDate"
      :teachers="teachers"
      :students="students"
      :submitting="submitting"
      @submit="onModalSubmit"
      @cancel="closeModal"
    />

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

    <!-- 历史抽屉 -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="historyDrawer.open" class="history-overlay" @click.self="closeHistoryDrawer">
          <div class="history-drawer">
            <div class="history-header">
              <h2 class="history-title">📜 {{ historyDrawer.course?.name }} · 历史时间线</h2>
              <button class="history-close" @click="closeHistoryDrawer" aria-label="关闭">×</button>
            </div>
            <div class="history-body">
              <div v-if="historyDrawer.items.length === 0" class="history-empty">暂无变更记录</div>
              <div v-else>
                <div
                  v-for="(item, idx) in historyDrawer.items"
                  :key="idx"
                  class="history-item"
                  :class="['status-' + classifyTimelineItem(item).status]"
                >
                  <div class="history-item-head">
                    <span class="history-date">{{ item.effectiveFrom }}</span>
                    <span v-if="item.validUntil" class="history-range">~ {{ item.validUntil }}</span>
                    <span class="history-status">{{ classifyTimelineItem(item).label }}</span>
                  </div>
                  <div class="history-item-body">
                    <div><strong>教师：</strong>{{ item.teacherName || '未知' }}</div>
                    <div><strong>学生：</strong>{{ getStudentNames(item.studentIds) }}</div>
                    <div v-if="item.classroom"><strong>教室：</strong>{{ item.classroom }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getCourses, addCourse, updateCourse, softDeleteCourse, getCourseHistory, getTeachers, getStudents } from '../utils/storage'
import { useToast } from '../composables/useToast'
import SearchSelect from '../components/SearchSelect.vue'
import CourseEditModal from '../components/CourseEditModal.vue'

const toast = useToast()
const courses = ref([])
const teachers = ref([])
const students = ref([])
const showModal = ref(false)
const editingCourse = ref(null)
const editEffectiveDate = ref(null)
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

const historyDrawer = ref({ open: false, course: null, items: [] })
const submitting = ref(false)

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

function getWeekdayText(weekday) {
  const map = { 1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四', 5: '星期五', 6: '星期六', 7: '星期日' }
  return map[weekday] || ''
}

function getTeacherName(teacherId) {
  const teacher = teachers.value.find(t => t.id === teacherId)
  return teacher ? teacher.name : '未知'
}

function getStudentNames(studentIds) {
  return (studentIds || []).map(id => {
    const student = students.value.find(s => s.id === id)
    return student ? student.name : ''
  }).filter(Boolean).join('、') || '无'
}

function nextFutureOccurrence(weekday, startTime) {
  const now = new Date()
  const targetDow = weekday === 7 ? 0 : weekday
  const curDow = now.getDay()
  let diff = (targetDow - curDow + 7) % 7
  if (diff === 0 && startTime) {
    const [h, m] = startTime.split(':').map(Number)
    if (h * 60 + m <= now.getHours() * 60 + now.getMinutes()) diff = 7
  }
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
  return d
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function editCourse(course) {
  editingCourse.value = course
  editEffectiveDate.value = nextFutureOccurrence(course.weekday, course.startTime)
  showModal.value = true
}

async function onModalSubmit(payload) {
  if (submitting.value) return

  if (payload.startTime && payload.endTime && payload.startTime >= payload.endTime) {
    toast.error('结束时间必须晚于开始时间')
    return
  }
  const hpc = Number(payload.hoursPerClass)
  if (!hpc || hpc <= 0) payload.hoursPerClass = 1
  else if (hpc % 0.5 !== 0) payload.hoursPerClass = Math.round(hpc * 2) / 2
  if (payload.hoursPerClass < 0.5) payload.hoursPerClass = 0.5

  submitting.value = true
  try {
    if (editingCourse.value) {
      const freshCourses = await getCourses()
      const stillExists = (freshCourses || []).find(c => c.id === editingCourse.value.id)
      if (!stillExists) {
        toast.error('该课程已移交，无法编辑')
        courses.value = freshCourses || []
        closeModal()
        return
      }
      // payload 来自 CourseEditModal；若包含 effectiveFrom，说明是"从某天起"生效
      courses.value = await updateCourse(editingCourse.value.id, payload)
    } else {
      courses.value = await addCourse(payload)
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
    courses.value = await softDeleteCourse(deleteTargetId.value)
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
  editEffectiveDate.value = null
}

async function openHistoryDrawer(course) {
  historyDrawer.value.course = course
  historyDrawer.value.open = true
  try {
    const items = await getCourseHistory(course.id)
    historyDrawer.value.items = items || []
  } catch (err) {
    toast.error('加载历史失败：' + (err.message || ''))
    historyDrawer.value.items = []
  }
}

function closeHistoryDrawer() {
  historyDrawer.value.open = false
  historyDrawer.value.course = null
  historyDrawer.value.items = []
}

function classifyTimelineItem(item) {
  // kind: 'history' 来自 course_history，'schedule' 来自 course_schedule
  // 状态：'past' | 'current' | 'pending'
  if (item.kind === 'history') return { status: 'past', label: '已替换' }
  // schedule: validUntil = NULL 且 effectiveFrom > today → pending
  //          validUntil = NULL 且 effectiveFrom <= today → current（开行）
  //          validUntil 有值 → 临时窗口（按日期判断 past/pending）
  const today = toDateStr(new Date())
  if (item.validUntil) {
    if (item.effectiveFrom >= today) return { status: 'pending-window', label: '待生效（仅本节）' }
    return { status: 'past-window', label: '历史窗口' }
  }
  if (item.effectiveFrom > today) return { status: 'pending', label: '待生效' }
  return { status: 'current', label: '当前生效' }
}

function studentCount(studentIds) {
  return (studentIds || []).length
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

/* ============ 历史抽屉 ============ */
.history-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  z-index: 1001;
  display: flex;
  justify-content: flex-end;
}

.history-drawer {
  background: white;
  width: 100%;
  max-width: 440px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.history-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text);
}

.history-close {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 50%;
  font-size: 22px;
  line-height: 1;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.history-body {
  padding: 16px 24px 24px;
  overflow-y: auto;
  flex: 1;
}

.history-empty {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 32px 0;
  font-size: 14px;
}

.history-item {
  border-left: 3px solid var(--color-border);
  padding: 10px 14px;
  margin-bottom: 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.history-item.status-current {
  border-left-color: var(--color-primary);
  background: rgba(0, 113, 227, 0.06);
}

.history-item.status-pending,
.history-item.status-pending-window {
  border-left-color: var(--color-warning);
  background: rgba(255, 149, 0, 0.06);
}

.history-item.status-past,
.history-item.status-past-window {
  border-left-color: rgba(0, 0, 0, 0.25);
  opacity: 0.85;
}

.history-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
  flex-wrap: wrap;
}

.history-date {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
}

.history-range {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.history-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--color-text-secondary);
  margin-left: auto;
}

.history-item-body {
  font-size: 12px;
  color: var(--color-text);
  line-height: 1.7;
}

.history-item-body strong {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active .history-drawer,
.drawer-leave-active .history-drawer {
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .history-drawer,
.drawer-leave-to .history-drawer {
  transform: translateX(40px);
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