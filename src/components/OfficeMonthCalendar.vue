<template>
  <div class="calendar-container">
    <div class="calendar-header"><span v-for="day in weekdays" :key="day" class="week-day">{{ day }}</span></div>
    <div class="calendar-body">
      <button v-for="day in days" :key="day.dateStr" type="button" class="calendar-day"
        :class="{ 'other-month': day.otherMonth, today: day.isToday, 'has-attendance': day.hasAttendance, selected: modelValue === day.dateStr }"
        :aria-label="`${day.dateStr}${day.isToday ? '，今天' : ''}，${day.courses?.length || 0} 节课程，${day.trials?.length || 0} 个试听`"
        :aria-pressed="modelValue === day.dateStr" @click="$emit('update:modelValue', day.dateStr)"
        @mouseenter="$emit('day-hover', day, $event)" @mouseleave="$emit('day-leave')" @blur="$emit('day-leave')">
        <span class="day-number">{{ day.day }}</span>
        <span class="day-markers" aria-hidden="true">
          <i v-if="day.courses?.length" class="course-dot"></i><i v-if="day.trials?.length" class="trial-dot"></i><i v-if="day.hasAttendance" class="attendance-dot"></i>
        </span>
        <span class="attendance-count" v-if="day.attendanceCount">{{ day.attendanceCount }} 人</span>
      </button>
    </div>
    <div class="calendar-legend"><span><i class="course-dot"></i>课程</span><span><i class="trial-dot"></i>试听</span><span><i class="attendance-dot"></i>已点名</span></div>
  </div>
</template>

<script setup>
defineProps({ days: { type: Array, default: () => [] }, modelValue: String })
defineEmits(['update:modelValue', 'day-hover', 'day-leave'])
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
</script>

<style scoped>
.calendar-container { padding: 20px; margin-bottom: 20px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg); box-shadow: var(--shadow-sm); }
.calendar-header, .calendar-body { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.calendar-header { margin-bottom: 8px; }
.week-day { padding: 6px; color: var(--color-text-secondary); text-align: center; font-size: 12px; }
.calendar-day { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; min-height: 72px; padding: 8px 4px; border: 1px solid transparent; border-radius: var(--radius-sm); color: var(--color-text); background: var(--color-bg-secondary); cursor: pointer; font: inherit; transition: var(--transition); }
.calendar-day:hover { border-color: var(--color-border); background: var(--color-selected); }
.calendar-day.other-month { color: var(--color-text-secondary); opacity: .5; }
.calendar-day.today .day-number { background: var(--color-primary); color: white; }
.calendar-day.selected { border-color: var(--color-primary); background: var(--color-selected); box-shadow: inset 0 0 0 1px var(--color-primary); }
.day-number { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-size: 14px; font-weight: 600; }
.day-markers { display: flex; gap: 4px; min-height: 6px; }
.course-dot, .trial-dot, .attendance-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--color-primary); }
.trial-dot { background: var(--color-trial); }
.attendance-dot { background: var(--color-success); }
.attendance-count { font-size: 10px; color: var(--color-text-secondary); line-height: 1; }
.calendar-legend { display: flex; justify-content: flex-end; gap: 16px; padding-top: 12px; color: var(--color-text-secondary); font-size: 11px; }
.calendar-legend span { display: flex; align-items: center; gap: 5px; }
@media (max-width: 599px) {
  .calendar-container { padding: 12px; }
  .calendar-header, .calendar-body { gap: 3px; }
  .calendar-day { min-height: 62px; padding: 6px 2px; }
}
</style>
