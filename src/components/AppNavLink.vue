<template>
  <router-link :to="item.to" :class="linkClass" :active-class="activeClass" :exact-active-class="activeClass" @click="emit('select')">
    <NavIcon v-if="showIcon" :name="item.icon" :size="iconSize" />
    <span>{{ item.label }}</span>
  </router-link>
</template>

<script setup>
import NavIcon from './NavIcon.vue'

defineProps({
  item: { type: Object, required: true },
  linkClass: { type: String, required: true },
  activeClass: { type: String, default: '' },
  showIcon: { type: Boolean, default: false },
  iconSize: { type: Number, default: 18 }
})
const emit = defineEmits(['select'])
</script>
