import OfficeModal from './components/OfficeModal.vue'
import OfficeDatePicker from './components/OfficeDatePicker.vue'
import OfficeButton from './components/OfficeButton.vue'
import OfficeInput from './components/OfficeInput.vue'
import { NTable } from 'naive-ui'
import { useToast } from './composables/useToast.js'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.component('OfficeModal', OfficeModal)
  app.component('OfficeDatePicker', OfficeDatePicker)
  app.component('OfficeButton', OfficeButton)
  app.component('OfficeInput', OfficeInput)
  app.component('OfficeTable', NTable)
  app.config.errorHandler = error => useToast().error(error.message || '加载失败，请重试')
  app.use(pinia)
  app.use(router)

  const { useAuthStore } = await import('./stores/auth.js')
  const authStore = useAuthStore()
  authStore.loadFromStorage()

  app.mount('#app')
}

bootstrap().catch(error => {
  console.error('应用启动失败:', error)
  const root = document.getElementById('app')
  if (!root) return
  const panel = document.createElement('main')
  panel.className = 'bootstrap-error'
  panel.setAttribute('role', 'alert')
  const card = document.createElement('div')
  card.className = 'bootstrap-error-card'
  const title = document.createElement('h1')
  title.textContent = '应用启动失败'
  const detail = document.createElement('p')
  detail.textContent = error?.message || '请刷新页面后重试'
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'btn btn-primary'
  retry.textContent = '重新加载'
  retry.addEventListener('click', () => location.reload())
  card.append(title, detail, retry)
  panel.append(card)
  root.replaceChildren(panel)
})
