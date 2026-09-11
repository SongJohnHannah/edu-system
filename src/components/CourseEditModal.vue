<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-overlay" @click.self="onCancel">
        <div class="modal">
          <h2 class="modal-title">
            {{ mode === 'create' ? '创建课程' : mode === 'readonly' ? '课程详情' : '编辑课程' }}
          </h2>

          <form @submit.prevent="onSubmit" class="modal-form">
            <div class="modal-body">
              <!-- 即改即用：顶部 banner 显示"所查看的周"范围（编辑课程时） -->
              <div v-if="mode !== 'create'" class="effective-banner">
                <span class="effective-label">查看周</span>
                <span class="effective-date">{{ weekRangeLabel }}</span>
                <span class="effective-weekday">{{ weekdayName }}</span>
              </div>

              <!-- 本周临时提示（仅 edit 模式，且课程当前存在本周临时行时显示） -->
              <div v-if="mode === 'edit' && existingTemp" class="temp-banner">
                <span class="temp-label">本周临时</span>
                <span class="temp-desc">{{ existingTempSummary }}</span>
                <button v-if="!readonly" type="button" class="btn-cancel-temp" @click="onCancelTemp">
                  取消本周临时
                </button>
              </div>

              <!-- 临时覆盖 / cascading 开关（仅 edit 模式） -->
              <div v-if="mode === 'edit'" class="cascade-row">
                <label class="cascade-toggle">
                  <input type="checkbox" v-model="applyTemp" :disabled="readonly" />
                  <span class="cascade-text">仅 {{ weekRangeLabel }} 所在周临时覆盖（整周）</span>
                </label>
                <span v-if="!applyTemp" class="cascade-hint">⚠ 立即永久生效（cascading），本周和以后所有同周几课程都用新值</span>
              </div>

              <div class="form-group">
                <label>课程名称 *</label>
                <input
                  type="text"
                  class="input"
                  v-model="form.name"
                  required
                  placeholder="如：三年级数学提高班"
                  :readonly="readonly"
                />
              </div>

              <div class="form-group">
                <label>授课教师 *</label>
                <SearchSelect
                  v-model="form.teacherId"
                  :options="teacherOptions"
                  placeholder="搜索或选择教师"
                  :disabled="readonly"
                />
              </div>

              <div class="form-group">
                <label>上课日期 *</label>
                <SearchSelect
                  v-model="form.weekday"
                  :options="weekdayOptions"
                  placeholder="选择星期"
                  :searchable="false"
                  :disabled="readonly"
                />
              </div>

              <div class="time-row">
                <div class="form-group">
                  <label>开始时间 *</label>
                  <SearchSelect
                    v-model="form.startTime"
                    :options="timeOptions"
                    placeholder="选择开始时间"
                    :searchable="false"
                    :disabled="readonly"
                  />
                </div>
                <div class="form-group">
                  <label>结束时间</label>
                  <input
                    type="text"
                    class="input input-locked"
                    :value="form.endTime"
                    readonly
                    tabindex="-1"
                    placeholder="自动计算"
                  />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>每次课时</label>
                  <input type="number" class="input" v-model.number="form.hoursPerClass" min="0.5" step="0.5" :readonly="readonly" />
                </div>
                <div class="form-group">
                  <label>教室</label>
                  <input type="text" class="input" v-model="form.classroom" placeholder="如：A101" :readonly="readonly" />
                </div>
              </div>

              <div class="form-group">
                <label>上课学生 *</label>
                <input type="text" class="input student-search" v-model="studentSearchText" placeholder="搜索学生姓名..." :readonly="readonly" />
                <div class="student-select">
                  <button
                    type="button"
                    class="student-btn"
                    v-for="s in filteredStudents"
                    :key="s.id"
                    :class="{ selected: form.studentIds.includes(s.id) }"
                    :disabled="readonly"
                    @click="toggleStudent(s.id)"
                  >
                    {{ s.name }}
                  </button>
                </div>
                <div class="student-summary" v-if="form.studentIds.length > 0">
                  已选 {{ form.studentIds.length }} 名学生
                </div>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" @click="onCancel">
                {{ mode === 'readonly' ? '关闭' : '取消' }}
              </button>
              <button v-if="mode !== 'readonly'" type="submit" class="btn btn-primary" :disabled="submitting">
                {{ submitting ? '保存中...' : '保存' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import SearchSelect from './SearchSelect.vue'

const props = defineProps({
  open: Boolean,
  mode: { type: String, default: 'edit' }, // 'create' | 'edit' | 'readonly'
  course: { type: Object, default: null },
  // 所查看那周的周一 (YYYY-MM-DD)，即改即用：临时覆盖应用于该周
  viewWeekStart: { type: String, default: '' },
  teachers: { type: Array, default: () => [] },
  students: { type: Array, default: () => [] },
  submitting: { type: Boolean, default: false },
  // 课程当前在 viewWeekStart 所在周是否已有"临时"行（null = 没有；Object = 该行）
  existingTemp: { type: Object, default: null }
})

const emit = defineEmits(['submit', 'cancel'])

const weekdayMap = { 1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四', 5: '星期五', 6: '星期六', 7: '星期日' }
const weekdayOptions = Object.entries(weekdayMap).map(([v, l]) => ({ value: Number(v), label: l }))

const timeOptions = []
for (let h = 6; h <= 23; h++) {
  for (let m = 0; m < 60; m += 30) {
    if (h === 23 && m > 0) continue
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    timeOptions.push({ value: time, label: time })
  }
}

const teacherOptions = computed(() => props.teachers.map(t => ({ value: t.id, label: t.name })))

const form = ref({
  name: '',
  teacherId: '',
  weekday: 1,
  startTime: '09:00',
  endTime: '11:00',
  hoursPerClass: 1,
  classroom: '',
  studentIds: []
})

const applyTemp = ref(false)
const studentSearchText = ref('')

const readonly = computed(() => props.mode === 'readonly')

// 本周临时行的简要描述，例如 "周五 09:00–11:00"
const existingTempSummary = computed(() => {
  const t = props.existingTemp
  if (!t) return ''
  const wdMap = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const wd = wdMap[t.weekday] || ''
  return `${wd} ${t.startTime}–${t.endTime}`
})

// 工具：YYYY-MM-DD → 本地 Date（避免时区漂移）
function parseLocalDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00')
}

// "查看周"周范围展示，例如 "9月28日-10月4日"
const weekRangeLabel = computed(() => {
  const ws = props.viewWeekStart
  if (!ws) return ''
  const start = parseLocalDate(ws)
  if (!start) return ''
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const m1 = start.getMonth() + 1
  const d1 = start.getDate()
  const m2 = end.getMonth() + 1
  const d2 = end.getDate()
  return m1 === m2
    ? `${m1}月${d1}日-${d2}日`
    : `${m1}月${d1}日-${m2}月${d2}日`
})

// 周一对应的中文星期几（用于 banner 标注"本周的周一"）
const weekdayName = computed(() => {
  const ws = props.viewWeekStart
  if (!ws) return ''
  const d = parseLocalDate(ws)
  if (!d) return ''
  return weekdayMap[d.getDay() === 0 ? 7 : d.getDay()] || ''
})

const filteredStudents = computed(() => {
  if (!studentSearchText.value) return props.students.filter(s => s.status === 'active')
  const search = studentSearchText.value.toLowerCase()
  return props.students.filter(s =>
    s.name.toLowerCase().includes(search) && s.status === 'active'
  )
})

function toggleStudent(id) {
  if (readonly.value) return
  const idx = form.value.studentIds.indexOf(id)
  if (idx === -1) form.value.studentIds.push(id)
  else form.value.studentIds.splice(idx, 1)
}

function reset() {
  if (props.course) {
    form.value = {
      name: props.course.name || '',
      teacherId: props.course.teacherId || '',
      weekday: props.course.weekday || 1,
      startTime: props.course.startTime || '09:00',
      endTime: props.course.endTime || '11:00',
      hoursPerClass: props.course.hoursPerClass ?? 1,
      classroom: props.course.classroom || '',
      studentIds: [...(props.course.studentIds || [])]
    }
  } else {
    form.value = {
      name: '',
      teacherId: props.teachers[0]?.id || '',
      weekday: 1,
      startTime: '09:00',
      endTime: '11:00',
      hoursPerClass: 1,
      classroom: '',
      studentIds: []
    }
  }
  // 默认状态：若所查看周已有 temp 行，默认勾上"仅本周临时"；否则 cascading
  applyTemp.value = !!props.existingTemp
  studentSearchText.value = ''
}

watch(() => props.open, (val) => {
  if (val) reset()
})

watch(() => props.course, () => {
  if (props.open) reset()
})

function onSubmit() {
  if (readonly.value) return
  const payload = {
    ...form.value,
    hoursPerClass: Number(form.value.hoursPerClass) || 1
  }
  if (props.mode === 'edit') {
    payload.applyTemp = !!applyTemp.value
    payload.cancelTemp = false
    if (applyTemp.value && props.viewWeekStart) {
      payload.tempWeekStart = props.viewWeekStart
    }
  }
  emit('submit', payload)
}

function onCancelTemp() {
  if (readonly.value) return
  if (!props.viewWeekStart) return
  const payload = {
    name: props.course?.name,
    teacherId: props.course?.teacherId,
    weekday: props.course?.weekday,
    startTime: props.course?.startTime,
    endTime: props.course?.endTime,
    hoursPerClass: props.course?.hoursPerClass,
    classroom: props.course?.classroom,
    studentIds: props.course?.studentIds || [],
    tempWeekStart: props.viewWeekStart,
    cancelTemp: true
  }
  emit('submit', payload)
}

function recomputeEndTime() {
  const start = form.value.startTime
  if (!start) return
  const [sh, sm] = start.split(':').map(Number)
  const hours = Number(form.value.hoursPerClass) || 1
  const totalMin = sh * 60 + sm + Math.round(hours * 60)
  const capped = Math.min(totalMin, 23 * 60 + 30)
  const eh = Math.floor(capped / 60)
  const em = capped % 60
  form.value.endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

watch(
  [() => form.value.startTime, () => form.value.hoursPerClass],
  recomputeEndTime
)

function onCancel() {
  emit('cancel')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px 16px;
  overflow-y: auto;
}

.modal {
  background: white;
  border-radius: var(--radius-lg);
  padding: 0;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-title {
  font-size: 22px;
  font-weight: 600;
  padding: 24px 24px 12px;
  margin: 0;
  flex-shrink: 0;
}

.modal-form {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.modal-body {
  padding: 12px 24px 24px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
}

.effective-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 18px;
  background: linear-gradient(135deg, rgba(0,113,227,0.08), rgba(90,200,250,0.06));
  border: 1px solid rgba(0,113,227,0.15);
  border-radius: var(--radius-md);
}

.effective-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  letter-spacing: 0.5px;
}

.effective-date {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.effective-weekday {
  font-size: 12px;
  color: var(--color-primary);
  background: rgba(0,113,227,0.1);
  padding: 2px 8px;
  border-radius: 8px;
}

.cascade-row {
  margin-bottom: 18px;
  padding: 12px 14px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.temp-banner {
  margin-bottom: 12px;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(255,149,0,0.10), rgba(255,214,10,0.06));
  border: 1px solid rgba(255,149,0,0.25);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 10px;
}

.temp-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-warning, #b36800);
  letter-spacing: 0.5px;
}

.temp-desc {
  flex: 1;
  font-size: 14px;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.btn-cancel-temp {
  padding: 4px 12px;
  font-size: 12px;
  background: white;
  border: 1px solid rgba(255,149,0,0.4);
  border-radius: var(--radius-sm);
  color: var(--color-warning, #b36800);
  cursor: pointer;
  font-weight: 500;
}

.btn-cancel-temp:hover:not(:disabled) {
  background: rgba(255,149,0,0.1);
}

.cascade-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.cascade-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.cascade-text {
  user-select: none;
}

.cascade-hint {
  font-size: 12px;
  color: var(--color-warning);
  margin-left: 24px;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 6px;
}

.input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: white;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.input[readonly] {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.input-locked {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: not-allowed;
  font-variant-numeric: tabular-nums;
}

.form-row,
.time-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.student-search {
  margin-bottom: 8px;
}

.student-select {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding: 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.student-btn {
  padding: 6px 14px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: white;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s;
}

.student-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.student-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.student-btn.selected {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.student-summary {
  font-size: 12px;
  color: var(--color-primary);
  margin-top: 8px;
  font-weight: 500;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 24px;
  margin-top: 0;
  flex-shrink: 0;
  background: white;
  border-top: 1px solid var(--color-border);
  position: sticky;
  bottom: 0;
}

.modal-enter-active, .modal-leave-active { transition: opacity 0.25s ease; }
.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal,
.modal-leave-to .modal {
  opacity: 0;
  transform: translateY(32px) scale(0.94);
}

@media (max-width: 1024px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal {
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    max-height: 92vh;
  }
  .modal-title { padding: 20px 16px 8px; }
  .modal-body { padding: 8px 16px 20px; }
  .modal-actions {
    flex-direction: column;
    padding: 14px 16px;
  }
  .modal-actions .btn { width: 100%; }
}
</style>