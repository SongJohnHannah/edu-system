<template>
  <section class="weekly-page">
    <header class="weekly-head">
      <div><h1>周课程表</h1><p>{{ weekLabel }} · 单击课程查看学生与试听预约</p></div>
      <div class="head-actions">
        <NButton @click="changeWeek(-1)">上两周</NButton>
        <NButton @click="goToday">本周</NButton>
        <NButton @click="changeWeek(1)">下两周</NButton>
        <NButton type="primary" :disabled="loading || referenceLoading || loadError || referenceError || !canCreateCourse" @click="openCreate">创建课程</NButton>
      </div>
    </header>

    <div class="filter-strip">
      <span>显示：</span>
      <NButton size="small" :type="teacherFilter === 'all' ? 'primary' : 'default'" :secondary="teacherFilter !== 'all'" @click="teacherFilter = 'all'">全部教师</NButton>
      <NButton v-if="auth.teacherId" size="small" :type="teacherFilter === 'mine' ? 'primary' : 'default'" :secondary="teacherFilter !== 'mine'" @click="teacherFilter = 'mine'">我的课程</NButton>
      <span class="hint desktop-hint">点击课程查看详情；拖动手柄或触屏长按可调课。红色虚线内的重叠课程请点击选择，不可拖动。</span>
      <span class="hint phone-hint">点击课程查看详情；调整时间请在详情中操作。</span>
    </div>
    <p v-if="!referenceLoading && !referenceError && !canCreateCourse" class="create-prerequisite">{{ createPrerequisite }}</p>
    <div v-if="teacherLegend.length" class="teacher-legend">
      <span v-for="teacher in teacherLegend" :key="teacher.id" class="legend-item">
        <i :style="paletteStyle(teacher.id)"></i>{{ teacher.name }}
      </span>
    </div>

    <div v-if="loading || referenceLoading" class="loading">正在加载两周课程…</div>
    <div v-else-if="loadError || referenceError" class="loading"><p>周排课加载失败，请重试</p><NButton @click="retryPage">重试</NButton></div>
    <template v-else>
      <div class="mobile-two-weeks" aria-label="两周课程安排">
        <section v-for="(week, weekIndex) in weekGroups" :key="week.start" class="mobile-week-block">
          <div class="mobile-week-head"><span>第 {{ weekIndex + 1 }} 周</span><strong>{{ week.start }} — {{ week.end }}</strong></div>
          <div v-for="d in week.days" :key="d.date" class="mobile-day" :class="{ today: d.date === today }">
            <div class="mobile-day-head">
              <div><strong>{{ d.label }}</strong><span>{{ d.month }} 月 {{ d.day }} 日</span><small v-if="d.date === today">今天</small></div>
              <button v-if="d.date >= today && canMoveWholeDay(d.date)" class="day-move-button" type="button" :aria-label="`整体调整 ${d.date} 的课程`" @click="openDayMove(d.date)">调</button>
              <button v-if="d.date >= today" type="button" :disabled="!canCreateCourse" :aria-label="`在 ${d.date} 创建课程`" @click="openCreateOnDay(d.date)">＋</button>
            </div>
            <div v-if="(itemsByDate[d.date] || []).length" class="mobile-day-items">
              <button v-for="item in itemsByDate[d.date]" :key="item.id" class="agenda-card"
                :class="{ trial: item.type === 'trial', 'has-overlap': item.hasOverlap }" :style="paletteStyle(item.teacherId)" @click="openItem(item)">
                <span class="agenda-time">{{ item.startTime }}—{{ item.endTime }}</span>
                <strong>{{ item.name }}</strong>
                <span>{{ item.teacherName }}<template v-if="item.type === 'course'"> · 正式学生 {{ item.studentIds.length }} 人</template></span>
                <span v-if="item.substitution" class="substitution-label">临时代课 · 原老师：{{ item.originalTeacherName }}</span>
                <span v-if="item.hasConflict || item.outOfBounds" class="course-warning">{{ item.hasConflict ? '时间冲突，请处理' : '超出显示时段' }}</span>
                <span v-if="item.type === 'course' && item.trialCount" class="trial-count">试听预约 {{ item.trialCount }} 人</span>
                <span v-if="item.type === 'trial'" class="trial-count">独立试听 · {{ item.studentName }}</span>
              </button>
            </div>
            <span v-else class="mobile-day-empty">暂无安排</span>
          </div>
          <div v-if="weekIndex === 0" class="mobile-next-week">向下滑动，查看第二周 ↓</div>
        </section>
      </div>
      <div class="combined-board" aria-label="连续两周课程表">
        <div class="combined-week-head"><span v-for="(week, index) in weekGroups" :key="week.start"><strong class="combined-week-label">第 {{ index + 1 }} 周 · {{ week.start }} — {{ week.end }}</strong><NButton size="tiny" :disabled="week.end < today || !canCreateCourse" @click="openCreate(week.start)">在本周创建课程</NButton></span></div>
        <div class="board-scroll">
          <div class="week-board combined-grid">
            <div class="corner">时间</div>
            <div v-for="(d, dayIndex) in weekDays" :key="`${d.date}-head`" class="day-head" :class="{ active: d.date === today, 'next-week': dayIndex === 7 }" :data-date="d.date">
              <div class="day-name">{{ d.label }}</div><span class="day-date">{{ d.month }}/{{ d.day }}</span>
              <button v-if="d.date >= today && canMoveWholeDay(d.date)" class="day-drag-handle" type="button" :aria-label="`拖动或点击整体调整 ${d.date} 的课程`" title="拖动整天课程到目标日期，或点击选择日期" @pointerdown.stop="startDayPointer($event, d.date)" @click.stop="clickDayMove(d.date)">整天</button>
            </div>
            <div class="time-ruler"><div v-for="(time, index) in rulerTimes" :key="time" class="time-cell" :style="{ top: `${index * SLOT_PX}px` }">{{ index % 2 === 0 ? time : '' }}</div></div>
            <div class="swimlane swimlane-morning"><span>上午<br />07:30 – 12:00</span></div>
            <div class="swimlane swimlane-afternoon"><span>下午<br />12:00 – 18:00</span></div>
            <div class="swimlane swimlane-evening"><span>晚上<br />18:00 – 22:30</span></div>
            <div v-for="(d, dayIndex) in weekDays" :key="d.date" class="day-lane" :class="{ 'next-week': dayIndex === 7 }" :data-date="d.date" :style="{ gridColumn: dayIndex + 2 }">
              <TransitionGroup name="bar">
                <div v-for="(item, itemIndex) in (itemsByDate[d.date] || []).filter(item => !item.hasOverlap)" :key="item.id" class="schedule-item course-bar"
                  :class="{ trial: item.type === 'trial', readonly: !canEdit(item), draggable: canDrag(item), compact: minutes(item.endTime) - minutes(item.startTime) <= 30, dragging: drag.item?.id === item.id && drag.active, 'out-of-bounds': item.outOfBounds }"
                  :title="`${item.name} · ${item.startTime}—${item.endTime} · ${item.teacherName}${item.substitution ? '（临时代课）' : ''}`"
                  :aria-label="`${item.date} ${item.startTime} 至 ${item.endTime}，${item.name}，${item.teacherName}，查看详情`" role="button" tabindex="0"
                  :style="{ ...itemStyle(item), ...paletteStyle(item.teacherId), '--idx': itemIndex }" @pointerdown="startPointer($event, item)" @click="openItem(item)" @keydown.enter.prevent="openItem(item)" @keydown.space.prevent="openItem(item)" @dragstart.prevent>
                  <div class="bar-top"><strong class="bar-name">{{ item.name }}</strong><span v-if="item.type === 'course' && item.trialCount" class="trial-count" :data-short="`试${item.trialCount}`">试听 {{ item.trialCount }} 人</span><span v-if="item.type === 'trial'" class="trial-count" data-short="试听">试听</span></div>
                  <span class="bar-meta">{{ item.laneCount > 1 ? item.startTime : `${item.startTime}—${item.endTime}` }} <span v-if="item.outOfBounds || item.hasOverlap" title="查看详情处理警示">⚠</span></span>
                  <div class="bar-bottom"><span class="bar-teacher">{{ item.teacherName }}{{ item.substitution ? ' · 代课' : '' }}</span><span class="bar-students">{{ item.type === 'course' ? `${item.studentIds.length} 人` : item.studentName }}</span></div>
                  <span v-if="canDrag(item)" class="drag-handle" title="按住拖动调整课程时间" aria-hidden="true"><svg viewBox="0 0 12 16" width="12" height="16" fill="currentColor"><circle cx="3" cy="3" r="1.25"/><circle cx="9" cy="3" r="1.25"/><circle cx="3" cy="8" r="1.25"/><circle cx="9" cy="8" r="1.25"/><circle cx="3" cy="13" r="1.25"/><circle cx="9" cy="13" r="1.25"/></svg></span>
                </div>
              </TransitionGroup>
              <button v-for="group in overlapGroups[d.date] || []" :key="group.id" type="button" class="overlap-region"
                :style="itemStyle(group)" :aria-label="`${group.items.length} 节重叠课程，点击选择编辑`" @click="openItem(group.items[0])">
                <span class="overlap-count">{{ group.items.length }} 节重叠 · 选择</span>
                <span v-for="item in group.items" :key="item.id" class="course-bar has-overlap" :class="{ trial: item.type === 'trial' }" :style="paletteStyle(item.teacherId)">
                  <strong class="bar-name">{{ item.name }}</strong><span class="overlap-time">{{ item.startTime }}—{{ item.endTime }}</span>
                  <span v-if="item.substitution" class="substitution-label">{{ item.teacherName }} · 代课</span>
                  <span v-if="item.trialCount" class="trial-count">试听 {{ item.trialCount }} 人</span>
                </span>
              </button>
              <template v-if="drag.active && drag.target?.date === d.date">
                <div v-for="preview in dropPreviews" :key="preview.id" class="drop-preview" :style="itemStyle(preview)">
                  <strong>{{ preview.name }}</strong><span>{{ preview.startTime }}—{{ preview.endTime }}</span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!visibleItems.length" class="empty week-empty"><p>这两周暂无课程或试听安排</p><NButton type="primary" :disabled="!canCreateCourse" @click="openCreate">创建第一门课程</NButton></div>
    </template>

    <NModal v-model:show="showOverlap" preset="card" class="overlap-modal" title="选择要编辑的课程">
      <p class="overlap-note">这些课程的时间重叠，不能拖动。请选择一节课程查看或编辑。</p>
      <div class="overlap-options">
        <button v-for="item in overlapChoices" :key="item.id" type="button" :style="paletteStyle(item.teacherId)" @click="selectOverlapItem(item)">
          <strong>{{ item.name }}</strong><span>{{ item.date }} · {{ item.startTime }}—{{ item.endTime }}</span><span>{{ item.teacherName }} · {{ item.type === 'trial' ? '独立试听' : '正式课程' }}</span>
        </button>
      </div>
    </NModal>

    <NModal v-model:show="showDetail" preset="card" class="detail-modal" title="课次详情">
      <template v-if="selectedItem">
        <h2>{{ selectedItem.name }}</h2>
        <p>{{ selectedItem.date }} {{ selectedItem.startTime }}—{{ selectedItem.endTime }} · {{ selectedItem.teacherName }}</p>
        <p v-if="selectedItem.substitution" class="substitution-label">临时代课：{{ selectedItem.teacherName }} · 原老师：{{ selectedItem.originalTeacherName }}<span v-if="selectedItem.substitution.reason"> · {{ selectedItem.substitution.reason }}</span></p>
        <p v-if="selectedItem.hasConflict || selectedItem.outOfBounds" class="course-warning">{{ selectedItem.hasConflict ? '这节课与同一老师或共同学生的其他安排存在时间冲突。' : '' }}{{ selectedItem.outOfBounds ? '课程时间超出周排课显示范围。' : '' }}</p>
        <template v-if="selectedItem.type === 'course'">
          <div class="detail-section"><h3>课程资料</h3>
            <template v-if="canEdit(selectedItem) && !isPast(selectedItem)">
              <label>课程名称 <OfficeInput v-model.trim="courseEdit.name" class="detail-input" type="text" maxlength="200" /></label>
              <label>教室 <OfficeInput v-model.trim="courseEdit.classroom" class="detail-input" type="text" maxlength="100" /></label>
              <label>每次课时 <OfficeInput v-model.number="courseEdit.hoursPerClass" class="detail-input" type="number" min="0.5" max="999.5" step="0.5" /></label>
            </template>
            <p v-else>{{ selectedItem.classroom || '未设置教室' }} · 每次 {{ selectedItem.hoursPerClass ?? 1 }} 课时</p>
          </div>
          <div class="detail-section"><h3>正式课程学生 · {{ selectedItem.studentIds.length }} 人</h3>
            <p>{{ selectedItem.studentIds.map(studentName).join('、') || '暂无学生' }}</p>
          </div>
          <div class="detail-section"><h3>试听预约 · {{ relatedTrials.length }} 人</h3>
            <p v-if="!relatedTrials.length">本次暂无试听预约</p>
            <div v-for="booking in relatedTrials" :key="booking.id" class="trial-student">{{ booking.studentName }} <span>{{ booking.note }}</span></div>
          </div>
          <div v-if="canEdit(selectedItem) && !isPast(selectedItem)" class="detail-section">
            <h3>调整正式学生名单</h3>
            <NSelect v-model:value="rosterIds" :options="activeStudentOptions" multiple filterable placeholder="选择学生" />
            <NButton size="small" type="primary" :loading="savingRoster" @click="saveCourseDetails">保存课程资料与名单</NButton>
          </div>
        </template>
        <template v-else><div class="detail-section"><h3>试听学生</h3><p>{{ selectedItem.studentName }}</p><p>{{ selectedItem.note }}</p><NButton @click="router.push({ path: '/trial-bookings', query: { date: selectedItem.date } })">查看预约</NButton></div></template>
        <template v-if="selectedItem.type === 'course' && canEdit(selectedItem) && !isPast(selectedItem)">
          <div class="detail-footer"><NButton @click="showSubstitution = true">{{ selectedItem.substitution ? '更换代课老师' : '安排代课' }}</NButton><NButton v-if="selectedItem.substitution" @click="showCancelSubstitution = true">取消代课</NButton><NButton @click="router.push({ path: '/trial-bookings', query: { date: selectedItem.date } })">安排试听</NButton><NButton type="primary" @click="editSelected">修改日期与时间</NButton></div>
          <div class="detail-section"><h3>已安排的调课</h3>
            <p v-if="!adjustments.once.length && !adjustments.future.length">暂无调课记录</p>
            <div v-for="change in adjustments.once" :key="change.id" class="adjustment-row"><span>{{ change.linkedFutureId ? '永久跨周调课：' : '仅本次：' }}{{ change.original_date }} → {{ change.target_date }} {{ change.start_time }}{{ change.linkedFutureId ? '，此后每周按目标星期上课' : '' }}</span><NButton v-if="!isPast({ date: change.target_date, startTime: change.start_time }) && (!change.linkedFutureId || !isPast({ date: change.original_date, startTime: change.start_time }))" size="small" @click="pendingRemoval = { kind: 'once', id: change.id }">移除</NButton></div>
            <div v-for="change in visibleFutureAdjustments" :key="change.id" class="adjustment-row"><span>从 {{ change.effective_week_start }} 起 · 周{{ ['日','一','二','三','四','五','六','日'][change.weekday] }} {{ change.start_time }}</span><NButton v-if="change.effective_week_start > today" size="small" @click="pendingRemoval = { kind: 'future', id: change.id }">移除</NButton></div>
          </div>
        </template>
      </template>
    </NModal>

    <SubstitutionModal v-model:show="showSubstitution" :occurrence="selectedItem" :teachers="teachers" @saved="substitutionSaved" />
    <NModal v-model:show="showCancelSubstitution" preset="dialog" title="取消本次代课" positive-text="确认取消代课" negative-text="返回" :loading="cancellingSubstitution" @positive-click="removeSubstitution">
      这一次将恢复由 {{ selectedItem?.originalTeacherName }} 授课，代课记录仍会保留。
    </NModal>

    <NModal :show="!!pendingRemoval" preset="dialog" title="移除未发生的调课" positive-text="确认移除" negative-text="返回" :loading="removingAdjustment" @negative-click="pendingRemoval = null" @close="pendingRemoval = null" @positive-click="confirmRemoveAdjustment">
      {{ pendingRemoval?.kind === 'once' && adjustments.once.some(change => change.id === pendingRemoval.id && change.linkedFutureId) ? '这项永久跨周调课会整体移除，本次课程及以后每周都恢复原星期。' : '移除后将恢复上一版课表。' }}系统会重新检查冲突和试听预约。
    </NModal>
    <NModal v-model:show="showCreate" preset="card" class="detail-modal" title="创建课程">
      <div class="create-form">
        <label>课程名称 <OfficeInput v-model.trim="createForm.name" class="detail-input" type="text" placeholder="请输入课程名称" maxlength="200" /></label>
        <label>授课教师 <NSelect v-model:value="createForm.teacherId" :options="createTeacherOptions" filterable placeholder="选择教师" /></label>
        <label>开始排课 <NSelect v-model:value="createForm.startWeek" :options="createWeekOptions" /></label>
        <label>上课星期 <NSelect v-model:value="createForm.weekday" :options="weekdayOptions" /></label>
        <div class="move-times"><label>开始时间 <NSelect v-model:value="createForm.startTime" :options="timeOptions" /></label><label>结束时间 <NSelect v-model:value="createForm.endTime" :options="timeOptions" /></label></div>
        <label>教室 <OfficeInput v-model.trim="createForm.classroom" class="detail-input" type="text" placeholder="可选" maxlength="100" /></label>
        <label>每次课时 <OfficeInput v-model.number="createForm.hoursPerClass" class="detail-input" type="number" min="0.5" max="999.5" step="0.5" /></label>
        <label>上课学生 <NSelect v-model:value="createForm.studentIds" :options="activeStudentOptions" multiple filterable placeholder="搜索并选择学生" /></label>
      </div>
      <template #footer><div class="detail-footer"><NButton @click="showCreate = false">取消</NButton><NButton type="primary" :loading="savingCreate" @click="saveCreate">创建课程</NButton></div></template>
    </NModal>

    <NModal v-model:show="showMove" preset="card" class="move-modal" title="确认调课">
      <div v-if="move.item" class="move-body">
        <p class="move-course">{{ move.item.name }} · {{ move.item.teacherName }}</p>
        <p>原定：{{ move.item.date }} {{ move.item.startTime }}—{{ move.item.endTime }}</p>
        <label>新日期 <OfficeDatePicker v-model="move.targetDate" :min="moveMinDate" :max="moveMaxDate" @change="keepWithinWeek" /></label>
        <div class="move-times">
          <label>开始时间 <NSelect v-model:value="move.startTime" :options="timeOptions" @update:value="keepDuration" /></label>
          <label>结束时间 <strong class="end-time-preview">{{ move.endTime }}</strong></label>
        </div>
        <label>请选择调整范围（必选）</label>
        <NRadioGroup v-model:value="move.scope">
          <NSpace vertical><NRadio value="once">仅这一次，之后仍按原星期上课</NRadio><NRadio value="future">从这次起改为每周目标星期</NRadio></NSpace>
        </NRadioGroup>
        <p class="move-note">{{ describeMove(move.item, move.targetDate, move.startTime, move.endTime, move.scope) }}</p>
        <p class="move-note">预约中的试听学生需要先取消或重新安排，才能调整该课次。</p>
        <p v-if="isPast(move.item)" class="course-warning">这节课已开始，不能再调课。</p>
      </div>
      <template #footer><div class="detail-footer"><NButton @click="showMove = false">返回</NButton><NButton type="primary" :disabled="!move.scope || (move.item && isPast(move.item))" :loading="savingMove" @click="saveMove">确认调课</NButton></div></template>
    </NModal>

    <NModal v-model:show="showDayMove" preset="card" class="move-modal" title="整天调课确认">
      <div class="move-body">
        <p>把 {{ dayMove.sourceDate }} 的 {{ dayMoveCourses.length }} 节正式课程整体移到新日期，保留每节课的原开始时间和时长。</p>
        <div class="day-move-list"><div v-for="item in dayMoveCourses" :key="item.id">{{ item.startTime }}—{{ item.endTime }} · {{ item.name }} · {{ item.teacherName }}</div></div>
        <label>新日期 <OfficeDatePicker v-model="dayMove.targetDate" :min="moveMinDate" :max="moveMaxDate" /></label>
        <label>请选择整批调整范围（必选）</label>
        <NRadioGroup v-model:value="dayMove.scope"><NSpace vertical><NRadio value="once">仅这一次，后续仍按原星期上课</NRadio><NRadio value="future">从这次起，每周改到目标星期</NRadio></NSpace></NRadioGroup>
        <p class="move-note">{{ describeDayMove(dayMove.sourceDate, dayMove.targetDate, dayMove.scope, dayMoveCourses) }}</p>
        <p class="move-note">若任一课程与现有课程或试听冲突，整批不会保存。独立试听预约不会自动移动。</p>
        <p v-if="hasPastDayCourse" class="course-warning">本日有课程已开始，不能整天调课。</p>
      </div>
      <template #footer><div class="detail-footer"><NButton @click="showDayMove = false">返回</NButton><NButton type="primary" :disabled="!dayMove.scope || hasPastDayCourse" :loading="savingDayMove" @click="saveDayMove">确认整体调课</NButton></div></template>
    </NModal>

    <Teleport to="body"><div v-if="drag.active" class="drag-ghost" :style="{ left: `${Math.min(drag.x + 12, viewportWidth - 250)}px`, top: `${Math.max(8, drag.y - 64)}px`, ...paletteStyle(drag.item?.teacherId) }">{{ drag.label || drag.item?.name }}<br />{{ drag.preview || '选择时段' }}</div></Teleport>
  </section>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { teacherStyle } from '../utils/teacherColors.js'
