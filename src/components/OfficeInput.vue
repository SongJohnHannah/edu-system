<template>
  <NInputNumber v-if="type === 'number'" v-bind="$attrs" :value="numericValue" :min="min === undefined ? undefined : Number(min)" :max="max === undefined ? undefined : Number(max)" :step="Number(step || 1)" :input-props="inputProps" @update:value="$emit('update:modelValue', $event)" />
  <NInput v-else v-bind="$attrs" :value="modelValue == null ? '' : String(modelValue)" :type="type === 'textarea' || type === 'password' ? type : 'text'" :input-props="inputProps" :rows="Number(rows || 3)" @update:value="$emit('update:modelValue', $event)" />
</template>
<script setup>
import { computed } from 'vue'
import { NInput, NInputNumber } from 'naive-ui'
defineOptions({ inheritAttrs: false })
const props = defineProps({ modelValue: [String, Number], type: { type: String, default: 'text' }, required: Boolean, minlength: [String, Number], min: [String, Number], max: [String, Number], step: [String, Number], rows: [String, Number], inputAriaLabel: String })
defineEmits(['update:modelValue'])
const numericValue = computed(() => props.modelValue === '' || props.modelValue == null ? null : Number(props.modelValue))
const inputProps = computed(() => ({ required: props.required, minlength: props.minlength, 'aria-label': props.inputAriaLabel, ...(props.type === 'tel' ? { type: 'tel' } : {}) }))
</script>
<style>.n-input.input, .n-input-number.input { padding: 0; border: none; background: white; min-width: 0; } .n-input-number.input .n-input { background: white; } .n-input.input textarea { min-height: 60px; }</style>
