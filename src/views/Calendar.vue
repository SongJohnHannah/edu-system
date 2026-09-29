<template>
  <div class="calendar-page fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">点名日历</h1>
        <p class="page-subtitle">查看每日点名记录和课程安排</p>
      </div>
      <div class="calendar-nav">
        <OfficeButton class="btn btn-secondary" :disabled="loading" @click="prevMonth">上月</OfficeButton>
        <span class="current-month">{{ currentYear }}年{{ currentMonth + 1 }}月</span>
        <OfficeButton class="btn btn-secondary" :disabled="loading" @click="nextMonth">下月</OfficeButton>
        <OfficeButton class="btn btn-primary" :disabled="loading" @click="goToday">今天</OfficeButton>
      </div>
    </div>

<div class="scope-filter"><OfficeButton :class="{ 'btn-primary': scopeFilter === 'all' }" :aria-pressed="scopeFilter === 'all'" @click="scopeFilter = 'all'">全部日程</OfficeButton><OfficeButton v-if="auth.teacherId" :class="{ 'btn-primary': scopeFilter === 'mine' }" :aria-pressed="scopeFilter === 'mine'" @click="scopeFilter = 'mine'">我的日程</OfficeButton></div>
    <div v-if="loading" class="empty-state" role="status">正在加载日历…</div>
    <div v-else-if="loadError" class="empty-state" role="alert"><p>日历数据加载失败，请重试</p><OfficeButton class="btn btn-secondary" @click="loadPage">重试</OfficeButton></div>
    <div class="calendar-container" v-else>
      <div class="calendar-header">
        <span v-for="day in weekDays" :key="day" class="week-day">{{ day }}</span>
      </div>
      <div class="calendar-body">
        <div
          v-for="(day, index) in calendarDays"
          :key="index"
          class="calendar-day"
          :class="{
            'other-month': day.otherMonth,
            'today': day.isToday,
            'has-attendance': day.hasAttendance,
            'selected': selectedDate === day.dateStr
          }"
          @click="selectDate(day)"
          @mouseenter="showTooltip(day, $event)"
          @mouseleave="hideTooltip"
        >
          <span class="day-number">{{ day.day }}</span>
          <span class="course-dot" v-if="day.courses && day.courses.length > 0 && !day.hasAttendance"></span>
          <span class="trial-dot" v-if="day.trials?.length"></span>
          <span class="attendance-dot" v-if="day.hasAttendance"></span>
          <span class="attendance-count" v-if="day.attendanceCount">{{ day.attendanceCount }}人</span>
        </div>
      </div>
    </div>

    <!-- Tooltip -->
    <div class="calendar-tooltip" v-if="!loading && !loadError && tooltipVisible" :style="tooltipStyle">
      <div class="tooltip-date">{{ tooltipData.dateStr }}</div>
      <div class="tooltip-section" v-if="tooltipData.courses.length > 0">
        <div class="tooltip-label">今日课程：</div>
        <div class="tooltip-course" v-for="course in tooltipData.courses" :key="course.id">
          <span class="course-name">{{ course.name }}</span>
          <span class="course-teacher">{{ course.teacherName }}</span>
        </div>
      </div>
      <div class="tooltip-section" v-if="tooltipData.attendanceCount > 0">
        <div class="tooltip-label">点名记录：</div>
        <div class="tooltip-attendance">{{ tooltipData.attendanceCount }} 人次</div>
      </div>
      <div class="tooltip-section" v-if="tooltipData.trials?.length"><div class="tooltip-label">试听预约：{{ tooltipData.trials.length }} 人</div></div>
      <div class="tooltip-empty" v-if="tooltipData.courses.length === 0 && tooltipData.attendanceCount === 0 && !tooltipData.trials?.length">
        暂无安排
      </div>
    </div>

    <div class="attendance-detail" v-if="!loading && !loadError && selectedDateInfo">
      <h3 class="detail-title">{{ selectedDateInfo.dateStr }}</h3>
      <!-- 课程安排 -->
      <div v-if="selectedDateInfo.courses.length > 0">
        <div class="detail-subtitle">课程安排</div>
        <div class="detail-list parallel-courses">
          <div class="detail-item course-item" v-for="course in selectedDateInfo.courses" :key="course.id" :style="teacherStyle(course.teacherId, teachers)">
            <div class="course-info-col">
              <router-link class="detail-course" :to="{ path: '/weekly-schedule', query: { date: course.date } }">{{ course.name }}</router-link>
              <div class="detail-teacher">{{ course.teacherName }}</div>
              <div class="detail-time" v-if="course.startTime">{{ course.startTime }} - {{ course.endTime }}</div>
              <div class="detail-time" v-if="course.trialCount">试听预约 {{ course.trialCount }} 人</div>
            </div>
            <div class="course-students-col" v-if="getStudentNames(course.studentIds)">
              <div class="students-label">学生</div>
              <div class="students-names">{{ getStudentNames(course.studentIds) }}</div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="selectedDateInfo.trials.length" class="trial-detail"><div class="detail-subtitle">试听预约</div>
        <div class="detail-list"><div v-for="booking in selectedDateInfo.trials" :key="booking.id" class="detail-item">
          <div><router-link :to="{ path: '/trial-bookings', query: { date: booking.date, booking: booking.id } }"><strong>{{ booking.studentName }}</strong></router-link><div class="detail-time">{{ booking.startTime }}—{{ booking.endTime }} · {{ booking.teacherName }}</div></div>
          <div class="detail-teacher">{{ booking.courseName || '独立试听' }}</div>
        </div></div>
      </div>
      <!-- 点名记录 -->
      <div v-if="selectedDateInfo.records.length > 0" style="margin-top: 16px;">
        <div class="detail-subtitle">点名记录</div>
        <div class="detail-list">
          <div class="detail-item" v-for="record in selectedDateInfo.records" :key="record.id">
            <div class="detail-course">{{ record.courseName || getCourseName(record.courseId) }}</div>
            <div class="detail-teacher" v-if="record.teacherName">{{ record.teacherName }}</div>
            <div class="detail-time" v-if="record.startTime">{{ record.startTime }}—{{ record.endTime }}</div>
            <div class="detail-students">{{ record.studentIds.map(id => record.studentNamesSnapshot?.[id] || getStudentNames([id])).join('、') }}</div>
            <div class="detail-hours">扣除 {{ record.hoursDeducted }} 课时/人</div>
          </div>
        </div>
      </div>
      <div class="no-record" v-if="selectedDateInfo.courses.length === 0 && selectedDateInfo.records.length === 0 && selectedDateInfo.trials.length === 0">
        <p>暂无安排</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { teacherStyle } from '../utils/teacherColors.js'
