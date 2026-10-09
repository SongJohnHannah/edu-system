<template>
  <div class="attendance fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">点名扣课时</h1>
        <p class="page-subtitle">记录学生出勤并扣除课时</p>
      </div>
    </div>

    <div class="select-course" v-if="!dataLoading && !dataError">
      <label>选择日期与课程</label>
      <div class="course-picker">
        <OfficeDatePicker v-model="selectedDate" class="input" aria-label="点名日期" @change="loadOccurrencesForDate" />
        <SearchSelect v-if="!dayLoading && filteredCourses.length" v-model="selectedCourseId"
          :options="filteredCourses.map(c => ({ value: c.id, label: `${c.startTime}—${c.endTime} · ${c.name}`, meta: getTeacherName(c.teacherId) }))"
          placeholder="搜索或选择课程" @update:modelValue="loadCourseStudents" />
      </div>
    </div>
    <div class="tip" v-if="dataLoading"><p>正在加载点名数据…</p></div>
    <div class="tip" v-else-if="dataError"><p>点名数据加载失败，请重试</p><OfficeButton class="btn btn-secondary" @click="loadData">重试</OfficeButton></div>
    <div class="tip" v-else-if="dayLoading"><p>正在加载所选日期的课程…</p></div>
    <div class="tip" v-else-if="courses.length === 0">
      <p>请先创建课程后再进行点名</p>
      <router-link to="/courses" class="btn btn-primary" style="margin-top: 12px">去创建课程</router-link>
    </div>
    <div class="tip" v-else-if="filteredCourses.length === 0">
      <p>所选日期没有可以点名的正式课程，请切换日期</p>
    </div>

    <template v-else>
      <div class="attendance-form" v-if="selectedCourse">
        <div class="form-header">
          <h2>{{ selectedCourse.name }}</h2>
          <span class="date">{{ selectedDate }} {{ selectedCourse.startTime }}—{{ selectedCourse.endTime }}</span>
        </div>

        <div class="student-list">
          <div class="list-header">
            <span>学生名单</span>
            <div class="quick-actions">
              <OfficeButton type="button" class="btn btn-text" @click="selectAll">全选</OfficeButton>
              <OfficeButton type="button" class="btn btn-text" @click="deselectAll">取消全选</OfficeButton>
            </div>
          </div>
          <div class="students">
            <label class="student-item" v-for="student in sortedCourseStudents" :key="student.id" :class="{ 'student-insufficient': isInsufficient(student) && checkedStudents.includes(student.id) }">
              <input type="checkbox" :value="student.id" v-model="checkedStudents" />
              <div class="student-info">
                <span class="student-name">{{ student.name }}</span>
                <span class="student-hours" :class="{ 'hours-negative': getRemainingHours(student) < 0, 'hours-low': isInsufficient(student) && getRemainingHours(student) >= 0 }">{{ formatRemaining(student) }}</span>
              </div>
              <span class="check-mark" v-if="checkedStudents.includes(student.id)">✓</span>
            </label>
          </div>
        </div>

        <div class="deduct-info">
          <span>将扣除 <strong>{{ selectedCourse.hoursPerClass ?? 1 }}</strong> 课时/人</span>
          <span>共 <strong>{{ checkedStudents.length * (selectedCourse.hoursPerClass ?? 1) }}</strong> 课时</span>
        </div>

        <OfficeButton class="btn btn-primary btn-lg" @click="handleConfirmClick" :disabled="checkedStudents.length === 0">
          确认点名 ({{ checkedStudents.length }} 人)
        </OfficeButton>
      </div>

      <!-- 点名确认弹框 -->
      <OfficeModal v-model:show="showConfirmModal" @update:show="value => { if (!value) { showConfirmModal = false } }">
        <div class="modal modal-sm">
          <h2 class="modal-title">确认点名</h2>
          <div class="confirm-warning" v-if="insufficientStudents.length > 0">
            <p>⚠️ 以下学生课时不足，扣除后余额将为负数：</p>
            <ul class="insufficient-list">
              <li v-for="s in insufficientStudents" :key="s.name">{{ s.name }}（{{ s.remaining }}）</li>
            </ul>
          </div>
          <div class="confirm-info" v-if="insufficientStudents.length === 0">
            <p>课程：<strong>{{ selectedCourse?.name }}</strong></p>
            <p>出勤学生：<strong>{{ checkedStudents.length }}</strong> 人</p>
            <p>扣除课时：<strong>{{ selectedCourse?.hoursPerClass ?? 1 }}</strong> 课时/人</p>
            <p>共计：<strong>{{ checkedStudents.length * (selectedCourse?.hoursPerClass ?? 1) }}</strong> 课时</p>
          </div>
          <div class="modal-actions">
            <OfficeButton class="btn btn-secondary" @click="showConfirmModal = false">取消</OfficeButton>
            <OfficeButton class="btn btn-primary" @click="submitAttendance" :disabled="submitting">{{ submitting ? '提交中...' : '确认点名' }}</OfficeButton>
          </div>
        </div>
      </OfficeModal>

    </template>
      <!-- 选择性删除弹窗 -->
      <OfficeModal v-model:show="showDeleteModal" @update:show="value => { if (!value) { showDeleteModal = false } }">
        <div class="modal modal-sm">
          <h2 class="modal-title">撤销点名记录</h2>
          <p class="delete-desc">选择要撤销的学生，撤销后将还原对应课时：</p>
          <div class="delete-student-list">
            <label class="delete-student-item" v-for="student in deleteTargetStudents" :key="student.id">
              <input type="checkbox" :value="student.id" v-model="deleteCheckedStudents" />
              <span class="delete-student-name">{{ student.name }}</span>
            </label>
          </div>
          <div class="delete-select-actions">
            <OfficeButton type="button" class="btn btn-text" @click="deleteCheckedStudents = deleteTargetStudents.map(s => s.id)">全选</OfficeButton>
            <OfficeButton type="button" class="btn btn-text" @click="deleteCheckedStudents = []">取消全选</OfficeButton>
          </div>
          <div class="modal-actions">
            <OfficeButton class="btn btn-secondary" @click="showDeleteModal = false">取消</OfficeButton>
            <OfficeButton class="btn btn-primary" style="background: var(--color-danger);" @click="confirmDeleteStudents" :disabled="deleteCheckedStudents.length === 0 || submitting">
              {{ submitting ? '撤销中...' : `确认撤销 (${deleteCheckedStudents.length} 人)` }}
            </OfficeButton>
          </div>
        </div>
      </OfficeModal>

      <!-- 点名历史 -->
      <div class="history" v-if="!dataLoading && !dataError">
        <div class="history-header">
          <div class="history-heading">
            <h3 class="history-title">点名记录</h3>
            <div v-if="currentUserTeacherId" class="history-scope" role="group" aria-label="点名记录范围">
              <OfficeButton type="button" class="btn btn-text" :class="{ selected: historyScope === 'all' }" @click="historyScope = 'all'">全部记录</OfficeButton>
              <OfficeButton type="button" class="btn btn-text" :class="{ selected: historyScope === 'mine' }" @click="historyScope = 'mine'">我记录的</OfficeButton>
            </div>
          </div>
          <div class="filter-group">
            <OfficeButton class="btn btn-text" :class="{ selected: includeVoided }" @click="toggleVoided">{{ includeVoided ? '隐藏已撤销' : '查看已撤销' }}</OfficeButton>
            <div class="filter-item">
              <SearchSelect
                v-model="filterCourseId"
                :options="[{ value: '', label: '全部课程' }, ...courses.map(c => ({ value: c.id, label: c.name }))]"
                placeholder="全部课程"
                :searchable="true"
              />
            </div>
            <div class="filter-item month-picker">
              <OfficeButton type="button" class="btn btn-secondary month-arrow" @click="changeMonth(-1)">‹</OfficeButton>
              <span class="month-label" @click="toggleMonthDropdown">{{ filterMonthLabel }}</span>
              <OfficeButton type="button" class="btn btn-secondary month-arrow" @click="changeMonth(1)">›</OfficeButton>
              <div class="month-dropdown" v-if="showMonthDropdown" @mousedown.prevent>
                <div class="month-year-nav">
                  <button type="button" class="month-arrow-sm" @click="monthDropdownYear--">‹</button>
                  <span class="month-year-label">{{ monthDropdownYear }}年</span>
                  <button type="button" class="month-arrow-sm" @click="monthDropdownYear++">›</button>
                </div>
                <div class="month-grid">
                  <button v-for="m in 12" :key="m" type="button" class="month-cell"
                    :class="{ active: filterMonth === `${monthDropdownYear}-${String(m).padStart(2, '0')}` }"
                    @click="pickMonth(m)">{{ m }}月</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="empty-history" v-if="historyLoading"><p>正在加载点名记录…</p></div>
        <div class="empty-history" v-else-if="historyError"><p>点名记录加载失败，请重试</p><OfficeButton class="btn btn-secondary" @click="loadHistory">重试</OfficeButton></div>
        <div class="history-list" v-else-if="filteredRecords.length > 0">
          <div class="history-item" v-for="record in filteredRecords" :key="record.id">
            <div class="history-main">
              <div class="history-row">
                <span class="history-date">{{ record.date }} {{ record.startTime ? `${record.startTime}—${record.endTime}` : record.createdAt?.split(' ')[1] }}</span>
                <span class="history-course">{{ record.courseName || getCourseName(record.courseId) }}</span>
                <span class="history-teacher">{{ record.teacherName || getTeacherNameByCourse(record.courseId) }}</span>
              </div>
              <div class="history-row">
                <span class="history-students">{{ record.voidedAt ? '原出勤' : '出勤' }}: {{ (record.voidedAt ? record.originalStudentIds : record.studentIds).map(id => record.studentNamesSnapshot?.[id] || getStudentNames([id])).join('、') }}</span>
                <span class="history-hours">{{ record.voidedAt ? '已撤销并还原' : `扣除 ${record.hoursDeducted ?? 1} 课时/人` }}</span>
              </div>
            </div>
            <OfficeButton class="btn btn-text delete-btn" @click="openDeleteModal(record)" v-if="!record.voidedAt && canDeleteRecord(record)">撤销</OfficeButton>
          </div>
        </div>
        <div class="empty-history" v-else>
          <p>暂无点名记录</p>
        </div>
        <OfficeButton v-if="hasMoreRecords && !historyLoading" class="btn btn-secondary load-more-btn" :disabled="loadingMore" @click="loadMoreRecords">{{ loadingMore ? '加载中…' : '加载更多记录' }}</OfficeButton>
      </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getCourses, getCourseOccurrences, getStudents, getTeachers, getAttendancePage, addAttendance, removeStudentsFromRecord } from '../utils/storage'
