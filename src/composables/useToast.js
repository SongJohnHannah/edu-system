import { reactive } from 'vue'

export const state = reactive({
  visible: false,
  message: '',
  type: 'info', // 'success' | 'error' | 'warning' | 'info'
  timer: null
})

function show(message, type = 'info', duration = 2000) {
  if (state.timer) clearTimeout(state.timer)
  state.message = message
  state.type = type
  state.visible = true
  state.timer = setTimeout(() => {
    state.visible = false
  }, duration)
}

export function useToast() {
  return {
    state,
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error', 3000),
    warning: (msg) => show(msg, 'warning'),
    info: (msg) => show(msg, 'info')
  }
}
