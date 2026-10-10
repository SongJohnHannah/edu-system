<template>
  <div class="courses fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">排课管理</h1>
        <p class="page-subtitle">创建和管理课程安排</p>
      </div>
      <OfficeButton class="btn btn-primary" @click="openCreate" :disabled="loading || loadError || !canCreateCourse">
        <span>+</span> 创建课程
      </OfficeButton>
    </div>

    <div class="tip" v-if="!loading && !loadError && !canCreateCourse">
      <p>{{ createPrerequisite }}</p>
    </div>

    <div class="search-bar" v-if="!loading && !loadError && courses.length > 0">
      <div class="scope-filter"><OfficeButton class="btn btn-text" :class="{ selected: scopeFilter === 'all' }" @click="scopeFilter = 'all'">全部课程</OfficeButton><OfficeButton v-if="auth.teacherId" class="btn btn-text" :class="{ selected: scopeFilter === 'mine' }" @click="scopeFilter = 'mine'">我的课程</OfficeButton></div>
      <div class="search-row">
        <SearchSelect
          v-model="searchType"
          :options="searchTypeOptions"
          :searchable="false"
        />
        <OfficeInput type="text" class="input" v-model="courseSearchText" :placeholder="'搜索' + (searchTypeOptions.find(o => o.value === searchType)?.label || '') + '...'" />
      </div>
    </div>

    <div v-if="loading" class="empty-state" role="status">正在加载课程安排…</div>
    <div v-else-if="loadError" class="empty-state" role="alert">
      <p>课程资料加载失败，请重试</p>
      <OfficeButton class="btn btn-secondary" @click="loadData">重试</OfficeButton>
    </div>
    <div class="courses-list" v-else-if="filteredCourses.length > 0">
      <div class="course-card" v-for="course in filteredCourses" :key="course.id">
        <div class="course-header">
          <h3 class="course-name">{{ course.name }}</h3>
          <span class="course-time">{{ getWeekdayText(course.weekday) }} {{ course.startTime || '' }}-{{ course.endTime || '' }}</span>
          <span v-if="course.upcomingSchedule" class="schedule-hint">{{ course.upcomingSchedule.effectiveWeekStart }} 起 {{ course.upcomingSchedule.startTime }}—{{ course.upcomingSchedule.endTime }}</span>
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
          <OfficeButton v-if="canEdit(course)" class="btn btn-text" @click="editCourse(course)">编辑</OfficeButton>
          <OfficeButton v-if="canEdit(course)" class="btn btn-text" style="color: var(--color-danger)" @click="removeCourse(course.id)">归档</OfficeButton>
          <span v-else class="read-only">只读</span>
        </div>
      </div>
    </div>
    <div class="empty-state" v-else>
      <p>暂无课程安排</p>
      <OfficeButton class="btn btn-primary" @click="openCreate" :disabled="!canCreateCourse">创建第一门课程</OfficeButton>
    </div>

    <!-- 添加/编辑弹窗 -->
    <OfficeModal v-model:show="showModal" @update:show="value => { if (!value) { closeModal() } }">
      <div class="modal">
        <h2 class="modal-title">{{ editingCourse ? '编辑课程' : '创建课程' }}</h2>
        <form @submit.prevent="saveCourse" @input.capture="captureHoursInput">
          <div class="form-group">
            <label>课程名称 *</label>
            <OfficeInput type="text" class="input" v-model="form.name" required maxlength="200" placeholder="如：三年级数学提高班" />
          </div>
          <div class="form-group">
            <label>授课教师 *</label>
            <SearchSelect
              v-model="form.teacherId"
              :options="activeTeachers.map(t => ({ value: t.id, label: t.name }))"
              placeholder="搜索或选择教师"
              :disabled="!isAdmin || !!editingCourse"
            />
          </div>
          <div class="form-group">
            <label>上课日期 *</label>
            <SearchSelect
              v-model="form.weekday"
              :options="weekdayOptions"
              placeholder="选择星期"
              :searchable="false"
              :disabled="!!editingCourse"
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
              <label>结束时间（自动计算）</label>
              <OfficeInput class="input" type="text" :model-value="formEndTime" readonly disabled input-aria-label="结束时间（自动计算）" placeholder="根据开始时间和课时自动计算" />
            </div>
          </div>
          <p class="schedule-hint">结束时间按开始时间＋课时自动计算，0.5 课时为 30 分钟。<template v-if="editingCourse">时间修改应用于后续每周课程；单次调课和修改星期请到 <router-link to="/weekly-schedule" @click="closeModal">周排课</router-link>。</template></p>
          <div class="form-row">
            <div class="form-group">
              <label>每次课时</label>
              <OfficeInput type="number" class="input hours-amount" v-model.number="form.hoursPerClass" min="0.5" max="999.5" step="0.5" />
            </div>
            <div class="form-group">
              <label>教室</label>
              <OfficeInput type="text" class="input" v-model="form.classroom" maxlength="100" placeholder="如：A101" />
            </div>
          </div>
          <div class="form-group">
            <label>上课学生 *</label>
            <p v-if="excludedStudents.length" class="schedule-hint">本次名单已移除：{{ excludedStudents.join('、') }}。保存后历史课次保留原名单；如需重新加入，请先到学生管理恢复并确认报名。</p>
            <OfficeInput type="text" class="input student-search" v-model="studentSearchText" placeholder="搜索学生姓名..." />
            <div class="student-select">
              <button type="button" class="student-btn" v-for="s in filteredStudents" :key="s.id"
                :class="{ selected: form.studentIds.includes(s.id) }"
                @click="toggleStudent(s.id)">
                {{ s.name }}
              </button>
            </div>
          </div>
          <div class="modal-actions">
            <OfficeButton type="button" class="btn btn-secondary" @click="closeModal">取消</OfficeButton>
            <OfficeButton type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</OfficeButton>
          </div>
        <p v-if="editingCourse && auth.isAdmin" class="form-hint"><router-link to="/teachers">前往教师信息办理课程交接</router-link></p></form>
      </div>
    </OfficeModal>

    <!-- 确认弹窗 -->
    <OfficeModal v-model:show="showConfirmModal" @update:show="value => { if (!value) { showConfirmModal = false } }">
      <div class="modal modal-sm">
        <h2 class="modal-title">归档课程</h2>
        <p class="confirm-message">确定归档课程“{{ deleteTargetName }}”吗？历史点名和课时会保留。</p>
        <div class="modal-actions">
          <OfficeButton class="btn btn-secondary" @click="showConfirmModal = false">取消</OfficeButton>
          <OfficeButton class="btn btn-primary" style="background: var(--color-danger)" @click="confirmDeleteCourse" :disabled="submitting">{{ submitting ? '归档中...' : '确认归档' }}</OfficeButton>
        </div>
      </div>
    </OfficeModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getCourses, addCourse, updateCourse, deleteCourse, getTeachers, getStudents } from '../utils/storage'
