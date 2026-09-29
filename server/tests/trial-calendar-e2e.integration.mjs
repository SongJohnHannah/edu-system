import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'
import { chromium } from '@playwright/test'

if (process.env.TEST_ISOLATED_MYSQL !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('试听与日历浏览器测试只允许本机 3307 隔离 MySQL 实例')
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const name = `edu_system_test_trial_calendar_${process.pid}_${Date.now()}`
const config = { host: '127.0.0.1', port: 3307, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true, timezone: '+08:00' }
const admin = await mysql.createConnection(config)
let migration, pool, server, browser, created = false
try {
  const [[identity]] = await admin.query('SELECT @@port AS port, @@datadir AS datadir')
  if (Number(identity.port) !== 3307 || !String(identity.datadir).replaceAll('\\', '/').toLowerCase().endsWith('/.qa/mysql/')) {
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
  const password = randomBytes(18).toString('base64url')
  await migration.execute('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)',
    ['admin-1', 'isolated-trial-calendar-admin', await bcrypt.hash(password, 10), 'admin', '测试管理员'])
  await migration.execute("INSERT INTO teachers (id, name, status) VALUES ('teacher-1', '林老师', 'active')")
  await migration.execute(`INSERT INTO students (id, name, total_hours, status, created_by, enrollment_stage) VALUES
    ('student-1', '试听学生甲', 0, 'active', 'admin', 'pending'),
    ('student-2', '试听学生乙', 0, 'active', 'admin', 'pending'),
    ('student-3', '试听学生丙', 0, 'active', 'admin', 'pending'),
    ('formal-student', '正式学生', 10, 'active', 'admin', 'enrolled')`)

  process.env.DB_NAME = name
  process.env.PORT = '0'
  process.env.JWT_SECRET = randomBytes(32).toString('hex')
  ;({ server } = await import('../src/index.js'))
  pool = (await import('../src/config/database.js')).default
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const health = await (await fetch(`${base}/edusystem/api/health`)).json()
  assert.equal(health.isolatedTestDatabase, true)
  assert.equal(health.database, 'ok')
  const response = await fetch(`${base}/edusystem/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'isolated-trial-calendar-admin', password })
  })
  assert.equal(response.status, 200)
  const login = await response.json()
  const future = new Date()
  future.setDate(future.getDate() + 2)
  const bookingDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Shanghai' })
  await context.addInitScript(data => {
    localStorage.setItem('access_token', data.accessToken)
    localStorage.setItem('refresh_token', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
  }, login)
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/trial-bookings`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新增预约' }).click()
  const editor = page.locator('.editor-modal')
  await editor.waitFor({ state: 'visible' })
  await editor.locator('.editor-grid .n-select').nth(0).click()
  await page.locator('.n-base-select-option').filter({ hasText: '试听学生甲' }).click()
  await editor.locator('.editor-grid .n-select').nth(1).click()
  await page.locator('.n-base-select-option').filter({ hasText: '林老师' }).click()
  await editor.locator('input[type="date"]').fill(bookingDate)
  await editor.locator('textarea').fill('日历联动初始备注')
  await editor.getByRole('button', { name: '保存预约' }).click()
  await editor.waitFor({ state: 'hidden' })
  const card = page.locator('.booking-card').filter({ hasText: '试听学生甲' })
  await card.getByText('备注：日历联动初始备注').waitFor({ state: 'visible' })
  const [[booking]] = await pool.execute('SELECT id, status, booking_date, student_id, teacher_id, course_id FROM trial_bookings WHERE student_id = ?', ['student-1'])
  assert.equal(booking.status, 'active')
  assert.equal(booking.student_id, 'student-1')
  assert.equal(booking.teacher_id, 'teacher-1')
  assert.equal(booking.course_id, null)

  await page.goto(`${base}/calendar`, { waitUntil: 'domcontentloaded' })
  await page.locator('.calendar-container').waitFor({ state: 'visible' })
  const monthLabel = `${future.getFullYear()}年${future.getMonth() + 1}月`
  if (!await page.getByText(monthLabel, { exact: true }).isVisible()) await page.getByRole('button', { name: '下月' }).click()
  await page.getByText(monthLabel, { exact: true }).waitFor({ state: 'visible' })
  const day = page.locator('.calendar-day:not(.other-month) .day-number').filter({ hasText: new RegExp(`^${future.getDate()}$`) })
  await day.locator('..').click()
  await page.locator('.trial-detail').getByText('试听学生甲').waitFor({ state: 'visible' })
  await page.locator('.trial-detail').getByText('独立试听').waitFor({ state: 'visible' })

  await page.goto(`${base}/trial-bookings?date=${bookingDate}&booking=${booking.id}`, { waitUntil: 'domcontentloaded' })
  await editor.waitFor({ state: 'visible' })
  await editor.locator('textarea').fill('日历联动更新备注')
  await editor.getByRole('button', { name: '保存预约' }).click()
  await card.getByText('备注：日历联动更新备注').waitFor({ state: 'visible' })
  const [[edited]] = await pool.execute('SELECT note, status FROM trial_bookings WHERE id = ?', [booking.id])
  assert.equal(edited.note, '日历联动更新备注')
  assert.equal(edited.status, 'active')
  await card.getByRole('button', { name: '取消预约' }).click()
  const confirmation = page.locator('.n-dialog').filter({ hasText: '取消试听预约' })
  await confirmation.waitFor({ state: 'visible' })
  const [[beforeConfirm]] = await pool.execute('SELECT status FROM trial_bookings WHERE id = ?', [booking.id])
  assert.equal(beforeConfirm.status, 'active')
  await confirmation.getByRole('button', { name: '确认取消' }).click()
  await card.getByText('已取消', { exact: true }).waitFor({ state: 'visible' })
  const [[cancelled]] = await pool.execute('SELECT status, note FROM trial_bookings WHERE id = ?', [booking.id])
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.note, '日历联动更新备注')
  await page.goto(`${base}/calendar`, { waitUntil: 'domcontentloaded' })
  await page.locator('.calendar-container').waitFor({ state: 'visible' })
  if (!await page.getByText(monthLabel, { exact: true }).isVisible()) await page.getByRole('button', { name: '下月' }).click()
  await day.locator('..').click()
  assert.equal(await page.locator('.trial-detail').getByText('试听学生甲').count(), 0)

  const courseResponse = await fetch(`${base}/edusystem/api/courses`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.accessToken}` },
    body: JSON.stringify({ name: '试听关联课', teacherId: 'teacher-1', weekday: future.getDay() || 7,
      startTime: '14:00', endTime: '15:00', hoursPerClass: 1, studentIds: ['formal-student'], effectiveStartDate: bookingDate })
  })
  assert.equal(courseResponse.status, 201)
  const formalCourse = await courseResponse.json()
  await page.goto(`${base}/trial-bookings`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新增预约' }).click()
  await editor.waitFor({ state: 'visible' })
  await editor.locator('.editor-grid .n-select').nth(0).click()
  await page.locator('.n-base-select-option').filter({ hasText: '试听学生乙' }).click()
  await editor.locator('.editor-grid .n-select').nth(1).click()
  await page.locator('.n-base-select-option').filter({ hasText: '林老师' }).click()
  await editor.locator('input[type="date"]').fill(bookingDate)
  await editor.locator('.editor-grid .n-select').nth(2).click()
  await page.locator('.n-base-select-option').filter({ hasText: '试听关联课' }).click()
  await editor.getByRole('button', { name: '保存预约' }).click()
  await editor.waitFor({ state: 'hidden' })
  const linkedCard = page.locator('.booking-card').filter({ hasText: '试听学生乙' })
  await linkedCard.getByText('对应课程：试听关联课').waitFor({ state: 'visible' })
  const [[linked]] = await pool.execute('SELECT course_id, occurrence_date, start_time, end_time, status FROM trial_bookings WHERE student_id = ?', ['student-2'])
  assert.equal(linked.course_id, formalCourse.id)
  assert.equal(linked.start_time, '14:00')
  assert.equal(linked.end_time, '15:00')
  assert.equal(linked.status, 'active')
  await page.getByRole('button', { name: '新增预约' }).click()
  await editor.waitFor({ state: 'visible' })
  await editor.locator('.editor-grid .n-select').nth(0).click()
  await page.locator('.n-base-select-option').filter({ hasText: '试听学生丙' }).click()
  await editor.locator('.editor-grid .n-select').nth(1).click()
  await page.locator('.n-base-select-option').filter({ hasText: '林老师' }).click()
  await editor.locator('input[type="date"]').fill(bookingDate)
  await editor.locator('.editor-grid .n-select').nth(2).click()
  await page.locator('.n-base-select-option').filter({ hasText: '试听关联课' }).click()
  await editor.getByRole('button', { name: '保存预约' }).click()
  await editor.waitFor({ state: 'hidden' })
  const [sameClassBookings] = await pool.execute("SELECT student_id, course_id, occurrence_date FROM trial_bookings WHERE course_id = ? AND status = 'active' ORDER BY student_id", [formalCourse.id])
  assert.deepEqual(sameClassBookings.map(row => [row.student_id, row.course_id]), [
    ['student-2', formalCourse.id], ['student-3', formalCourse.id]
  ])
  assert.ok(sameClassBookings.every(row => row.occurrence_date?.getTime() === linked.occurrence_date?.getTime()))
  await page.goto(`${base}/calendar`, { waitUntil: 'domcontentloaded' })
  await page.locator('.calendar-container').waitFor({ state: 'visible' })
  if (!await page.getByText(monthLabel, { exact: true }).isVisible()) await page.getByRole('button', { name: '下月' }).click()
  await day.locator('..').click()
  await page.locator('.course-item').filter({ hasText: '试听关联课' }).getByText('试听预约 2 人').waitFor({ state: 'visible' })
  await page.goto(`${base}/weekly-schedule?date=${bookingDate}`, { waitUntil: 'domcontentloaded' })
  const weeklyCard = page.locator(`.combined-grid .day-lane[data-date="${bookingDate}"] .course-bar`).filter({ hasText: '试听关联课' })
  await weeklyCard.getByText('试听 2 人').waitFor({ state: 'visible' })
  assert.deepEqual(errors, [])
  process.stdout.write('isolated trial/calendar browser API passed: independent lifecycle, multiple linked students, calendar and weekly counts\n')
} catch (error) {
  process.exitCode = 1
  throw error
} finally {
  if (browser) await browser.close()
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  if (migration) await migration.end()
  if (created) await admin.query(`DROP DATABASE ${name}`)
  await admin.end()
}