import { useAuthStore } from '../stores/auth.js'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getAllAttendance, getCourseOccurrences, getTrialBookings, getStudents, getTeachers } from '../utils/storage'
import { useToast } from '../composables/useToast.js'

const auth = useAuthStore()
const toast = useToast()
const scopeFilter = ref('all')
const attendanceRecords = ref([])
const courses = ref([])
const trials = ref([])
const students = ref([])
const teachers = ref([])
const currentDate = ref(new Date())
const todayStr = ref(formatDate(currentDate.value.getFullYear(), currentDate.value.getMonth(), currentDate.value.getDate()))
const selectedDate = ref('')
const loading = ref(true)
const loadError = ref(false)

// Tooltip 相关
const tooltipVisible = ref(false)
const tooltipStyle = ref({})
const tooltipData = ref({
  dateStr: '',
  courses: [],
  trials: [],
  attendanceCount: 0
})

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

let referencesReady = false
let pageRequest = 0
let loadErrorToast = null
async function loadPage() {
  const request = ++pageRequest
  loading.value = true
  loadError.value = false
  try {
    const [a, s, t] = await Promise.all([getAllAttendance(), getStudents(), getTeachers()])
    if (request !== pageRequest) return
    attendanceRecords.value = a || []
    students.value = s || []
    teachers.value = t || []
    referencesReady = true
    await loadMonth()
    if (!loadError.value && !selectedDate.value) {
      const now = new Date()
      selectedDate.value = formatDate(now.getFullYear(), now.getMonth(), now.getDate())
    }
  } catch (error) {
    if (request === pageRequest) {
      loadError.value = true
      loadErrorToast = toast.error(error.message || '日历数据加载失败')
    }
  } finally {
    if (request === pageRequest) loading.value = false
  }
}
function refreshToday() {
  const now = new Date()
  const next = formatDate(now.getFullYear(), now.getMonth(), now.getDate())
  if (next === todayStr.value) return
  const followToday = selectedDate.value === todayStr.value
  todayStr.value = next
  if (followToday) {
    selectedDate.value = next
    if (currentYear.value !== now.getFullYear() || currentMonth.value !== now.getMonth()) currentDate.value = now
  }
}
function refreshVisible() {
  if (document.visibilityState !== 'visible') return
  refreshToday()
  loadPage()
  scheduleMidnightRefresh()
}
let midnightTimer
function scheduleMidnightRefresh() {
  clearTimeout(midnightTimer)
  const now = new Date()
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  midnightTimer = setTimeout(() => { refreshToday(); scheduleMidnightRefresh() }, nextMidnight - now + 50)
}
onMounted(() => { loadPage(); scheduleMidnightRefresh(); document.addEventListener('visibilitychange', refreshVisible) })
onUnmounted(() => { pageRequest++; monthRequest++; clearTimeout(midnightTimer); document.removeEventListener('visibilitychange', refreshVisible) })

