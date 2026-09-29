<template>
  <section class="trial-page">
    <header class="page-head">
      <div><h1>试听预约</h1><p>一次性试听安排，供老师查看；不会点名或扣课时。</p></div>
      <NButton type="primary" :disabled="referenceLoading || referenceError || loading || loadError || !canCreateBooking" @click="openCreate">新增预约</NButton>
    </header>
    <p v-if="!referenceLoading && !referenceError && !canCreateBooking" class="create-prerequisite">
      <span v-if="!pendingStudentOptions.length">请先在<router-link to="/students">学生管理</router-link>录入待报名学生。</span>
      <span v-if="!hasAvailableTeacher">请先在<router-link to="/teachers">教师信息</router-link>添加或恢复授课教师。</span>
    </p>

    <NCard class="filters" :bordered="false">
      <div class="filter-row">
        <label>日期 <OfficeDatePicker v-model="filters.date" clearable @change="load" /></label>
        <label>教师 <NSelect v-model:value="filters.teacherId" :options="teacherFilters" clearable placeholder="全部教师" @update:value="load" /></label>
        <label>学生 <NSelect v-model:value="filters.studentId" :options="studentFilters" clearable filterable placeholder="全部学生" @update:value="load" /></label>
        <label>状态 <NSelect v-model:value="filters.status" :options="statusFilters" clearable placeholder="全部状态" @update:value="load" /></label>
        <div v-if="auth.teacherId" class="scope-actions" role="group" aria-label="试听预约范围">
          <NButton :type="!filters.teacherId ? 'primary' : 'default'" :secondary="!!filters.teacherId" :aria-pressed="!filters.teacherId" @click="filters.teacherId = null; load()">全部预约</NButton>
          <NButton :type="filters.teacherId === auth.teacherId ? 'primary' : 'default'" :secondary="filters.teacherId !== auth.teacherId" :aria-pressed="filters.teacherId === auth.teacherId" @click="filters.teacherId = auth.teacherId; load()">我的预约</NButton>
        </div>
        <NButton quaternary @click="resetFilters">清除筛选</NButton>
      </div>
    </NCard>

    <div v-if="referenceLoading || loading" class="state" role="status">正在加载预约…</div>
    <div v-else-if="referenceError || loadError" class="state" role="alert"><p>{{ referenceError ? '学生或教师资料加载失败，请重试' : '预约加载失败，请重试' }}</p><NButton @click="loadPage">重试</NButton></div>
    <div v-else-if="!bookings.length" class="state">暂无符合条件的预约</div>
    <div v-else class="booking-list">
      <NCard v-for="booking in bookings" :key="booking.id" class="booking-card" :bordered="false">
        <div class="booking-main">
          <div class="booking-heading">
            <strong>{{ booking.studentName }}</strong>
            <NTag :type="booking.status === 'active' ? 'warning' : 'default'" size="small">{{ booking.status === 'active' ? '有效预约' : '已取消' }}</NTag>
            <NTag size="small" :bordered="false">{{ booking.courseId ? '随正式课试听' : '独立试听' }}</NTag>
          </div>
          <p>{{ booking.date }} · {{ booking.startTime }}—{{ booking.endTime }} · {{ booking.teacherName }}</p>
          <p v-if="booking.courseName">对应课程：{{ booking.courseName }}</p>
          <p v-if="booking.note">备注：{{ booking.note }}</p>
        </div>
        <div v-if="booking.status === 'active' && canEdit(booking) && isFutureBooking(booking)" class="booking-actions">
          <NButton size="small" @click="openEdit(booking)">编辑</NButton>
          <NButton size="small" secondary type="error" @click="cancel(booking)">取消预约</NButton>
        </div>
      </NCard>
    </div>

    <NModal :show="!!cancelling" preset="dialog" title="取消试听预约" positive-text="确认取消" negative-text="保留预约" :loading="cancellingBusy" @negative-click="cancelling = null" @close="cancelling = null" @positive-click="confirmCancel"><p>{{ cancelling?.studentName }} · {{ cancelling?.date }} {{ cancelling?.startTime }}</p><p>取消后仍保留历史记录。</p></NModal>
    <NModal v-model:show="showEditor" preset="card" :title="editingId ? '编辑试听预约' : '新增试听预约'" class="editor-modal">
      <div class="editor-grid">
        <label>试听学生 *
          <NSelect v-model:value="form.studentId" :options="pendingStudentOptions" filterable placeholder="选择待报名学生" />
        </label>
        <p class="editor-hint"><router-link to="/students" @click="showEditor = false">学生还未录入？先到学生管理新增并设为待报名</router-link></p>
        <label>负责教师 *
          <NSelect v-model:value="form.teacherId" :options="teacherOptions" :disabled="!isAdmin" filterable placeholder="选择教师" @update:value="loadOccurrences(true)" />
        </label>
        <label>预约日期 * <OfficeDatePicker v-model="form.date" :min="today" @change="loadOccurrences(true)" /></label>
        <label>对应正式课
          <NSelect v-model:value="form.occurrenceKey" :options="courseOptions" clearable placeholder="不选则为独立试听" @update:value="onCourseChange" />
        </label>
        <p v-if="occurrenceLoading" class="editor-hint" role="status">正在加载当日课程…</p>
        <p v-else-if="occurrenceError" class="editor-hint" role="alert">当日课程加载失败，<NButton text type="primary" @click="loadOccurrences(false)">重试</NButton></p>
        <div class="time-row">
          <label>开始时间 * <NSelect v-model:value="form.startTime" :options="timeOptions" :disabled="!!form.occurrenceKey" /></label>
          <label>结束时间 * <NSelect v-model:value="form.endTime" :options="timeOptions" :disabled="!!form.occurrenceKey" /></label>
        </div>
        <label>备注 <NInput v-model:value="form.note" type="textarea" placeholder="试听需求、联系说明等" /></label>
      </div>
      <template #footer>
        <div class="modal-footer"><NButton @click="showEditor = false">返回</NButton><NButton type="primary" :loading="saving" :disabled="occurrenceLoading || occurrenceError" @click="save">保存预约</NButton></div>
      </template>
    </NModal>
  </section>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { NButton, NCard, NInput, NModal, NSelect, NTag } from 'naive-ui'