import { useToast } from '../composables/useToast'
import { useAuthStore } from '../stores/auth.js'
import SearchSelect from '../components/SearchSelect.vue'

const toast = useToast()
const auth = useAuthStore()
const isAdmin = computed(() => auth.isAdmin)
const currentUserTeacherId = computed(() => auth.teacherId)
const courses = ref([])
const dataLoading = ref(true)
const dataError = ref(false)
const dayCourses = ref([])
const dayLoading = ref(false)
let occurrenceRequestId = 0
let dataRequestId = 0
let dataErrorToast = null
let dayErrorToast = null
const students = ref([])
const teachers = ref([])
const attendanceRecords = ref([])
const includeVoided = ref(false)
const hasMoreRecords = ref(false)
const historyLoading = ref(false)
const historyError = ref(false)
const loadingMore = ref(false)
let historyRequestId = 0
let historyErrorToast = null
const selectedCourseId = ref('')
const todayStr = ref(new Date().toLocaleDateString('sv-SE'))
const selectedDate = ref(todayStr.value)
const filterCourseId = ref('')
const historyScope = ref('all')
const nowDate = new Date()
const filterMonth = ref(`${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`)
const showMonthDropdown = ref(false)
const monthDropdownYear = ref(nowDate.getFullYear())

const filterMonthLabel = computed(() => {
  if (!filterMonth.value) return '选择月份'
  const [y, m] = filterMonth.value.split('-')
  return `${y}年${parseInt(m)}月`
})

