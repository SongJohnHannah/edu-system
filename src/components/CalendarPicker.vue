<template>
  <div class="cal-picker" ref="rootRef">
    <button type="button" class="cal-trigger" :class="{ open }" @click="toggle">
      <svg class="cal-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <span class="cal-value">{{ displayValue }}</span>
    </button>

    <Transition name="cal-pop">
      <div v-if="open" class="cal-popover" @click.stop>
        <div class="cal-header">
          <button type="button" class="cal-nav" @click="prevMonth" aria-label="上一月">‹</button>
          <div class="cal-title">{{ titleLabel }}</div>
          <button type="button" class="cal-nav" @click="nextMonth" aria-label="下一月">›</button>
        </div>

        <div class="cal-weekdays">
          <span v-for="w in weekdays" :key="w">{{ w }}</span>
        </div>

        <div class="cal-grid">
          <button
            v-for="cell in cells"
            :key="cell.key"
            type="button"
            class="cal-cell"
            :class="{
              'out': !cell.inMonth,
              'today': cell.isToday,
              'selected': cell.selected,
              'disabled': cell.disabled
            }"
            :disabled="cell.disabled"
            @click="pick(cell)"
          >
            {{ cell.day }}
          </button>
        </div>

        <div class="cal-footer">
          <button type="button" class="cal-shortcut" @click="pickToday">今天</button>
          <button type="button" class="cal-shortcut" @click="clear" v-if="modelValue">清除</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },       // YYYY-MM-DD
  min: { type: String, default: '' },
  max: { type: String, default: '' },
  placeholder: { type: String, default: '选择日期' }
})
const emit = defineEmits(['update:modelValue'])

const rootRef = ref(null)
const open = ref(false)
const viewYear = ref(0)
const viewMonth = ref(0)   // 0-11

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const displayValue = computed(() => {
  if (!props.modelValue) return props.placeholder
  const [y, m, d] = props.modelValue.split('-')
  return `${y}-${m}-${d}`
})

const titleLabel = computed(() => `${viewYear.value}年 ${monthNames[viewMonth.value]}`)

function pad2(n) { return String(n).padStart(2, '0') }

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function syncViewFromValue() {
  const src = props.modelValue || props.min || todayStr()
  const [y, m] = src.split('-').map(Number)
  viewYear.value = y
  viewMonth.value = m - 1
}

function toggle() {
  if (open.value) { open.value = false; return }
  syncViewFromValue()
  open.value = true
}

function prevMonth() {
  if (viewMonth.value === 0) { viewMonth.value = 11; viewYear.value-- }
  else viewMonth.value--
}

function nextMonth() {
  if (viewMonth.value === 11) { viewMonth.value = 0; viewYear.value++ }
  else viewMonth.value++
}

const cells = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const startDow = first.getDay()                      // 0=Sun
  const daysInMonth = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const daysInPrev = new Date(viewYear.value, viewMonth.value, 0).getDate()
  const cellsArr = []
  const today = todayStr()
  // 6 行 × 7 列 = 42 格
  for (let i = 0; i < 42; i++) {
    let y = viewYear.value, m = viewMonth.value, d
    if (i < startDow) {
      // 上月
      m = viewMonth.value - 1
      if (m < 0) { m = 11; y-- }
      d = daysInPrev - (startDow - 1 - i)
    } else if (i >= startDow + daysInMonth) {
      // 下月
      m = viewMonth.value + 1
      if (m > 11) { m = 0; y++ }
      d = i - (startDow + daysInMonth) + 1
    } else {
      d = i - startDow + 1
    }
    const dateStr = `${y}-${pad2(m + 1)}-${pad2(d)}`
    cellsArr.push({
      key: `${y}-${m}-${d}`,
      day: d,
      inMonth: m === viewMonth.value && y === viewYear.value,
      dateStr,
      isToday: dateStr === today,
      selected: dateStr === props.modelValue,
      disabled: !!(props.min && dateStr < props.min) || !!(props.max && dateStr > props.max)
    })
  }
  return cellsArr
})

function pick(cell) {
  if (cell.disabled) return
  emit('update:modelValue', cell.dateStr)
  open.value = false
}

function pickToday() {
  const t = todayStr()
  if (props.min && t < props.min) return
  emit('update:modelValue', t)
  open.value = false
}

function clear() {
  emit('update:modelValue', '')
  open.value = false
}

function onDocClick(e) {
  if (!open.value) return
  // 兜底：用类名查找 picker 容器（避免模板 ref 在 Teleport 场景下引用错位）
  const root = document.querySelector('.cal-picker')
  if (root && !root.contains(e.target)) open.value = false
}

function onKey(e) {
  if (e.key === 'Escape' && open.value) open.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.cal-picker {
  position: relative;
  display: inline-block;
}

.cal-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-family: inherit;
  border: 1px solid rgba(0, 113, 227, 0.30);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--color-text);
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
}

.cal-trigger:hover {
  border-color: var(--color-primary);
  background: white;
}

.cal-trigger.open {
  border-color: var(--color-primary);
  background: white;
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.10);
}

.cal-icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.cal-value {
  letter-spacing: 0.3px;
}

.cal-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 1100;
  width: 280px;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 12px;
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.cal-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cal-nav {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 50%;
  font-size: 18px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.cal-nav:hover {
  background: var(--color-bg-secondary);
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  margin-bottom: 4px;
}

.cal-weekdays span {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding: 4px 0;
  letter-spacing: 0.5px;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.cal-cell {
  aspect-ratio: 1 / 1;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s;
  font-family: inherit;
}

.cal-cell:hover:not(:disabled):not(.selected) {
  background: rgba(0, 113, 227, 0.08);
}

.cal-cell.out {
  color: rgba(0, 0, 0, 0.25);
}

.cal-cell.today {
  font-weight: 700;
  color: var(--color-primary);
}

.cal-cell.selected {
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

.cal-cell.selected.today {
  color: white;
}

.cal-cell.disabled {
  color: rgba(0, 0, 0, 0.18);
  cursor: not-allowed;
}

.cal-cell.disabled:hover {
  background: transparent;
}

.cal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.cal-shortcut {
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  border: none;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  transition: background 0.15s;
}

.cal-shortcut:hover {
  background: rgba(0, 113, 227, 0.08);
}

.cal-pop-enter-active,
.cal-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.cal-pop-enter-from,
.cal-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
</style>
