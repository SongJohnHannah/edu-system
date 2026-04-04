import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'copy-wasm',
      closeBundle() {
        const distDir = 'dist/assets'
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true })
        }
        // 复制 sql.js 的 WASM 文件到 dist
        const wasmSource = 'node_modules/sql.js/dist/sql-wasm.wasm'
        const wasmDest = join(distDir, 'sql-wasm.wasm')
        if (existsSync(wasmSource)) {
          copyFileSync(wasmSource, wasmDest)
          console.log('Copied sql-wasm.wasm to dist/assets/')
        }
      }
    }
  ],
  server: {
    port: 3000,
    open: true
  }
})
