import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { createLibraryScene } from './libraryScene.js'

export function useLibraryAnimation(canvasRef, backdropUrl, theme) {
  const ready = ref(false)
  const playing = ref(true)
  const hotspot = shallowRef(null)
  let image, preference, observer, context, scene
  let frame = 0, lastDraw = 0, previous = 0, elapsed = 0
  let width = 0, height = 0, destroyed = false

  function draw() {
    if (!ready.value || !scene || !width || !height) return
    const next = scene.draw(width, height, elapsed / 1000)
    const previousBox = hotspot.value
    if (!next || !previousBox || Object.keys(next).some(key => next[key] !== previousBox[key])) hotspot.value = next
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

  function loadBackdrop() {
    if (destroyed || !context) return
    if (image) image.onload = image.onerror = null
    const nextImage = new Image()
    image = nextImage
    ready.value = false
    hotspot.value = null
    elapsed = 0
    scene?.dispose()
    scene = createLibraryScene(context, nextImage, theme.value)
    nextImage.onload = () => {
      if (destroyed || image !== nextImage) return
      ready.value = true
      syncAnimation()
    }
    nextImage.onerror = () => {
      if (destroyed || image !== nextImage) return
      ready.value = true
      draw()
    }
    // Only the selected scene is requested; the other background stays unloaded.
    nextImage.src = backdropUrl.value
    syncAnimation()
  }

  watch([backdropUrl, theme], loadBackdrop)

  onMounted(() => {
    context = canvasRef.value.getContext('2d', { alpha: false })
    if (!context) return
    preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    playing.value = !preference.matches
    observer = new ResizeObserver(resize)
    observer.observe(canvasRef.value)
    preference.addEventListener('change', syncPreference)
    document.addEventListener('visibilitychange', syncAnimation)
    resize()
    loadBackdrop()
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

  return { ready, playing, hotspot, toggleMotion }
}
