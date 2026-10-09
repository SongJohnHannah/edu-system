<template>
  <NModal :show="show" preset="card" class="substitution-modal" title="安排临时代课" :mask-closable="!saving" :closable="!saving" @update:show="close">
    <template v-if="occurrence">
      <p class="substitution-summary">{{ occurrence.name }} · {{ occurrence.date }}<br>{{ occurrence.startTime }}—{{ occurrence.endTime }} · 原老师：{{ occurrence.originalTeacherName || occurrence.teacherName }}</p>
      <p class="substitution-note">仅这一次由代课老师授课，后续周次仍由原老师上课。学生照常扣课时，授课统计计入代课老师。</p>
      <div v-if="conflicts.length" class="substitution-warning" role="alert">
        <strong>代课老师在此时段已有安排，是否仍安排？</strong>
        <p v-for="conflict in conflicts" :key="conflict.id">{{ conflict.date }} {{ conflict.time }} · {{ conflict.student }}</p>
      </div>
      <div v-else class="substitution-form">
        <label>代课老师<NSelect v-model:value="teacherId" :options="teacherOptions" filterable placeholder="请选择代课老师" :disabled="saving" /></label>
        <label>代课原因<OfficeInput v-model.trim="reason" type="textarea" maxlength="500" placeholder="可选，例如原老师临时有事" :disabled="saving" /></label>
      </div>
      <p v-if="error" class="substitution-error" role="alert">{{ error }}</p>
    </template>
    <template #footer>
      <div class="substitution-actions">
        <NButton :disabled="saving" @click="conflicts.length ? conflicts = [] : close(false)">{{ conflicts.length ? '返回修改' : '取消' }}</NButton>
        <NButton type="primary" :disabled="!teacherId" :loading="saving" @click="save">{{ conflicts.length ? '仍然安排' : '确认代课' }}</NButton>
      </div>
    </template>
  </NModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NButton, NModal, NSelect } from 'naive-ui'
import { arrangeSubstitution } from '../utils/storage.js'
const props = defineProps({ show: Boolean, occurrence: Object, teachers: { type: Array, default: () => [] } })
const emit = defineEmits(['update:show', 'saved'])
const teacherId = ref(null)
const reason = ref('')
const saving = ref(false)
const error = ref('')
const conflicts = ref([])
const teacherOptions = computed(() => props.teachers.filter(t => t.status === 'active' && t.id !== (props.occurrence?.originalTeacherId || props.occurrence?.teacherId))
  .map(t => ({ label: t.name, value: t.id })))
watch(() => props.show, show => {
  if (!show) return
  teacherId.value = props.occurrence?.substitution ? props.occurrence.teacherId : null
  reason.value = props.occurrence?.substitution?.reason || ''
  error.value = ''; conflicts.value = []
})
function close(show) { if (!saving.value) emit('update:show', show) }
async function save() {
  if (saving.value || !teacherId.value || !props.occurrence) return
  saving.value = true; error.value = ''
  try {
    await arrangeSubstitution(props.occurrence.courseId, {
      originalDate: props.occurrence.originalDate, teacherId: teacherId.value, reason: reason.value,
      acknowledgedConflicts: conflicts.value.map(row => row.id)
    })
    emit('update:show', false); emit('saved')
  } catch (failure) {
    if (failure.status === 409 && failure.details?.length && failure.details.every(row => row.type === 'teacher_overlap')) conflicts.value = failure.details
    else error.value = failure.message || '安排代课失败，请重试'
  } finally { saving.value = false }
}
</script>

<style>
.substitution-modal { width: min(440px, calc(100vw - 24px)); }
.substitution-summary { color: var(--color-text); line-height: 1.8; }
.substitution-note { margin: 10px 0 16px; font-size: 13px; color: var(--color-text-secondary); line-height: 1.7; }
.substitution-form, .substitution-form label { display: grid; gap: 8px; }
.substitution-form { gap: 16px; font-size: 14px; }
.substitution-warning { padding: 12px; background: #fff5e7; border-radius: 8px; font-size: 13px; line-height: 1.8; }
.substitution-warning p { margin-top: 8px; }
.substitution-error { margin-top: 12px; color: var(--color-danger); white-space: pre-line; font-size: 13px; }
.substitution-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