let monthRequest = 0
async function loadMonth() {
  const request = ++monthRequest
  loading.value = true
  loadError.value = false
  const first = new Date(currentYear.value, currentMonth.value, 1)
  const start = new Date(first)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(end.getDate() + 41)
  try {
    const [courseRows, trialRows] = await Promise.all([
      getCourseOccurrences(formatDate(start.getFullYear(), start.getMonth(), start.getDate()), formatDate(end.getFullYear(), end.getMonth(), end.getDate())),
      getTrialBookings({ start: formatDate(start.getFullYear(), start.getMonth(), start.getDate()), end: formatDate(end.getFullYear(), end.getMonth(), end.getDate()) })
    ])
    if (request !== monthRequest) return
    courses.value = courseRows || []
    trials.value = (trialRows || []).filter(t => t.status === 'active')
    toast.clearError(loadErrorToast)
    loadErrorToast = null
  } catch (error) {
    if (request === monthRequest) {
      loadError.value = true
      loadErrorToast = toast.error(error.message || '日历数据加载失败')
    }
  } finally {
    if (request === monthRequest) loading.value = false
  }
}
watch(currentDate, () => { if (referencesReady) loadMonth() })

const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth())

// Pre-build attendance map for O(N) instead of O(42*N)
const occurrenceTeacherMap = computed(() => new Map(courses.value.map(c => [c.id, c.teacherId])))
const legacyTeacherMap = computed(() => new Map(courses.value.map(c => [`${c.courseId}:${c.date}`, c.teacherId])))
const attendanceMap = computed(() => {
  const map = new Map()
  for (const r of attendanceRecords.value) {
    const teacherId = r.originalDate
      ? occurrenceTeacherMap.value.get(`${r.courseId}:${r.originalDate}`) || r.recordedBy
      : legacyTeacherMap.value.get(`${r.courseId}:${r.date}`) || r.recordedBy
    if (scopeFilter.value === 'mine' && teacherId !== auth.teacherId) continue
    const key = r.date
    if (!map.has(key)) map.set(key, { count: 0, records: [] })
    const entry = map.get(key)
    entry.count += (r.studentIds || []).length
    entry.records.push(r)
  }
  return map
})

const dateCourseMap = computed(() => {
  const map = new Map()
  for (const c of courses.value) {
    if (scopeFilter.value === 'mine' && c.teacherId !== auth.teacherId) continue
    if (!map.has(c.date)) map.set(c.date, [])
    map.get(c.date).push(c)
  }
  return map
})
const trialMap = computed(() => {
  const map = new Map()
  for (const t of trials.value) {
    if (scopeFilter.value === 'mine' && t.teacherId !== auth.teacherId) continue
    if (!map.has(t.date)) map.set(t.date, [])
    map.get(t.date).push(t)
  }
  return map
})

function getTeacherName(teacherId) {
  const teacher = teachers.value.find(t => t.id === teacherId)
  return teacher ? teacher.name : '未知教师'
}

function getCoursesOnDate(dateStr) {
  return dateCourseMap.value.get(dateStr) || []
}

