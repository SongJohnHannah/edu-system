<template>
  <div class="teacher-stats fade-in">
    <!-- 页面头部 -->
    <div class="page-header">
      <div>
        <h1 class="page-title">教师工作量统计</h1>
        <p class="page-subtitle">查看教师授课情况与工作量分析</p>
      </div>
    </div>

    <!-- 时间筛选器 -->
    <div class="filter-section"><div v-if="auth.teacherId" class="preset-filters"><OfficeButton :class="scope === 'all' ? 'btn btn-primary' : 'btn btn-secondary'" @click="scope = 'all'; loadData()">全部教师</OfficeButton><OfficeButton :class="scope === 'mine' ? 'btn btn-primary' : 'btn btn-secondary'" @click="scope = 'mine'; loadData()">我的统计</OfficeButton></div>
      <div class="preset-filters">
        <button
          v-for="preset in presets"
          :key="preset.value"
          class="filter-btn"
          :class="{ active: activePreset === preset.value }"
          @click="setPreset(preset.value)"
        >
          {{ preset.label }}
        </button>
      </div>
      <div class="custom-range" v-if="activePreset === 'custom'">
        <OfficeDatePicker class="input date-input" v-model="customStartDate" aria-label="开始日期" />
        <span class="date-separator">至</span>
        <OfficeDatePicker class="input date-input" v-model="customEndDate" aria-label="结束日期" />
        <OfficeButton class="btn btn-primary btn-sm" @click="applyCustomRange">应用</OfficeButton>
      </div>
      <div class="current-range">
        {{ formatDateRange(startDate, endDate) }}
      </div>
    </div>

    <div v-if="loading" class="status-panel">正在加载统计…</div>
    <div v-else-if="loadError" class="status-panel">
      <p>统计加载失败，请重试</p>
      <OfficeButton class="btn btn-secondary" @click="loadData">重试</OfficeButton>
    </div>
    <template v-else>
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon teachers">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ overallStats.activeTeachers }} / {{ overallStats.totalTeachers }}</span>
          <span class="stat-label">本期授课教师 / 教师总数</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon attendance">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ overallStats.totalAttendance }}</span>
          <span class="stat-label">点名次数</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon hours">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ overallStats.totalConsumedHours }}</span>
          <span class="stat-label">消耗课时</span>
        </div>
      </div>
    </div>

    <!-- 教师工作量列表 -->
    <div class="section">
      <h2 class="section-title">教师工作量明细</h2>
      <div class="table-container">
        <OfficeTable class="table">
          <thead>
            <tr>
              <th>教师</th>
              <th>教授科目</th>
              <th>授课课程数</th>
              <th>授课学生数</th>
              <th>点名次数</th>
              <th>消耗课时</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="stat in teacherStats" :key="stat.id">
              <td>
                <div class="teacher-cell">
                  <div class="teacher-avatar">{{ (stat.name || '?').charAt(0) }}</div>
                  <span class="teacher-name">{{ stat.name }}</span>
                  <span v-if="stat.status === 'deleted'" class="teacher-stopped">已停用</span>
                </div>
              </td>
              <td>{{ stat.subject || '-' }}</td>
              <td>{{ stat.courseCount }} 门</td>
              <td>{{ stat.studentCount }} 人</td>
              <td>{{ stat.attendanceCount }} 次</td>
              <td class="hours-cell">{{ stat.consumedHours }} 课时</td>
            </tr>
          </tbody>
        </OfficeTable>
        <div class="empty-state" v-if="teacherStats.length === 0">
          <p>暂无教师数据</p>
        </div>
      </div>
    </div>

    <!-- 所选日期内实际课次分布图表 -->
    <div class="section">
      <h2 class="section-title">课程分布（按上课日）</h2>
      <div class="chart-container">
        <div class="bar-chart">
          <div class="bar-item" v-for="(count, index) in weekdayDistribution" :key="index">
            <div class="bar-label">{{ weekdayLabels[index] }}</div>
            <div class="bar-wrapper">
              <div
                class="bar"
                :style="{ width: getBarWidth(count) + '%' }"
                :class="{ 'bar-highlight': count > 0 }"
              ></div>
              <span class="bar-value">{{ count }} 课次</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  getTeacherStats,
  getWeekdayDistribution,
  getOverallStats,
  getDateRange
} from '../utils/storage'
import { useAuthStore } from '../stores/auth.js'
import { useToast } from '../composables/useToast.js'

const auth = useAuthStore()
const toast = useToast()
const scope = ref('all')
const loading = ref(true)
const loadError = ref(false)

// 时间筛选
const presets = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
  { label: '自定义', value: 'custom' }
]

const activePreset = ref('month')
const startDate = ref(new Date())
const endDate = ref(new Date())
const customStartDate = ref('')
const customEndDate = ref('')

