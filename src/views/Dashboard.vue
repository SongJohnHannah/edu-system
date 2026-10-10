<template>
  <div class="dashboard fade-in">
    <div class="welcome"><div><h1 class="page-title">教师工作台</h1><p class="page-subtitle">查看今天的课程、学生和试听安排</p></div><img src="/brand/waving-bear.png" alt="挥手的小熊" /></div>

    <div class="quick-actions">
      <h2 class="section-title">快速操作</h2>
      <div class="actions-grid">
        <router-link to="/attendance" class="action-card">
          <div class="action-icon attendance">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <span>开始点名</span>
        </router-link>
        <router-link to="/students" class="action-card">
          <div class="action-icon students">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
          </div>
          <span>添加学生</span>
        </router-link>
        <router-link to="/teachers" class="action-card" v-if="isAdmin">
          <div class="action-icon teachers">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
              <line x1="12" y1="14" x2="12" y2="20"/>
              <line x1="15" y1="17" x2="9" y2="17"/>
            </svg>
          </div>
          <span>添加教师</span>
        </router-link>
        <router-link to="/courses" class="action-card">
          <div class="action-icon courses">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              <line x1="12" y1="6" x2="12" y2="12"/>
              <line x1="15" y1="9" x2="9" y2="9"/>
            </svg>
          </div>
          <span>创建课程</span>
        </router-link>
        <router-link to="/trial-bookings" class="action-card"><div class="action-icon trial">☆</div><span>试听预约</span></router-link>
      </div>
    </div>

    <div v-if="loading" class="section trial-today" role="status">正在加载工作台数据…</div>
    <div v-else-if="loadError" class="section trial-today" role="alert"><p>工作台数据加载失败，请重试</p><OfficeButton class="btn btn-secondary" @click="loadData">重试</OfficeButton></div>
    <template v-else>
    <div class="section trial-today"><div class="section-heading"><h2 class="section-title">今日正式课程</h2><router-link to="/weekly-schedule">查看周排课</router-link></div><div v-if="todayCourses.length" class="trial-today-list"><router-link v-for="course in todayCourses" :key="course.id" :to="{ path: '/weekly-schedule', query: { date: course.date } }" class="trial-today-item formal"><strong>{{ course.startTime }}—{{ course.endTime }}</strong><span>{{ course.name }} · {{ course.teacherName }}</span><small>正式学生 {{ course.studentIds.length }} 人<span v-if="course.trialCount" class="trial-inline"> · 试听 {{ course.trialCount }} 人</span></small></router-link></div><p v-else class="trial-today-empty">今天没有正式课程</p></div>
    <div class="section trial-today">
      <div class="section-heading"><h2 class="section-title">今日试听预约</h2><router-link to="/trial-bookings">查看全部</router-link></div>
      <div v-if="todayTrials.length" class="trial-today-list">
        <router-link v-for="booking in todayTrials" :key="booking.id" :to="{ path: '/trial-bookings', query: { date: booking.date, booking: booking.id } }" class="trial-today-item">
          <strong>{{ booking.startTime }}—{{ booking.endTime }}</strong>
          <span>{{ booking.studentName }} · {{ booking.teacherName }}</span>
          <small>{{ booking.courseName || '独立试听' }}</small>
        </router-link>
      </div>
      <p v-else class="trial-today-empty">今天没有试听预约</p>
    </div>

    <div class="section">
      <h2 class="section-title">数据统计</h2>
      <div class="stats-grid">
        <router-link to="/calendar" class="stat-card">
          <div class="stat-icon students">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ todayStudentCount }}</span>
            <span class="stat-label">今日上课学生</span>
          </div>
        </router-link>

        <router-link to="/teachers" class="stat-card">
          <div class="stat-icon teachers">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ todayTeacherCount }}</span>
            <span class="stat-label">今日上课教师</span>
          </div>
        </router-link>

        <router-link to="/courses" class="stat-card">
          <div class="stat-icon courses">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ todayCourseCount }}</span>
            <span class="stat-label">今日课程</span>
          </div>
        </router-link>

        <router-link to="/students" class="stat-card">
          <div class="stat-icon hours">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ todayUsedHours }}</span>
            <span class="stat-label">今日学生消耗课时</span>
          </div>
        </router-link>

        <router-link to="/calendar" class="stat-card">
          <div class="stat-icon attendance">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ todayAttendanceCount }}</span>
            <span class="stat-label">今日点名</span>
          </div>
        </router-link>

        <router-link to="/calendar" class="stat-card">
          <div class="stat-icon month-attendance">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ thisMonthAttendanceCount }}</span>
            <span class="stat-label">本月点名</span>
          </div>
        </router-link>
      </div>
    </div>

    <div class="section" v-if="lowHoursStudents.length > 0">
      <h2 class="section-title">课时预警</h2>
      <div class="warning-list">
        <div class="warning-item" v-for="student in lowHoursStudents" :key="student.id">
          <span class="warning-name">{{ student.name }}</span>
          <span class="warning-hours" :class="{ 'hours-negative': (student.totalHours || 0) - (student.usedHours || 0) < 0 }">{{ formatRemaining(student) }}</span>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getStudents, getTeachers, getCourseOccurrences, getTrialBookings, getAllAttendance } from '../utils/storage'