import { getStudents, getTeachers, getCourseOccurrences, getTrialBookings, addTrialBooking, updateTrialBooking, cancelTrialBooking } from '../utils/storage.js'
import { useAuthStore } from '../stores/auth.js'
import { useToast } from '../composables/useToast.js'

const auth = useAuthStore()
const toast = useToast()
const today = ref(localDate(new Date()))
const clockTime = ref(Date.now())
const isAdmin = computed(() => auth.isAdmin)
const students = ref([])
const teachers = ref([])
const bookings = ref([])
const occurrences = ref([])
const occurrenceLoading = ref(false)
const occurrenceError = ref(false)
const referenceLoading = ref(true)
const referenceError = ref(false)
const loadError = ref(false)
const route = useRoute()
const filters = ref({ date: route.query.date || '', teacherId: null, studentId: null, status: null })
const loading = ref(false)
const saving = ref(false)
const showEditor = ref(false)
const editingId = ref(null)
const cancelling = ref(null)
const cancellingBusy = ref(false)
const form = ref(blankForm())

function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function blankForm() { return { studentId: null, teacherId: auth.teacherId || null, date: today.value, occurrenceKey: null, startTime: '09:00', endTime: '10:00', note: '' } }
const teacherOptions = computed(() => teachers.value.filter(t => t.status === 'active').map(t => ({ label: t.name, value: t.id })))
const teacherFilters = computed(() => teachers.value.map(t => ({ label: t.name, value: t.id })))
const studentFilters = computed(() => students.value.map(s => ({ label: s.name, value: s.id })))
const pendingStudentOptions = computed(() => students.value.filter(s => s.status === 'active' && s.enrollmentStage === 'pending').map(s => ({ label: s.name, value: s.id })))
const hasAvailableTeacher = computed(() => isAdmin.value ? teacherOptions.value.length > 0 : teacherOptions.value.some(option => option.value === auth.teacherId))
const canCreateBooking = computed(() => pendingStudentOptions.value.length > 0 && hasAvailableTeacher.value)
const statusFilters = [{ label: '有效预约', value: 'active' }, { label: '已取消', value: 'cancelled' }]
const courseOptions = computed(() => occurrences.value.filter(o => !form.value.teacherId || o.teacherId === form.value.teacherId).map(o => ({
  label: `${o.startTime}—${o.endTime} ${o.name}`, value: o.id
})))
const timeOptions = []
for (let m = 450; m <= 1350; m += 30) timeOptions.push({ label: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, value: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` })

function canEdit(booking) { return isAdmin.value || !!auth.teacherId && booking.teacherId === auth.teacherId }
function isFutureBooking(booking) { return new Date(`${booking.date}T${booking.startTime}:00`).getTime() > clockTime.value }
let loadSequence = 0
let loadErrorToast = null
let referenceErrorToast = null
let occurrenceErrorToast = null
async function load() {
  const sequence = ++loadSequence
  loading.value = true
  loadError.value = false
  try {
    const query = {}
    if (filters.value.date) { query.start = filters.value.date; query.end = filters.value.date }
    if (filters.value.teacherId) query.teacherId = filters.value.teacherId
    if (filters.value.studentId) query.studentId = filters.value.studentId
    if (filters.value.status) query.status = filters.value.status
    const rows = await getTrialBookings(query)
    if (sequence === loadSequence) {
      bookings.value = rows
      toast.clearError(loadErrorToast)
      loadErrorToast = null
      return true
    }
  } catch (error) {
    if (sequence === loadSequence) { loadError.value = true; loadErrorToast = toast.error(error.message || '预约加载失败'); return false }
  }
  finally { if (sequence === loadSequence) loading.value = false }
}
function resetFilters() { filters.value = { date: '', teacherId: null, studentId: null, status: null }; load() }
let occurrenceRequest = 0
async function loadOccurrences(resetSelection = false) {
  const request = ++occurrenceRequest
  if (resetSelection) form.value.occurrenceKey = null
  occurrences.value = []
  if (!form.value.date) {
    occurrenceLoading.value = false
    occurrenceError.value = false
    toast.clearError(occurrenceErrorToast)
    occurrenceErrorToast = null
    return
  }
  occurrenceLoading.value = true
  occurrenceError.value = false
  try {
    const rows = await getCourseOccurrences(form.value.date, form.value.date)
    if (request === occurrenceRequest) {
      occurrences.value = rows
      toast.clearError(occurrenceErrorToast)
      occurrenceErrorToast = null
    }
  } catch (error) {
    if (request === occurrenceRequest) { occurrenceError.value = true; occurrenceErrorToast = toast.error(error.message || '当日课程加载失败') }
  } finally { if (request === occurrenceRequest) occurrenceLoading.value = false }
}
function onCourseChange(key) {
  const item = occurrences.value.find(o => o.id === key)
  if (item) { form.value.startTime = item.startTime; form.value.endTime = item.endTime }
}
let editorSequence = 0
async function openCreate() {
  if (!canCreateBooking.value) return toast.error('请先准备待报名学生和在职教师')
  const sequence = ++editorSequence
  editingId.value = null
  form.value = blankForm()
  await loadOccurrences()
  if (sequence === editorSequence) showEditor.value = true
}
async function openEdit(booking) {
  if (!isFutureBooking(booking)) return toast.error('过去的预约不能修改')
  const sequence = ++editorSequence
  editingId.value = booking.id
  form.value = { studentId: booking.studentId, teacherId: booking.teacherId, date: booking.date,
    occurrenceKey: booking.courseId ? `${booking.courseId}:${booking.occurrenceDate}` : null,
    startTime: booking.startTime, endTime: booking.endTime, note: booking.note || '' }
  await loadOccurrences()
  if (sequence !== editorSequence) return
  showEditor.value = true
}
async function save() {
  if (saving.value) return
  if (occurrenceLoading.value || occurrenceError.value) return toast.error('请先重新加载当日课程')
  const f = form.value
  if (!f.studentId || !f.teacherId || !f.date || !f.startTime || !f.endTime) return toast.error('请填写必填信息')
  if (f.startTime >= f.endTime) return toast.error('结束时间必须晚于开始时间')
  const occurrence = occurrences.value.find(o => o.id === f.occurrenceKey)
  if (f.occurrenceKey && !occurrence) return toast.error('原预约关联的课次已变化，请重新选择对应课程')
  if (new Date(`${f.date}T${occurrence?.startTime || f.startTime}:00`) <= new Date()) return toast.error('不能预约已开始的时段')
  const payload = { studentId: f.studentId, teacherId: f.teacherId, date: f.date, startTime: f.startTime,
    endTime: f.endTime, note: f.note, courseId: occurrence?.courseId || null, occurrenceDate: occurrence?.originalDate || null }
  const editor = editorSequence
  const bookingId = editingId.value
  saving.value = true
  try {
    if (bookingId) await updateTrialBooking(bookingId, payload)
    else await addTrialBooking(payload)
    if (editor === editorSequence) showEditor.value = false
    toast.success('预约已保存')
    if (await load() === false) {
      toast.clearError(loadErrorToast)
      loadErrorToast = null
      toast.warning('预约已保存，列表刷新失败，请重试')
    }
  } catch (error) { toast.error(error.message || '保存失败') }
  finally { saving.value = false }
}
function cancel(booking) { if (!isFutureBooking(booking)) return toast.error('过去的预约不能取消'); cancelling.value = booking }
async function confirmCancel() {
  if (cancellingBusy.value) return false
  const booking = cancelling.value
  if (!booking) return false
  cancellingBusy.value = true
  try {
    await cancelTrialBooking(booking.id)
    if (cancelling.value === booking) cancelling.value = null
    toast.success('预约已取消')
    if (await load() === false) {
      toast.clearError(loadErrorToast)
      loadErrorToast = null
      toast.warning('预约已取消，列表刷新失败，请重试')
    }
  }
  catch (error) { toast.error(error.message || '取消失败'); return false }
  finally { cancellingBusy.value = false }
}
let linkedRouteSequence = 0
async function openLinkedBooking(sequence) {
  if (sequence !== linkedRouteSequence || loadError.value || !route.query.booking || showEditor.value) return
  const booking = bookings.value.find(item => item.id === route.query.booking)
  if (booking && canEdit(booking) && booking.status === 'active' && isFutureBooking(booking)) await openEdit(booking)
}
let referenceRequest = 0
async function loadPage() {
  const request = ++referenceRequest
  referenceLoading.value = true
  referenceError.value = false
  try {
    const [nextStudents, nextTeachers] = await Promise.all([getStudents(), getTeachers()])
    if (request !== referenceRequest) return
    students.value = nextStudents
    teachers.value = nextTeachers
    toast.clearError(referenceErrorToast)
    referenceErrorToast = null
  }
  catch (error) {
    if (request !== referenceRequest) return
    referenceError.value = true
    referenceErrorToast = toast.error(error.message || '基础数据加载失败')
    referenceLoading.value = false
    return
  }
  referenceLoading.value = false
  const sequence = linkedRouteSequence
  if (typeof route.query.date === 'string') filters.value.date = route.query.date
  await load()
  await openLinkedBooking(sequence)
}
let clockTimer
function scheduleClockRefresh() {
  clearTimeout(clockTimer)
  const now = Date.now()
  const current = new Date(now)
  let next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1).getTime()
  for (const booking of bookings.value) {
    if (booking.status !== 'active') continue
    const start = new Date(`${booking.date}T${booking.startTime}:00`).getTime()
    if (Number.isFinite(start) && start > now && start < next) next = start
  }
  clockTimer = setTimeout(refreshClock, Math.max(50, next - now + 50))
}
function refreshClock() {
  clockTime.value = Date.now()
  today.value = localDate(new Date(clockTime.value))
  scheduleClockRefresh()
}
function refreshVisible() {
  if (document.visibilityState !== 'visible') return
  refreshClock()
  if (!referenceLoading.value && !referenceError.value) load()
}
watch(bookings, scheduleClockRefresh)
onMounted(() => { loadPage(); scheduleClockRefresh(); document.addEventListener('visibilitychange', refreshVisible) })
onUnmounted(() => { loadSequence++; referenceRequest++; occurrenceRequest++; editorSequence++; clearTimeout(clockTimer); document.removeEventListener('visibilitychange', refreshVisible) })
watch(() => [route.query.date, route.query.booking], async () => {
  const sequence = ++linkedRouteSequence
  editorSequence++
  showEditor.value = false
  if (referenceLoading.value || referenceError.value) return
  filters.value = { date: typeof route.query.date === 'string' ? route.query.date : '', teacherId: null, studentId: null, status: null }
  await load()
  await openLinkedBooking(sequence)
})
</script>

<style scoped>
.trial-page { max-width: 1160px; margin: auto; }
.page-head { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 24px; }
.page-head h1 { font-size: 28px; color: var(--color-text); }
.page-head p, .booking-main p, .editor-hint { color: var(--color-text-secondary); font-size: 14px; }
.create-prerequisite { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: -14px 0 18px; color: var(--color-text-secondary); font-size: 12px; }
.create-prerequisite a { color: var(--color-primary-text); }
.filters { margin-bottom: 18px; box-shadow: var(--shadow-sm); }
.filter-row { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
.scope-actions { display: flex; gap: 6px; }
.filter-row label { flex: 1 1 170px; font-size: 13px; color: var(--color-text-secondary); }
.booking-list { display: grid; gap: 12px; }
.booking-card { box-shadow: var(--shadow-sm); border-left: 3px solid var(--color-trial); }
.booking-card :deep(.n-card__content) { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
.booking-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.booking-main p { margin: 3px 0; }
.booking-actions, .modal-footer { display: flex; gap: 8px; justify-content: flex-end; }
.state { padding: 52px 16px; text-align: center; color: var(--color-text-secondary); background: white; border-radius: var(--radius-lg); }
.editor-grid { display: grid; gap: 14px; }
.editor-grid label { display: grid; gap: 5px; font-size: 14px; color: var(--color-text); }
.time-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 599px) { .page-head { align-items: start; } .booking-card :deep(.n-card__content) { display: block; } .booking-actions { margin-top: 12px; } }
</style>
