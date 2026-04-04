import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    {
      name: 'copy-wasm',
      closeBundle() {
        const distDir = 'dist/assets'
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true })
        }

        // 查找打包后的 WASM 文件并复制为固定名称
        try {
          const files = readdirSync(distDir)
          const wasmFile = files.find(f => f.match(/^sql-wasm-[^.]+\.wasm$/))
          if (wasmFile) {
            const wasmDest = join(distDir, 'sql-wasm.wasm')
            copyFileSync(join(distDir, wasmFile), wasmDest)
            console.log('Copied', wasmFile, 'to sql-wasm.wasm')
          }
        } catch (e) {
          console.error('Error copying WASM:', e)
        }
      }
    }
  ],
  build: {
    assetsInlineLimit: 0, // 确保 WASM 文件不被内联
    rollupOptions: {
      output: {
        // 为 WASM 文件设置固定的命名模式
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.wasm')) {
            return 'assets/[name][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})
