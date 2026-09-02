<template>
  <div class="weekly-page fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">周课程表</h1>
        <p class="page-subtitle">{{ weekRangeLabel }} · 单击课程可编辑学生名单</p>
      </div>
      <div class="week-nav">
        <button class="btn btn-secondary" @click="prevWeek">‹ 上周</button>
        <button class="btn btn-primary" @click="goToday">本周</button>
        <button class="btn btn-secondary" @click="nextWeek">下周 ›</button>
      </div>
    </div>

    <div class="schedule-grid">
      <!-- 表头：时间列 + 7 天列 -->
      <div class="grid-header">
        <div class="time-col-head"></div>
        <div
          v-for="d in weekDays"
          :key="d.col"
          class="day-head"
          :class="{ today: d.isToday }"
        >
          <div class="day-name">{{ d.label }}</div>
          <div class="day-date">{{ d.month }}/{{ d.day }}</div>
        </div>
      </div>

      <!-- 表体 -->
      <div class="grid-body">
        <!-- 时间列（30 分钟一格） -->
        <div class="time-col">
          <div v-for="r in ROWS" :key="r" class="time-label">
            <span v-if="(r - 1) % 2 === 0">{{ rowToTime(r) }}</span>
          </div>
        </div>

        <!-- 三泳道背景层 -->
        <div class="swimlane swimlane-morning">
          <div class="swimlane-label">上午<br />07:30 – 12:00</div>
        </div>
        <div class="swimlane swimlane-afternoon">
          <div class="swimlane-label">下午<br />12:00 – 18:00</div>
        </div>
        <div class="swimlane swimlane-evening">
          <div class="swimlane-label">晚上<br />18:00 – 22:30</div>
        </div>

        <!-- 30 分钟虚线参考层 -->
        <div class="time-rules">
          <div v-for="r in ROWS" :key="r" class="time-rule" :class="{ 'major': (r - 1) % 2 === 0 }"></div>
        </div>

        <!-- 课程 bar -->
        <TransitionGroup name="bar" tag="div" class="bars-layer">
          <div
            v-for="(c, i) in placedCourses"
            :key="c.id"
            class="course-bar"
            :class="{
              'out-of-bounds': c.outOfBounds,
              'has-overlap': c.overlap,
              'is-stacked': c.stackSize > 1,
              'stack-expanded': c.stackSize > 1 && expandedGroupId === c.groupId
            }"
            :style="{
              '--c-bg': c.color.bg,
              '--c-fg': c.color.fg,
              '--c-border': c.color.border,
              '--idx': i,
              '--stack-idx': c.stackIndex,
              '--stack-total': c.stackSize,
              '--stack-translate': c.stackSize > 1
                ? (expandedGroupId === c.groupId
                    ? `${c.stackIndex * 28}px`
                    : `${c.stackIndex * 22}px`)
                : '0px',
              '--stack-z': c.stackSize > 1 ? (c.stackIndex + 10) : 1,
              gridColumn: c.col + 1,
              gridRow: `${c.startRow} / span ${c.rowSpan}`
            }"
            @click.stop="handleBarClick(c)"
          >
            <div class="bar-name">{{ c.name }}</div>
            <div class="bar-meta">
              {{ c.startTime }}–{{ c.endTime }}
              <span v-if="c.outOfBounds" class="warn-icon" title="时间超出 07:30–22:30 范围">⚠</span>
            </div>
            <div class="bar-bottom">
              <span class="bar-teacher">{{ c.teacherName || '未指定' }}</span>
              <span class="bar-students">{{ c.studentCount }} 人</span>
            </div>
            <span v-if="c.stackSize > 1" class="stack-badge">+{{ c.stackSize }}</span>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <!-- 移动端重叠课程列表 -->
    <Teleport to="body">
      <Transition name="overlap-list">
        <div v-if="mobileListGroup" class="overlap-list-overlay" @click.self="mobileListGroup = null">
          <div class="overlap-list">
            <div class="overlap-list-header">
              <span class="overlap-list-title">{{ mobileListGroup.length }} 个课程在此重叠</span>
              <button class="overlap-list-close" @click="mobileListGroup = null" aria-label="关闭">×</button>
            </div>
            <button
              v-for="c in mobileListGroup"
              :key="c.id"
              class="overlap-list-item"
              :style="{ borderLeftColor: c.color.border, background: c.color.bg }"
              @click="selectFromList(c)"
            >
              <div class="overlap-list-name">{{ c.name }}</div>
              <div class="overlap-list-meta">
                <span>{{ c.startTime }}–{{ c.endTime }}</span>
                <span class="dot">·</span>
                <span>{{ c.teacherName || '未指定' }}</span>
              </div>
              <div class="overlap-list-students">{{ c.studentCount }} 人 · {{ c.classroom || '未指定教室' }}</div>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 空状态 -->
    <div v-if="placedCourses.length === 0" class="empty-state">
      <p>本周还没有任何课程</p>
      <button class="btn btn-primary" @click="openCreate">+ 创建第一门课程</button>
    </div>

    <!-- 编辑弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
          <div class="modal">
            <h2 class="modal-title">{{ editingCourse ? '编辑课程' : '创建课程' }}</h2>
            <form @submit.prevent="debouncedSave" class="modal-form">
              <div class="modal-body">
              <div class="form-group">
                <label>课程名称 *</label>
                <input type="text" class="input" v-model="form.name" required placeholder="如：三年级数学课" />
              </div>
              <div class="form-group">
                <label>授课教师 *</label>
                <SearchSelect
                  v-model="form.teacherId"
                  :options="teachers.map(t => ({ value: t.id, label: t.name }))"
                  placeholder="搜索或选择教师"
                />
              </div>
              <div class="form-group">
                <label>上课日期 *</label>
                <SearchSelect
                  v-model="form.weekday"
                  :options="weekdayOptions"
                  placeholder="选择星期"
                  :searchable="false"
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
                  />
                </div>
                <div class="form-group">
                  <label>结束时间 *</label>
                  <SearchSelect
                    v-model="form.endTime"
                    :options="timeOptions"
                    placeholder="选择结束时间"
                    :searchable="false"
                  />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>每次课时</label>
                  <input type="number" class="input" v-model.number="form.hoursPerClass" min="0.5" step="0.5" />
                </div>
                <div class="form-group">
                  <label>教室</label>
                  <input type="text" class="input" v-model="form.classroom" placeholder="如：A101" />
                </div>
              </div>
              <div class="form-group">
                <label>上课学生 *</label>
                <input type="text" class="input student-search" v-model="studentSearchText" placeholder="搜索学生姓名..." />
                <div class="student-select">
                  <button type="button" class="student-btn" v-for="s in filteredStudents" :key="s.id"
                    :class="{ selected: form.studentIds.includes(s.id) }"
                    @click="toggleStudent(s.id)">
                    {{ s.name }}
                  </button>
                </div>
                <div class="student-summary" v-if="form.studentIds.length > 0">
                  已选 {{ form.studentIds.length }} 名学生
                </div>
              </div>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" @click="closeModal">取消</button>
                <button type="submit" class="btn btn-primary" :disabled="submitting">
                  {{ submitting ? '保存中...' : '保存' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getCourses, addCourse, updateCourse, getTeachers, getStudents } from '../utils/storage'
import { useToast } from '../composables/useToast'
import SearchSelect from '../components/SearchSelect.vue'

const toast = useToast()

// ============================ 常量 ============================
const ROWS = 31                          // 07:30 → 22:30 = 31 行
const ROW_MIN = 30                       // 每行 30 分钟
const START_MIN = 7 * 60 + 30            // 07:30 = 450 分钟
const END_MIN = 22 * 60 + 30             // 22:30 = 1350 分钟

// 星期标签：网格列序 周日(1) → 周六(7)；DB weekday 1=Mon..7=Sun
const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 节段（仅用于颜色背景层定位）
const SECTIONS = [
  { name: '上午', startRow: 1,  endRow: 9  },
  { name: '下午', startRow: 10, endRow: 21 },
  { name: '晚上', startRow: 22, endRow: 31 }
]

// 颜色调色板（按课程名哈希分发）
const PALETTE = [
  { bg: 'rgba(0,113,227,0.16)',   fg: '#0058b8', border: '#0071e3' },
  { bg: 'rgba(52,199,89,0.16)',    fg: '#1f7a3e', border: '#34c759' },
  { bg: 'rgba(255,149,0,0.16)',    fg: '#b36800', border: '#ff9500' },
  { bg: 'rgba(175,82,222,0.16)',   fg: '#7e3eaf', border: '#af52de' },
  { bg: 'rgba(90,200,250,0.18)',   fg: '#2a7ea3', border: '#5ac8fa' },
  { bg: 'rgba(255,45,85,0.14)',    fg: '#b31a3f', border: '#ff2d55' },
  { bg: 'rgba(255,214,10,0.20)',   fg: '#8a6e00', border: '#ffd60a' },
  { bg: 'rgba(255,59,48,0.16)',    fg: '#b3261d', border: '#ff3b30' }
]

// ============================ State ============================
const courses = ref([])
const teachers = ref([])
const students = ref([])
const weekOffset = ref(0)            // 0=本周, -1=上周, 1=下周

const showModal = ref(false)
const editingCourse = ref(null)
const studentSearchText = ref('')
const submitting = ref(false)

// 重叠课程交互
const expandedGroupId = ref(null)        // 桌面: 哪个重叠组已展开
const mobileListGroup = ref(null)        // 移动: 哪个重叠组弹出列表
const isMobile = ref(false)               // 是否移动端
const STACK_MAX = 4                       // 最多展示 4 张重叠卡

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

// ============================ 时间工具 ============================
function parseHM(time) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function rowToTime(row) {
  const total = START_MIN + (row - 1) * ROW_MIN
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeToRow(time) {
  const fromStart = parseHM(time) - START_MIN
  return Math.max(1, Math.min(ROWS, Math.floor(fromStart / ROW_MIN) + 1))
}

// ============================ 颜色哈希 ============================
function hashName(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function hashColor(name) {
  return PALETTE[hashName(name || '') % PALETTE.length]
}

// ============================ 周计算 ============================
function getWeekStart(offset = 0) {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun..6=Sat
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek)
  sunday.setDate(sunday.getDate() + offset * 7)
  return sunday
}

const weekStart = computed(() => getWeekStart(weekOffset.value))

const weekDays = computed(() => {
  const result = []
  const todayStr = formatDate(new Date())
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.value)
    d.setDate(d.getDate() + i)
    const dateStr = formatDate(d)
    result.push({
      col: i + 1,
      label: DAY_LABELS[i],
      day: d.getDate(),
      month: d.getMonth() + 1,
      isToday: dateStr === todayStr,
      date: d
    })
  }
  return result
})

