import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createLibraryScene } from './libraryScene.js'

export function useLibraryAnimation(canvasRef, backdropUrl) {
  const ready = ref(false)
  const playing = ref(true)
  let image, preference, observer, context, scene
  let frame = 0, lastDraw = 0, previous = 0, elapsed = 0
  let width = 0, height = 0, destroyed = false

  function draw() {
    if (scene && width && height) scene.draw(width, height, elapsed / 1000)
  }

  function tick(now) {
    frame = requestAnimationFrame(tick)
    if (now - lastDraw < 1000 / 30) return
    if (previous) elapsed += Math.min(100, now - previous)
    previous = now
    lastDraw = now
    draw()
  }

  function syncAnimation() {
    cancelAnimationFrame(frame)
    frame = 0
    previous = 0
    if (!destroyed && ready.value && playing.value && !document.hidden) frame = requestAnimationFrame(tick)
    else draw()
  }

  function syncPreference() {
    playing.value = !preference.matches
    syncAnimation()
  }

  function toggleMotion() {
    playing.value = !playing.value
    syncAnimation()
  }

  function resize() {
    if (destroyed || !canvasRef.value) return
    const canvas = canvasRef.value
    const bounds = canvas.getBoundingClientRect()
    width = Math.round(bounds.width)
    height = Math.round(bounds.height)
    if (!width || !height) return
    const density = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    canvas.width = Math.round(width * density)
    canvas.height = Math.round(height * density)
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
    context.imageSmoothingEnabled = false
    draw()
  }

  onMounted(() => {
    context = canvasRef.value.getContext('2d', { alpha: false })
    if (!context) return
    image = new Image()
    scene = createLibraryScene(context, image)
    preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    playing.value = !preference.matches
    observer = new ResizeObserver(resize)
    observer.observe(canvasRef.value)
    preference.addEventListener('change', syncPreference)
    document.addEventListener('visibilitychange', syncAnimation)
    image.onload = () => {
      if (destroyed) return
      draw()
      ready.value = true
      syncAnimation()
    }
    image.onerror = () => {
      if (destroyed) return
      draw()
      ready.value = true
    }
    resize()
    image.src = backdropUrl
  })

  onBeforeUnmount(() => {
    destroyed = true
    cancelAnimationFrame(frame)
    observer?.disconnect()
    preference?.removeEventListener('change', syncPreference)
    document.removeEventListener('visibilitychange', syncAnimation)
    if (image) image.onload = image.onerror = null
    scene?.dispose()
  })

  return { ready, playing, toggleMotion }
}