// 数据
const teacherStats = ref([])
const overallStats = ref({
  totalTeachers: 0,
  activeTeachers: 0,
  totalCourses: 0,
  totalAttendance: 0,
  totalConsumedHours: 0
})
const weekdayDistribution = ref([0, 0, 0, 0, 0, 0, 0])
const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 加载数据
let loadRequest = 0
let loadErrorToast = null
async function loadData() {
  const request = ++loadRequest
  loading.value = true
  loadError.value = false
  try {
    const [teachers, overall, distribution] = await Promise.all([
      getTeacherStats(startDate.value, endDate.value, scope.value),
      getOverallStats(startDate.value, endDate.value, scope.value),
      getWeekdayDistribution(startDate.value, endDate.value, scope.value)
    ])
    if (request !== loadRequest) return
    teacherStats.value = teachers || []
    overallStats.value = overall || {}
    weekdayDistribution.value = distribution || [0, 0, 0, 0, 0, 0, 0]
    toast.clearError(loadErrorToast)
    loadErrorToast = null
  } catch (error) {
    if (request === loadRequest) { loadError.value = true; loadErrorToast = toast.error(error.message || '统计加载失败') }
  } finally { if (request === loadRequest) loading.value = false }
}

// 设置预设时间范围
function setPreset(preset) {
  activePreset.value = preset
  if (preset !== 'custom') {
    const range = getDateRange(preset)
    startDate.value = range.start
    endDate.value = range.end
    loadData()
  }
}

// 应用自定义时间范围
function applyCustomRange() {
  if (customStartDate.value && customEndDate.value) {
    const start = new Date(`${customStartDate.value}T12:00:00`)
    const end = new Date(`${customEndDate.value}T12:00:00`)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start || (end - start) / 86400000 > 366) {
      toast.error('请选择有效日期，统计范围不超过一年')
      return
    }
    startDate.value = start
    endDate.value = end
    loadData()
  }
}

// 格式化日期范围显示
function formatDateRange(start, end) {
  const formatDate = (d) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return `${formatDate(start)} 至 ${formatDate(end)}`
}

// 计算条形图宽度
function getBarWidth(count) {
  const max = Math.max(...weekdayDistribution.value, 1)
  return (count / max) * 100
}

let dayTimer
let currentDay = new Date().toDateString()
function scheduleDayRefresh() {
  clearTimeout(dayTimer)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  dayTimer = setTimeout(refreshDay, Math.max(50, next - now.getTime() + 50))
}
function refreshDay() {
  const day = new Date().toDateString()
  const changed = day !== currentDay
  currentDay = day
  if (changed && activePreset.value !== 'custom') {
    const range = getDateRange(activePreset.value)
    startDate.value = range.start
    endDate.value = range.end
    loadData()
  }
  scheduleDayRefresh()
  return changed
}
function refreshVisible() {
  if (document.visibilityState !== 'visible') return
  if (!refreshDay() || activePreset.value === 'custom') loadData()
}
onMounted(() => {
  // 初始化为本月
  const range = getDateRange('month')
  startDate.value = range.start
  endDate.value = range.end
  loadData()
  scheduleDayRefresh()
  document.addEventListener('visibilitychange', refreshVisible)
})
onUnmounted(() => {
  loadRequest++
  clearTimeout(dayTimer)
  document.removeEventListener('visibilitychange', refreshVisible)
})
</script>

<style scoped>
.teacher-stats {
  max-width: 1000px;
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

/* 筛选器 */
.filter-section {
  background: white;
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
}

.preset-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: white;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: var(--transition);
}

.filter-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.filter-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.custom-range {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.date-input {
  width: 160px;
  padding: 8px 12px;
  font-size: 14px;
}

.date-separator {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.current-range {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 32px;
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

.stat-icon.teachers { background: rgba(53, 124, 101, 0.1); color: var(--color-success); }
.stat-icon.attendance { background: var(--color-selected); color: var(--color-primary); }
.stat-icon.hours { background: rgba(179, 79, 80, 0.1); color: var(--color-danger); }

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

/* 表格区域 */
.section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16px;
}

.table-container {
  background: white;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.teacher-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.teacher-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.teacher-name {
  font-weight: 500;
  color: var(--color-text);
}

.teacher-stopped { flex: none; padding: 2px 6px; border: 1px solid var(--color-border); border-radius: 5px; color: var(--color-text-secondary); background: var(--color-bg-secondary); font-size: 11px; }

.hours-cell {
  font-weight: 600;
  color: var(--color-primary);
}

.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--color-text-secondary);
}
.status-panel { text-align: center; padding: 48px 24px; margin-bottom: 24px; border-radius: var(--radius-lg); background: white; color: var(--color-text-secondary); box-shadow: var(--shadow-sm); }
.status-panel .btn { margin-top: 12px; }

/* 图表区域 */
.chart-container {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bar-item {
  display: flex;
  align-items: center;
  gap: 16px;
}

.bar-label {
  width: 48px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.bar-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.bar {
  height: 28px;
  background: var(--color-bg-secondary);
  border-radius: 4px;
  transition: width 0.3s ease;
  min-width: 4px;
}

.bar-highlight {
  background: var(--color-primary);
}

.bar-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  min-width: 48px;
}

/* 响应式 */
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .preset-filters {
    flex-wrap: wrap;
  }

  .custom-range {
    flex-direction: column;
    align-items: stretch;
  }

  .date-input {
    width: 100%;
  }

  .table-container {
    overflow-x: auto;
  }

  .bar-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .bar-wrapper {
    width: 100%;
  }
}
</style>
