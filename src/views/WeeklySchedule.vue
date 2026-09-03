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

        <!-- 课程层 (单卡 + 重叠组) -->
        <div class="bars-layer">
        <!-- 单卡 (无重叠) -->
        <div
          v-for="c in singleCourses"
          :key="c.id"
          class="course-bar"
          :class="{
            'out-of-bounds': c.outOfBounds,
            'is-past': c.isPast
          }"
          :style="{
            '--c-bg': c.color.bg,
            '--c-fg': c.color.fg,
            '--c-border': c.color.border,
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
        </div>

        <!-- 重叠组 (≥2 张时间重叠) -->
        <div
          v-for="grp in overlapGroups"
          :key="grp.groupId"
          class="overlap-group"
          :class="{ 'is-collapsing': collapsingGroupId === grp.groupId }"
          :style="{
            gridColumn: grp.col + 1,
            gridRow: `${grp.startRow} / span ${grp.rowSpan}`
          }"
          @click.stop="handleBarClick(grp.members[0])"
        >
          <span class="overlap-group-badge">+{{ grp.members.length }}</span>
          <div
            v-for="c in grp.members"
            :key="c.id"
            class="course-bar is-stacked"
            :class="{
              'out-of-bounds': c.outOfBounds,
              'is-past': c.isPast
            }"
            :style="{
              '--c-bg': c.color.bg,
              '--c-fg': c.color.fg,
              '--c-border': c.color.border,
              '--stack-translate': `${c.stackIndex * 16}px`,
              '--stack-z': c.stackIndex + 10,
              gridColumn: '1 / -1',
              gridRow: `${c.startRow - grp.startRow + 1} / span ${c.rowSpan}`
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
          </div>
        </div>
        </div>
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

    <!-- 桌面端重叠课程居中弹框 -->
    <Teleport to="body">
      <Transition name="overlap-list">
        <div v-if="desktopOverlapGroup" class="overlap-list-overlay desktop-pick" @click.self="closeDesktopOverlap">
          <div class="overlap-list desktop-pick" @click.stop>
            <div class="overlap-list-header">
              <span class="overlap-list-title">{{ desktopOverlapGroup.length }} 个课程在此重叠</span>
              <button class="overlap-list-close" @click="closeDesktopOverlap" aria-label="关闭">×</button>
            </div>
            <button
              v-for="c in desktopOverlapGroup"
              :key="c.id"
              class="overlap-list-item"
              :style="{ borderLeftColor: c.color.border, background: c.color.bg }"
              @click="selectFromDesktopList(c)"
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
    <div v-if="placedCourses.length === 0" class="empty-state">
      <p>本周还没有任何课程</p>
      <button class="btn btn-primary" @click="openCreate">+ 创建第一门课程</button>
    </div>

    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showHistoryDrawer" class="history-overlay" @click.self="closeHistoryDrawer">
          <div class="history-drawer">
            <div class="history-header">
              <h2 class="history-title">📜 {{ historyCourse?.name }} · 历史时间线</h2>
              <button class="history-close" @click="closeHistoryDrawer" aria-label="关闭">×</button>
            </div>
            <div class="history-body">
              <div v-if="historyItems.length === 0" class="history-empty">暂无变更记录</div>
              <div v-else>
                <div
                  v-for="(item, idx) in historyItems"
                  :key="idx"
                  class="history-item"
                  :class="['status-' + classifyTimelineItem(item).status]"
                >
                  <div class="history-item-head">
                    <span class="history-date">{{ item.effectiveFrom }}</span>
                    <span v-if="item.validUntil" class="history-range">~ {{ item.validUntil }}</span>
                    <span class="history-status">{{ classifyTimelineItem(item).label }}</span>
                  </div>
                  <div class="history-item-body">
                    <div><strong>教师：</strong>{{ item.teacherName || '未知' }}</div>
                    <div><strong>学生：</strong>{{ getStudentNames(item.studentIds) }}</div>
                    <div v-if="item.classroom"><strong>教室：</strong>{{ item.classroom }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 编辑/只读弹窗（共用 CourseEditModal） -->
    <CourseEditModal
      :open="showModal"
      :mode="modalMode"
      :course="editingCourse"
      :effective-date="editEffectiveDate"
      :teachers="teachers"
      :students="students"
      :submitting="submitting"
      @submit="onModalSubmit"
      @cancel="closeModal"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getCourses, getEffectiveCourses, addCourse, updateCourse, getTeachers, getStudents, getCourseHistory } from '../utils/storage'
