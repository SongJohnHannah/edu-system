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
    <div class="filter-section">
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
        <input type="date" class="input date-input" v-model="customStartDate" />
        <span class="date-separator">至</span>
        <input type="date" class="input date-input" v-model="customEndDate" />
        <button class="btn btn-primary btn-sm" @click="applyCustomRange">应用</button>
      </div>
      <div class="current-range">
        {{ formatDateRange(startDate, endDate) }}
      </div>
    </div>

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
          <span class="stat-label">活跃教师 / 总教师</span>
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
        <table class="table">
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
                  <div class="teacher-avatar">{{ stat.name.charAt(0) }}</div>
                  <span class="teacher-name">{{ stat.name }}</span>
                </div>
              </td>
              <td>{{ stat.subject || '-' }}</td>
              <td>{{ stat.courseCount }} 门</td>
              <td>{{ stat.studentCount }} 人</td>
              <td>{{ stat.attendanceCount }} 次</td>
              <td class="hours-cell">{{ stat.consumedHours }} 课时</td>
            </tr>
          </tbody>
        </table>
        <div class="empty-state" v-if="teacherStats.length === 0">
          <p>暂无教师数据</p>
        </div>
      </div>
    </div>

    <!-- 上课日分布图表 -->
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
              <span class="bar-value">{{ count }} 门</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
  getTeacherStats,
  getWeekdayDistribution,
  getOverallStats,
  getDateRange
} from '../utils/storage'

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
function loadData() {
  teacherStats.value = getTeacherStats(startDate.value, endDate.value)
  overallStats.value = getOverallStats(startDate.value, endDate.value)
  weekdayDistribution.value = getWeekdayDistribution()
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
    startDate.value = new Date(customStartDate.value)
    endDate.value = new Date(customEndDate.value)
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

onMounted(() => {
  // 初始化为本月
  const range = getDateRange('month')
  startDate.value = range.start
  endDate.value = range.end
  loadData()
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

.stat-icon.teachers { background: rgba(52, 199, 89, 0.1); color: var(--color-success); }
.stat-icon.attendance { background: rgba(175, 82, 222, 0.1); color: #af52de; }
.stat-icon.hours { background: rgba(255, 59, 48, 0.1); color: var(--color-danger); }

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
  background: linear-gradient(135deg, var(--color-primary), #00c7be);
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

.hours-cell {
  font-weight: 600;
  color: var(--color-primary);
}

.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--color-text-secondary);
}

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
  background: linear-gradient(90deg, var(--color-primary), #00c7be);
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