const weekRangeLabel = computed(() => {
  const start = weekDays.value[0]
  const end = weekDays.value[6]
  if (start.month === end.month) {
    return `${start.month}月${start.day}日 – ${end.day}日`
  }
  return `${start.month}月${start.day}日 – ${end.month}月${end.day}日`
})

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ============================ 课程定位 ============================
const placedCourses = computed(() => {
  const placed = courses.value.map(c => {
    const startMin = parseHM(c.startTime)
    const endMin = parseHM(c.endTime)
    const outOfBounds = startMin < START_MIN || endMin > END_MIN
    const startRow = timeToRow(c.startTime)
    const endRow = timeToRow(c.endTime)
    const rowSpan = Math.max(1, endRow - startRow)
    const col = c.weekday === 7 ? 1 : c.weekday + 1 // 1=Sun..7=Sat
    return {
      ...c,
      col,
      startRow,
      rowSpan,
      color: hashColor(c.name),
      studentCount: (c.studentIds || []).length,
      teacherName: c.teacherName || getTeacherNameById(c.teacherId),
      outOfBounds,
      overlap: false,
      groupId: null,
      stackIndex: 0,
      stackSize: 1
    }
  })

  // 按列扫描, 用 sweep 算法识别重叠组 (含跨课程的传递重叠)
  for (let col = 1; col <= 7; col++) {
    const colCourses = placed
      .filter(p => p.col === col)
      .sort((a, b) => a.startRow - b.startRow || placed.indexOf(a) - placed.indexOf(b))

    let groupId = null
    let groupEndRow = 0
    let groupMembers = []
    const flushGroup = () => {
      if (groupMembers.length < 2) return
      const gid = groupId
      groupMembers.forEach((m, idx) => {
        m.overlap = true
        m.groupId = gid
        m.stackSize = groupMembers.length
        m.stackIndex = idx
      })
    }
    for (const c of colCourses) {
      const cEnd = c.startRow + c.rowSpan
      if (c.startRow <= groupEndRow) {
        // 与当前组重叠或首尾相接, 归入同一扑克牌组
        groupMembers.push(c)
        groupEndRow = Math.max(groupEndRow, cEnd)
      } else {
        // 不相邻, 开始新的组
        flushGroup()
        groupId = `${col}-${c.startRow}-${cEnd}`
        groupMembers = [c]
        groupEndRow = cEnd
      }
    }
    flushGroup()
  }
  return placed
})

