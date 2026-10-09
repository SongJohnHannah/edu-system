<template>
  <component :is="ariaLabel ? 'label' : 'div'" class="office-date-picker" v-bind="$attrs">
    <span v-if="ariaLabel" class="date-picker-label">{{ ariaLabel }}</span>
    <NDatePicker type="date" :disabled="disabled"
    :formatted-value="modelValue || null" value-format="yyyy-MM-dd" format="yyyy-MM-dd"
    :first-day-of-week="6" :clearable="clearable" :actions="null" :close-on-select="true"
    :is-date-disabled="dateDisabled" :placeholder="placeholder" @update:formatted-value="updateDate" />
  </component>
</template>

<script setup>
import { NDatePicker } from 'naive-ui'
defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: String,
  min: String,
  max: String,
  clearable: Boolean,
  disabled: Boolean,
  ariaLabel: String,
  placeholder: { type: String, default: '选择日期' }
})
const emit = defineEmits(['update:modelValue', 'change'])
function dateDisabled(timestamp) {
  const date = new Date(timestamp)
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return !!((props.min && day < props.min) || (props.max && day > props.max))
}
function updateDate(value) {
  const next = value || ''
  if (next === (props.modelValue || '')) return
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<style>
.office-date-picker { width: 100%; min-width: 0; }
.office-date-picker .n-date-picker { width: 100%; }
.date-picker-label { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.office-date-picker.input { padding: 0; border: 0; background: transparent; }
.n-date-panel { border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); }
@media (max-width: 599px) { .office-date-picker input { font-size: 16px; } }
</style>
