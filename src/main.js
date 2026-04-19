import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { initStorage } from './utils/storage'

const useApi = import.meta.env.VITE_USE_API === 'true'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)

  if (useApi) {
    const { useAuthStore } = await import('./stores/auth.js')
    const authStore = useAuthStore()
    authStore.loadFromStorage()
  } else {
    await initStorage()
  }

  app.mount('#app')
}

bootstrap().catch(error => {
  console.error('应用启动失败:', error)
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; text-align: center; color: #ff3b30;">
      <h2>应用启动失败</h2>
      <p>${error.message}</p>
      <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 10px;">重试</button>
    </div>
  `
})