import { useToast } from '../composables/useToast.js'
import { useAuthStore } from '../stores/auth.js'

const toast = useToast()
const auth = useAuthStore()
const isAdmin = computed(() => auth.isAdmin)

const students = ref([])
const teachers = ref([])
const courses = ref([])
const attendance = ref([])
const todayTrials = ref([])
const loading = ref(true)
const loadError = ref(false)

// 获取今日日期信息
function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const todayStr = ref(localDate(new Date()))
let loadSequence = 0
let loadErrorToast = null

async function loadData() {
  const sequence = ++loadSequence
  const date = localDate(new Date())
  loading.value = true
  loadError.value = false
  try {
    const [s, t, c, a, b] = await Promise.all([
      getStudents(), getTeachers(), getCourseOccurrences(date, date), getAllAttendance(),
      getTrialBookings({ start: date, end: date, status: 'active' })
    ])
    if (sequence !== loadSequence) return
    todayStr.value = date
    students.value = s || []
    teachers.value = t || []
    courses.value = c || []
    attendance.value = a || []
    todayTrials.value = b || []
    toast.clearError(loadErrorToast)
    loadErrorToast = null
  } catch (error) {
    if (sequence === loadSequence) { loadError.value = true; loadErrorToast = toast.error(error.message || '工作台加载失败') }
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}
function refreshVisible() { if (document.visibilityState === 'visible') loadData() }
let midnightTimer
function scheduleMidnightRefresh() {
  const now = new Date()
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  midnightTimer = setTimeout(() => { loadData(); scheduleMidnightRefresh() }, nextMidnight - now + 50)
}
onMounted(() => { loadData(); scheduleMidnightRefresh(); document.addEventListener('visibilitychange', refreshVisible) })
onUnmounted(() => { loadSequence++; clearTimeout(midnightTimer); document.removeEventListener('visibilitychange', refreshVisible) })

// 今日课程
const todayCourses = computed(() => {
  return courses.value
})

// 今日上课教师数
const todayTeacherCount = computed(() => {
  const teacherIds = new Set(todayCourses.value.map(c => c.teacherId))
  return teacherIds.size
})

// 今日上课学生数
const todayStudentCount = computed(() => {
  const studentIds = new Set()
  todayCourses.value.forEach(c => {
    (c.studentIds || []).forEach(id => studentIds.add(id))
  })
  return studentIds.size
})

// 今日课程数
const todayCourseCount = computed(() => {
  return todayCourses.value.length
})

// 今日已消耗课时
const todayUsedHours = computed(() => {
  const todayRecords = attendance.value.filter(r => r.date === todayStr.value)
  return todayRecords.reduce((sum, r) => sum + (r.hoursDeducted ?? 1) * ((r.studentIds || []).length), 0)
})

// 今日点名次数
const todayAttendanceCount = computed(() => {
  return attendance.value.filter(r => r.date === todayStr.value).length
})

// 本月点名次数
const thisMonthAttendanceCount = computed(() => {
  const thisMonth = todayStr.value.slice(0, 7)
  return attendance.value.filter(r => r.date && r.date.startsWith(thisMonth)).length
})

// 课时预警学生
const lowHoursStudents = computed(() => {
  return students.value
    .filter(s => {
      if (s.enrollmentStage === 'pending' || s.status !== 'active') return false
      const r = (s.totalHours || 0) - (s.usedHours || 0)
      return r < 3
    })
    .sort((a, b) => ((a.totalHours || 0) - (a.usedHours || 0)) - ((b.totalHours || 0) - (b.usedHours || 0)))
})

function formatRemaining(student) {
  const r = (student.totalHours || 0) - (student.usedHours || 0)
  return r < 0 ? `欠 ${Math.abs(r)} 课时` : `剩余 ${r} 课时`
}
</script>

<style scoped>
.welcome { display: flex; align-items: center; justify-content: center; gap: 18px; padding: 20px 0 26px; }
.welcome img { width: 88px; height: 108px; object-fit: contain; }
.action-icon.trial { background: #fff4e5; color: #9b621c; font-size: 27px; }
.welcome .page-title, .welcome .page-subtitle { text-align: left; margin-bottom: 4px; }
@media (max-width: 599px) { .welcome { justify-content: space-between; } .welcome img { width: 70px; height: 88px; } }
.dashboard {
  max-width: 900px;
  margin: 0 auto;
}

.page-title {
  font-size: 40px;
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 18px;
  color: var(--color-text-secondary);
  text-align: center;
  margin-bottom: 48px;
}

.section {
  margin-bottom: 40px;
}

.section-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16px;
}

.quick-actions {
  margin-bottom: 40px;
}
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.section-heading a { color: var(--color-primary); font-size: 13px; text-decoration: none; }
.trial-today-list { display: grid; gap: 8px; }
.trial-today-item { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border: 1px solid #efdfc9; border-radius: var(--radius-md); background: #fffaf3; color: var(--color-text); text-decoration: none; }
.trial-today-item strong { color: #946729; }
.trial-today-item.formal { background: white; border-color: var(--color-border); }
.trial-today-item.formal strong { color: var(--color-primary); }
.trial-inline { color: var(--color-warning); font-weight: 600; }
.trial-today-item small { margin-left: auto; color: var(--color-text-secondary); }
.trial-today-empty { padding: 16px; border: 1px dashed var(--color-border); border-radius: var(--radius-md); color: var(--color-text-secondary); font-size: 13px; }

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
  gap: 16px;
}

.action-card {
  background: white;
  border-radius: var(--radius-lg);
  padding: 32px 24px;
  text-align: center;
  text-decoration: none;
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  transition: var(--transition);
}

.action-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  color: var(--color-primary);
}

.action-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}

.action-icon.attendance, .action-icon.students, .action-icon.teachers, .action-icon.courses {
  background: var(--color-selected);
  color: var(--color-primary);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.stat-card {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-sm);
  transition: var(--transition);
  text-decoration: none;
  color: inherit;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon.students, .stat-icon.teachers, .stat-icon.courses,
.stat-icon.hours, .stat-icon.attendance, .stat-icon.month-attendance {
  background: var(--color-selected);
  color: var(--color-primary);
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.warning-list {
  background: white;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.warning-item {
  display: flex;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-bg-secondary);
}

.warning-item:last-child {
  border-bottom: none;
}

.warning-name {
  font-weight: 500;
  color: var(--color-text);
}

.warning-hours {
  color: var(--color-warning);
  font-weight: 500;
}

.warning-hours.hours-negative {
  color: var(--color-danger);
  font-weight: 700;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .actions-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .action-card:last-child:nth-child(odd) { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 14px; padding: 16px; }
  .action-card:last-child:nth-child(odd) .action-icon { margin: 0; }

  .page-title {
    font-size: 28px;
  }
}
</style>
