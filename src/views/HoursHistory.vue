<template>
  <div class="hours-history fade-in">
    <div class="page-header">
      <div>
        <button class="btn btn-secondary back-btn" @click="goBack">
          ← 返回学生列表
        </button>
        <h1 class="page-title">{{ student?.name || '学生' }} - 课时记录</h1>
        <p class="page-subtitle">查看该学生的所有课时变更记录</p>
      </div>
    </div>

    <div class="stats-card" v-if="student">
      <div class="stat-item">
        <span class="stat-label">总课时</span>
        <span class="stat-value">{{ student.totalHours }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">已用课时</span>
        <span class="stat-value">{{ student.usedHours || 0 }}</span>
      </div>
      <div class="stat-item highlight">
        <span class="stat-label">剩余课时</span>
        <span class="stat-value">{{ student.totalHours - (student.usedHours || 0) }}</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-label">累计添加</span>
        <span class="stat-value add">+{{ totalAdded }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">累计扣除</span>
        <span class="stat-value deduct">-{{ totalDeducted }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">累计还原</span>
        <span class="stat-value restore">+{{ totalRestored }}</span>
      </div>
    </div>

    <div class="filter-bar" v-if="records.length > 0">
      <select class="input" v-model="filterType">
        <option value="">全部类型</option>
        <option value="add">添加</option>
        <option value="deduct">扣除</option>
        <option value="restore">还原</option>
      </select>
    </div>

    <div class="table-container">
      <table class="table" v-if="filteredRecords.length > 0">
        <thead>
          <tr>
            <th>日期</th>
            <th>类型</th>
            <th>课时</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in filteredRecords" :key="record.id">
            <td>{{ formatDate(record.createdAt) }}</td>
            <td>
              <span class="badge" :class="getTypeClass(record.type)">
                {{ getTypeText(record.type) }}
              </span>
            </td>
            <td :class="getHoursClass(record.type)">
              {{ record.type === 'deduct' ? '-' : '+' }}{{ record.hours }}
            </td>
            <td>{{ record.remark || '-' }}</td>
          </tr>
        </tbody>
      </table>
      <div class="empty-state" v-else>
        <p>该学生暂无课时记录</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getStudents, getHourRecordsByStudent } from '../utils/storage'

const route = useRoute()
const router = useRouter()
const student = ref(null)
const records = ref([])
const filterType = ref('')

onMounted(() => {
  const studentId = route.query.studentId
  if (!studentId) {
    router.push('/students')
    return
  }

  const students = getStudents()
  student.value = students.find(s => s.id === studentId)

  if (!student.value) {
    router.push('/students')
    return
  }

  records.value = getHourRecordsByStudent(studentId)
})

const filteredRecords = computed(() => {
  if (!filterType.value) return records.value
  return records.value.filter(r => r.type === filterType.value)
})

const totalAdded = computed(() => {
  return records.value
    .filter(r => r.type === 'add')
    .reduce((sum, r) => sum + r.hours, 0)
})

const totalDeducted = computed(() => {
  return records.value
    .filter(r => r.type === 'deduct')
    .reduce((sum, r) => sum + r.hours, 0)
})

const totalRestored = computed(() => {
  return records.value
    .filter(r => r.type === 'restore')
    .reduce((sum, r) => sum + r.hours, 0)
})

function formatDate(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getTypeClass(type) {
  const classes = {
    add: 'badge-success',
    deduct: 'badge-danger',
    restore: 'badge-info'
  }
  return classes[type] || 'badge-secondary'
}

function getTypeText(type) {
  const texts = {
    add: '添加',
    deduct: '扣除',
    restore: '还原'
  }
  return texts[type] || type
}

function getHoursClass(type) {
  if (type === 'deduct') return 'hours-deduct'
  return 'hours-add'
}

function goBack() {
  router.push('/students')
}
</script>

<style scoped>
.hours-history {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.back-btn {
  margin-bottom: 16px;
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

.student-info {
  margin-bottom: 24px;
}

.info-card {
  display: flex;
  gap: 24px;
  background: white;
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.info-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.info-item.highlight .info-value {
  color: var(--color-primary);
}

.stats-bar {
  display: flex;
  gap: 32px;
  background: white;
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-sm);
}

.stats-card {
  display: flex;
  align-items: center;
  gap: 24px;
  background: white;
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 80px;
}

.stat-divider {
  width: 1px;
  height: 40px;
  background: var(--color-border);
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
}

.stat-item.highlight .stat-value {
  color: var(--color-primary);
}

.stat-value.add { color: var(--color-success); }
.stat-value.deduct { color: var(--color-danger); }
.stat-value.restore { color: var(--color-primary); }

.filter-bar {
  margin-bottom: 16px;
}

.filter-bar .input {
  min-width: 160px;
}

.table-container {
  background: white;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.empty-state {
  text-align: center;
  padding: 64px 24px;
  color: var(--color-text-secondary);
}

.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.badge-success { background: rgba(52, 199, 89, 0.1); color: var(--color-success); }
.badge-danger { background: rgba(255, 59, 48, 0.1); color: var(--color-danger); }
.badge-info { background: rgba(0, 113, 227, 0.1); color: var(--color-primary); }
.badge-secondary { background: rgba(142, 142, 147, 0.1); color: #8e8e93; }

.hours-add {
  color: var(--color-success);
  font-weight: 600;
}

.hours-deduct {
  color: var(--color-danger);
  font-weight: 600;
}

@media (max-width: 768px) {
  .info-card {
    flex-wrap: wrap;
    gap: 16px;
  }

  .stats-bar {
    flex-wrap: wrap;
    gap: 16px;
  }
}
</style>