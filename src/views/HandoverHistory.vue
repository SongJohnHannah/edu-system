<template>
  <div class="handover-page fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">交接记录</h1>
        <p class="page-subtitle">查看课程交接历史</p>
      </div>
    </div>

    <div class="card" v-if="records.length > 0">
      <table class="table">
        <thead>
          <tr>
            <th>时间</th>
            <th>课程</th>
            <th>原教师</th>
            <th>新教师</th>
            <th>操作人</th>
            <th>原因</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in records" :key="record.id">
            <td>{{ formatDate(record.createdAt) }}</td>
            <td>{{ record.courseName }}</td>
            <td>{{ record.oldTeacherName }}</td>
            <td>{{ record.newTeacherName }}</td>
            <td>{{ record.performedBy }}</td>
            <td>{{ record.reason || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="empty-state" v-else>
      <p>暂无交接记录</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getHandoverHistory } from '../utils/storage'

const records = ref([])

onMounted(async () => {
  try {
    records.value = await getHandoverHistory()
  } catch {}
})

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.handover-page {
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

.empty-state {
  text-align: center;
  padding: 64px 32px;
  color: var(--color-text-secondary);
}

@media (max-width: 768px) {
  .page-title {
    font-size: 24px;
  }
  .card {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .table {
    min-width: 560px;
    font-size: 13px;
  }
}
</style>