import { useToast } from '../composables/useToast'
import SearchSelect from '../components/SearchSelect.vue'
import { useAuthStore } from '../stores/auth.js'
import { courseEndTime } from '../../shared/courseTime.js'
import { courseStudentLabel, prepareCourseRoster } from '../utils/courseRoster.js'

const toast = useToast()
const auth = useAuthStore()
const isAdmin = computed(() => auth.isAdmin)
const scopeFilter = ref('all')
function canEdit(course) { return isAdmin.value || !!auth.teacherId && course.teacherId === auth.teacherId }
const courses = ref([])
const teachers = ref([])
const students = ref([])
const activeTeachers = computed(() => teachers.value.filter(t => t.status !== 'deleted'))
const eligibleStudents = computed(() => students.value.filter(s => s.status === 'active' && s.enrollmentStage !== 'pending'))
const canCreateCourse = computed(() => activeTeachers.value.length > 0 && eligibleStudents.value.length > 0)
const createPrerequisite = computed(() => {
  if (!activeTeachers.value.length && !eligibleStudents.value.length) return '请先添加或恢复教师，并录入已报名且在读的学生'
  return !activeTeachers.value.length ? '请先添加或恢复教师' : '请先录入已报名且在读的学生'
})
const loading = ref(true)
const loadError = ref(false)
const showModal = ref(false)
const editingCourse = ref(null)
const excludedStudents = ref([])
let modalVersion = 0
const hoursRawInput = ref(null)
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
  endTime: '10:00',
  hoursPerClass: 1,
  classroom: '',
  studentIds: []
})
const formEndTime = computed(() => courseEndTime(form.value.startTime, hoursRawInput.value ?? form.value.hoursPerClass))

let loadRequest = 0
let loadErrorToast = null
async function loadData() {
  const request = ++loadRequest
  loading.value = true
  loadError.value = false
  try {
    const [c, t, s] = await Promise.all([
      getCourses(), getTeachers(), getStudents()
    ])
    if (request !== loadRequest) return
    courses.value = c || []
    teachers.value = t || []
    students.value = s || []
    toast.clearError(loadErrorToast)
    loadErrorToast = null
  } catch (error) {
    if (request !== loadRequest) return
    loadError.value = true
    loadErrorToast = toast.error(error.message || '课程资料加载失败')
  } finally {
    if (request === loadRequest) loading.value = false
  }
}

onMounted(() => {
  loadData()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  loadRequest++
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    loadData()
  }
}

// 过滤学生列表
const filteredStudents = computed(() => {
  if (!studentSearchText.value) return eligibleStudents.value
  const search = studentSearchText.value.toLowerCase()
  return eligibleStudents.value.filter(s => s.name.toLowerCase().includes(search))
})

