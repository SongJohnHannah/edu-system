import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('未来试听集成测试只允许在显式指定的本机 3307 隔离 MySQL 实例运行')
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const name = `edu_system_test_future_${process.pid}_${Date.now()}`
const config = {
  host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', multipleStatements: true, timezone: '+08:00'
}
const admin = await mysql.createConnection(config)
let migration
let pool
let created = false
try {
  const [[identity]] = await admin.query('SELECT @@port AS port, @@datadir AS datadir')
  const datadir = String(identity.datadir).replaceAll('\\', '/').toLowerCase()
  if (Number(identity.port) !== 3307 || !datadir.endsWith('/.qa/mysql/')) {
    throw new Error('数据库实例并非项目 .qa/mysql 隔离目录')
  }
  await admin.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  created = true
  migration = await mysql.createConnection({ ...config, database: name })
  for (const file of (await fs.readdir(path.join(root, 'migrations'))).filter(file => /^0\d{2}_.*\.sql$/.test(file)).sort()) {
    let sql = await fs.readFile(path.join(root, 'migrations', file), 'utf8')
    if (file.startsWith('001_')) sql = sql.replace(/CREATE DATABASE IF NOT EXISTS edu_system[^;]*;/i, '').replace(/USE edu_system;/i, '')
    if (file.startsWith('002_')) continue
    await migration.query(sql)
  }

  const rows = [
    ['past-day', '2030-09-27', '16:00', 'active', 'teacher-1', 'course-1'],
    ['same-day-past', '2030-09-28', '09:00', 'active', 'teacher-1', 'course-1'],
    ['same-day-start', '2030-09-28', '15:00', 'active', 'teacher-1', 'course-1'],
    ['same-day-future', '2030-09-28', '16:00', 'active', 'teacher-1', 'course-1'],
    ['future-day', '2030-09-29', '09:00', 'active', 'teacher-1', 'course-1'],
    ['cancelled-future', '2030-09-29', '10:00', 'cancelled', 'teacher-1', 'course-1'],
    ['other-teacher', '2030-09-29', '11:00', 'active', 'teacher-2', 'course-2']
  ]
  for (const [id, date, start, status, teacherId, courseId] of rows) {
    await migration.execute(
      'INSERT INTO trial_bookings (id, student_id, teacher_id, course_id, booking_date, start_time, end_time, status, student_name_snapshot, teacher_name_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, 'student-1', teacherId, courseId, date, start, '17:00', status, '试听学生', '测试教师']
    )
  }

  process.env.DB_NAME = name
  const { futureTrialWindow } = await import('../src/services/scheduleService.js')
  pool = (await import('../src/config/database.js')).default
  const future = futureTrialWindow(new Date(2030, 8, 28, 15, 0))
  const [teacherRows] = await migration.execute(
    `SELECT id FROM trial_bookings WHERE teacher_id = ? AND status = 'active' AND ${future.clause} ORDER BY id`,
    ['teacher-1', ...future.params]
  )
  assert.deepEqual(teacherRows.map(row => row.id), ['future-day', 'same-day-future'])
  const [courseRows] = await migration.execute(
    `SELECT id FROM trial_bookings WHERE course_id = ? AND status = 'active' AND booking_date >= ? AND ${future.clause} ORDER BY id`,
    ['course-1', '2030-09-29', ...future.params]
  )
  assert.deepEqual(courseRows.map(row => row.id), ['future-day'])
  console.log('isolated MySQL future trial query passed; past, exact start, future and cancelled rows checked')
} finally {
  if (pool) await pool.end()
  if (migration) await migration.end()
  if (created) await admin.query(`DROP DATABASE ${name}`)
  await admin.end()
}