const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days = []

  const firstDayWeek = firstDay.getDay()
  const prevMonthLastDay = new Date(year, month, 0).getDate()

  for (let i = firstDayWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i
    const dateStr = formatDate(year, month - 1, day)
    const att = attendanceMap.value.get(dateStr)
    days.push({
      day, dateStr, otherMonth: true, isToday: false,
      hasAttendance: !!att, attendanceCount: att?.count || 0,
      courses: getCoursesOnDate(dateStr), trials: trialMap.value.get(dateStr) || []
    })
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    const dateStr = formatDate(year, month, i)
    const att = attendanceMap.value.get(dateStr)
    days.push({
      day: i, dateStr, otherMonth: false,
      isToday: dateStr === todayStr.value,
      hasAttendance: !!att, attendanceCount: att?.count || 0,
      courses: getCoursesOnDate(dateStr), trials: trialMap.value.get(dateStr) || []
    })
  }

  const remainingDays = 42 - days.length
  for (let i = 1; i <= remainingDays; i++) {
    const dateStr = formatDate(year, month + 1, i)
    const att = attendanceMap.value.get(dateStr)
    days.push({
      day: i, dateStr, otherMonth: true, isToday: false,
      hasAttendance: !!att, attendanceCount: att?.count || 0,
      courses: getCoursesOnDate(dateStr), trials: trialMap.value.get(dateStr) || []
    })
  }

  return days
})

const selectedDateInfo = computed(() => {
  if (!selectedDate.value) return null
  const att = attendanceMap.value.get(selectedDate.value)
  return {
    dateStr: selectedDate.value,
    records: att?.records || [],
    courses: getCoursesOnDate(selectedDate.value), trials: trialMap.value.get(selectedDate.value) || []
  }
})

function formatDate(year, month, day) {
  const normalized = new Date(year, month, day)
  const m = String(normalized.getMonth() + 1).padStart(2, '0')
  const d = String(normalized.getDate()).padStart(2, '0')
  return `${normalized.getFullYear()}-${m}-${d}`
}

function getCourseName(courseId) {
  const course = courses.value.find(c => c.courseId === courseId)
  return course ? course.name : '未知课程'
}

function getStudentNames(studentIds) {
  return (studentIds || []).map(id => {
    const student = students.value.find(s => s.id === id)
    return student ? student.name : ''
  }).filter(Boolean).join('、')
}

function prevMonth() {
  currentDate.value = new Date(currentYear.value, currentMonth.value - 1, 1)
  selectedDate.value = formatDate(currentYear.value, currentMonth.value, 1)
}

function nextMonth() {
  currentDate.value = new Date(currentYear.value, currentMonth.value + 1, 1)
  selectedDate.value = formatDate(currentYear.value, currentMonth.value, 1)
}

function goToday() {
  currentDate.value = new Date()
  const now = new Date()
  selectedDate.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function selectDate(day) {
  selectedDate.value = day.dateStr
}

// Tooltip 函数
function showTooltip(day, event) {
  tooltipData.value = {
    dateStr: day.dateStr,
    courses: day.courses || [],
    trials: day.trials || [],
    attendanceCount: day.attendanceCount || 0
  }

  const rect = event.target.getBoundingClientRect()
  let left = rect.left + rect.width / 2
  let top = rect.top - 10

  // Clamp to viewport
  const tooltipWidth = 200
  left = Math.max(tooltipWidth / 2 + 8, Math.min(left, window.innerWidth - tooltipWidth / 2 - 8))
  if (top < 60) {
    tooltipStyle.value = {
      position: 'fixed',
      left: `${left}px`,
      top: `${rect.bottom + 10}px`,
      transform: 'translate(-50%, 0)'
    }
  } else {
    tooltipStyle.value = {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      transform: 'translate(-50%, -100%)'
    }
  }

  tooltipVisible.value = true
}

function hideTooltip() {
  tooltipVisible.value = false
}
</script>

<style scoped>
.trial-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--color-trial); margin-left: 3px; }
.trial-detail { margin-top: 16px; }
.calendar-page {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  flex-wrap: wrap;
  gap: 16px;
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

.calendar-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}

.current-month {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  min-width: 120px;
  text-align: center;
}