function getTeacherNameById(id) {
  const t = teachers.value.find(t => t.id === id)
  return t ? t.name : ''
}

// ============================ 表单选项 ============================
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

const filteredStudents = computed(() => {
  if (!studentSearchText.value) return students.value.filter(s => s.status === 'active')
  const search = studentSearchText.value.toLowerCase()
  return students.value.filter(s =>
    s.name.toLowerCase().includes(search) && s.status === 'active'
  )
})

function toggleStudent(id) {
  const index = form.value.studentIds.indexOf(id)
  if (index === -1) form.value.studentIds.push(id)
  else form.value.studentIds.splice(index, 1)
}

// ============================ 弹窗 ============================
function openEdit(course) {
  editingCourse.value = course
  form.value = {
    name: course.name,
    teacherId: course.teacherId,
    weekday: course.weekday,
    startTime: course.startTime,
    endTime: course.endTime,
    hoursPerClass: course.hoursPerClass ?? 1,
    classroom: course.classroom || '',
    studentIds: [...(course.studentIds || [])]
  }
  studentSearchText.value = ''
  showModal.value = true
}

function openCreate() {
  editingCourse.value = null
  form.value = {
    name: '',
    teacherId: teachers.value[0]?.id || '',
    weekday: 1,
    startTime: '09:00',
    endTime: '11:00',
    hoursPerClass: 1,
    classroom: '',
    studentIds: []
  }
  studentSearchText.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingCourse.value = null
  studentSearchText.value = ''
  submitting.value = false
  mobileListGroup.value = null
}

