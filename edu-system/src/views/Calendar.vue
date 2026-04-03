<template>
  <div class="calendar-page fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">点名日历</h1>
        <p class="page-subtitle">查看每日点名记录和课程安排</p>
      </div>
      <div class="calendar-nav">
        <button class="btn btn-secondary" @click="prevMonth">上月</button>
        <span class="current-month">{{ currentYear }}年{{ currentMonth + 1 }}月</span>
        <button class="btn btn-secondary" @click="nextMonth">下月</button>
        <button class="btn btn-primary" @click="goToday">今天</button>
      </div>
    </div>

    <div class="calendar-container">
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
          <span class="attendance-dot" v-if="day.hasAttendance"></span>
          <span class="attendance-count" v-if="day.attendanceCount">{{ day.attendanceCount }}人</span>
        </div>
      </div>
    </div>

    <!-- Tooltip -->
    <div class="calendar-tooltip" v-if="tooltipVisible" :style="tooltipStyle">
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
      <div class="tooltip-empty" v-if="tooltipData.courses.length === 0 && tooltipData.attendanceCount === 0">
        暂无安排
      </div>
    </div>

    <div class="attendance-detail" v-if="selectedDateInfo">
      <h3 class="detail-title">{{ selectedDateInfo.dateStr }}</h3>
      <div class="detail-list" v-if="selectedDateInfo.records.length > 0">
        <div class="detail-item" v-for="record in selectedDateInfo.records" :key="record.id">
          <div class="detail-course">{{ getCourseName(record.courseId) }}</div>
          <div class="detail-students">{{ getStudentNames(record.studentIds) }}</div>
          <div class="detail-hours">扣除 {{ record.hoursDeducted }} 课时/人</div>
        </div>
      </div>
      <div class="no-record" v-else>
        <p>当日无点名记录</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getAttendance, getCourses, getStudents, getTeachers } from '../utils/storage'

const attendanceRecords = ref([])
const courses = ref([])
const students = ref([])
const teachers = ref([])
const currentDate = ref(new Date())
const selectedDate = ref('')

// Tooltip 相关
const tooltipVisible = ref(false)
const tooltipStyle = ref({})
const tooltipData = ref({
  dateStr: '',
  courses: [],
  attendanceCount: 0
})

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

onMounted(() => {
  attendanceRecords.value = getAttendance()
  courses.value = getCourses()
  students.value = getStudents()
  teachers.value = getTeachers()

  // 默认选中今天
  selectedDate.value = new Date().toISOString().split('T')[0]
})

const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth())

// 获取某天的课程（根据星期几）
function getCoursesOnDate(dateStr) {
  const date = new Date(dateStr)
  const weekday = date.getDay() // 0-6, 0是周日
  const weekdayMap = { 0: 7, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 } // 转换为 1-7

  return courses.value
    .filter(c => c.weekday === weekdayMap[weekday])
    .map(c => ({
      ...c,
      teacherName: getTeacherName(c.teacherId)
    }))
}

function getTeacherName(teacherId) {
  const teacher = teachers.value.find(t => t.id === teacherId)
  return teacher ? teacher.name : '未知教师'
}

const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days = []

  // 上个月的天数
  const firstDayWeek = firstDay.getDay()
  const prevMonthLastDay = new Date(year, month, 0).getDate()

  for (let i = firstDayWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i
    const dateStr = formatDate(year, month - 1, day)
    days.push({
      day,
      dateStr,
      otherMonth: true,
      isToday: false,
      hasAttendance: hasAttendanceOnDate(dateStr),
      attendanceCount: getAttendanceCount(dateStr),
      courses: getCoursesOnDate(dateStr)
    })
  }

  // 当月的天数
  const today = new Date()
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const dateStr = formatDate(year, month, i)
    days.push({
      day: i,
      dateStr,
      otherMonth: false,
      isToday: today.getFullYear() === year && today.getMonth() === month && today.getDate() === i,
      hasAttendance: hasAttendanceOnDate(dateStr),
      attendanceCount: getAttendanceCount(dateStr),
      courses: getCoursesOnDate(dateStr)
    })
  }

  // 下个月的天数
  const remainingDays = 42 - days.length
  for (let i = 1; i <= remainingDays; i++) {
    const dateStr = formatDate(year, month + 1, i)
    days.push({
      day: i,
      dateStr,
      otherMonth: true,
      isToday: false,
      hasAttendance: hasAttendanceOnDate(dateStr),
      attendanceCount: getAttendanceCount(dateStr),
      courses: getCoursesOnDate(dateStr)
    })
  }

  return days
})

const selectedDateInfo = computed(() => {
  if (!selectedDate.value) return null

  const records = attendanceRecords.value.filter(r => r.date === selectedDate.value)
  return {
    dateStr: selectedDate.value,
    records
  }
})

function formatDate(year, month, day) {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function hasAttendanceOnDate(dateStr) {
  return attendanceRecords.value.some(r => r.date === dateStr)
}

function getAttendanceCount(dateStr) {
  const records = attendanceRecords.value.filter(r => r.date === dateStr)
  return records.reduce((sum, r) => sum + r.studentIds.length, 0)
}

function getCourseName(courseId) {
  const course = courses.value.find(c => c.id === courseId)
  return course ? course.name : '未知课程'
}

function getStudentNames(studentIds) {
  return studentIds.map(id => {
    const student = students.value.find(s => s.id === id)
    return student ? student.name : ''
  }).filter(Boolean).join('、')
}

function prevMonth() {
  currentDate.value = new Date(currentYear.value, currentMonth.value - 1, 1)
}

function nextMonth() {
  currentDate.value = new Date(currentYear.value, currentMonth.value + 1, 1)
}

function goToday() {
  currentDate.value = new Date()
  selectedDate.value = new Date().toISOString().split('T')[0]
}

function selectDate(day) {
  selectedDate.value = day.dateStr
}

// Tooltip 函数
function showTooltip(day, event) {
  tooltipData.value = {
    dateStr: day.dateStr,
    courses: day.courses || [],
    attendanceCount: day.attendanceCount || 0
  }

  const rect = event.target.getBoundingClientRect()
  tooltipStyle.value = {
    position: 'fixed',
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top - 10}px`,
    transform: 'translate(-50%, -100%)'
  }

  tooltipVisible.value = true
}

function hideTooltip() {
  tooltipVisible.value = false
}
</script>

<style scoped>
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
  background: rgba(0, 113, 227, 0.1);
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

.calendar-day.today .attendance-dot {
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
  background: rgba(29, 29, 31, 0.95);
  color: white;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  z-index: 1000;
  min-width: 160px;
  max-width: 240px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.tooltip-date {
  font-weight: 600;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.tooltip-section {
  margin-top: 8px;
}

.tooltip-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
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
  color: rgba(255, 255, 255, 0.7);
  margin-left: 8px;
}

.tooltip-attendance {
  color: #5ac8fa;
  font-weight: 500;
}

.tooltip-empty {
  color: rgba(255, 255, 255, 0.5);
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
</style>