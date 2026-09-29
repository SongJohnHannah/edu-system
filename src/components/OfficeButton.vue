<template><NButton v-bind="$attrs" :attr-type="type" :type="variant" :text="String($attrs.class || '').includes('btn-text')"><slot /></NButton></template>
<script setup>
import { computed, useAttrs } from 'vue'
import { NButton } from 'naive-ui'
defineOptions({ inheritAttrs: false })
defineProps({ type: { type: String, default: 'button' } })
const attrs = useAttrs()
const variant = computed(() => String(attrs.class || '').includes('btn-primary') ? 'primary' : 'default')
</script>