function changeMonth(delta) {
  const [y, m] = filterMonth.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  filterMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toggleMonthDropdown() {
  if (showMonthDropdown.value) {
    showMonthDropdown.value = false
    return
  }
  const [y] = filterMonth.value.split('-').map(Number)
  monthDropdownYear.value = y
  showMonthDropdown.value = true
}

function pickMonth(m) {
  filterMonth.value = `${monthDropdownYear.value}-${String(m).padStart(2, '0')}`
  showMonthDropdown.value = false
}

function closeMonthDropdown(e) {
  if (showMonthDropdown.value && !e.target.closest('.month-picker')) {
    showMonthDropdown.value = false
  }
}

const checkedStudents = ref([])
const courseStudents = ref([])
const showConfirmModal = ref(false)

// 选择性删除相关
const showDeleteModal = ref(false)
const deleteTargetRecord = ref(null)
const deleteCheckedStudents = ref([])

// 课时不足的学生
const insufficientStudents = ref([])

function getRemainingHours(student) {
  return (student.totalHours || 0) - (student.usedHours || 0)
}

function formatRemaining(student) {
  const r = getRemainingHours(student)
  return r < 0 ? `欠 ${Math.abs(r)} 课时` : `剩余 ${r} 课时`
}

function formatRemainingShort(student) {
  const r = getRemainingHours(student)
  return r < 0 ? `欠${Math.abs(r)}课时` : `余${r}课时`
}

function isInsufficient(student) {
  if (!selectedCourse.value) return false
  return getRemainingHours(student) < (selectedCourse.value.hoursPerClass ?? 1)
}

// 点击确认点名按钮
async function handleConfirmClick() {
  const course = selectedCourse.value
  const date = selectedDate.value
  if (!course || dayLoading.value) return
  try {
    const existing = await getAttendancePage({ limit: 1, courseId: course.courseId, date, originalDate: course.originalDate })
    if (date !== selectedDate.value || selectedCourse.value?.id !== course.id) return
    if (existing.data?.length) return toast.error('该课次已经点名，请到点名记录中查看或撤销')
  } catch (error) {
    if (date === selectedDate.value && selectedCourse.value?.id === course.id) toast.error(error.message || '点名记录检查失败')
    return
  }
  const hoursNeeded = course.hoursPerClass ?? 1
  insufficientStudents.value = checkedStudents.value
    .map(id => courseStudents.value.find(s => s.id === id))
    .filter(s => s && getRemainingHours(s) < hoursNeeded)
    .map(s => ({ name: s.name, remaining: formatRemainingShort(s) }))
  showConfirmModal.value = true
}

async function loadData() {
  const requestId = ++dataRequestId
  dataLoading.value = true
  dataError.value = false
  try {
    const [c, s, t] = await Promise.all([
      getCourses({ includeArchived: true }), getStudents(), getTeachers()
    ])
    if (requestId !== dataRequestId) return
    courses.value = c || []
    await loadOccurrencesForDate()
    if (requestId !== dataRequestId) return
    students.value = s || []
    teachers.value = t || []
    await loadHistory()
    if (requestId === dataRequestId && !dataError.value) {
      toast.clearError(dataErrorToast)
      dataErrorToast = null
    }
  } catch (error) { if (requestId === dataRequestId) { dataError.value = true; dataErrorToast = toast.error(error.message || '点名数据加载失败') } }
  finally { if (requestId === dataRequestId) dataLoading.value = false }
}

async function loadHistory() {
  const requestId = ++historyRequestId
  historyLoading.value = true
  historyError.value = false
  attendanceRecords.value = []
  hasMoreRecords.value = false
  try {
    const page = await getAttendancePage({ limit: 50, includeVoided: includeVoided.value, scope: historyScope.value,
      courseId: filterCourseId.value, month: filterMonth.value })
    if (requestId !== historyRequestId) return
    attendanceRecords.value = (page.data || []).reverse()
    hasMoreRecords.value = !!page.hasMore
    toast.clearError(historyErrorToast)
    historyErrorToast = null
  } catch (error) {
    if (requestId === historyRequestId) { historyError.value = true; historyErrorToast = toast.error(error.message || '点名记录加载失败') }
  } finally {
    if (requestId === historyRequestId) historyLoading.value = false
  }
}

watch([filterCourseId, filterMonth, historyScope], loadHistory)

async function loadOccurrencesForDate() {
  const requestId = ++occurrenceRequestId
  const date = selectedDate.value
  dayLoading.value = true
  dataError.value = false
  dayCourses.value = []
  selectedCourseId.value = ''
  courseStudents.value = []
  checkedStudents.value = []
  try {
    const rows = await getCourseOccurrences(date, date)
    if (requestId !== occurrenceRequestId) return
    dayCourses.value = rows || []
    toast.clearError(dayErrorToast)
    dayErrorToast = null
  } catch (error) {
    if (requestId !== occurrenceRequestId) return
    dataError.value = true
    dayErrorToast = toast.error(error.message || '所选日期课程加载失败')
  } finally {
    if (requestId === occurrenceRequestId) dayLoading.value = false
  }
}

function refreshToday(reloadDay = true) {
  if (submitting.value) return
  const next = new Date().toLocaleDateString('sv-SE')
  if (next === todayStr.value) return
  const previous = todayStr.value
  const followToday = selectedDate.value === previous
  todayStr.value = next
  if (!followToday) return
  showConfirmModal.value = false
  selectedDate.value = next
  if (filterMonth.value === previous.slice(0, 7)) filterMonth.value = next.slice(0, 7)
  if (reloadDay) loadOccurrencesForDate()
}
let midnightTimer
function scheduleMidnightRefresh() {
  clearTimeout(midnightTimer)
  const now = new Date()
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  midnightTimer = setTimeout(() => { refreshToday(); scheduleMidnightRefresh() }, nextMidnight - now + 50)
}
onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('click', closeMonthDropdown, true)
  scheduleMidnightRefresh()
  loadData()
})

