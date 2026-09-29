<template>
  <div class="handover-page fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">交接记录</h1>
        <p class="page-subtitle">查看课程交接历史</p>
      </div>
    </div>

    <div class="empty-state" v-if="loading">正在加载交接记录…</div>
    <div class="empty-state" v-else-if="loadError">
      <p>交接记录加载失败，请重试</p>
      <OfficeButton class="btn btn-secondary" @click="loadHistory">重试</OfficeButton>
    </div>
    <div class="card" v-else-if="records.length > 0">
      <OfficeTable class="table handover-table">
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
      </OfficeTable>
      <div class="handover-mobile-list">
        <article v-for="record in records" :key="record.id" class="handover-mobile-card">
          <dl>
            <div><dt>课程</dt><dd class="handover-course-name">{{ record.courseName }}</dd></div>
            <div><dt>时间</dt><dd>{{ formatDate(record.createdAt) }}</dd></div>
            <div><dt>原教师</dt><dd>{{ record.oldTeacherName }}</dd></div>
            <div><dt>新教师</dt><dd>{{ record.newTeacherName }}</dd></div>
            <div><dt>操作人</dt><dd>{{ record.performedBy }}</dd></div>
            <div><dt>原因</dt><dd>{{ record.reason || '-' }}</dd></div>
          </dl>
        </article>
      </div>
    </div>

    <div class="empty-state" v-else>
      <p>暂无交接记录</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getHandoverHistory } from '../utils/storage'
import { useToast } from '../composables/useToast.js'

const records = ref([])
const loading = ref(true)
const loadError = ref(false)
const toast = useToast()
let loadRequest = 0
let loadErrorToast = null

async function loadHistory() {
  const request = ++loadRequest
  loading.value = true
  loadError.value = false
  try {
    const rows = await getHandoverHistory() || []
    if (request === loadRequest) {
      records.value = rows
      toast.clearError(loadErrorToast)
      loadErrorToast = null
    }
  } catch (error) {
    if (request === loadRequest) {
      records.value = []
      loadError.value = true
      loadErrorToast = toast.error(error.message || '交接记录加载失败')
    }
  } finally { if (request === loadRequest) loading.value = false }
}
onMounted(loadHistory)
onUnmounted(() => { loadRequest++ })

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(typeof dateStr === 'string' ? dateStr.replace(' ', 'T') : dateStr)
  if (Number.isNaN(d.getTime())) return '-'
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

.handover-mobile-list { display: none; }

@media (min-width: 600px) and (max-width: 900px) {
  .handover-page .handover-table { display: table; width: 100%; min-width: 0; table-layout: fixed; overflow: visible; }
  .handover-table th, .handover-table td { padding: 10px 6px; white-space: normal; overflow-wrap: anywhere; vertical-align: top; }
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

@media (max-width: 599px) {
  .handover-page .card { padding: 0; overflow: visible; background: transparent; box-shadow: none; }
  .handover-table { display: none; }
  .handover-mobile-list { display: grid; gap: 12px; }
  .handover-mobile-card { padding: 14px 16px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: #fff; box-shadow: var(--shadow-sm); }
  .handover-mobile-card dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; }
  .handover-mobile-card dl > div { min-width: 0; }
  .handover-mobile-card dl > div:first-child { grid-column: 1 / -1; padding-bottom: 10px; border-bottom: 1px solid var(--color-border); }
  .handover-mobile-card dt { margin-bottom: 4px; color: var(--color-text-secondary); font-size: 11px; }
  .handover-mobile-card dd { margin: 0; overflow-wrap: anywhere; font-size: 13px; }
  .handover-course-name { font-size: 15px !important; font-weight: 650; }
}
</style>