const filteredCourses = computed(() => {
  const list = courses.value.filter(c => scopeFilter.value !== 'mine' || c.teacherId === auth.teacherId)
  if (!courseSearchText.value) return list
  const search = courseSearchText.value.toLowerCase()
  return list.filter(c => {
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
    if (time >= '07:30' && time <= '22:30') timeOptions.push({ value: time, label: time })
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
  return (studentIds || []).map(id => {
    const student = students.value.find(s => s.id === id)
    return courseStudentLabel(student)
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
  if (!canEdit(course)) return
  modalVersion++
  editingCourse.value = course
  const roster = prepareCourseRoster(course.studentIds, students.value)
  excludedStudents.value = roster.excluded
  form.value = { ...course, startTime: course.upcomingSchedule?.startTime ?? course.startTime, studentIds: roster.studentIds }
  hoursRawInput.value = null
  showModal.value = true
}

function openCreate() {
  modalVersion++
  editingCourse.value = null
  excludedStudents.value = []
  form.value.teacherId = auth.teacherId || activeTeachers.value[0]?.id || ''
  hoursRawInput.value = null
  showModal.value = true
}

function captureHoursInput(event) {
  if (event.target?.closest?.('.hours-amount')) hoursRawInput.value = event.target.value
}

const submitting = ref(false)

function upsertCourse(course) {
  if (!course?.id) return
  courses.value = courses.value.some(item => item.id === course.id)
    ? courses.value.map(item => item.id === course.id ? course : item)
    : [course, ...courses.value]
}

async function saveCourse() {
  if (submitting.value) return
  const roster = prepareCourseRoster(form.value.studentIds, students.value)
  form.value.studentIds = roster.studentIds
  excludedStudents.value = [...new Set([...excludedStudents.value, ...roster.excluded])]
  if (!form.value.studentIds.length) return toast.error('请至少选择一名已报名且在读的学生，或先恢复归档学生')

  const hpc = Number(hoursRawInput.value ?? form.value.hoursPerClass)
  if (!Number.isFinite(hpc) || hpc < 0.5 || hpc > 999.5 || !Number.isInteger(hpc * 2)) {
    toast.error('每次课时须为 0.5 至 999.5 的半课时倍数')
    return
  }
  form.value.hoursPerClass = hpc
  form.value.endTime = formEndTime.value
  if (!form.value.endTime) return toast.error('请检查开始时间和课时，结束时间不能晚于22:30')

  const editing = editingCourse.value
  const requestVersion = modalVersion
  const submittedForm = { ...form.value, studentIds: [...form.value.studentIds] }
  submitting.value = true
  try {
    if (editing) {
      // 编辑前刷新确认课程仍存在且归属未变。
      const freshCourses = await getCourses()
      const current = (freshCourses || []).find(c => c.id === editing.id)
      if (!current || current.teacherId !== editing.teacherId || !canEdit(current)) {
        courses.value = freshCourses || []
        if (requestVersion === modalVersion) {
          closeModal()
          toast.error(current ? '该课程已移交，无法编辑' : '该课程已归档，无法编辑')
        }
        return
      }
      const updated = await updateCourse(editing.id, submittedForm)
      upsertCourse(updated)
      if (updated.timeChange) toast.success(`新时间从 ${updated.timeChange.effectiveDate} 起每周生效`)
    } else {
      upsertCourse(await addCourse(submittedForm))
    }
    if (requestVersion === modalVersion) closeModal()
  } catch (err) {
    if (requestVersion === modalVersion) toast.error(err.message || '保存失败')
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
    const archivedId = deleteTargetId.value
    await deleteCourse(archivedId)
    courses.value = courses.value.filter(course => course.id !== archivedId)
    showConfirmModal.value = false
  } catch (err) {
    toast.error(err.message || '删除失败')
  } finally {
    submitting.value = false
  }
}

function closeModal() {
  modalVersion++
  showModal.value = false
  editingCourse.value = null
  excludedStudents.value = []
  hoursRawInput.value = null
  studentSearchText.value = ''
  form.value = {
    name: '',
    teacherId: '',
    weekday: 1,
    startTime: '09:00',
    endTime: '10:00',
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
  background: rgba(173, 108, 29, 0.1);
  color: var(--color-warning);
  padding: 16px 24px;
  border-radius: var(--radius-md);
  margin-bottom: 24px;
}

.search-bar {
  margin-bottom: 24px;
}

.scope-filter { display: flex; gap: 6px; margin-bottom: 12px; }
.scope-filter .selected { background: var(--color-selected); font-weight: 650; }
.read-only, .schedule-hint { color: var(--color-text-secondary); font-size: 13px; }
.schedule-hint { margin: 2px 0 16px; }

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