onUnmounted(() => {
  dataRequestId++
  occurrenceRequestId++
  historyRequestId++
  clearTimeout(midnightTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  document.removeEventListener('click', closeMonthDropdown, true)
})

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible' || submitting.value) return
  refreshToday(false)
  loadData()
  scheduleMidnightRefresh()
}

async function loadMoreRecords() {
  if (loadingMore.value || historyLoading.value || !hasMoreRecords.value) return
  const requestId = historyRequestId
  loadingMore.value = true
  try {
    const currentCount = attendanceRecords.value.length
    const page = await getAttendancePage({ limit: 50, offset: currentCount, includeVoided: includeVoided.value, scope: historyScope.value,
      courseId: filterCourseId.value, month: filterMonth.value })
    if (requestId !== historyRequestId) return
    const newData = (page.data || []).reverse()
    attendanceRecords.value = [...newData, ...attendanceRecords.value]
    hasMoreRecords.value = !!page.hasMore
  } catch (error) { toast.error(error.message || '点名记录加载失败') }
  finally { loadingMore.value = false }
}

function toggleVoided() { includeVoided.value = !includeVoided.value; loadHistory() }

const selectedCourse = computed(() => {
  return dayCourses.value.find(c => c.id === selectedCourseId.value)
})

const sortedCourseStudents = computed(() => {
  return [...courseStudents.value].sort((a, b) => getRemainingHours(a) - getRemainingHours(b))
})

