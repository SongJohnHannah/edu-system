<template>
  <div class="search-select" ref="wrapperRef">
    <input
      type="text"
      class="input ss-input"
      :value="displayText"
      :placeholder="placeholder"
      @focus="onFocus"
      @input="onInput"
      autocomplete="off"
    />
    <button v-if="modelValue" type="button" class="ss-clear" @click="clear">×</button>
    <div class="ss-dropdown" v-if="open">
      <div
        class="ss-option"
        v-for="opt in visibleOptions"
        :key="opt.value"
        :class="{ active: opt.value === modelValue }"
        @mousedown.prevent="select(opt.value)"
      >
        <span class="ss-option-label">{{ opt.label }}</span>
        <span class="ss-option-meta" v-if="opt.meta">{{ opt.meta }}</span>
      </div>
      <div class="ss-empty" v-if="visibleOptions.length === 0">无匹配项</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  searchable: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const search = ref('')
const wrapperRef = ref(null)

const selectedOption = computed(() =>
  props.options.find(o => o.value === props.modelValue)
)

const displayText = computed({
  get() {
    if (open.value && props.searchable) return search.value
    return selectedOption.value?.label || ''
  },
  set(v) { search.value = v }
})

const visibleOptions = computed(() => {
  if (!props.searchable) return props.options
  const kw = search.value.trim().toLowerCase()
  if (!kw) return props.options
  return props.options.filter(o =>
    o.label.toLowerCase().includes(kw) ||
    (o.meta && o.meta.toLowerCase().includes(kw))
  )
})

function onFocus() {
  search.value = ''
  open.value = true
}

function onInput(e) {
  search.value = e.target.value
  if (!open.value) open.value = true
}

function select(val) {
  emit('update:modelValue', val)
  search.value = ''
  open.value = false
}

function clear() {
  emit('update:modelValue', '')
  search.value = ''
  open.value = false
}

function onClickOutside(e) {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target)) {
    open.value = false
    search.value = ''
  }
}

onMounted(() => document.addEventListener('click', onClickOutside, true))
onUnmounted(() => document.removeEventListener('click', onClickOutside, true))
</script>

<style scoped>
.search-select {
  position: relative;
}

.ss-input {
  width: 100%;
  padding-right: 32px !important;
  cursor: pointer;
}

.ss-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 18px;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.ss-clear:hover {
  color: var(--color-text);
}

.ss-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 100;
  max-height: 240px;
  overflow-y: auto;
}

.ss-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
  gap: 8px;
}

.ss-option:hover,
.ss-option.active {
  background: rgba(0, 113, 227, 0.08);
}

.ss-option.active {
  color: var(--color-primary);
  font-weight: 500;
}

.ss-option-label {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ss-option-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.ss-empty {
  padding: 16px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 13px;
}
</style>