import { groupScheduleItems } from '../utils/scheduleLayout.js'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { NButton, NModal, NRadio, NRadioGroup, NSelect, NSpace } from 'naive-ui'
import { getCourseOccurrences, getTrialBookings, getStudents, getTeachers, addCourse, rescheduleCourse, rescheduleCourseDay, updateCourse, getScheduleAdjustments, removeScheduleAdjustment, cancelSubstitution } from '../utils/storage.js'
import SubstitutionModal from '../components/SubstitutionModal.vue'
import { useAuthStore } from '../stores/auth.js'
import { useToast } from '../composables/useToast.js'

const SLOT_PX = 24
const START_MIN = 450
const END_MIN = 1350

const auth = useAuthStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const adjustments = ref({ once: [], future: [] })
const visibleFutureAdjustments = computed(() => adjustments.value.future.filter(v => !adjustments.value.once.some(c => c.linkedFutureId === v.id)))
const pendingRemoval = ref(null)
const removingAdjustment = ref(false)
const today = ref(localDate(new Date()))
const nowTick = ref(Date.now())
const weekOffset = ref(0)
const selectedDay = ref(today.value)
const teacherFilter = ref('all')
const occurrences = ref([])
const bookings = ref([])
const students = ref([])
const teachers = ref([])
const loading = ref(true)
const referenceLoading = ref(true)
const loadError = ref(false)
const referenceError = ref(false)
const showDetail = ref(false)
let detailRequest = 0
const selectedItem = ref(null)
const showSubstitution = ref(false)
const showCancelSubstitution = ref(false)
const cancellingSubstitution = ref(false)
const showOverlap = ref(false)
const overlapChoices = ref([])
const viewportWidth = ref(window.innerWidth)
const rosterIds = ref([])
const savingRoster = ref(false)
const courseEdit = ref({ name: '', classroom: '', hoursPerClass: 1 })
const showCreate = ref(false)
let createRequest = 0
const savingCreate = ref(false)
const createForm = ref({ name: '', teacherId: null, startWeek: '', weekday: 1, startTime: '09:00', endTime: '11:00', classroom: '', hoursPerClass: 1, studentIds: [] })
const showMove = ref(false)
let moveRequest = 0
const savingMove = ref(false)
const move = ref({ item: null, targetDate: '', startTime: '', endTime: '', scope: null })
const showDayMove = ref(false)
let dayMoveRequest = 0
const savingDayMove = ref(false)
const dayMove = ref({ sourceDate: '', targetDate: '', scope: null })
const drag = ref({ item: null, active: false, x: 0, y: 0, preview: '', target: null })
let pointerOrigin = null
let holdTimer = null
let suppressClick = false

