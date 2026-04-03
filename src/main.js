import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { initStorage } from './utils/storage'

// 先初始化数据库，再挂载应用
initStorage().then(() => {
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}).catch(error => {
  console.error('数据库初始化失败:', error)
  // 显示错误提示
  document.getElementById('app').innerHTML = `
    <div style="padding: 20px; text-align: center; color: #ff3b30;">
      <h2>数据库初始化失败</h2>
      <p>${error.message}</p>
      <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 10px;">重试</button>
    </div>
  `
})