const filteredCourses = computed(() => {
  const activeIds = new Set(courses.value.filter(c => !c.archivedAt).map(c => c.id))
  return dayCourses.value.filter(c => activeIds.has(c.courseId) && (isAdmin.value || c.teacherId === currentUserTeacherId.value))
})

const filteredRecords = computed(() => attendanceRecords.value)

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
  return (studentIds || []).map(id => {
    const student = students.value.find(s => s.id === id)
    return student ? student.name : ''
  }).filter(Boolean).join('、')
}

function loadCourseStudents() {
  if (!selectedCourse.value) {
    courseStudents.value = []
    return
  }
  courseStudents.value = (selectedCourse.value.studentIds || [])
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

const submitting = ref(false)
watch(submitting, busy => { if (!busy) refreshToday() })

async function submitAttendance() {
  if (!selectedCourse.value || checkedStudents.value.length === 0) return
  if (submitting.value) return

  submitting.value = true
  try {
    // 重新读取实际课次；固定课表、交接和课时规则可能在弹窗打开后改变。
    const freshOccurrences = await getCourseOccurrences(selectedDate.value, selectedDate.value)
    const freshCourse = (freshOccurrences || []).find(c => c.courseId === selectedCourse.value.courseId && c.originalDate === selectedCourse.value.originalDate)
    if (!freshCourse || (currentUserTeacherId.value && freshCourse.teacherId !== currentUserTeacherId.value)) {
      toast.error('该课次已变更或移交，请重新选择')
      showConfirmModal.value = false
      await loadOccurrencesForDate()
      selectedCourseId.value = ''
      courseStudents.value = []
      checkedStudents.value = []
      return
    }
    if (checkedStudents.value.some(id => !freshCourse.studentIds.includes(id))) {
      toast.error('课程名单已变更，请重新选择学生')
      showConfirmModal.value = false
      await loadOccurrencesForDate()
      return
    }

    // 记录点名（后端会自动扣课时）
    const attendedIds = [...checkedStudents.value]
    await addAttendance({
      courseId: freshCourse.courseId,
      date: selectedDate.value,
      originalDate: freshCourse.originalDate,
      studentIds: attendedIds
    })

    // 写入已完成，后续读取失败不能再把点名提示为失败。
    showConfirmModal.value = false
    students.value = students.value.map(student => attendedIds.includes(student.id)
      ? { ...student, usedHours: Number(student.usedHours || 0) + Number(freshCourse.hoursPerClass ?? 1) }
      : student)
    let refreshFailed = false
    try { students.value = await getStudents() || [] }
    catch { refreshFailed = true }
    filterMonth.value = selectedDate.value.slice(0, 7)
    await loadHistory()

    loadCourseStudents()
    checkedStudents.value = []
    if (refreshFailed) toast.warning('点名已成功，学生资料刷新失败，请稍后重试')
    else if (historyError.value) toast.warning('点名已成功，点名记录刷新失败，请稍后重试')
    else toast.success('点名成功！已扣除对应课时。')
  } catch (err) {
    toast.error(err.message || '点名失败')
  } finally {
    submitting.value = false
  }
}

// 选择性删除相关
const deleteTargetStudents = computed(() => {
  if (!deleteTargetRecord.value) return []
  return (deleteTargetRecord.value.studentIds || [])
    .map(id => {
      const student = students.value.find(s => s.id === id)
      return student && { ...student, name: deleteTargetRecord.value.studentNamesSnapshot?.[id] || student.name }
    })
    .filter(Boolean)
})

function canDeleteRecord(record) {
  if (isAdmin.value) return true
  return !!currentUserTeacherId.value && record.recordedBy === currentUserTeacherId.value
}

function openDeleteModal(record) {
  deleteTargetRecord.value = record
  deleteCheckedStudents.value = []
  showDeleteModal.value = true
}

async function confirmDeleteStudents() {
  if (!deleteTargetRecord.value || deleteCheckedStudents.value.length === 0 || submitting.value) return

  submitting.value = true
  try {
    const targetRecord = deleteTargetRecord.value
    const removedIds = [...deleteCheckedStudents.value]
    await removeStudentsFromRecord(
      targetRecord.id,
      removedIds
    )
    // 撤销写入已完成；资料刷新失败时不可提示“删除失败”并诱导重复提交。
    showDeleteModal.value = false
    students.value = students.value.map(student => removedIds.includes(student.id)
      ? { ...student, usedHours: Number(student.usedHours || 0) - Number(targetRecord.hoursDeducted ?? 1) }
      : student)
    await loadHistory()
    let refreshFailed = false
    try { students.value = await getStudents() || [] }
    catch { refreshFailed = true }
    loadCourseStudents()

    if (refreshFailed) toast.warning('撤销已成功，学生资料刷新失败，请稍后重试')
    else if (historyError.value) toast.warning('撤销已成功，点名记录刷新失败，请稍后重试')
    else if (removedIds.length === (targetRecord.studentIds || []).length) {
      toast.success('已撤销整条点名记录并还原所有学生课时。')
    } else {
      toast.success(`已撤销 ${removedIds.length} 名学生的点名并还原课时。`)
    }
  } catch (err) {
    toast.error(err.message || '删除失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.filter-group .selected { background: var(--color-selected); font-weight: 650; }
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.select-course > label {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  flex-shrink: 0;
}

.course-picker {
  display: flex;
  gap: 10px;
  max-width: 480px;
  width: 100%;
}
.course-picker > * { flex: 1; min-width: 0; }

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
  background: rgba(65, 120, 185, 0.1);
}

.student-item.student-insufficient {
  background: rgba(179, 79, 80, 0.08);
}

.hours-low {
  color: var(--color-danger) !important;
  font-weight: 500;
}

.hours-negative {
  color: var(--color-danger) !important;
  font-weight: 700;
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
  gap: 12px;
  margin-bottom: 16px;
}

.history-heading { display: grid; gap: 5px; }
.history-scope { display: flex; gap: 4px; }
.history-scope .btn { padding: 3px 8px; font-size: 12px; }
.history-scope .selected { background: var(--color-selected); font-weight: 650; }

.history-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.filter-group {
  display: flex;
  gap: 10px;
  max-width: 480px;
  width: 100%;
}

.filter-item {
  flex: 1;
  min-width: 0;
}

.month-picker {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: white;
  padding: 0 4px;
}

.month-arrow {
  padding: 4px 8px;
  font-size: 18px;
  line-height: 1;
  min-width: 32px;
  flex-shrink: 0;
}

.month-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  text-align: center;
  flex: 1;
  white-space: nowrap;
}

.month-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 100;
  padding: 8px;
}

.month-year-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px 0 8px;
  border-bottom: 1px solid var(--color-bg-secondary);
  margin-bottom: 8px;
}

