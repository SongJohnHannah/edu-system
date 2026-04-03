<template>
  <div class="dashboard fade-in">
    <h1 class="page-title">欢迎使用教务管理系统</h1>
    <p class="page-subtitle">轻松管理学生、教师和课程</p>

    <div class="quick-actions">
      <h2 class="section-title">快速操作</h2>
      <div class="actions-grid">
        <router-link to="/attendance" class="action-card">
          <span class="action-icon">✓</span>
          <span>开始点名</span>
        </router-link>
        <router-link to="/students" class="action-card">
          <span class="action-icon">+</span>
          <span>添加学生</span>
        </router-link>
        <router-link to="/teachers" class="action-card">
          <span class="action-icon">+</span>
          <span>添加教师</span>
        </router-link>
        <router-link to="/courses" class="action-card">
          <span class="action-icon">+</span>
          <span>创建课程</span>
        </router-link>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">数据统计</h2>
      <div class="stats-grid">
        <router-link to="/students" class="stat-card">
          <div class="stat-icon students">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ students.length }}</span>
            <span class="stat-label">学生总数</span>
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
            <span class="stat-value">{{ teachers.length }}</span>
            <span class="stat-label">教师总数</span>
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
            <span class="stat-value">{{ courses.length }}</span>
            <span class="stat-label">课程总数</span>
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
            <span class="stat-value">{{ totalUsedHours }}</span>
            <span class="stat-label">已消耗课时</span>
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
            <span class="stat-value">{{ totalAttendanceCount }}</span>
            <span class="stat-label">点名总次数</span>
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
          <span class="warning-hours">剩余 {{ student.totalHours - student.usedHours }} 课时</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getStudents, getTeachers, getCourses, getAttendance } from '../utils/storage'

const students = ref([])
const teachers = ref([])
const courses = ref([])
const attendance = ref([])

onMounted(() => {
  students.value = getStudents()
  teachers.value = getTeachers()
  courses.value = getCourses()
  attendance.value = getAttendance()
})

const totalUsedHours = computed(() => {
  return students.value.reduce((sum, s) => sum + (s.usedHours || 0), 0)
})

const totalAttendanceCount = computed(() => {
  return attendance.value.length
})

const thisMonthAttendanceCount = computed(() => {
  const now = new Date()
  const thisMonth = now.toISOString().slice(0, 7)
  return attendance.value.filter(r => r.date.startsWith(thisMonth)).length
})

const lowHoursStudents = computed(() => {
  return students.value.filter(s => (s.totalHours - s.usedHours) < 3 && (s.totalHours - s.usedHours) > 0)
})
</script>

<style scoped>
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

.actions-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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
  display: block;
  font-size: 32px;
  font-weight: 300;
  margin-bottom: 8px;
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

.stat-icon.students { background: rgba(0, 113, 227, 0.1); color: var(--color-primary); }
.stat-icon.teachers { background: rgba(52, 199, 89, 0.1); color: var(--color-success); }
.stat-icon.courses { background: rgba(255, 149, 0, 0.1); color: var(--color-warning); }
.stat-icon.hours { background: rgba(255, 59, 48, 0.1); color: var(--color-danger); }
.stat-icon.attendance { background: rgba(175, 82, 222, 0.1); color: #af52de; }
.stat-icon.month-attendance { background: rgba(90, 200, 250, 0.1); color: #5ac8fa; }

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

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .actions-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .page-title {
    font-size: 28px;
  }
}
</style>