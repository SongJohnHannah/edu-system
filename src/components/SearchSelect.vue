<template><NSelect class="search-select" :value="modelValue === '' ? null : modelValue" :options="displayOptions" :filterable="searchable" :disabled="disabled" :placeholder="placeholder" clearable @update:value="$emit('update:modelValue', $event ?? '')" /></template>
<script setup>
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
const props = defineProps({ modelValue: { default: '' }, options: { type: Array, default: () => [] }, placeholder: { type: String, default: '请选择' }, searchable: { type: Boolean, default: true }, disabled: Boolean })
defineEmits(['update:modelValue'])
const displayOptions = computed(() => props.options.filter(o => o.value !== '').map(o => ({ ...o, label: o.meta ? `${o.label} · ${o.meta}` : o.label })))
</script>