function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function atNoon(date) { return new Date(`${date}T12:00:00`) }
function addDays(date, count) { const d = atNoon(date); d.setDate(d.getDate() + count); return localDate(d) }
function blockStart() { const d = atNoon(today.value); d.setDate(d.getDate() - d.getDay() + weekOffset.value * 14); return localDate(d) }
const weekStart = computed(blockStart)
const weekGroups = computed(() => [0, 1].map(index => {
  const start = addDays(weekStart.value, index * 7)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i); const d = atNoon(date)
    return { date, day: d.getDate(), month: d.getMonth() + 1, label: ['周日','周一','周二','周三','周四','周五','周六'][i] }
  })
  return { start, end: days[6].date, days }
}))
const weekDays = computed(() => weekGroups.value.flatMap(week => week.days))
const weekLabel = computed(() => `${weekGroups.value[0].start} — ${weekGroups.value[1].end}`)
const createWeekOptions = computed(() => weekGroups.value.map((week, index) => ({ label: `第 ${index + 1} 周 · ${week.start} — ${week.end}`, value: week.start, disabled: week.end < today.value })))
function displayedWeek(date) { return weekGroups.value.find(week => date >= week.start && date <= week.end) }
const moveMinDate = computed(() => [today.value, weekGroups.value[0].start].sort().at(-1))
const moveMaxDate = computed(() => weekGroups.value[1].end)
const dayMoveCourses = computed(() => (itemsByDate.value[dayMove.value.sourceDate] || []).filter(item => canEdit(item)))
const hasPastDayCourse = computed(() => dayMoveCourses.value.some(isPast))
const rulerTimes = Array.from({ length: 31 }, (_, i) => formatMinutes(START_MIN + i * 30))
const timeOptions = rulerTimes.map(time => ({ label: time, value: time }))
const weekdayOptions = [1, 2, 3, 4, 5, 6, 7].map((value, index) => ({ value, label: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'][index] }))
const activeStudentOptions = computed(() => students.value.filter(s => s.status === 'active' && s.enrollmentStage !== 'pending').map(s => ({ label: s.name, value: s.id })))
const createTeacherOptions = computed(() => teachers.value.filter(t => t.status === 'active' && (auth.isAdmin || t.id === auth.teacherId)).map(t => ({ label: t.name, value: t.id })))
const canCreateCourse = computed(() => createTeacherOptions.value.length > 0 && activeStudentOptions.value.length > 0)
const createPrerequisite = computed(() => {
  if (!createTeacherOptions.value.length && !activeStudentOptions.value.length) return '创建课程前，请先添加或恢复教师，并录入已报名且在读的学生。'
  return !createTeacherOptions.value.length ? '创建课程前，请先添加或恢复教师。' : '创建课程前，请先录入已报名且在读的学生。'
})
function formatMinutes(n) { return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` }
function minutes(time) { return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) }
function studentName(id) { return students.value.find(s => s.id === id)?.name || '已归档学生' }
function paletteStyle(id) { return teacherStyle(id, teachers.value) }
function isPast(item) { return new Date(`${item.date}T${item.startTime}:00`).getTime() <= Math.max(nowTick.value, Date.now()) }
function canEdit(item) { return item.type === 'course' && (auth.isAdmin || !!auth.teacherId && auth.teacherId === (item.ownerTeacherId || item.teacherId)) }
function hasScheduleOverlap(item) {
  return allItems.value.some(other => other.id !== item.id && other.date === item.date && other.startTime < item.endTime && item.startTime < other.endTime)
}
function canDrag(item) { return canEdit(item) && !isPast(item) && !hasScheduleOverlap(item) }
function canMoveWholeDay(date) {
  const courses = (itemsByDate.value[date] || []).filter(canEdit)
  return courses.length > 0 && courses.every(canDrag)
}
function weekdayName(date) { return ['日', '一', '二', '三', '四', '五', '六'][atNoon(date).getDay()] }
function describeMove(item, targetDate, startTime, endTime, scope) {
  if (!scope) return '请选择“仅这一次”或“此后每周”，确认后才会保存。'
  const sourceDate = item.date
  const originalDate = item.originalDate || sourceDate
  const nextOriginal = addDays(originalDate, 7)
  const followingOriginal = addDays(originalDate, 14)
  if (targetDate === sourceDate && startTime === item.startTime) return '新日期和时间与原安排相同，请先调整后保存。'
  if (targetDate === sourceDate && scope === 'once') return `仅将 ${sourceDate} 本次上课时间改为 ${startTime}—${endTime}；${nextOriginal}、${followingOriginal} 及以后仍按原时段上课。`
  if (targetDate === sourceDate) return `从 ${sourceDate} 起每周${weekdayName(targetDate)}调整为 ${startTime}—${endTime}（下次 ${addDays(targetDate, 7)}）；此前课次保持原样。`
  if (scope === 'once') return `仅将 ${sourceDate} 这节课移到 ${targetDate}；${nextOriginal}、${followingOriginal} 及以后仍按原星期上课。`
  return `将 ${sourceDate} 这节课移到 ${targetDate}；此后每周${weekdayName(targetDate)}上课（下次 ${addDays(targetDate, 7)}）。${nextOriginal}、${followingOriginal} 及以后原星期不再上课。`
}
function describeDayMove(sourceDate, targetDate, scope, courses) {
  if (!scope) return '请选择“仅这一次”或“此后每周”，确认后才会整批保存。'
  const sameOriginalDay = courses.every(item => item.originalDate === sourceDate)
  if (!sameOriginalDay) return scope === 'once'
    ? `${sourceDate} 的课仅移到 ${targetDate}；后续各课程仍按原来的固定星期上课。`
    : `${sourceDate} 的课移到 ${targetDate}；此后各课程每周${weekdayName(targetDate)}上课，原来的固定星期不再上课。`
  const nextOriginal = addDays(sourceDate, 7)
  const followingOriginal = addDays(sourceDate, 14)
  return scope === 'once'
    ? `${sourceDate} 的课仅移到 ${targetDate}，本日不再上课；下一个原星期照常上课（${nextOriginal}），${followingOriginal} 及以后也保持原安排。`
    : `${sourceDate} 的课移到 ${targetDate}，本日不再上课；此后每周${weekdayName(targetDate)}上课（下次 ${addDays(targetDate, 7)}），原星期不再上课（${nextOriginal}、${followingOriginal} 及以后）。`
}

const allItems = computed(() => {
  const courses = occurrences.value.map(o => ({ ...o, type: 'course' }))
  const trials = bookings.value.filter(b => b.status === 'active' && !b.courseId).map(b => ({
    ...b, id: `trial:${b.id}`, type: 'trial', name: '独立试听', studentName: b.studentName
  }))
  return [...courses, ...trials]
})
const visibleItems = computed(() => allItems.value.filter(item => teacherFilter.value === 'all' || item.teacherId === auth.teacherId || item.ownerTeacherId === auth.teacherId))
const teacherLegend = computed(() => {
  const byId = new Map()
  for (const item of visibleItems.value) if (item.teacherId) byId.set(item.teacherId, item.teacherName || teachers.value.find(t => t.id === item.teacherId)?.name || '教师')
  return [...byId].map(([id, name]) => ({ id, name }))
})
const itemsByDate = computed(() => {
  const days = Object.fromEntries(weekDays.value.map(d => [d.date, []]))
  for (const item of visibleItems.value) if (days[item.date]) days[item.date].push({ ...item })
  for (const items of Object.values(days)) {
    items.sort((a, b) => a.startTime.localeCompare(b.startTime))
    for (const item of items) item.outOfBounds = minutes(item.startTime) < START_MIN || minutes(item.endTime) > END_MIN
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]
      if (a.endTime <= b.startTime || b.endTime <= a.startTime) continue
      a.hasOverlap = true; b.hasOverlap = true
      const sharedStudent = a.type === 'course' && b.type === 'course' && a.studentIds.some(id => b.studentIds.includes(id))
      if (a.teacherId === b.teacherId || sharedStudent) { a.hasConflict = true; b.hasConflict = true }
    }
  }
  return days
})
const overlapGroups = computed(() => Object.fromEntries(Object.entries(itemsByDate.value)
  .map(([date, items]) => [date, groupScheduleItems(items).filter(group => group.items.length > 1)])))
const dropPreviews = computed(() => {
  if (!drag.value.target) return []
  if (drag.value.item) return [{ ...drag.value.item, ...drag.value.target }]
  return (itemsByDate.value[pointerOrigin?.sourceDate] || []).filter(canEdit)
})
const relatedTrials = computed(() => selectedItem.value?.type === 'course'
  ? bookings.value.filter(b => b.status === 'active' && b.courseId === selectedItem.value.courseId && b.occurrenceDate === selectedItem.value.originalDate)
  : [])
function itemStyle(item) {
  const top = ((Math.min(END_MIN - 30, Math.max(START_MIN, minutes(item.startTime))) - START_MIN) / 30) * SLOT_PX
  const height = Math.max(SLOT_PX, ((Math.min(END_MIN, minutes(item.endTime)) - Math.max(START_MIN, minutes(item.startTime))) / 30) * SLOT_PX)
  return { top: `${top}px`, height: `${height}px`, left: '3px', width: 'calc(100% - 6px)' }
}

let weekRequest = 0
let loadErrorToast = null
async function loadWeek() {
  const request = ++weekRequest
  loading.value = true
  loadError.value = false
  try {
    const start = weekDays.value[0].date; const end = weekDays.value[13].date
    const [nextOccurrences, nextBookings] = await Promise.all([getCourseOccurrences(start, end), getTrialBookings({ start, end })])
    if (request === weekRequest) { occurrences.value = nextOccurrences; bookings.value = nextBookings; return true }
  } catch (error) {
    if (request === weekRequest) {
      loadError.value = true; occurrences.value = []; bookings.value = []
      loadErrorToast = toast.error(error.message || '周排课加载失败')
      return false
    }
  }
  finally { if (request === weekRequest) loading.value = false }
}
async function refreshWeekAfterWrite(action) {
  if (await loadWeek() === false) {
    toast.clearError(loadErrorToast)
    loadErrorToast = null
    toast.warning(`${action}，课表刷新失败，请重试`)
  }
}
async function loadReferenceData() {
  referenceLoading.value = true
  referenceError.value = false
  try {
    const [nextStudents, nextTeachers] = await Promise.all([getStudents(), getTeachers()])
    students.value = nextStudents || []
    teachers.value = nextTeachers || []
  } catch (error) { referenceError.value = true; loadErrorToast = toast.error(error.message || '教师和学生资料加载失败') }
  finally { referenceLoading.value = false }
}
async function retryPage() {
  await Promise.all([loadWeek(), loadReferenceData()])
  if (!loading.value && !referenceLoading.value && !loadError.value && !referenceError.value) {
    toast.clearError(loadErrorToast)
    loadErrorToast = null
  }
}
function changeWeek(delta) { refreshToday(); weekOffset.value += delta; selectedDay.value = weekDays.value[0].date }
function goToday() { refreshToday(); weekOffset.value = 0; selectedDay.value = today.value }
function applyLinkedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || localDate(atNoon(value)) !== value) return
  const linkedWeek = atNoon(value)
  linkedWeek.setDate(linkedWeek.getDate() - linkedWeek.getDay())
  const currentSunday = addDays(today.value, -atNoon(today.value).getDay())
  const weeksAway = Math.round((linkedWeek - atNoon(currentSunday)) / 604800000)
  weekOffset.value = Math.floor(weeksAway / 2)
  selectedDay.value = value
}
applyLinkedDate(route.query.date)
watch(() => route.query.date, applyLinkedDate)
watch(weekStart, loadWeek)
async function openItem(item, chosen = false) {
  if (suppressClick) return
  if (item.hasOverlap && !chosen) {
    overlapChoices.value = overlapGroups.value[item.date]?.find(group => group.items.some(entry => entry.id === item.id))?.items || [item]
    showOverlap.value = true
    return
  }
  const request = ++detailRequest
  selectedItem.value = item
  rosterIds.value = [...(item.studentIds || [])]
  courseEdit.value = { name: item.name, classroom: item.classroom || '', hoursPerClass: item.hoursPerClass ?? 1 }
  showDetail.value = true
  adjustments.value = { once: [], future: [] }
  if (item.type === 'course' && canEdit(item)) {
    try {
      const nextAdjustments = await getScheduleAdjustments(item.courseId)
      if (request === detailRequest && showDetail.value) adjustments.value = nextAdjustments
    } catch (error) { if (request === detailRequest && showDetail.value) toast.error(error.message) }
  }
}
function selectOverlapItem(item) { showOverlap.value = false; openItem(item, true) }
async function substitutionSaved() {
  showDetail.value = false
  toast.success('已安排本次代课，后续周次照常上课')
  await refreshWeekAfterWrite('代课已保存')
}
async function removeSubstitution() {
  if (cancellingSubstitution.value || !selectedItem.value || !canEdit(selectedItem.value)) return false
  cancellingSubstitution.value = true
  try {
    await cancelSubstitution(selectedItem.value.courseId, selectedItem.value.originalDate)
    showDetail.value = false; showCancelSubstitution.value = false
    toast.success('已取消本次代课')
    await refreshWeekAfterWrite('代课已取消')
    return true
  } catch (error) { toast.error(error.message); return false }
  finally { cancellingSubstitution.value = false }
}
async function saveCourseDetails() {
  if (savingRoster.value) return
  if (!selectedItem.value || !canEdit(selectedItem.value) || isPast(selectedItem.value)) return
  if (!courseEdit.value.name?.trim()) return toast.error('请输入课程名称')
  if (!Number.isFinite(Number(courseEdit.value.hoursPerClass)) || Number(courseEdit.value.hoursPerClass) < 0.5 || Number(courseEdit.value.hoursPerClass) > 999.5 || Number(courseEdit.value.hoursPerClass) % 0.5 !== 0) return toast.error('每次课时须为 0.5 至 999.5 的半课时倍数')
  if (!rosterIds.value.length) return toast.error('请至少选择一名正式学生')
  const request = detailRequest
  const courseId = selectedItem.value.courseId
  const changes = { ...courseEdit.value, studentIds: [...rosterIds.value] }
  savingRoster.value = true
  try {
    await updateCourse(courseId, changes)
    toast.success('课程资料已保存')
    await refreshWeekAfterWrite('课程资料已保存')
    if (request === detailRequest && showDetail.value) showDetail.value = false
  } catch (error) { toast.error(error.message || '保存课程资料失败') }
  finally { savingRoster.value = false }
}
function openCreate(startWeek = null) {
  if (!canCreateCourse.value) return toast.error(createPrerequisite.value)
  if (typeof startWeek !== 'string') startWeek = displayedWeek(selectedDay.value)?.start || weekGroups.value[0].start
  if (weekGroups.value.find(week => week.start === startWeek)?.end < today.value) {
    goToday()
    startWeek = weekGroups.value[0].start
  }
  let day = displayedWeek(selectedDay.value)?.start === startWeek ? atNoon(selectedDay.value).getDay() : 1
  if (startWeek === displayedWeek(today.value)?.start && selectedDay.value < today.value) day = atNoon(today.value).getDay()
  createRequest++
  createForm.value = { name: '', teacherId: auth.teacherId || createTeacherOptions.value[0]?.value || null,
    startWeek, weekday: day || 7, startTime: '09:00', endTime: '11:00', classroom: '', hoursPerClass: 1, studentIds: [] }
  showCreate.value = true
}
function openCreateOnDay(date) { selectedDay.value = date; openCreate(displayedWeek(date)?.start) }
async function saveCreate() {
  if (savingCreate.value) return
  const form = createForm.value
  const request = createRequest
  if (!form.name?.trim()) return toast.error('请输入课程名称')
  if (!form.teacherId) return toast.error('请选择授课教师')
  if (!form.studentIds?.length) return toast.error('请至少选择一名学生')
  if (!form.startTime || !form.endTime || form.startTime >= form.endTime) return toast.error('结束时间必须晚于开始时间')
  if (!Number.isFinite(Number(form.hoursPerClass)) || Number(form.hoursPerClass) < 0.5 || Number(form.hoursPerClass) > 999.5 || Number(form.hoursPerClass) % 0.5 !== 0) return toast.error('每次课时须为 0.5 至 999.5 的半课时倍数')
  if (!weekGroups.value.some(week => week.start === form.startWeek && week.end >= today.value)) return toast.error('请选择当前或未来的一周')
  savingCreate.value = true
  try {
    await addCourse({ ...form, effectiveStartDate: form.startWeek > today.value ? form.startWeek : undefined })
    if (request === createRequest) showCreate.value = false
    toast.success('课程已创建')
    await refreshWeekAfterWrite('课程已创建')
  }
  catch (error) { toast.error(error.message || '创建课程失败') }
  finally { savingCreate.value = false }
}
function openMove(item, targetDate = item.date, startTime = item.startTime, endTime = item.endTime) {
  if (!canEdit(item) || isPast(item)) return
  moveRequest++
  move.value = { item, targetDate, startTime, endTime, scope: null }
  showDetail.value = false
  showMove.value = true
}
function editSelected() { openMove(selectedItem.value) }
function keepDuration(value) {
  if (!move.value.item) return
  const length = minutes(move.value.item.endTime) - minutes(move.value.item.startTime)
  move.value.endTime = formatMinutes(minutes(value) + length)
}
function keepWithinWeek() {
  if (move.value.targetDate < moveMinDate.value || move.value.targetDate > moveMaxDate.value) {
    move.value.targetDate = move.value.item.date; toast.error('仅可在当前显示的两周内调整')
  }
}
async function saveMove() {
  const m = move.value
  const request = moveRequest
  if (savingMove.value) return
  if (m.item && isPast(m.item)) return toast.error('这节课已开始，不能再调课')
  if (!['once', 'future'].includes(m.scope)) return toast.error('请先选择调课范围')
  if (!m.item || !m.targetDate || !m.startTime || !m.endTime || m.startTime >= m.endTime ||
      minutes(m.endTime) - minutes(m.startTime) !== minutes(m.item.endTime) - minutes(m.item.startTime)) return toast.error('请保持原课程时长')
  if (m.targetDate < moveMinDate.value || m.targetDate > moveMaxDate.value) return toast.error('仅可在当前显示的两周内调整')
  if (m.scope === 'future' && displayedWeek(m.targetDate)?.start !== displayedWeek(m.item.date)?.start &&
      displayedWeek(m.targetDate)?.start !== addDays(displayedWeek(m.item.date)?.start, 7)) return toast.error('跨周永久调课只可从下一周开始')
  if (minutes(m.startTime) < START_MIN || minutes(m.endTime) > END_MIN) return toast.error('时间须在07:30—22:30之间')
  if (new Date(`${m.targetDate}T${m.startTime}:00`) < new Date()) return toast.error('不能把课程调到过去的时段')
  if (m.targetDate === m.item.date && m.startTime === m.item.startTime && m.endTime === m.item.endTime) return toast.error('调课日期和时间未改变')
  savingMove.value = true
  try {
    await rescheduleCourse(m.item.courseId, { originalDate: m.item.originalDate, targetDate: m.targetDate,
      startTime: m.startTime, endTime: m.endTime, scope: m.scope })
    if (request === moveRequest) showMove.value = false
    toast.success('调课已保存'); await refreshWeekAfterWrite('调课已保存')
  } catch (error) { toast.error(error.message || '调课失败，课表未改变') }
  finally { savingMove.value = false }
}

function openDayMove(sourceDate, targetDate = sourceDate) {
  const courses = (itemsByDate.value[sourceDate] || []).filter(item => canEdit(item))
  if (!courses.length) return toast.error('这一天没有可调整的正式课程')
  if (courses.some(hasScheduleOverlap)) return toast.error('本日有重叠课程，请先逐节选择处理')
  if (courses.some(isPast)) return toast.error('本日有课程已开始，不能整天调课')
  dayMoveRequest++
  dayMove.value = { sourceDate, targetDate, scope: null }
  showDayMove.value = true
}
function clickDayMove(sourceDate) { if (!suppressClick) openDayMove(sourceDate) }
async function saveDayMove() {
  const { sourceDate, targetDate, scope } = dayMove.value
  const request = dayMoveRequest
  if (hasPastDayCourse.value) return toast.error('本日有课程已开始，不能整天调课')
  if (dayMoveCourses.value.some(hasScheduleOverlap)) return toast.error('本日有重叠课程，请先逐节选择处理')
  if (!['once', 'future'].includes(scope)) return toast.error('请先选择整批调课范围')
  if (!sourceDate || !targetDate || sourceDate === targetDate) return toast.error('请选择其他日期')
  if (targetDate < moveMinDate.value || targetDate > moveMaxDate.value) return toast.error('仅可在当前显示的两周内调整')
  if (scope === 'future' && displayedWeek(targetDate)?.start !== displayedWeek(sourceDate)?.start &&
      displayedWeek(targetDate)?.start !== addDays(displayedWeek(sourceDate)?.start, 7)) return toast.error('跨周永久调课只可从下一周开始')
  if (savingDayMove.value) return
  savingDayMove.value = true
  try {
    const result = await rescheduleCourseDay({ sourceDate, targetDate, scope })
    if (request === dayMoveRequest) showDayMove.value = false
    toast.success(`已整体调整 ${result.count} 节课程`)
    await refreshWeekAfterWrite('整天调课已保存')
  } catch (error) { toast.error(error.message || '整天调课失败，课表未改变') }
  finally { savingDayMove.value = false }
}

function startPointer(event, item) {
  if (!canDrag(item) || isPhoneLayout() || (event.pointerType === 'mouse' && event.button !== 0)) return
  if (event.pointerType === 'mouse' && !event.target.closest('.drag-handle')) return
  const touch = event.pointerType !== 'mouse'
  pointerOrigin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, item, touch, ready: !touch, cancelled: false }
  drag.value = { item, active: false, x: event.clientX, y: event.clientY, preview: '', target: null }
  if (touch) holdTimer = setTimeout(() => { if (pointerOrigin) pointerOrigin.ready = true }, 280)
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', endPointer)
  window.addEventListener('pointercancel', endPointer)
}
function startDayPointer(event, sourceDate) {
  if (event.button !== 0 || isPhoneLayout() || sourceDate < today.value) return
  const courses = (itemsByDate.value[sourceDate] || []).filter(item => canEdit(item))
  if (!canMoveWholeDay(sourceDate)) return
  const touch = event.pointerType !== 'mouse'
  if (!touch) event.preventDefault()
  pointerOrigin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, sourceDate, ready: !touch, cancelled: false }
  drag.value = { item: null, active: false, x: event.clientX, y: event.clientY, preview: '', target: null, label: `${courses.length} 节课程` }
  if (touch) holdTimer = setTimeout(() => { if (pointerOrigin) pointerOrigin.ready = true }, 280)
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', endPointer)
  window.addEventListener('pointercancel', endPointer)
}
function isPhoneLayout() {
  return window.matchMedia('(max-width: 599px) and (max-device-width: 599px), (max-height: 599px) and (max-device-height: 599px) and (min-aspect-ratio: 17/10) and (pointer: coarse)').matches
}
function onPointerMove(event) {
  if (!pointerOrigin || event.pointerId !== pointerOrigin.pointerId || pointerOrigin.cancelled) return
  const distance = Math.hypot(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y)
  if (!pointerOrigin.ready && distance > 8) { cleanupPointer(); return }
  if (!pointerOrigin.ready || distance < 10) return
  drag.value.active = true
  viewportWidth.value = window.innerWidth
  drag.value.x = event.clientX; drag.value.y = event.clientY
  event.preventDefault()
  if (pointerOrigin.sourceDate) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-date]')
    const date = target?.dataset.date
    drag.value.target = date && date !== pointerOrigin.sourceDate && date >= today.value && displayedWeek(date) ? { date } : null
    drag.value.preview = drag.value.target ? `整体移至 ${date}，保持原时段` : '拖到另一日期'
    return
  }
  const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest('.day-lane')
  if (!lane) { drag.value.target = null; drag.value.preview = '移至两周内的日期'; return }
  const slot = Math.floor((event.clientY - lane.getBoundingClientRect().top) / SLOT_PX)
  const startMinute = START_MIN + slot * 30
  const duration = minutes(pointerOrigin.item.endTime) - minutes(pointerOrigin.item.startTime)
  const date = lane.dataset.date
  if (slot < 0 || startMinute + duration > END_MIN || new Date(`${date}T${formatMinutes(startMinute)}:00`) < new Date()) {
    drag.value.target = null; drag.value.preview = '此时段不可用'; return
  }
  drag.value.target = { date, startTime: formatMinutes(startMinute), endTime: formatMinutes(startMinute + duration) }
  drag.value.preview = `${date} ${drag.value.target.startTime}—${drag.value.target.endTime}`
}
function endPointer(event) {
  if (!pointerOrigin || event.pointerId !== pointerOrigin.pointerId) return
  if (event?.type === 'pointercancel') { cleanupPointer(); return }
  if (drag.value.active || pointerOrigin.cancelled) {
    suppressClick = true
    setTimeout(() => { suppressClick = false }, 120)
    if (drag.value.active && drag.value.target) {
      if (pointerOrigin.sourceDate) openDayMove(pointerOrigin.sourceDate, drag.value.target.date)
      else openMove(pointerOrigin.item, drag.value.target.date, drag.value.target.startTime, drag.value.target.endTime)
    }
  }
  cleanupPointer()
}
function cleanupPointer() {
  clearTimeout(holdTimer); pointerOrigin = null
  drag.value = { item: null, active: false, x: 0, y: 0, preview: '', target: null }
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endPointer)
  window.removeEventListener('pointercancel', endPointer)
}
function refreshToday() {
  nowTick.value = Date.now()
  const current = localDate(new Date())
  if (current !== today.value) today.value = current
}
function refreshVisible() {
  if (document.visibilityState !== 'visible') return
  const previousWeekStart = weekStart.value
  refreshToday()
  if (weekStart.value === previousWeekStart) loadWeek()
  scheduleMidnightRefresh()
  scheduleSlotRefresh()
}
let midnightTimer
let slotTimer
function scheduleMidnightRefresh() {
  clearTimeout(midnightTimer)
  const now = new Date()
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  midnightTimer = setTimeout(() => { refreshToday(); scheduleMidnightRefresh() }, nextMidnight - now + 50)
}
function scheduleSlotRefresh() {
  clearTimeout(slotTimer)
  const now = new Date()
  const next = new Date(now)
  next.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0)
  slotTimer = setTimeout(() => { refreshToday(); scheduleSlotRefresh() }, next - now + 50)
}
onMounted(() => { retryPage(); scheduleMidnightRefresh(); scheduleSlotRefresh(); document.addEventListener('visibilitychange', refreshVisible) })
onUnmounted(() => { weekRequest++; clearTimeout(midnightTimer); clearTimeout(slotTimer); cleanupPointer(); document.removeEventListener('visibilitychange', refreshVisible) })
async function confirmRemoveAdjustment() {
  if (removingAdjustment.value || !pendingRemoval.value || !selectedItem.value) return false
  const request = detailRequest
  const pending = pendingRemoval.value
  const courseId = selectedItem.value.courseId
  removingAdjustment.value = true
  try {
    await removeScheduleAdjustment(courseId, pending.kind, pending.id)
    if (pendingRemoval.value === pending) pendingRemoval.value = null
    if (request === detailRequest) showDetail.value = false
    toast.success('调课已移除')
    await refreshWeekAfterWrite('调课已移除')
  }
  catch (error) { toast.error(error.message); return false }
  finally { removingAdjustment.value = false }
}
</script>

<style scoped>
.weekly-page { max-width: 1400px; margin: auto; }
.weekly-head { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 20px; }
.weekly-head h1 { font-size: 32px; font-weight: 700; margin-bottom: 4px; } .weekly-head p, .hint { color: var(--color-text-secondary); font-size: 14px; }
.head-actions { display: flex; gap: 7px; flex-wrap: wrap; }
.filter-strip { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 10px; }
.create-prerequisite { margin: -2px 0 10px; color: var(--color-text-secondary); font-size: 12px; }
.hint { margin-left: auto; }
.phone-hint { display: none; }
.teacher-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 0 0 12px; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-secondary); font-size: 12px; }
.legend-item i { display: inline-block; width: 15px; height: 15px; border-radius: 5px; background: var(--c-bg); border: 1px solid var(--c-border); }
.combined-board { min-width: 0; }
.combined-week-head { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 0 8px 42px; color: var(--color-text-secondary); font-size: 12px; font-weight: 650; }
.combined-week-head span { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 8px; }
.combined-week-label { font-weight: inherit; }
.combined-week-head span + span { border-left: 2px solid var(--color-primary); }
.week-board.combined-grid { grid-template-columns: 42px repeat(14, minmax(0, 1fr)); grid-template-rows: 64px 720px; }
.combined-grid .swimlane { grid-column: 2 / 16; }
.combined-grid .next-week { border-left: 2px solid var(--color-primary); }
.combined-grid .day-head { position: relative; }
.day-drag-handle { display: block; margin: 2px auto 0; padding: 0 3px; border: 1px solid var(--color-border); border-radius: 4px; background: white; color: var(--color-primary); font-size: 9px; line-height: 16px; cursor: grab; touch-action: none; }
.day-drag-handle:active { cursor: grabbing; }
.day-drag-handle:hover { background: var(--color-selected); }
.board-scroll { overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: white; box-shadow: var(--shadow-sm); }
.week-board { display: grid; grid-template-columns: 42px repeat(7, minmax(0, 1fr)); grid-template-rows: 48px 720px; min-width: 0; }
.corner, .day-head { grid-row: 1; border-bottom: 1px solid var(--color-border); text-align: center; background: rgba(38, 56, 77, .018); }
.corner { grid-column: 1; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); font-size: 12px; }
.day-head { padding: 5px 1px; border-left: 1px solid var(--color-border); color: var(--color-text); }
.day-head.active { background: linear-gradient(180deg, rgba(65,120,185,.10), rgba(65,120,185,.035)); }
.day-name { font-size: 11px; font-weight: 600; line-height: 1.25; }
.day-date { display: inline-block; margin-top: 2px; padding: 1px 4px; border: 1px solid var(--color-border); border-radius: 10px; background: white; font-size: 10px; }
.day-head.active .day-date { border-color: var(--color-primary); background: var(--color-primary); color: white; }
.time-ruler { grid-column: 1; grid-row: 2; position: relative; z-index: 2; height: 720px; border-right: 1px solid var(--color-border); background: rgba(38,56,77,.018); }
.time-cell { position: absolute; right: 3px; font-size: 10px; color: var(--color-text-secondary); line-height: 1; transform: translateY(-5px); }
.swimlane { grid-column: 2 / 9; grid-row: 2; align-self: start; position: relative; z-index: 0; pointer-events: none; border-bottom: 2px dashed rgba(38,56,77,.065); }
.swimlane span { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); text-align: right; font-size: 10px; font-weight: 600; line-height: 1.3; letter-spacing: .5px; color: rgba(38,56,77,.26); }
.swimlane-morning { height: 216px; background: linear-gradient(180deg, rgba(151,196,233,.10), rgba(151,196,233,.035)); }
.swimlane-afternoon { height: 288px; margin-top: 216px; background: linear-gradient(180deg, rgba(245,192,169,.09), rgba(245,192,169,.025)); }
.swimlane-evening { height: 216px; margin-top: 504px; background: linear-gradient(180deg, rgba(198,184,231,.10), rgba(198,184,231,.03)); border-bottom: 0; }
.day-lane { grid-row: 2; height: 720px; position: relative; z-index: 1; border-left: 1px solid var(--color-border); background: repeating-linear-gradient(to bottom, transparent 0 23px, rgba(38,56,77,.055) 23px 24px); }
.course-bar { position: absolute; z-index: 2; display: flex; flex-direction: column; gap: 0; padding: 3px 3px; overflow: hidden; border: 1px solid var(--c-border); border-left: 3px solid var(--c-border); border-radius: 6px; background: var(--c-bg); color: var(--c-fg); box-shadow: 0 2px 8px rgba(38,56,77,.07); cursor: pointer; user-select: none; touch-action: manipulation; animation: barIn .5s cubic-bezier(.34,1.56,.64,1) both; animation-delay: calc(var(--idx) * 35ms + 100ms); transition: transform .3s cubic-bezier(.25,.1,.25,1), box-shadow .3s cubic-bezier(.25,.1,.25,1); }
.course-bar.draggable { padding-right: 21px; }
.course-bar.draggable { touch-action: none; }
.drag-handle { position: absolute; top: 2px; right: 2px; width: 16px; height: 18px; display: grid; place-items: center; border-radius: 4px; background: rgba(255,255,255,.7); color: var(--c-fg); cursor: grab; opacity: .8; touch-action: none; }
.drag-handle:hover { opacity: 1; background: rgba(255,255,255,.95); }
.drag-handle:active { cursor: grabbing; }
@keyframes barIn { from { opacity: 0; transform: translateY(10px) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
.course-bar:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 8px 24px rgba(38,56,77,.14); z-index: 5; }
.course-bar:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; z-index: 6; }
.course-bar:active { transform: translateY(0) scale(.99); }
.course-bar.trial { border-style: dashed; cursor: pointer; }
.course-bar.out-of-bounds { background: repeating-linear-gradient(45deg, var(--c-bg), var(--c-bg) 8px, rgba(179,79,80,.13) 8px, rgba(179,79,80,.13) 16px); border-color: var(--color-danger); }
.course-bar.out-of-bounds:not(.has-overlap) { border-style: solid; }
.course-bar.has-overlap { outline: 2px dashed var(--color-danger); outline-offset: -2px; }
.course-bar.readonly { cursor: pointer; }
.course-bar.dragging { animation: none; opacity: .45; }
.bar-top, .bar-bottom { display: flex; align-items: center; justify-content: space-between; gap: 3px; min-width: 0; }
.bar-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 700; line-height: 1.2; }
.bar-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; font-weight: 600; line-height: 1.2; }
.course-bar.parallel .bar-meta { font-size: 10px; }
.bar-bottom { margin-top: auto; font-size: 9px; line-height: 1.1; }
.bar-teacher { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-students { flex: none; padding: 0 4px; border-radius: 7px; background: rgba(255,255,255,.58); white-space: nowrap; }
.trial-count { flex: none; padding: 0 3px; border-radius: 4px; background: #fff4dd; color: #815618; font-size: 9px; font-weight: 700; line-height: 1.35; white-space: nowrap; }
.course-bar.compact { padding: 2px 4px; }
.course-bar.draggable.compact { padding-right: 21px; }
.course-bar.compact .bar-meta, .course-bar.compact .bar-bottom { display: none; }
.loading, .empty { padding: 55px 16px; text-align: center; color: var(--color-text-secondary); }
.detail-modal h2 { font-size: 21px; margin-bottom: 4px; }
.detail-modal p, .move-body p { color: var(--color-text-secondary); }
.detail-section { border-top: 1px solid var(--color-border); margin-top: 16px; padding-top: 14px; display: grid; gap: 8px; }
.detail-section label, .create-form label { display: grid; gap: 5px; color: var(--color-text-secondary); font-size: 13px; }
.detail-input { width: 100%; min-height: 36px; border: 1px solid var(--color-border); border-radius: 8px; padding: 6px 10px; background: white; color: var(--color-text); font: inherit; }
.detail-input:focus { border-color: var(--color-primary); outline: 2px solid var(--color-selected); }
.create-form { display: grid; gap: 14px; }
.course-warning { border-radius: 8px; padding: 8px 10px; background: #fceeee; color: var(--color-danger) !important; font-size: 13px; }
.week-empty p { margin-bottom: 10px; }
.detail-section h3 { font-size: 15px; } .trial-student { padding: 6px 9px; background: #fff5e7; border-radius: 6px; }
.trial-student span { color: var(--color-text-secondary); margin-left: 8px; }
.detail-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.substitution-label { margin-top: 8px; color: var(--color-primary-text); font-size: 13px; }
.move-body { display: grid; gap: 12px; } .move-course { font-weight: 650; }
.move-body > label, .move-times > label { display: grid; gap: 5px; }
.end-time-preview { min-height: 34px; display: flex; align-items: center; font-size: 14px; }
.move-times { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .move-note { font-size: 12px; }
.day-move-list { display: grid; gap: 5px; max-height: 160px; overflow-y: auto; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary); font-size: 12px; }
.drag-ghost { position: fixed; z-index: 9999; pointer-events: none; width: 238px; background: var(--c-bg, var(--color-selected)); color: var(--c-fg, var(--color-primary)); border: 1px solid var(--c-border, var(--color-primary)); box-shadow: var(--shadow-lg); padding: 9px; border-radius: 7px; font-size: 12px; }
.drop-preview { position: absolute; z-index: 20; pointer-events: none; display: flex; flex-direction: column; overflow: hidden; border: 2px dashed var(--color-primary); border-radius: 6px; padding: 3px; background: rgba(234,243,252,.9); color: var(--color-primary-text); font-size: 10px; box-shadow: 0 0 0 2px white; }
.overlap-region { position: absolute; z-index: 2; display: flex; flex-direction: column; gap: 2px; overflow: hidden; padding: 2px; border: 2px dashed var(--color-danger); border-radius: 7px; background: #fff6f6; cursor: pointer; text-align: left; font: inherit; }
.overlap-count { flex-shrink: 0; color: var(--color-danger); font-size: 9px; line-height: 12px; white-space: nowrap; }
.overlap-region .course-bar { position: relative; inset: auto; flex: 1 1 0; width: 100%; min-height: 0; padding: 1px 3px; border-radius: 3px; outline: none; animation: none; display: flex; flex-direction: column; gap: 0; }
.overlap-region .bar-name { flex-shrink: 0; font-size: 10px; line-height: 13px; }
.overlap-time { font-size: 9px; line-height: 11px; white-space: nowrap; }
.overlap-note { margin-bottom: 14px; color: var(--color-text-secondary); }
.overlap-options { display: grid; gap: 10px; }
.overlap-options button { display: grid; gap: 4px; padding: 14px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-bg); color: var(--c-fg); text-align: left; cursor: pointer; font: inherit; }
.overlap-options span { font-size: 13px; }
.mobile-two-weeks { display: none; }
@media (max-width: 599px) and (max-device-width: 599px), (max-height: 599px) and (max-device-height: 599px) and (min-aspect-ratio: 17/10) and (pointer: coarse) {
  .desktop-hint { display: none; }
  .phone-hint { display: inline; }
  .combined-board { display: none; }
  .mobile-two-weeks { display: grid; gap: 18px; }
  .mobile-week-block { overflow: hidden; border: 1px solid var(--color-border); border-radius: 16px; background: white; box-shadow: var(--shadow-sm); }
  .mobile-week-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 12px 14px; background: #f2f6fa; border-bottom: 1px solid var(--color-border); }
  .mobile-week-head span { font-size: 15px; font-weight: 700; color: var(--color-text); }
  .mobile-week-head strong { font-size: 11px; font-weight: 500; color: var(--color-text-secondary); white-space: nowrap; }
  .mobile-day { padding: 9px 12px 11px; border-bottom: 1px solid var(--color-border); }
  .mobile-day.today { background: rgba(151,196,233,.07); }
  .mobile-day-head { display: flex; justify-content: space-between; align-items: center; min-height: 36px; }
  .mobile-day-head div { display: flex; gap: 7px; align-items: baseline; }
  .mobile-day-head strong { font-size: 12px; color: var(--color-text); }
  .mobile-day-head span, .mobile-day-empty { font-size: 11px; color: var(--color-text-secondary); }
  .mobile-day-head small { color: var(--color-primary); font-size: 10px; }
  .mobile-day-head button { min-width: 36px; min-height: 36px; border: 0; border-radius: 8px; background: transparent; color: var(--color-primary); font-size: 19px; line-height: 1; padding: 0 6px; cursor: pointer; }
  .mobile-day-head button:disabled { opacity: .45; cursor: not-allowed; }
  .mobile-day-head .day-move-button { margin-left: auto; border: 1px solid var(--color-border); background: var(--color-selected); color: var(--color-primary-text); font-size: 12px; }
  .mobile-day-items { display: grid; gap: 6px; margin-top: 5px; }
  .mobile-day-empty { display: block; padding-top: 1px; }
  .mobile-next-week { padding: 10px; text-align: center; color: var(--color-text-secondary); font-size: 11px; background: #f8fafc; }
  .agenda-card { width: 100%; display: grid; grid-template-columns: auto 1fr; align-items: baseline; column-gap: 8px; row-gap: 2px; text-align: left; border: 1px solid var(--c-border); border-left: 4px solid var(--c-border); border-radius: 9px; background: var(--c-bg); padding: 7px 9px; color: var(--c-fg); box-shadow: 0 1px 3px rgba(38,56,77,.05); }
  .agenda-card.trial { border-style: dashed; }
  .agenda-card.has-overlap { outline: 2px dashed var(--color-danger); outline-offset: -2px; }
  .agenda-card strong { min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .agenda-card > span:nth-of-type(2) { grid-column: 2; font-size: 11px; }
  .agenda-card .trial-count, .agenda-card .course-warning { grid-column: 2; }
  .agenda-time { color: var(--c-fg); font-weight: 600; font-size: 11px; }
  .week-empty { display: none; }
}
@media (max-width: 599px) and (max-device-width: 599px), (max-height: 599px) and (max-device-height: 599px) and (min-aspect-ratio: 17/10) and (pointer: coarse) {
  .weekly-head { display: block; } .head-actions { margin-top: 12px; }
}
.bar-leave-active { transition: opacity .18s, transform .18s; }
.bar-leave-to { opacity: 0; transform: scale(.94); }
.course-bar.compact:hover { min-height: 76px; overflow: visible; }
.course-bar.compact:hover .bar-meta, .course-bar.compact:hover .bar-bottom { display: flex; }
@media (min-width: 600px) and (max-width: 850px) {
  .course-bar { padding: 2px; border-left-width: 2px; border-radius: 5px; }
  .course-bar.draggable, .course-bar.draggable.compact { padding-right: 13px; }
  .drag-handle { top: 2px; right: 1px; width: 11px; height: 14px; }
  .drag-handle svg { width: 8px; height: 11px; }
  .bar-name { font-size: 10px; }
  .course-bar.compact .bar-name { display: block; white-space: nowrap; font-size: 9px; }
  .bar-meta, .bar-bottom { font-size: 8px; }
  .bar-bottom { gap: 1px; }
  .bar-students { padding: 0 1px; font-size: 7px; }
  .bar-top .trial-count { position: absolute; left: 2px; bottom: 1px; padding: 1px 2px; font-size: 0; line-height: 1; }
  .bar-top .trial-count::after { content: attr(data-short); font-size: 8px; }
  .course-bar.parallel.draggable { padding-right: 2px; }
  .course-bar.parallel .drag-handle { display: none; }
  .course-bar.parallel:is(:hover, :focus-visible) .drag-handle { display: grid; }
  .course-bar.compact:hover { min-height: 0; overflow: hidden; }
}
@media (max-width: 599px) and (min-device-width: 600px) {
  .combined-week-head span { flex-direction: column; gap: 3px; padding: 4px 1px; }
  .combined-week-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
  .course-bar { padding: 2px; border-left-width: 2px; border-radius: 4px; }
  .course-bar.draggable, .course-bar.draggable.compact { padding-right: 2px; }
  .drag-handle { display: none; top: 1px; right: 1px; width: 9px; height: 12px; }
  .drag-handle svg { width: 7px; height: 10px; }
  .course-bar:is(:hover, :focus-visible) .drag-handle { display: grid; }
  .bar-name { font-size: 9px; }
  .bar-meta, .bar-bottom { font-size: 7px; }
  .bar-students { padding: 0 1px; font-size: 7px; }
}
.adjustment-row { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 13px; }
</style>