.month-arrow-sm {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 4px 8px;
}

.month-arrow-sm:hover {
  color: var(--color-primary);
}

.month-year-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  min-width: 60px;
  text-align: center;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.month-cell {
  padding: 8px 4px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
  text-align: center;
  transition: background 0.15s;
}

.month-cell:hover {
  background: var(--color-bg-secondary);
}

.month-cell.active {
  background: var(--color-primary);
  color: white;
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

.load-more-btn {
  width: 100%;
  margin-top: 16px;
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

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.confirm-info {
  margin-bottom: 24px;
}

.confirm-warning {
  background: #fff8ea;
  border: 1px solid #e8d6b6;
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 16px;
  text-align: center;
}

.confirm-warning p {
  margin: 0;
  color: #815618;
  font-size: 14px;
  font-weight: 500;
}

.confirm-error {
  background: #fef2f2;
  border-color: #fca5a5;
}

.confirm-error p {
  color: #991b1b;
}

.insufficient-list {
  margin: 8px 0;
  padding-left: 20px;
  color: #991b1b;
  font-size: 14px;
  font-weight: 600;
}

.insufficient-list li {
  margin-bottom: 2px;
}

.insufficient-hint {
  font-size: 13px !important;
  font-weight: 400 !important;
  color: #b91c1c !important;
  margin-top: 6px !important;
}

@media (max-width: 768px) {
  .select-course {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .select-course > label {
    font-size: 18px;
    font-weight: 600;
    text-align: center;
  }
  .course-picker {
    gap: 6px;
    max-width: none;
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
  .history-header {
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .filter-group {
    flex-wrap: nowrap;
    gap: 6px;
    width: 100%;
    max-width: none;
  }
  .filter-item {
    flex: 1;
    min-width: 0;
  }
  .month-picker {
    padding: 0 2px;
  }
  .month-arrow {
    padding: 4px 6px;
    font-size: 16px;
    min-width: 28px;
  }
  .month-label {
    font-size: 12px;
  }
  .form-header {
    flex-direction: column;
    gap: 8px;
  }
  .student-info {
    flex-direction: column;
    gap: 2px;
  }
  .deduct-info {
    flex-direction: column;
    gap: 4px;
  }
  .history-item {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .history-row {
    flex-direction: column;
    gap: 4px;
  }
}
@media (max-width: 599px) {
  .history-header { align-items: stretch; }
  .filter-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .filter-group > .btn { width: 100%; }
  .filter-item.month-picker { grid-column: 1 / -1; min-height: 34px; }
}
</style>
