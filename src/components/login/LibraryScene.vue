<template>
  <div class="library-scene" :class="{ 'is-day': theme === 'day' }" :data-theme="theme"
    :style="{ '--library-backdrop': `url('${backdrop}')` }">
    <canvas ref="canvas" class="library-canvas" :class="{ 'is-ready': ready }" aria-hidden="true"></canvas>
    <span class="library-heading">嘉言思听 · 教务管理系统</span>
    <div class="library-brand" role="img" aria-label="Read · 嘉言思听">
      <strong>嘉言思听</strong>
      <span>读启童趣 · 在书的世界里，一起向上</span>
    </div>
    <button v-if="hotspot" type="button" class="library-weather" :style="hotspotStyle"
      :aria-label="theme === 'day' ? '点击太阳，返回黑夜图书馆' : '点击桌上的小画，前往白天云上世界'"
      @click="switchWeather"></button>
    <button type="button" class="library-motion" :aria-pressed="!playing" @click="toggleMotion">
      {{ playing ? '暂停动画' : '播放动画' }}
    </button>
  </div>
</template>

<script setup>
import { computed, ref, toRef } from 'vue'
import libraryBackdrop from '../../assets/login-library.webp'
import cloudBackdrop from '../../assets/login-clouds.webp'
import { useLibraryAnimation } from './useLibraryAnimation.js'
import { saveSceneTheme } from './libraryPreferences.js'

const props = defineProps({ theme: { type: String, default: 'night' } })
const emit = defineEmits(['update:theme'])
const canvas = ref(null)
const backdrop = computed(() => props.theme === 'day' ? cloudBackdrop : libraryBackdrop)
const { ready, playing, hotspot, toggleMotion } = useLibraryAnimation(canvas, backdrop, toRef(props, 'theme'))
const hotspotStyle = computed(() => Object.fromEntries(Object.entries(hotspot.value || {}).map(([key, value]) => [key, `${value}px`])))

function switchWeather() {
  const next = props.theme === 'day' ? 'night' : 'day'
  saveSceneTheme(next)
  emit('update:theme', next)
}
</script>

<style scoped>
.library-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background: #171c23 var(--library-backdrop) center / cover no-repeat;
}
.library-scene.is-day { background-color: #48a4ed; }
.library-canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; visibility: hidden; }
.library-canvas.is-ready { visibility: visible; }
.library-heading { position: absolute; top: max(18px, env(safe-area-inset-top)); left: 24px; color: #ead6a3; font-size: 11px; letter-spacing: 2px; text-shadow: 1px 1px #111217, -1px -1px #111217; }
.library-brand { position: absolute; top: calc(50% - 155px); left: 50%; transform: translateX(-50%); width: 300px; text-align: center; }
.library-brand strong { display: block; font-family: 'SimSun', serif; color: #e6d293; font-size: 24px; line-height: 32px; font-weight: 700; letter-spacing: 7px; text-indent: 7px; text-shadow: 2px 2px #111820, -1px -1px #433727; }
.library-brand span { display: block; margin-top: 7px; color: #cbbb92; font-size: 10px; letter-spacing: 1px; text-shadow: 1px 1px #0e161e; }
.library-motion { position: absolute; right: 14px; bottom: max(15px, env(safe-area-inset-bottom)); pointer-events: auto; padding: 7px 10px; border: 1px solid #886b3f; border-radius: 2px; background: #142638; color: #d9c496; font: 11px 'Microsoft YaHei', sans-serif; box-shadow: 1px 1px #0b1016; cursor: pointer; }
.library-motion:hover { background: #21374b; color: #f1dcad; }
.library-motion:focus-visible { outline: 2px solid #f2ca7b; outline-offset: 3px; }
.library-weather { position: absolute; pointer-events: auto; padding: 0; border: 0; background: transparent; cursor: pointer; border-radius: 4px; }
.library-weather:hover { outline: 1px dashed #ffe1a080; outline-offset: 3px; }
.library-weather:focus-visible { outline: 2px solid #f2ca7b; outline-offset: 4px; }
.is-day .library-heading { color: #174b78; text-shadow: 1px 1px #e6f6ff; }
.is-day .library-brand strong { color: #194e7d; text-shadow: 1px 1px #e5f6ff, -1px -1px #b9e3fa; }
.is-day .library-brand span { color: #1a557c; text-shadow: 1px 1px #d5efff; }
.is-day .library-motion { color: #22577f; background: #edf8ff; border-color: #589bcc; box-shadow: 1px 1px #376b99; }
.is-day .library-motion:hover { background: #d0ecff; }
.is-day .library-weather:hover, .is-day .library-weather:focus-visible { outline-color: #ffffff; }
@media (max-width: 599px) {
  .library-heading { left: 18px; font-size: 10px; }
  .library-motion { min-height: 40px; min-width: 80px; }
}
@media (max-height: 500px) {
  .library-heading, .library-brand span { display: none; }
  .library-brand { top: calc(50% - 120px); }
  .library-brand strong { font-size: 17px; line-height: 22px; }
  .library-motion { bottom: 8px; }
}
@media (max-height: 379px) {
  .library-brand { display: none; }
}
</style>