// ============================ 重叠课程交互 ============================
function checkMobile() {
  isMobile.value = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768
}

function handleBarClick(course) {
  // 单卡: 直接编辑
  if (course.stackSize <= 1) {
    expandedGroupId.value = null
    openEdit(course)
    return
  }
  // 移动端: 任何重叠/相连 → 弹列表
  if (isMobile.value) {
    mobileListGroup.value = placedCourses.value
      .filter(c => c.groupId === course.groupId)
      .sort((a, b) => a.stackIndex - b.stackIndex)
    return
  }
  // 桌面: 扑克牌 fan-out (≥2 张都展开)
  if (expandedGroupId.value === course.groupId) {
    // 已展开, 用户点击的是某一层 → 进入编辑
    openEdit(course)
  } else {
    expandedGroupId.value = course.groupId
  }
}

function selectFromList(course) {
  mobileListGroup.value = null
  openEdit(course)
}

function handleBackdropClick() {
  // 点击空白区域收起展开/列表
  expandedGroupId.value = null
  mobileListGroup.value = null
}

async function saveCourse() {
  if (submitting.value) return

  if (!form.value.name.trim()) {
    toast.error('请输入课程名称')
    return
  }
  if (!form.value.teacherId) {
    toast.error('请选择授课教师')
    return
  }
  if (!form.value.studentIds || form.value.studentIds.length === 0) {
    toast.error('请至少选择一名学生')
    return
  }
  if (form.value.startTime && form.value.endTime && form.value.startTime >= form.value.endTime) {
    toast.error('结束时间必须晚于开始时间')
    return
  }
  const hours = Number(form.value.hoursPerClass)
  if (!Number.isFinite(hours) || hours < 0.5) {
    toast.error('每次课时不能小于 0.5')
    return
  }
  form.value.hoursPerClass = hours

  submitting.value = true
  try {
    if (editingCourse.value) {
      courses.value = await updateCourse(editingCourse.value.id, form.value)
      toast.success('课程已更新')
    } else {
      courses.value = await addCourse(form.value)
      toast.success('课程已创建')
    }
    closeModal()
  } catch (err) {
    toast.error(err.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

// 防抖保存：300ms 内多次点击只触发一次真正的 save
const debouncedSave = (() => {
  let timer = null
  let lastRun = 0
  return () => {
    if (timer) return
    const now = Date.now()
    const elapsed = now - lastRun
    if (elapsed < 300) {
      timer = setTimeout(() => {
        timer = null
        lastRun = Date.now()
        saveCourse()
      }, 300 - elapsed)
      return
    }
    lastRun = now
    saveCourse()
  }
})()

// ============================ 周导航 ============================
function prevWeek() { weekOffset.value-- }
function nextWeek() { weekOffset.value++ }
function goToday() { weekOffset.value = 0 }

// ============================ 数据加载 ============================
async function loadData() {
  const [c, t, s] = await Promise.all([
    getCourses(), getTeachers(), getStudents()
  ])
  courses.value = c || []
  teachers.value = t || []
  students.value = s || []
}

onMounted(() => {
  loadData()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('click', handleWindowClick)
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('click', handleWindowClick)
  window.removeEventListener('resize', checkMobile)
})

function handleKeydown(e) {
  if (e.key === 'Escape') {
    if (showModal.value) closeModal()
    else if (expandedGroupId.value || mobileListGroup.value) {
      expandedGroupId.value = null
      mobileListGroup.value = null
    }
    return
  }
  if (e.key === 'Enter' && expandedGroupId.value && !showModal.value) {
    // 展开状态下回车 = 编辑最上层卡
    const top = placedCourses.value
      .filter(c => c.groupId === expandedGroupId.value)
      .sort((a, b) => b.stackIndex - a.stackIndex)[0]
    if (top) openEdit(top)
  }
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  if (showModal.value) return
  loadData()
}

function handleWindowClick(e) {
  // 点击非课程 bar 时收起展开/列表
  if (!e.target.closest('.course-bar') && !e.target.closest('.overlap-list-item')) {
    expandedGroupId.value = null
    mobileListGroup.value = null
  }
}
</script>

<style scoped>
.weekly-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
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

.week-nav {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ============ 网格主结构 ============ */
.schedule-grid {
  background: white;
  border-radius: var(--radius-lg);
  padding: 0;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.grid-header {
  display: grid;
  grid-template-columns: 64px repeat(7, 1fr);
  background: rgba(0, 0, 0, 0.02);
  border-bottom: 1px solid var(--color-border);
}

.time-col-head { /* 占位 */ }

.day-head {
  padding: 14px 8px;
  text-align: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
  border-left: 1px solid var(--color-border);
  transition: background 0.2s;
}

.day-head.today {
  background: linear-gradient(180deg, rgba(0,113,227,0.10), rgba(0,113,227,0.04));
  color: var(--color-primary);
}

.day-head.today .day-date {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.day-name {
  font-size: 14px;
  margin-bottom: 4px;
}

.day-date {
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: white;
}

/* ============ 表体 ============ */
.grid-body {
  position: relative;
  display: grid;
  grid-template-columns: 64px repeat(7, 1fr);
  grid-auto-rows: 24px;
  grid-auto-flow: column;
}

/* 时间列 */
.time-col {
  grid-column: 1;
  grid-row: 1 / span 31;
  display: grid;
  grid-template-rows: repeat(31, 24px);
  background: rgba(0, 0, 0, 0.02);
  border-right: 1px solid var(--color-border);
}

.time-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  padding: 0 8px;
  height: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

/* ============ 泳道背景层 ============ */
.swimlane {
  grid-row: 1 / span 9;
  grid-column: 2 / span 7;
  position: relative;
  pointer-events: none;
  border-bottom: 2px dashed rgba(0, 0, 0, 0.06);
}
.swimlane-morning {
  grid-row: 1 / span 9;
  background: linear-gradient(180deg, rgba(0,113,227,0.04), rgba(0,113,227,0.015));
}
.swimlane-afternoon {
  grid-row: 10 / span 12;
  background: linear-gradient(180deg, rgba(255,149,0,0.035), rgba(255,149,0,0.012));
}
.swimlane-evening {
  grid-row: 22 / span 10;
  background: linear-gradient(180deg, rgba(175,82,222,0.045), rgba(175,82,222,0.015));
}

.swimlane-label {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.20);
  text-align: right;
  line-height: 1.3;
  pointer-events: none;
  letter-spacing: 0.5px;
}

/* ============ 课程 bar ============ */
.bars-layer {
  grid-column: 2 / span 7;
  grid-row: 1 / span 31;
  position: relative;
  display: grid;
  grid-template-columns: subgrid;
  grid-auto-rows: subgrid;
  grid-auto-flow: row dense;
  pointer-events: none;
}

.course-bar {
  pointer-events: auto;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-left: 4px solid var(--c-border);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 0 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  color: var(--c-fg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  opacity: 0;
  animation: barIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: calc(var(--idx) * 35ms + 100ms);
  transition:
    transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1),
    box-shadow 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}

@keyframes barIn {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.course-bar:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 5;
}

.course-bar:active {
  transform: translateY(0) scale(0.99);
}

.bar-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-meta {
  font-size: 11px;
  opacity: 0.85;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.warn-icon {
  font-size: 11px;
  color: var(--color-danger);
  cursor: help;
}

.course-bar.out-of-bounds {
  background: repeating-linear-gradient(
    45deg,
    var(--c-bg),
    var(--c-bg) 8px,
    rgba(255, 59, 48, 0.12) 8px,
    rgba(255, 59, 48, 0.12) 16px
  );
  border-color: var(--color-danger);
}

.course-bar.has-overlap {
  outline: 2px dashed var(--color-danger);
  outline-offset: -2px;
}

/* ============ 30 分钟虚线参考层 ============ */
.time-rules {
  grid-column: 2 / span 7;
  grid-row: 1 / span 31;
  display: grid;
  grid-template-rows: repeat(31, 24px);
  pointer-events: none;
  z-index: 0;
}
.time-rule {
  border-bottom: 1px dashed rgba(0, 0, 0, 0.06);
}
.time-rule.major {
  border-bottom: 1px dashed rgba(0, 0, 0, 0.12);
}

/* ============ 重叠堆叠样式 ============ */
.course-bar.is-stacked {
  z-index: var(--stack-z);
  transform: translateY(var(--stack-translate));
}
.course-bar.is-stacked.stack-expanded {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
  overflow: visible;
  min-height: 96px;
}
.course-bar.is-stacked.stack-expanded:hover {
  transform: translateY(calc(var(--stack-translate) - 3px)) scale(1.02);
  z-index: calc(var(--stack-z) + 5);
}
.course-bar.is-stacked:hover {
  z-index: calc(var(--stack-z) + 3);
}

/* 顶层卡微弱描边, 表明是主操作对象 */
.course-bar.is-stacked[data-stack-top='true'] {
  border-top-width: 2px;
}

.stack-badge {
  position: absolute;
  top: -7px;
  right: -7px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: var(--color-danger, #ff3b30);
  color: white;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(255, 59, 48, 0.4);
  pointer-events: none;
  letter-spacing: 0.3px;
}

.bar-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  font-size: 10px;
  opacity: 0.75;
}

.bar-teacher {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

.bar-students {
  background: rgba(255, 255, 255, 0.6);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
}

/* TransitionGroup 动画 */
.bar-enter-active {
  animation: barIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bar-leave-active {
  transition: all 0.25s cubic-bezier(0.5, 0, 0.75, 0);
  position: absolute;
}
.bar-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

/* ============ 空状态 ============ */
.empty-state {
  text-align: center;
  padding: 60px 24px;
  background: white;
  border-radius: var(--radius-lg);
  margin-top: 16px;
  color: var(--color-text-secondary);
}

.empty-state p {
  margin-bottom: 16px;
  font-size: 15px;
}

/* ============ 弹窗 ============ */
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
  max-width: 560px;
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

.student-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
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

/* 弹窗动画 */
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

/* ============ 移动端 ============ */
@media (max-width: 1024px) {
  .schedule-grid {
    overflow-x: auto;
  }
  .grid-header,
  .grid-body {
    min-width: 800px;
  }
  .page-title { font-size: 24px; }
  .week-nav .btn { padding: 6px 10px; font-size: 13px; }

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

@media (max-width: 640px) {
  .day-name { font-size: 12px; }
  .day-date { font-size: 10px; padding: 1px 6px; }
  .course-bar { padding: 4px 8px; }
  .bar-name { font-size: 12px; }
  .bar-meta { font-size: 10px; }
  .swimlane-label { display: none; }
}

/* ============ 移动端重叠课程列表 ============ */
.overlap-list-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.overlap-list {
  background: white;
  width: 100%;
  max-width: 480px;
  max-height: 70vh;
  border-radius: 16px 16px 0 0;
  padding: 16px 12px 20px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.overlap-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px 12px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
}
.overlap-list-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}
.overlap-list-close {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 50%;
  font-size: 22px;
  line-height: 1;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.overlap-list-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  margin: 6px 0;
  border: none;
  border-left: 4px solid;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.overlap-list-item:hover {
  transform: translateX(2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.overlap-list-item:active {
  transform: scale(0.98);
}
.overlap-list-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-fg, var(--color-text));
  margin-bottom: 2px;
}
.overlap-list-meta {
  font-size: 12px;
  opacity: 0.85;
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 2px;
}
.overlap-list-meta .dot {
  opacity: 0.5;
}
.overlap-list-students {
  font-size: 11px;
  opacity: 0.7;
}

/* 弹层进出场动画 */
.overlap-list-enter-active,
.overlap-list-leave-active {
  transition: opacity 0.2s ease;
}
.overlap-list-enter-active .overlap-list,
.overlap-list-leave-active .overlap-list {
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.overlap-list-enter-from,
.overlap-list-leave-to {
  opacity: 0;
}
.overlap-list-enter-from .overlap-list,
.overlap-list-leave-to .overlap-list {
  transform: translateY(40px);
}
</style>