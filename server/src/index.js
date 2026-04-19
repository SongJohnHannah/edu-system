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

app.use(errorHandler)

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
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`[嘉言思听教务系统] 后端服务运行在 http://localhost:${PORT}`)
})
