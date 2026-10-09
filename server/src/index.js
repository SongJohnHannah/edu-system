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
import statsRoutes from './routes/stats.js'
import backupRoutes from './routes/backup.js'
import handoverRoutes from './routes/handovers.js'
import trialBookingRoutes from './routes/trialBookings.js'

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

app.get(`${API_PREFIX}/health`, async (req, res) => {
  try {
    const pool = (await import('./config/database.js')).default
    await pool.query('SELECT 1')
    res.json({ status: 'ok', database: 'ok', isolatedTestDatabase: /^edu_system_test_[a-zA-Z0-9_]+$/.test(process.env.DB_NAME || ''), timestamp: new Date().toISOString() })
  } catch { res.status(503).json({ status: 'unavailable', database: 'unavailable' }) }
})

app.use(`${API_PREFIX}/auth`, authRoutes)

app.use(`${API_PREFIX}/students`, verifyToken, studentRoutes)
app.use(`${API_PREFIX}/teachers`, verifyToken, teacherRoutes)
app.use(`${API_PREFIX}/courses`, verifyToken, courseRoutes)
app.use(`${API_PREFIX}/attendance`, verifyToken, attendanceRoutes)
app.use(`${API_PREFIX}/hour-records`, verifyToken, hourRecordRoutes)
app.use(`${API_PREFIX}/stats`, verifyToken, statsRoutes)
app.use(`${API_PREFIX}/backup`, verifyToken, requireRole('admin'), backupRoutes)
app.use(`${API_PREFIX}/handovers`, verifyToken, handoverRoutes)
app.use(`${API_PREFIX}/trial-bookings`, verifyToken, trialBookingRoutes)

// 清理测试数据（仅管理员）
app.delete(`${API_PREFIX}/admin/test-data`, verifyToken, requireRole('admin'), async (req, res, next) => {
  // Cleanup is deliberately restricted to an explicitly isolated test database.
  if (!/^edu_system_test_[a-zA-Z0-9_]+$/.test(process.env.DB_NAME || '')) return res.status(403).json({ error: '仅独立测试数据库允许清理测试数据' })
  const pool = (await import('./config/database.js')).default
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    for (const table of ['course_detail_versions', 'course_schedule_versions', 'course_occurrence_changes', 'course_roster_versions']) await conn.execute(`DELETE v FROM ${table} v JOIN courses c ON v.course_id = c.id WHERE c.is_test = 1`)
    await conn.execute(`DELETE s FROM course_substitutions s LEFT JOIN courses c ON c.id = s.course_id
      LEFT JOIN teachers t ON t.id = s.teacher_id LEFT JOIN teachers o ON o.id = s.original_teacher_id
      WHERE c.is_test = 1 OR t.is_test = 1 OR o.is_test = 1`)
    await conn.execute(`DELETE ar FROM attendance_reversals ar
      JOIN attendance a ON ar.attendance_id = a.id
      LEFT JOIN courses c ON a.course_id = c.id WHERE a.is_test = 1 OR c.is_test = 1`)
    const hourRecordJoins = `FROM hour_records h
      LEFT JOIN students s ON h.student_id = s.id
      LEFT JOIN attendance a ON h.related_id = a.id
      LEFT JOIN courses c ON a.course_id = c.id`
    const hourRecordWhere = 'h.is_test = 1 OR s.is_test = 1 OR a.is_test = 1 OR c.is_test = 1'
    const [balances] = await conn.execute(`SELECT h.student_id,
      SUM(CASE h.type WHEN 'add' THEN -h.hours WHEN 'subtract' THEN h.hours ELSE 0 END) AS total_delta,
      SUM(CASE h.type WHEN 'deduct' THEN -h.hours WHEN 'restore' THEN h.hours ELSE 0 END) AS used_delta
      ${hourRecordJoins} WHERE s.is_test = 0 AND (${hourRecordWhere}) GROUP BY h.student_id`)
    for (const row of balances) await conn.execute(
      'UPDATE students SET total_hours = total_hours + ?, used_hours = used_hours + ? WHERE id = ?',
      [Number(row.total_delta), Number(row.used_delta), row.student_id]
    )
    await conn.execute(`DELETE h ${hourRecordJoins} WHERE ${hourRecordWhere}`)
    await conn.execute(`DELETE h FROM course_handovers h LEFT JOIN courses c ON h.course_id = c.id
      WHERE h.is_test = 1 OR c.is_test = 1`)
    await conn.execute('DELETE u FROM users u JOIN teachers t ON u.teacher_id = t.id WHERE t.is_test = 1')
    const deleted = {}
    const [trials] = await conn.execute(`DELETE b FROM trial_bookings b
      LEFT JOIN students s ON s.id = b.student_id
      LEFT JOIN teachers t ON t.id = b.teacher_id
      LEFT JOIN courses c ON c.id = b.course_id
      WHERE b.is_test = 1 OR s.is_test = 1 OR t.is_test = 1 OR c.is_test = 1`)
    deleted.trial_bookings = trials.affectedRows
    const [attendance] = await conn.execute(`DELETE a FROM attendance a
      LEFT JOIN courses c ON a.course_id = c.id WHERE a.is_test = 1 OR c.is_test = 1`)
    deleted.attendance = attendance.affectedRows
    for (const table of ['course_handovers', 'courses', 'students', 'teachers']) {
      const [result] = await conn.execute(`DELETE FROM ${table} WHERE is_test = 1`)
      deleted[table] = result.affectedRows
    }
    await conn.commit()
    res.json({ deleted })
  } catch (error) { await conn.rollback(); next(error) }
  finally { conn.release() }
})

app.use(API_PREFIX, (_req, res) => res.status(404).json({ error: '接口不存在' }))

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

export { app, server }
