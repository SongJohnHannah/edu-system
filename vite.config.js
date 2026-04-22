import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    vue()
  ],
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    allowedHosts: ['education.weiguandu.cn'],
    hmr: {
      host: 'education.weiguandu.cn',
      protocol: 'wss'
    },
    proxy: {
      '/edusystem/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