import { useToast } from '../composables/useToast'
import CourseEditModal from '../components/CourseEditModal.vue'

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
const editEffectiveDate = ref(null)
const modalMode = ref('edit')           // 'edit' | 'create' | 'readonly'
const submitting = ref(false)

// 历史抽屉
const showHistoryDrawer = ref(false)
const historyCourse = ref(null)
const historyItems = ref([])

// 重叠课程交互
const desktopOverlapGroup = ref(null)      // 桌面居中 modal 显示哪个重叠组 (数组)
const mobileListGroup = ref(null)          // 移动: 哪个重叠组弹出列表
const collapsingGroupId = ref(null)        // 触发归位动画的组 id
const isMobile = ref(false)                // 是否移动端

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
      date: d,
      dateStr
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

const isViewingPast = computed(() => weekOffset.value < 0)

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// col → DB weekday（col 1 = Sunday = weekday 7, col 2 = Monday = weekday 1, ...）
function colToWeekday(col) {
  return col === 1 ? 7 : col - 1
}

// 判断该 slot 是否属于过去：(weekDays[col-1].date + endTime) < now
function isSlotPast(col, endTime) {
  const day = weekDays.value[col - 1]
  if (!day) return false
  const slotEnd = new Date(day.date)
  const [h, m] = endTime.split(':').map(Number)
  slotEnd.setHours(h, m, 0, 0)
  return slotEnd < new Date()
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
      isPast: isSlotPast(col, c.endTime),
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
      if (c.startRow < groupEndRow) {
        // 与当前组时间重叠, 归入同一重叠组
        groupMembers.push(c)
        groupEndRow = Math.max(groupEndRow, cEnd)
      } else {
        // 首尾相接或不相邻, 开始新的组
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

// 单卡 (stackSize <= 1): 直接渲染
const singleCourses = computed(() => placedCourses.value.filter(c => c.stackSize <= 1))

// 重叠组: 按 groupId 聚合, 每个组渲染为一个 .overlap-group 虚线包裹框
const overlapGroups = computed(() => {
  const map = new Map()
  for (const c of placedCourses.value) {
    if (c.stackSize <= 1) continue
    if (!map.has(c.groupId)) map.set(c.groupId, [])
    map.get(c.groupId).push(c)
  }
  return Array.from(map.values()).map(members => {
    members.sort((a, b) => a.stackIndex - b.stackIndex)
    const startRow = Math.min(...members.map(m => m.startRow))
    const endRow = Math.max(...members.map(m => m.startRow + m.rowSpan))
    return {
      groupId: members[0].groupId,
      members,
      startRow,
      rowSpan: endRow - startRow,
      col: members[0].col
    }
  })
})

function getTeacherNameById(id) {
  const t = teachers.value.find(t => t.id === id)
  return t ? t.name : ''
}

function getStudentNames(studentIds) {
  return (studentIds || []).map(id => {
    const s = students.value.find(s => s.id === id)
    return s ? s.name : ''
  }).filter(Boolean).join('、') || '无'
}

// ============================ 弹窗 ============================
function openEdit(course) {
  editingCourse.value = course
  // 未来 occurrence 默认为当天/下一节课日期
  editEffectiveDate.value = nextFutureOccurrence(course.weekday, course.startTime)
  modalMode.value = 'edit'
  showModal.value = true
}

function openReadonly(course) {
  editingCourse.value = course
  editEffectiveDate.value = nextFutureOccurrence(course.weekday, course.startTime)
  modalMode.value = 'readonly'
  showModal.value = true
}

function openCreate() {
  editingCourse.value = null
  editEffectiveDate.value = null
  modalMode.value = 'create'
  showModal.value = true
}

function nextFutureOccurrence(weekday, startTime) {
  const now = new Date()
  const targetDow = weekday === 7 ? 0 : weekday
  const curDow = now.getDay()
  let diff = (targetDow - curDow + 7) % 7
  if (diff === 0 && startTime) {
    const [h, m] = startTime.split(':').map(Number)
    if (h * 60 + m <= now.getHours() * 60 + now.getMinutes()) diff = 7
  }
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
  return d
}

function closeModal() {
  showModal.value = false
  editingCourse.value = null
  editEffectiveDate.value = null
  submitting.value = false
  mobileListGroup.value = null
}

// ============================ 历史抽屉 ============================
async function openHistoryDrawer(course) {
  historyCourse.value = course
  showHistoryDrawer.value = true
  historyItems.value = []
  try {
    const items = await getCourseHistory(course.id)
    historyItems.value = items || []
  } catch (err) {
    toast.error('加载历史失败：' + (err.message || ''))
    historyItems.value = []
  }
}

function closeHistoryDrawer() {
  showHistoryDrawer.value = false
  historyCourse.value = null
  historyItems.value = []
}

function classifyTimelineItem(item) {
  if (item.kind === 'history') return { status: 'past', label: '已替换' }
  const today = formatDate(new Date())
  if (item.validUntil) {
    if (item.effectiveFrom >= today) return { status: 'pending-window', label: '待生效（仅本节）' }
    return { status: 'past-window', label: '历史窗口' }
  }
  if (item.effectiveFrom > today) return { status: 'pending', label: '待生效' }
  return { status: 'current', label: '当前生效' }
}

// ============================ 重叠课程交互 ============================
function checkMobile() {
  isMobile.value = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768
}

function handleBarClick(course) {
  // 移动端: 弹底部 sheet
  if (isMobile.value) {
    mobileListGroup.value = placedCourses.value
      .filter(c => c.groupId === course.groupId)
      .sort((a, b) => a.stackIndex - b.stackIndex)
    return
  }
  // 桌面: 单卡 → 直接编辑; 重叠组 → 弹居中 modal + 触发归位动画
  if (course.stackSize <= 1) {
    if (course.isPast) {
      openReadonly(course)
      openHistoryDrawer(course)
      return
    }
    openEdit(course)
    return
  }
  collapsingGroupId.value = course.groupId
  desktopOverlapGroup.value = placedCourses.value
    .filter(c => c.groupId === course.groupId)
    .sort((a, b) => a.stackIndex - b.stackIndex)
}

function selectFromDesktopList(course) {
  desktopOverlapGroup.value = null
  setTimeout(() => {
    collapsingGroupId.value = null
    if (course.isPast) {
      openReadonly(course)
      openHistoryDrawer(course)
    } else {
      openEdit(course)
    }
  }, 220)
}

function closeDesktopOverlap() {
  desktopOverlapGroup.value = null
  collapsingGroupId.value = null
}

function selectFromList(course) {
  mobileListGroup.value = null
  if (course.isPast) {
    openReadonly(course)
    openHistoryDrawer(course)
    return
  }
  openEdit(course)
}

function handleBackdropClick() {
  desktopOverlapGroup.value = null
  mobileListGroup.value = null
  collapsingGroupId.value = null
}

async function onModalSubmit(payload) {
  if (submitting.value) return

  submitting.value = true
  try {
    if (editingCourse.value) {
      courses.value = await updateCourse(editingCourse.value.id, payload)
      toast.success('课程已更新')
    } else {
      courses.value = await addCourse(payload)
      toast.success('课程已创建')
    }
    closeModal()
    // 编辑完成后重新加载，确保当周展示新值
    await loadData()
  } catch (err) {
    toast.error(err.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

// ============================ 周导航 ============================
function prevWeek() { weekOffset.value-- }
function nextWeek() { weekOffset.value++ }
function goToday() { weekOffset.value = 0 }

// ============================ 数据加载 ============================
async function loadData() {
  const [t, s] = await Promise.all([
    getTeachers(), getStudents()
  ])
  teachers.value = t || []
  students.value = s || []

  // 过去周调 effective endpoint；本周/未来周调 courses（更快）
  if (isViewingPast.value) {
    try {
      const ws = formatDate(weekStart.value)
      courses.value = (await getEffectiveCourses(ws)) || []
      return
    } catch (err) {
      toast.error('加载历史课程失败：' + (err.message || ''))
      courses.value = []
      return
    }
  }
  try {
    courses.value = (await getCourses()) || []
  } catch (err) {
    toast.error('加载课程失败：' + (err.message || ''))
    courses.value = []
  }
}

watch(weekOffset, () => { loadData() })

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
    else if (showHistoryDrawer.value) closeHistoryDrawer()
    else if (desktopOverlapGroup.value || mobileListGroup.value) {
      desktopOverlapGroup.value = null
      mobileListGroup.value = null
      collapsingGroupId.value = null
    }
    return
  }
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  if (showModal.value) return
  loadData()
}

function handleWindowClick(e) {
  // 点击非课程 bar 时收起展开/列表
  if (!e.target.closest('.course-bar') && !e.target.closest('.overlap-group') && !e.target.closest('.overlap-list-item') && !e.target.closest('.history-drawer')) {
    desktopOverlapGroup.value = null
    mobileListGroup.value = null
    collapsingGroupId.value = null
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

.course-bar.is-past {
  opacity: 0.55;
  filter: grayscale(60%);
  border-color: rgba(0, 0, 0, 0.2);
  border-left-color: rgba(0, 0, 0, 0.25);
  cursor: help;
}

.course-bar.is-past:hover {
  opacity: 0.85;
  filter: grayscale(30%);
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
  transition: transform 0.25s ease, box-shadow 0.2s ease;
}
.course-bar.is-stacked:hover {
  z-index: calc(var(--stack-z) + 3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

/* ============ 重叠组虚线包裹框 ============ */
.overlap-group {
  position: relative;
  pointer-events: auto;
  border: 2px dashed rgba(0, 0, 0, 0.55);
  border-radius: 12px;
  margin: 0 4px;
  padding: 0;
  background: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  display: grid;
  grid-template-columns: 1fr;
  grid-auto-rows: 24px;
  z-index: 5;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.overlap-group:hover {
  border-color: rgba(0, 113, 227, 0.85);
  background: rgba(0, 113, 227, 0.06);
}
.overlap-group.is-collapsing {
  background: rgba(255, 255, 255, 0.7);
}

.overlap-group-badge {
  position: absolute;
  top: -11px;
  right: -10px;
  min-width: 26px;
  height: 26px;
  padding: 0 9px;
  border-radius: 13px;
  background: white;
  color: #b31a3f;
  border: 2px solid #ff2d55;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  pointer-events: none;
  z-index: 6;
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

/* ============ 历史抽屉 ============ */
.history-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  z-index: 1001;
  display: flex;
  justify-content: flex-end;
}

.history-drawer {
  background: white;
  width: 100%;
  max-width: 440px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.history-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text);
}

.history-close {
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

.history-body {
  padding: 16px 24px 24px;
  overflow-y: auto;
  flex: 1;
}

.history-empty {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 32px 0;
  font-size: 14px;
}

.history-item {
  border-left: 3px solid var(--color-border);
  padding: 10px 14px;
  margin-bottom: 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.history-item.status-current {
  border-left-color: var(--color-primary);
  background: rgba(0, 113, 227, 0.06);
}

.history-item.status-pending,
.history-item.status-pending-window {
  border-left-color: var(--color-warning);
  background: rgba(255, 149, 0, 0.06);
}

.history-item.status-past,
.history-item.status-past-window {
  border-left-color: rgba(0, 0, 0, 0.25);
  opacity: 0.85;
}

.history-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
  flex-wrap: wrap;
}

.history-date {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
}

.history-range {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.history-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--color-text-secondary);
  margin-left: auto;
}

.history-item-body {
  font-size: 12px;
  color: var(--color-text);
  line-height: 1.7;
}

.history-item-body strong {
  color: var(--color-text-secondary);
  font-weight: 500;
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

  .history-drawer {
    max-width: 100%;
  }
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

/* ============ 桌面端重叠课程居中 modal ============ */
.overlap-list-overlay.desktop-pick {
  align-items: center;
}
.overlap-list.desktop-pick {
  border-radius: 16px;
  max-height: 80vh;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.18);
}
@media (max-width: 1024px) {
  .overlap-list-overlay.desktop-pick { display: none; }
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
.overlap-list-enter-from .overlap-list.desktop-pick,
.overlap-list-leave-to .overlap-list.desktop-pick {
  transform: translateY(32px) scale(0.94);
}
</style>