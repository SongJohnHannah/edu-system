import { reactive } from 'vue'

export const state = reactive({
  visible: false,
  message: '',
  type: 'info', // 'success' | 'error' | 'warning' | 'info'
  timer: null
})
let serial = 0

function show(message, type = 'info', duration = 2000) {
  const token = ++serial
  if (state.timer) clearTimeout(state.timer)
  state.message = message
  state.type = type
  state.visible = true
  if (duration === 0) return token
  state.timer = setTimeout(() => {
    if (token === serial) state.visible = false
  }, duration)
  return token
}

function clearError(token) {
  if (!token || token !== serial || state.type !== 'error') return
  if (state.timer) clearTimeout(state.timer)
  state.timer = null
  state.visible = false
}

export function useToast() {
  return {
    state,
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error', 0),
    warning: (msg) => show(msg, 'warning'),
    info: (msg) => show(msg, 'info'),
    clearError
  }
}
