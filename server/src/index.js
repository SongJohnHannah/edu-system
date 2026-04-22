import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { verifyToken } from './middleware/auth.js'
import { requireRole } from './middleware/rbac.js'
import { errorHandler } from './middleware/errorHandler.js'
import authRoutes from './routes/auth.js'
import studentRoutes from './routes/students.js'
import teacherRoutes from './routes/teachers.js'
import courseRoutes from './routes/courses.js'
import attendanceRoutes from './routes/attendance.js'
import hourRecordRoutes from './routes/hourRecords.js'
import classRoutes from './routes/classes.js'
import statsRoutes from './routes/stats.js'
import backupRoutes from './routes/backup.js'
import handoverRoutes from './routes/handovers.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const API_PREFIX = '/edusystem/api'

app.set('trust proxy', 2)
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 500,
  message: { error: '请求过于频繁，请稍后再试' }
}))

app.get(`${API_PREFIX}/health`, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use(`${API_PREFIX}/auth`, authRoutes)

app.use(`${API_PREFIX}/students`, verifyToken, studentRoutes)
app.use(`${API_PREFIX}/teachers`, verifyToken, teacherRoutes)
app.use(`${API_PREFIX}/courses`, verifyToken, courseRoutes)
app.use(`${API_PREFIX}/attendance`, verifyToken, attendanceRoutes)
app.use(`${API_PREFIX}/hour-records`, verifyToken, hourRecordRoutes)
app.use(`${API_PREFIX}/classes`, verifyToken, classRoutes)
app.use(`${API_PREFIX}/stats`, verifyToken, statsRoutes)
app.use(`${API_PREFIX}/backup`, verifyToken, requireRole('admin'), backupRoutes)
app.use(`${API_PREFIX}/handovers`, verifyToken, handoverRoutes)

// 清理测试数据（仅管理员）
app.delete(`${API_PREFIX}/admin/test-data`, verifyToken, requireRole('admin'), async (req, res) => {
  const pool = (await import('./config/database.js')).default
  const tables = ['attendance', 'hour_records', 'courses', 'students', 'teachers', 'course_handovers']
  const counts = {}
  for (const table of tables) {
    try {
      const [result] = await pool.execute(`DELETE FROM ${table} WHERE is_test = 1`)
      counts[table] = result.affectedRows
    } catch { counts[table] = 0 }
  }
  res.json({ deleted: counts })
})

const distPath = join(__dirname, '../../dist')
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
  }
}))
app.get('*', (req, res, next) => {
  res.sendFile(join(distPath, 'index.html'), err => {
    if (err) next(err)
  })
})

app.use(errorHandler)

const server = app.listen(PORT, () => {
  console.log(`[嘉言思听教务系统] 后端服务运行在 http://localhost:${PORT}`)
})

// 优雅关闭
function gracefulShutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭服务...`)
  server.close(async () => {
    try {
      const pool = (await import('./config/database.js')).default
      await pool.end()
      console.log('数据库连接池已关闭')
    } catch {}
    console.log('服务已关闭')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('unhandledRejection', (reason, promise) => {
  console.error('[未处理的 Promise 拒绝]:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('[未捕获的异常]:', err)
})
