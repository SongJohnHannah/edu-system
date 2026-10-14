import { onUnmounted, ref } from 'vue'

export function useScheduleBoardPan() {
  const phoneMedia = window.matchMedia('(max-width: 599px) and (max-device-width: 599px), (max-height: 599px) and (max-device-height: 599px) and (min-aspect-ratio: 17/10) and (pointer: coarse)')
  const isBoardLayout = ref(!phoneMedia.matches)
  const panning = ref(false)
  let origin = null
  let suppressClick = false
  let clickTimer

  function cleanup() {
    if (origin?.element.hasPointerCapture(origin.pointerId)) origin.element.releasePointerCapture(origin.pointerId)
    origin = null
    panning.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', cancel)
  }

  function cancel() {
    if (panning.value) suppressNextClick()
    cleanup()
  }

  function suppressNextClick() {
    suppressClick = true
    clearTimeout(clickTimer)
    clickTimer = setTimeout(() => { suppressClick = false }, 0)
  }

  function move(event) {
    if (!origin || event.pointerId !== origin.pointerId) return
    // A long press on an editable course belongs to the existing reschedule
    // gesture; a quick horizontal swipe belongs to calendar browsing.
    if (!panning.value && origin.touch && origin.draggableCourse && event.timeStamp - origin.startedAt >= 280) return cleanup()
    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y
    if (!panning.value) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) return cleanup()
      if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy)) return
      panning.value = true
      origin.element.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
    origin.element.scrollLeft = origin.scrollLeft - dx
  }

  function end(event) {
    if (!origin || event.pointerId !== origin.pointerId) return
    if (panning.value) suppressNextClick()
    cleanup()
  }

  function startBoardPan(event) {
    if (!isBoardLayout.value || event.button !== 0) return
    if (event.target.closest('.drag-handle, button, a, input, select, textarea')) return
    const element = event.currentTarget
    if (element.scrollWidth <= element.clientWidth) return
    cleanup()
    origin = { element, pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: element.scrollLeft,
      touch: event.pointerType !== 'mouse', draggableCourse: !!event.target.closest('.course-bar.draggable'), startedAt: event.timeStamp }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', cancel)
  }

  function consumePanClick(event) {
    if (!suppressClick) return
    event.preventDefault()
    event.stopPropagation()
    suppressClick = false
  }

  function updateLayout() {
    isBoardLayout.value = !phoneMedia.matches
    cancel()
  }
  phoneMedia.addEventListener('change', updateLayout)
  onUnmounted(() => {
    cleanup()
    clearTimeout(clickTimer)
    phoneMedia.removeEventListener('change', updateLayout)
  })

  return { isBoardLayout, panning, startBoardPan, consumePanClick }
}
