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
              <!-- 生效日期提示（create 时隐藏） -->
              <div v-if="effectiveDate && mode !== 'create'" class="effective-banner">
                <span class="effective-label">生效日期</span>
                <span class="effective-date">{{ formatEffectiveDate }}</span>
                <span v-if="mode === 'edit'" class="effective-weekday">{{ weekdayName }}</span>
              </div>

              <!-- cascading 开关（仅 edit 模式） -->
              <div v-if="mode === 'edit'" class="cascade-row">
                <label class="cascade-toggle">
                  <input type="checkbox" v-model="cascade" :disabled="readonly" />
                  <span class="cascade-text">从这一节起以后的同周几课程都生效</span>
                </label>
                <span v-if="!cascade" class="cascade-hint">⚠ 仅本节临时覆盖（{{ formatEffectiveDate }}）</span>
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
  effectiveDate: { type: [String, Date], default: null }, // 'YYYY-MM-DD' 或 Date
  teachers: { type: Array, default: () => [] },
  students: { type: Array, default: () => [] },
  submitting: { type: Boolean, default: false }
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

const cascade = ref(true)
const studentSearchText = ref('')

const readonly = computed(() => props.mode === 'readonly')

const formatEffectiveDate = computed(() => {
  if (!props.effectiveDate) return ''
  if (typeof props.effectiveDate === 'string') {
    return props.effectiveDate.startsWith('T') ? '' : props.effectiveDate.split('T')[0]
  }
  const d = props.effectiveDate
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const weekdayName = computed(() => {
  if (!props.effectiveDate) return ''
  const d = typeof props.effectiveDate === 'string' ? new Date(props.effectiveDate + 'T00:00:00') : props.effectiveDate
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
  cascade.value = true
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
  if (props.mode === 'edit' && props.effectiveDate) {
    payload.effectiveFrom = formatEffectiveDate.value
    if (!cascade.value) {
      // 仅本节：valid_until = effective_from + 1 day
      const d = new Date(formatEffectiveDate.value + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      payload.validUntil = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
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