.calendar-container {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 24px;
}

.calendar-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 16px;
}

.week-day {
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding: 8px;
}

.calendar-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.calendar-day {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);
  position: relative;
  min-height: 60px;
}

.calendar-day:hover {
  background: var(--color-bg-secondary);
}

.calendar-day.other-month {
  opacity: 0.4;
}

.calendar-day.today {
  background: var(--color-primary);
  color: white;
}

.calendar-day.today:hover {
  background: var(--color-primary-hover);
}

.calendar-day.has-attendance {
  background: rgba(65, 120, 185, 0.1);
}

.calendar-day.today.has-attendance {
  background: var(--color-primary);
}

.calendar-day.selected {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.day-number {
  font-size: 15px;
  font-weight: 500;
}

.attendance-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
  position: absolute;
  top: 8px;
  right: 8px;
}

.course-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  position: absolute;
  top: 8px;
  right: 8px;
}

.calendar-day.today .attendance-dot {
  background: white;
}

.calendar-day.today .course-dot {
  background: white;
}

.attendance-count {
  font-size: 11px;
  color: var(--color-primary);
  margin-top: 2px;
}

.calendar-day.today .attendance-count {
  color: rgba(255, 255, 255, 0.9);
}

/* Tooltip 样式 */
.calendar-tooltip {
  background: rgba(255, 255, 255, 0.97);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  z-index: 1000;
  min-width: 160px;
  max-width: 240px;
  box-shadow: var(--shadow-md);
  pointer-events: none;
}

.tooltip-date {
  font-weight: 600;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.tooltip-section {
  margin-top: 8px;
}

.tooltip-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.tooltip-course {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.course-name {
  font-weight: 500;
}

.course-teacher {
  color: var(--color-text-secondary);
  margin-left: 8px;
}

.tooltip-attendance {
  color: var(--color-primary);
  font-weight: 500;
}

.tooltip-empty {
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: center;
  padding: 8px 0;
}

.attendance-detail {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.detail-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-bg-secondary);
}

.detail-subtitle {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.course-item {
  border-left: 3px solid var(--color-success);
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.course-info-col {
  flex: 1;
  min-width: 0;
}

.course-students-col {
  flex: 1;
  min-width: 0;
  border-left: 1px solid var(--color-border, #e5e5e5);
  padding-left: 16px;
}

.students-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.students-names {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.6;
}

.detail-teacher {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.detail-time {
  font-size: 13px;
  color: var(--color-primary);
  margin-top: 2px;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-item {
  padding: 16px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.detail-course {
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 8px;
}

.detail-students {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.detail-hours {
  font-size: 13px;
  color: var(--color-primary);
}

.no-record {
  text-align: center;
  padding: 32px;
  color: var(--color-text-secondary);
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 20px;
    gap: 12px;
  }

  .page-title {
    font-size: 22px;
  }

  .calendar-nav {
    width: 100%;
    justify-content: space-between;
    gap: 6px;
  }

  .calendar-nav .btn {
    padding: 8px 12px;
    font-size: 13px;
  }

  .current-month {
    font-size: 15px;
    min-width: auto;
  }

  .calendar-container {
    padding: 12px;
    border-radius: var(--radius-md);
  }

  .calendar-body {
    gap: 2px;
  }

  .calendar-day {
    aspect-ratio: 1;
    min-height: 0;
    border-radius: 6px;
  }

  .day-number {
    font-size: 13px;
  }

  .attendance-count {
    font-size: 9px;
  }

  .attendance-dot {
    width: 4px;
    height: 4px;
    top: 4px;
    right: 4px;
  }

  .calendar-tooltip {
    display: none;
  }

  .attendance-detail {
    padding: 16px;
  }

  .course-item {
    flex-direction: column;
    gap: 12px;
  }

  .course-students-col {
    border-left: none;
    padding-left: 0;
    border-top: 1px solid var(--color-border, #e5e5e5);
    padding-top: 12px;
  }
}
.scope-filter { display: flex; gap: 8px; margin-bottom: 16px; }
.parallel-courses { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; }
.parallel-courses .course-item { border-left: 4px solid var(--c-border); background: var(--c-bg); color: var(--c-fg); border-radius: 8px; }
</style>
