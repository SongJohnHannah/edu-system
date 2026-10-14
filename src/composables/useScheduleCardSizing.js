import { onUnmounted, shallowRef, watch } from 'vue'

// Cards keep their fixed width and grow naturally for complete text. Measure
// their actual heights to reserve matching space in the shared time grid.
export function useScheduleCardSizing(enabled) {
  const cardHeights = shallowRef({})
  const elements = new Map()
  let frame = 0
  const observer = new ResizeObserver(queueMeasurement)

  function queueMeasurement() {
    if (frame || !enabled.value) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!enabled.value) return
      const next = {}
      for (const [id, element] of elements) {
        if (!element.isConnected) continue
        if (!element.offsetWidth) continue
        next[id] = parseFloat(getComputedStyle(element).height)
      }
      const previous = cardHeights.value
      if (Object.keys(next).length !== Object.keys(previous).length || Object.entries(next).some(([id, height]) =>
        previous[id] === undefined || Math.abs(previous[id] - height) > 0.1)) cardHeights.value = next
    })
  }

  function observeCard(id, element) {
    const previous = elements.get(id)
    if (previous === element) return
    if (previous) observer.unobserve(previous)
    if (element) {
      elements.set(id, element)
      observer.observe(element)
    } else elements.delete(id)
    queueMeasurement()
  }

  watch(enabled, value => {
    if (value) queueMeasurement()
  }, { flush: 'post' })
  onUnmounted(() => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    elements.clear()
  })
  return { cardHeights, observeCard }
}
